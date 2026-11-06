<?php
// Read-only TLS diagnostic. No API key, no generation, no billable request.
if (PHP_SAPI !== 'cli') { exit; }
if (!extension_loaded('curl')) { fwrite(STDERR, "PHP cURL indisponível.\n"); exit(1); }
$curl=curl_init('https://api.openai.com/v1/models');
curl_setopt_array($curl,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>20]);
curl_exec($curl); $code=curl_getinfo($curl,CURLINFO_HTTP_CODE); $error=curl_error($curl); curl_close($curl);
echo json_encode(['http_status'=>$code,'tls_error'=>$error],JSON_UNESCAPED_SLASHES),PHP_EOL;
exit($code===401?0:1);
