<?php
declare(strict_types=1);
if($route==='/profile' && $method==='GET'){
    $actor=user();$pending=query('SELECT new_email,expires_at FROM email_changes WHERE user_id=? AND expires_at>UTC_TIMESTAMP()',[$actor['id']])->fetch();respond(['user'=>$actor,'pending_email'=>$pending?:null]);
}
if($route==='/profile' && $method==='PUT'){
    $actor=user();$name=field(body(),'name',2,100);query('UPDATE users SET name=? WHERE id=?',[$name,$actor['id']]);activity('Perfil atualizado','Nome atualizado.');respond(['user'=>user()]);
}
if($route==='/profile/password' && $method==='POST'){
    $actor=user();$data=body();$verified=currentPassword($data,$actor);$password=passwordField($data);
    if(password_verify($password,$verified['password_hash']))fail('Escolhe uma palavra-passe diferente.',422);
    transaction(function()use($actor,$verified,$password){
        $locked=query('SELECT password_hash FROM users WHERE id=? FOR UPDATE',[$actor['id']])->fetchColumn();if($locked!==$verified['password_hash'])fail('A conta mudou. Inicia sessão novamente.',409);
        query('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$actor['id']]);
        query('DELETE FROM password_resets WHERE user_id=?',[$actor['id']]);query('DELETE FROM email_changes WHERE user_id=?',[$actor['id']]);
        notifyUser((int)$actor['id'],'Palavra-passe alterada','As outras sessões foram terminadas.');activity('Palavra-passe alterada','Alteração autenticada; outras sessões invalidadas.');
    });loginUser(query('SELECT * FROM users WHERE id=?',[$actor['id']])->fetch());respond(['user'=>user(),'csrf'=>$_SESSION['csrf']]);
}
if($route==='/profile/email' && $method==='POST'){
    $actor=user();$data=body();$verified=currentPassword($data,$actor);$email=emailField($data);
    if($email===$actor['email']||query('SELECT id FROM users WHERE email=?',[$email])->fetchColumn())fail('Não é possível usar esse endereço de email.',422);
    rateLimit('email-change-'.$actor['id'],4,3600);$token=bin2hex(random_bytes(32));
    transaction(function()use($actor,$verified,$email,$token){
        $locked=query('SELECT session_version FROM users WHERE id=? FOR UPDATE',[$actor['id']])->fetchColumn();if((int)$locked!==(int)$verified['session_version'])fail('A conta mudou. Inicia sessão novamente.',409);
        query('INSERT INTO email_changes (user_id,new_email,old_email,token_hash,session_version,expires_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE new_email=VALUES(new_email),old_email=VALUES(old_email),token_hash=VALUES(token_hash),session_version=VALUES(session_version),expires_at=VALUES(expires_at)',[$actor['id'],$email,$actor['email'],hash('sha256',$token),$verified['session_version'],gmdate('Y-m-d H:i:s',time()+1800)]);
        global $config;$link=rtrim($config['app_url'],'/').'/#verify-email?token='.$token;
        queueEmail($email,'Confirmar novo email FORMA',"Pediste para usar este email na FORMA. Entra na conta que fez o pedido e confirma em:\n$link\n\nO link expira em 30 minutos e só pode ser usado uma vez. Se não fizeste o pedido, ignora esta mensagem.");
        activity('Alteração de email pedida','Confirmação enviada ao novo endereço.');
    });respond(['message'=>integrations()['smtp_enabled']&&getenv('FORMA_TEST_MODE')!=='1'?'Enviámos a confirmação para o novo email. Até confirmares, continua a usar o email atual.':'Confirmação criada em modo de demonstração, sem entrega de email. Até confirmares, continua a usar o email atual.']);
}
if($route==='/profile/email' && $method==='DELETE'){ $actor=user();query('DELETE FROM email_changes WHERE user_id=?',[$actor['id']]);activity('Alteração de email cancelada','Pedido cancelado.');respond(['ok'=>true]); }
if($route==='/profile/email/confirm' && $method==='POST'){
    $actor=user();rateLimit('email-confirm',15);$token=field(body(),'token',64,64);
    transaction(function()use($actor,$token){
        $locked=query('SELECT * FROM users WHERE id=? FOR UPDATE',[$actor['id']])->fetch();
        $pending=query('SELECT * FROM email_changes WHERE user_id=? AND token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[$actor['id'],hash('sha256',$token)])->fetch();
        if(!$pending||(int)$pending['session_version']!==(int)$locked['session_version']||$pending['old_email']!==$locked['email'])fail('Link inválido, expirado ou pertencente a outra conta.',422);
        if(query('SELECT id FROM users WHERE email=?',[$pending['new_email']])->fetchColumn())fail('Este endereço já não está disponível. Pede outra alteração.',409);
        query('UPDATE users SET email=?,session_version=session_version+1 WHERE id=?',[$pending['new_email'],$actor['id']]);query('DELETE FROM email_changes WHERE user_id=?',[$actor['id']]);query('DELETE FROM password_resets WHERE user_id=?',[$actor['id']]);
        queueEmail($locked['email'],'Email da conta FORMA alterado','O endereço de email da tua conta foi alterado após confirmação. Se não foste tu, contacta o responsável pela loja.');
        notifyUser((int)$actor['id'],'Email confirmado','O novo endereço está ativo. As outras sessões foram terminadas.');activity('Email alterado','Novo endereço confirmado; outras sessões invalidadas.');
    });loginUser(query('SELECT * FROM users WHERE id=?',[$actor['id']])->fetch());respond(['user'=>user(),'csrf'=>$_SESSION['csrf']]);
}
if($route==='/products/suggestions' && $method==='GET'){
    $term=trim((string)($_GET['q']??''));if(mb_strlen($term)<2)respond([]);if(mb_strlen($term)>100)fail('Pesquisa demasiado longa.',422);
    $pattern='%'.str_replace(['!','%','_'],['!!','!%','!_'],$term).'%';
    respond(query("SELECT p.id,p.name,p.image,p.price_cents,p.stock,c.name AS category_name FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1 AND (p.name LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!') ORDER BY p.featured DESC,p.name LIMIT 6",[$pattern,$pattern])->fetchAll());
}
if(preg_match('~^/admin/products/(\d+)/gallery$~D',$route,$m)){
    admin();$pid=(int)$m[1];if(!query('SELECT id FROM products WHERE id=? AND active=1',[$pid])->fetchColumn())fail('Produto não encontrado.',404);
    if($method==='GET')respond(query('SELECT * FROM product_images WHERE product_id=? ORDER BY position,id',[$pid])->fetchAll());
    if($method==='PUT'){
        $images=body()['images']??null;if(!is_array($images)||!array_is_list($images)||count($images)>12)fail('A galeria pode ter até 12 imagens.',422);
        transaction(function()use($pid,$images){query('SELECT id FROM products WHERE id=? FOR UPDATE',[$pid]);query('DELETE FROM product_images WHERE product_id=?',[$pid]);
            foreach($images as $pos=>$image){if(!is_array($image))fail('Imagem inválida.',422);$path=imagePath(field($image,'image',1,500));$alt=field($image+['alt'=>''],'alt',0,160);$vid=empty($image['variant_id'])?null:integer($image['variant_id'],1,PHP_INT_MAX,'opção');
                if($vid&&!query('SELECT id FROM product_variants WHERE id=? AND product_id=? AND active=1',[$vid,$pid])->fetchColumn())fail('A opção não pertence a este produto.',422);
                query('INSERT INTO product_images (product_id,variant_id,image,alt,position) VALUES (?,?,?,?,?)',[$pid,$vid,$path,$alt,$pos]);}
            activity('Galeria atualizada',"Produto #$pid: ".count($images).' fotografias.');
        });respond(['ok'=>true]);
    }
}
if($route==='/support/attachments' && $method==='POST'){
    $actor=user();rateLimit('support-upload-'.$actor['id'],20);$file=$_FILES['file']??null;
    if(!$file||$file['error']!==UPLOAD_ERR_OK||$file['size']<1||$file['size']>5*1024*1024)fail('Seleciona um ficheiro até 5 MB.',422);
    $mime=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if(!in_array($mime,['image/jpeg','image/png','image/webp','application/pdf'],true))fail('Usa uma imagem JPG, PNG, WebP ou um PDF.',422);
    if(str_starts_with($mime,'image/')){$size=@getimagesize($file['tmp_name']);if(!$size||$size[0]>6000||$size[1]>6000)fail('Imagem inválida ou demasiado grande.',422);}
    elseif(file_get_contents($file['tmp_name'],false,null,0,5)!=='%PDF-')fail('PDF inválido.',422);
    $id=bin2hex(random_bytes(16));$name=mb_substr(preg_replace('/[\x00-\x1F\x7F]/u','',basename(str_replace('\\','/',$file['name']))),0,120)?:'anexo';$path=attachmentDirectory().'/'.$id;
    if(!move_uploaded_file($file['tmp_name'],$path))throw new RuntimeException('Upload failed');
    try{query('INSERT INTO support_attachments (id,user_id,name,mime,size_bytes) VALUES (?,?,?,?,?)',[$id,$actor['id'],$name,$mime,$file['size']]);}catch(Throwable $e){unlink($path);throw $e;}
    activity('Anexo carregado','Ficheiro privado para apoio.');respond(['id'=>$id,'name'=>$name,'mime'=>$mime,'size_bytes'=>$file['size']],201);
}
if(preg_match('~^/support/attachments/([a-f0-9]{32})$~D',$route,$m)&&$method==='GET'){
    $actor=user();$a=query('SELECT a.*,t.user_id AS ticket_owner FROM support_attachments a LEFT JOIN support_messages m ON m.id=a.message_id LEFT JOIN support_tickets t ON t.id=m.ticket_id WHERE a.id=?',[$m[1]])->fetch();
    if(!$a||($a['message_id']?(int)$a['ticket_owner']!==(int)$actor['id']&&$actor['role']!=='admin':(int)$a['user_id']!==(int)$actor['id']))fail('Anexo não encontrado.',404);
    $path=attachmentDirectory().'/'.$a['id'];if(!is_file($path))fail('Ficheiro indisponível.',404);
    header('Content-Type: '.$a['mime']);header("Content-Disposition: attachment; filename=\"anexo\"; filename*=UTF-8''".rawurlencode($a['name']));header('Content-Length: '.filesize($path));header("Content-Security-Policy: sandbox; default-src 'none'");session_write_close();readfile($path);exit;
}
if($route==='/admin/integrations/logs'&&$method==='GET'){
    admin();$state=$_GET['status']??'';$allowed=['queued','processing','done','failed','sent','local'];if($state!==''&&!in_array($state,$allowed,true))fail('Filtro inválido.',422);
    $where=$state!==''?' WHERE status=?':'';$params=$state!==''?[$state]:[];
    $ai=query('SELECT id,purpose,status,error,created_at,started_at,finished_at FROM ai_jobs'.$where.' ORDER BY created_at DESC,id DESC LIMIT 50',$params)->fetchAll();
    $mail=query('SELECT id,recipient,subject,status,attempts,error,created_at,finished_at FROM mail_outbox'.$where.' ORDER BY id DESC LIMIT 50',$params)->fetchAll();
    foreach($mail as &$row){$parts=explode('@',$row['recipient'],2);$row['recipient']=mb_substr($parts[0],0,2).'…@'.($parts[1]??'');}
    respond(['ai'=>$ai,'mail'=>$mail,'worker_running'=>is_file(workerHeartbeat())&&filemtime(workerHeartbeat())>time()-90,'checked_at'=>gmdate('Y-m-d H:i:s')]);
}
