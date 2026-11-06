<?php
declare(strict_types=1);
function notifyAdmins(string $title,string $message): void { foreach(query("SELECT id FROM users WHERE role='admin'")->fetchAll(PDO::FETCH_COLUMN) as $id) { notifyUser((int)$id,$title,$message); } }
if($route==='/cart/quote' && $method==='POST') { rateLimit('cart-quote',80); respond(quoteCart(body())); }
function bundleRows(bool $all=false): array {
    $rows=query('SELECT * FROM bundles' . ($all?'':' WHERE active=1') . ' ORDER BY id DESC')->fetchAll();
    foreach($rows as &$row) {
        $row['items']=query('SELECT p.id,p.name,p.image,p.active AS product_active,v.id AS variant_id,v.label AS variant_label,v.price_cents,v.stock,v.active AS variant_active,b.quantity FROM bundle_items b JOIN product_variants v ON v.id=b.variant_id JOIN products p ON p.id=v.product_id WHERE b.bundle_id=? ORDER BY p.id,v.id',[$row['id']])->fetchAll();
        $row['total_cents']=array_sum(array_map(fn($i)=>(int)$i['price_cents']*(int)$i['quantity'],$row['items']));
        $row['available']=count($row['items'])>0 && !array_filter($row['items'],fn($i)=>!(int)$i['product_active']||!(int)$i['variant_active']||(int)$i['stock']<(int)$i['quantity']);
    } return $rows;
}
if($route==='/favorites/share') {
    $actor=user();
    if($method==='GET') { respond(['active'=>(bool)query('SELECT user_id FROM favorite_shares WHERE user_id=?',[$actor['id']])->fetchColumn()]); }
    if($method==='POST') {
        rateLimit('share',20); $token=bin2hex(random_bytes(24));
        query('INSERT INTO favorite_shares (user_id,token_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),created_at=UTC_TIMESTAMP()',[$actor['id'],hash('sha256',$token)]);
        activity('Favoritos partilhados','Novo link criado; links anteriores revogados.'); respond(['token'=>$token],201);
    }
    if($method==='DELETE') { query('DELETE FROM favorite_shares WHERE user_id=?',[$actor['id']]); activity('Partilha revogada','O link dos favoritos foi desativado.'); respond(['ok'=>true]); }
}
if(preg_match('~^/shared/([a-f0-9]{48})$~D',$route,$m) && $method==='GET') {
    $id=query('SELECT user_id FROM favorite_shares WHERE token_hash=?',[hash('sha256',$m[1])])->fetchColumn();
    if(!$id) { fail('Este link não existe ou foi desativado.',404); }
    respond(array_map('enrichProduct',query('SELECT p.*,c.name AS category_name FROM favorites f JOIN products p ON p.id=f.product_id JOIN categories c ON c.id=p.category_id WHERE f.user_id=? AND p.active=1 ORDER BY p.id LIMIT 200',[$id])->fetchAll()));
}
if(in_array($route,['/support','/admin/support'],true)) {
    $isAdmin=$route==='/admin/support'; $actor=$isAdmin?admin():user();
    if($method==='GET') { respond(query('SELECT t.*,u.name AS customer_name FROM support_tickets t JOIN users u ON u.id=t.user_id' . ($isAdmin?'':' WHERE t.user_id=?') . ' ORDER BY t.updated_at DESC,t.id DESC LIMIT 200',$isAdmin?[]:[$actor['id']])->fetchAll()); }
    if($method==='POST' && !$isAdmin) {
        rateLimit('support-create',10); $input=body(); $subject=field($input,'subject',3,160); $content=field($input,'content',5,5000);
        $id=transaction(function() use($actor,$subject,$content,$input) { query('INSERT INTO support_tickets (user_id,subject) VALUES (?,?)',[$actor['id'],$subject]); $id=(int)db()->lastInsertId(); query('INSERT INTO support_messages (ticket_id,user_id,content) VALUES (?,?,?)',[$id,$actor['id'],$content]); attachToMessage((int)db()->lastInsertId(),(int)$actor['id'],$input); notifyAdmins('Novo pedido de apoio',"Pedido #$id: $subject"); activity('Pedido de apoio criado',"Pedido #$id"); return $id; }); respond(['id'=>$id],201);
    }
}
if(preg_match('~^/(admin/)?support/(\d+)$~D',$route,$m)) {
    $isAdmin=$m[1]!==''; $actor=$isAdmin?admin():user(); $id=(int)$m[2];
    $ticket=query('SELECT * FROM support_tickets WHERE id=?' . ($isAdmin?'':' AND user_id=?'),$isAdmin?[$id]:[$id,$actor['id']])->fetch();
    if(!$ticket) { fail('Pedido não encontrado.',404); }
    if($method==='GET') { $ticket['messages']=query('SELECT m.id,m.content,m.created_at,u.name,u.role FROM support_messages m JOIN users u ON u.id=m.user_id WHERE ticket_id=? ORDER BY m.id',[$id])->fetchAll(); foreach($ticket['messages'] as &$message){$message['attachments']=query('SELECT id,name,mime,size_bytes FROM support_attachments WHERE message_id=? ORDER BY created_at,id',[$message['id']])->fetchAll();} unset($message); respond($ticket); }
    if($method==='POST') {
        rateLimit('support-reply',40); $input=body(); $content=field($input,'content',1,5000);
        transaction(function() use($id,$actor,$content,$isAdmin,$input) {
            $t=query('SELECT * FROM support_tickets WHERE id=? FOR UPDATE',[$id])->fetch(); if($t['status']==='closed') { fail('Este pedido está fechado. Reabre-o para responder.',409); }
            query('INSERT INTO support_messages (ticket_id,user_id,content) VALUES (?,?,?)',[$id,$actor['id'],$content]);
            attachToMessage((int)db()->lastInsertId(),(int)$actor['id'],$input);
            query('UPDATE support_tickets SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[$isAdmin?'answered':'open',$id]);
            if($isAdmin) { notifyUser((int)$t['user_id'],'Resposta ao teu pedido',"O pedido #$id recebeu uma resposta. Consulta a tua conta."); } else { notifyAdmins('Nova mensagem de apoio',"Pedido #$id atualizado."); }
            activity('Mensagem de apoio',"Pedido #$id");
        }); respond(['ok'=>true],201);
    }
    if($method==='PATCH') { $state=body()['status']??''; if(!in_array($state,['open','closed'],true)) { fail('Estado inválido.',422); } query('UPDATE support_tickets SET status=? WHERE id=?',[$state,$id]); activity('Estado do apoio alterado',"Pedido #$id: $state"); respond(['ok'=>true]); }
}
if(in_array($route,['/returns','/admin/returns'],true)) {
    $isAdmin=$route==='/admin/returns'; $actor=$isAdmin?admin():user();
    if($method==='GET') { respond(query('SELECT r.*,u.name AS customer_name,o.total_cents FROM return_requests r JOIN users u ON u.id=r.user_id JOIN orders o ON o.id=r.order_id' . ($isAdmin?'':' WHERE r.user_id=?') . ' ORDER BY r.id DESC LIMIT 200',$isAdmin?[]:[$actor['id']])->fetchAll()); }
    if($method==='POST' && !$isAdmin) {
        $input=body(); $orderId=integer($input['order_id']??null,1,PHP_INT_MAX,'encomenda'); $reason=field($input,'reason',10,2000);
        $id=transaction(function() use($actor,$orderId,$reason) {
            $order=query('SELECT * FROM orders WHERE id=? AND user_id=? FOR UPDATE',[$orderId,$actor['id']])->fetch(); if(!$order) { fail('Encomenda não encontrada.',404); }
            if($order['status']!=='delivered'||$order['payment_status']!=='paid') { fail('Só podes pedir a devolução de uma encomenda entregue e paga.',409); }
            if(query('SELECT id FROM return_requests WHERE order_id=?',[$orderId])->fetchColumn()) { fail('Já existe um pedido para esta encomenda.',409); }
            query("INSERT INTO return_requests (order_id,user_id,reason,admin_note) VALUES (?,?,?,'')",[$orderId,$actor['id'],$reason]); $id=(int)db()->lastInsertId();
            notifyAdmins('Pedido de devolução',"Encomenda #$orderId, pedido #$id."); activity('Devolução pedida',"Encomenda #$orderId"); return $id;
        }); respond(['id'=>$id],201);
    }
}
if(preg_match('~^/admin/returns/(\d+)$~D',$route,$m) && $method==='PATCH') {
    admin(); $input=body(); $state=$input['status']??''; $note=field($input+['admin_note'=>''],'admin_note',0,2000);
    if(!in_array($state,['approved','rejected','completed'],true)) { fail('Estado inválido.',422); }
    if(($input['confirm']??false)!==true) { fail('Confirma a alteração da devolução.',422); }
    transaction(function() use($m,$state,$note) {
        $r=query('SELECT * FROM return_requests WHERE id=? FOR UPDATE',[$m[1]])->fetch(); if(!$r) { fail('Pedido não encontrado.',404); }
        if($r['status']===$state) { return; }
        $allowed=['requested'=>['approved','rejected'],'approved'=>['completed'],'rejected'=>[],'completed'=>[]]; if(!in_array($state,$allowed[$r['status']],true)) { fail('Transição de devolução inválida.',409); }
        if($state==='completed') {
            $order=query('SELECT * FROM orders WHERE id=? FOR UPDATE',[$r['order_id']])->fetch(); if($order['payment_status']!=='paid') { fail('A encomenda já não tem um pagamento aprovado.',409); }
            foreach(query('SELECT variant_id,quantity FROM order_items WHERE order_id=? ORDER BY product_id,variant_id',[$order['id']])->fetchAll() as $item) { stockChange((int)$item['variant_id'],(int)$item['quantity'],'Devolução — encomenda #'.$order['id'],(int)$order['id']); }
            query("UPDATE orders SET payment_status='refunded' WHERE id=?",[$order['id']]); orderEvent((int)$order['id'],'refunded','Devolução concluída e reembolso simulado');
            query("INSERT INTO payment_attempts (order_id,outcome,amount_cents,request_key) VALUES (?,'refunded',?,?)",[$order['id'],$order['total_cents'],substr(bin2hex(random_bytes(18)),0,36)]);
        }
        query('UPDATE return_requests SET status=?,admin_note=? WHERE id=?',[$state,$note,$r['id']]);
        $labels=['approved'=>'aprovada','rejected'=>'recusada','completed'=>'concluída (reembolso simulado)']; notifyUser((int)$r['user_id'],'Devolução atualizada',"Encomenda #{$r['order_id']}: {$labels[$state]}."); activity('Devolução atualizada',"Pedido #{$r['id']}: $state");
    }); respond(['ok'=>true]);
}
if($route==='/bundles' && $method==='GET') { respond(bundleRows()); }
if($route==='/admin/bundles' || str_starts_with($route,'/admin/bundles/')) {
    admin();
    if($route==='/admin/bundles' && $method==='GET') { respond(bundleRows(true)); }
    if($route==='/admin/bundles/variants' && $method==='GET') { respond(query('SELECT v.id,v.label,v.stock,v.price_cents,p.name FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 AND p.active=1 ORDER BY p.name,v.id')->fetchAll()); }
    if($route==='/admin/bundles' && $method==='POST' || preg_match('~^/admin/bundles/(\d+)$~D',$route,$m) && in_array($method,['PUT','DELETE'],true)) {
        $id=isset($m[1])?(int)$m[1]:null; $input=body();
        if($method==='DELETE') { if(($input['confirm']??false)!==true) { fail('Confirma a eliminação.',422); } query('DELETE FROM bundles WHERE id=?',[$id]); activity('Conjunto eliminado',"Conjunto #$id"); respond(['ok'=>true]); }
        $name=field($input,'name',3,120); $description=field($input,'description',10,2000); $image=imagePath(field($input,'image',1,500));
        $items=$input['items']??null; if(!is_array($items)||count($items)<2||count($items)>12) { fail('Escolhe entre 2 e 12 opções para o conjunto.',422); }
        $id=transaction(function() use($id,$input,$name,$description,$image,$items) {
            if($id && !query('SELECT id FROM bundles WHERE id=? FOR UPDATE',[$id])->fetchColumn()) { fail('Conjunto não encontrado.',404); }
            $values=[$name,$description,$image,($input['active']??false)===true?1:0];
            if($id) { query('UPDATE bundles SET name=?,description=?,image=?,active=? WHERE id=?',[...$values,$id]); query('DELETE FROM bundle_items WHERE bundle_id=?',[$id]); }
            else { query('INSERT INTO bundles (name,description,image,active) VALUES (?,?,?,?)',$values); $id=(int)db()->lastInsertId(); }
            $seen=[];
            foreach($items as $item) { if(!is_array($item)) { fail('Opção inválida.',422); } $vid=integer($item['variant_id']??null,1,PHP_INT_MAX,'opção'); $qty=integer($item['quantity']??null,1,10,'quantidade');
                if(isset($seen[$vid])||!query('SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.active=1 AND p.active=1',[$vid])->fetchColumn()) { fail('Escolhe opções ativas e diferentes.',422); } $seen[$vid]=true;
                query('INSERT INTO bundle_items (bundle_id,variant_id,quantity) VALUES (?,?,?)',[$id,$vid,$qty]); }
            activity('Conjunto guardado',"Conjunto #$id: $name"); return $id;
        }); respond(['id'=>$id],$method==='POST'?201:200);
    }
}
