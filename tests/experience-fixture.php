<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'||getenv('FORMA_TEST_MODE')!=='1') { exit(1); }
require __DIR__.'/../server/bootstrap.php';
require __DIR__.'/../server/integrations.php';
session_write_close();
if(($argv[1]??'')==='ai-contract') {
    $payload=['question'=>'Uma cadeira','context'=>['products'=>[['id'=>1,'stock'=>2],['id'=>2,'stock'=>0]]]];
    $request=openaiRequest($payload,'gpt-4.1-mini');
    if($request['store']!==false||$request['text']['format']['strict']!==true||$request['max_output_tokens']>1000||isset($request['tools'])) { throw new RuntimeException('Unsafe request'); }
    $response=['status'=>'completed','output'=>[['type'=>'message','content'=>[['type'=>'output_text','text'=>json_encode(['message'=>'Uma sugestão.','product_ids'=>[1,9999,1,2,'1']])]]]]];
    $decoded=decodeAiResponse($response,$payload['context']);
    if($decoded['product_ids']!==[1]) { throw new RuntimeException('Product filtering failed'); }
    foreach ([
        [429, 'credit_balance_exhausted', 'insufficient_quota', 'adicionar créditos'],
        [429, 'project_spend_limit_exceeded', 'insufficient_quota', 'limites do projeto'],
        [429, 'organization_spend_limit_exceeded', 'insufficient_quota', 'limites da organização'],
        [429, 'organization_usage_limit_exceeded', 'insufficient_quota', 'Limite de utilização'],
        [429, 'insufficient_quota', 'insufficient_quota', 'sem quota'],
        [429, 'rate_limit_exceeded', 'rate_limit_error', 'Aguarda'],
        [401, 'invalid_api_key', 'invalid_request_error', 'chave OpenAI foi recusada'],
        [403, '', '', 'permissões'],
        [404, 'model_not_found', '', 'modelo'],
    ] as [$status, $code, $type, $expected]) {
        $message = openaiFailure($status, ['error'=>['code'=>$code, 'type'=>$type, 'message'=>'SECRET-KEY-DO-NOT-EXPOSE']]);
        if (!str_contains($message, $expected) || str_contains($message, 'SECRET') || strlen($message)>255) { throw new RuntimeException('Incorrect or unsafe OpenAI error'); }
    }
    if (!str_contains(openaiFailure(0, [], 60), 'certificado') || !str_contains(openaiFailure(0, [], 28), 'demorou')) { throw new RuntimeException('Transport classification failed'); }
    foreach([['status'=>'incomplete'],['status'=>'completed','output'=>[]]] as $invalid) {
        $failed=false;try{decodeAiResponse($invalid,$payload['context']);}catch(RuntimeException $e){$failed=true;}if(!$failed)throw new RuntimeException('Invalid response accepted');
    }
    echo 'AI request and response contract verified';
} elseif (($argv[1] ?? '') === 'gemini-contract') {
    $context = ['products'=>[['id'=>1, 'stock'=>2], ['id'=>2, 'stock'=>0]]];
    $request = geminiRequest(['question'=>'Uma cadeira', 'context'=>$context]);
    if ($request['generationConfig']['responseMimeType'] !== 'application/json' || isset($request['tools']) || $request['generationConfig']['maxOutputTokens'] > 2048) { throw new RuntimeException('Unsafe Gemini request'); }
    $response = ['candidates'=>[['finishReason'=>'STOP', 'content'=>['parts'=>[
        ['thought'=>true, 'text'=>'PRIVATE_THOUGHT'],
        ['text'=>json_encode(['message'=>'Sugestão Gemini.', 'product_ids'=>[1, 2, 999, 1, '1']])]
    ]]]]];
    $decoded = decodeGeminiResponse($response, $context);
    if ($decoded !== ['message'=>'Sugestão Gemini.', 'product_ids'=>[1]]) { throw new RuntimeException('Gemini filtering failed'); }
    foreach ([[], ['promptFeedback'=>['blockReason'=>'SAFETY']], ['candidates'=>[['finishReason'=>'MAX_TOKENS']]], ['candidates'=>[['finishReason'=>'STOP', 'content'=>['parts'=>[['text'=>'invalid json']]]]]]] as $bad) {
        $failed=false; try { decodeGeminiResponse($bad, $context); } catch (RuntimeException $e) { $failed=true; }
        if (!$failed) { throw new RuntimeException('Invalid Gemini output accepted'); }
    }
    foreach ([400, 401, 402, 403, 404, 429, 500] as $status) {
        $message=geminiFailure($status, ['error'=>['message'=>'SECRET-KEY', 'details'=>[]]]);
        if (str_contains($message, 'SECRET') || strlen($message)>255) { throw new RuntimeException('Unsafe Gemini error'); }
    }
    if (!str_contains(geminiFailure(400, ['error'=>['details'=>[['reason'=>'API_KEY_INVALID']]]]), 'inválida')) { throw new RuntimeException('Gemini key error missing'); }
    if (!str_contains(geminiFailure(0, [], 60), 'certificado') || !str_contains(geminiFailure(0, [], 28), 'demorou')) { throw new RuntimeException('Gemini transport error missing'); }
    $failed=false; try { callGemini(['context'=>$context]); } catch (RuntimeException $e) { $failed=str_contains($e->getMessage(), 'desativadas nos testes'); }
    if (!$failed) { throw new RuntimeException('External Gemini calls allowed in tests'); }
    echo 'Gemini contract verified';
} elseif(($argv[1]??'')==='heartbeat') { touch(workerHeartbeat()); }
elseif(($argv[1]??'')==='job-complete') {
    $id=$argv[2];query("UPDATE ai_jobs SET status='done',result=?,payload='{}' WHERE id=?",[json_encode(['message'=>'Resposta de teste controlada.','product_ids'=>[1]]),$id]);
} elseif(($argv[1]??'')==='mail-count') { echo query('SELECT COUNT(*) FROM mail_outbox WHERE recipient=? AND subject=?',[$argv[2],$argv[3]])->fetchColumn(); }
