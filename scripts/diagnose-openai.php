<?php
// CLI only: never print credentials, provider messages or conversation contents.
if (PHP_SAPI !== 'cli') { exit; }
require __DIR__ . '/../server/bootstrap.php';
require __DIR__ . '/../server/integrations.php';
session_write_close();
$s = integrations();
echo json_encode(['configured'=>$s['openai_key'] !== '', 'model'=>$s['model'], 'recent_jobs'=>query('SELECT status,error,created_at FROM ai_jobs ORDER BY created_at DESC LIMIT 5')->fetchAll()], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), PHP_EOL;
if (($argv[1] ?? '') !== '--probe' || $s['openai_key'] === '' || getenv('FORMA_TEST_MODE') === '1') { exit; }
// One minimal Responses request checks the same endpoint/model/schema as the app.
$curl = curl_init('https://api.openai.com/v1/responses');
curl_setopt_array($curl, [CURLOPT_POST=>true, CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>50, CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$s['openai_key'], 'Content-Type: application/json'], CURLOPT_POSTFIELDS=>json_encode(openaiRequest(['question'=>'Responde apenas OK, sem produtos.', 'context'=>['products'=>[]]], $s['model']), JSON_THROW_ON_ERROR)]);
$raw = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); $errno = curl_errno($curl); curl_close($curl);
$body = json_decode($raw ?: '{}', true) ?: [];
$safeCode = fn($v) => is_string($v) && preg_match('/^[a-z_]{1,80}$/D', $v) ? $v : null;
echo json_encode(['http_status'=>$status, 'curl_errno'=>$errno, 'error_code'=>$safeCode($body['error']['code'] ?? null), 'error_type'=>$safeCode($body['error']['type'] ?? null), 'completed'=>($body['status'] ?? '') === 'completed'], JSON_PRETTY_PRINT), PHP_EOL;
