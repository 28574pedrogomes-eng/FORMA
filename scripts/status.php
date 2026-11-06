<?php
if (PHP_SAPI !== 'cli') { exit; }
require __DIR__ . '/../server/bootstrap.php';
require __DIR__ . '/../server/integrations.php';
session_write_close();
$settings=publicIntegrations();
echo json_encode(['products'=>(int)query('SELECT COUNT(*) FROM products WHERE active=1')->fetchColumn(),'news'=>(int)query('SELECT COUNT(*) FROM news_articles')->fetchColumn(),'bundles'=>(int)query('SELECT COUNT(*) FROM bundles WHERE active=1')->fetchColumn(),'ai_provider'=>$settings['ai_provider'],'ai_configured'=>$settings['ai_configured'],'gemini_configured'=>$settings['gemini_configured'],'openai_configured'=>$settings['openai_configured'],'smtp_enabled'=>$settings['smtp_enabled'],'worker_running'=>$settings['worker_running']],JSON_PRETTY_PRINT),PHP_EOL;
