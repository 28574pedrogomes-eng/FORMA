<?php
declare(strict_types=1);
if ($route === '/admin/integrations') {
    admin();
    if ($method === 'PUT') { saveIntegrations(body()); respond(publicIntegrations()); }
    if ($method === 'GET') { respond(publicIntegrations()); }
}
if ($route === '/admin/integrations/test-email' && $method === 'POST') {
    $actor=admin(); rateLimit('test-email',3);
    respond(['id'=>queueEmail($actor['email'],'Teste de email FORMA','A configuração de email da FORMA foi testada.'),'local'=>getenv('FORMA_TEST_MODE')==='1' || !integrations()['smtp_enabled']],202);
}
if ($route === '/ai/chat' && $method === 'POST' || $route === '/admin/ai/summary' && $method === 'POST') {
    $purpose=$route==='/ai/chat'?'chat':'summary'; $actor=$purpose==='summary'?admin():user();
    rateLimit('ai-user-'.$actor['id'],15); rateLimit('ai-global',40,3600);
    $settings = integrations();
    if (!aiConfigured($settings)) { fail('O assistente ainda não foi configurado. O administrador pode ativá-lo em Integrações.',503); }
    if (!is_file(workerHeartbeat()) || filemtime(workerHeartbeat())<time()-90) { fail('O serviço de IA está parado. Inicia a loja através de iniciar.bat.',503); }
    $message=$purpose==='chat'?field(body(),'message',3,1000):'Resume as vendas, destaca o stock que precisa de atenção e sugere três ações.';
    $id=bin2hex(random_bytes(16)); $context=aiContext($purpose);
    query('INSERT INTO ai_jobs (id,user_id,session_hash,purpose,payload) VALUES (?,?,?,?,?)',[$id,$actor['id'],hash('sha256',session_id()),$purpose,json_encode(['provider'=>$settings['ai_provider'],'question'=>$message,'context'=>$context],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
    respond(['id'=>$id,'status'=>'queued'],202);
}
if (preg_match('~^/ai/jobs/([a-f0-9]{32})$~D',$route,$m) && $method==='GET') {
    $actor=user(); $job=query('SELECT id,user_id,purpose,status,result,error,created_at FROM ai_jobs WHERE id=? AND user_id=?',[$m[1],$actor['id']])->fetch();
    if(!$job) { fail('Pedido não encontrado.',404); } if($job['purpose']==='summary') { admin(); }
    $result=$job['result']?json_decode($job['result'],true):null;
    if($result) { $result['products']=[]; foreach($result['product_ids'] as $pid) { $p=query('SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1',[$pid])->fetch(); if($p) { $result['products'][]=enrichProduct($p); } } unset($result['product_ids']); }
    respond(['id'=>$job['id'],'status'=>$job['status'],'error'=>$job['error'],'result'=>$result,'created_at'=>$job['created_at']]);
}
