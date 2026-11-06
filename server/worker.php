<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/integrations.php';
require __DIR__ . '/improvements.php';
session_write_close();
$lock = fopen(workerHeartbeat() . '.lock','c');
if (!$lock || !flock($lock,LOCK_EX|LOCK_NB)) { exit; }
do {
    touch(workerHeartbeat());
    query('DELETE FROM email_changes WHERE expires_at<UTC_TIMESTAMP()');
    foreach(query('SELECT id FROM support_attachments WHERE message_id IS NULL AND created_at<UTC_TIMESTAMP()-INTERVAL 1 DAY')->fetchAll(PDO::FETCH_COLUMN) as $attachmentId){
        if(preg_match('/^[a-f0-9]{32}$/D',$attachmentId)){$file=attachmentDirectory().'/'.$attachmentId;if(is_file($file))unlink($file);query('DELETE FROM support_attachments WHERE id=? AND message_id IS NULL',[$attachmentId]);}
    }
    // Never retry an uncertain delivery automatically: this could duplicate mail or API costs.
    query("UPDATE ai_jobs SET status='failed',error='O processamento foi interrompido. Tenta novamente.',payload='{}',finished_at=UTC_TIMESTAMP() WHERE status='processing' AND started_at<UTC_TIMESTAMP()-INTERVAL 3 MINUTE");
    query("UPDATE mail_outbox SET status='failed',error='Entrega interrompida; confirma no fornecedor antes de repetir.' WHERE status='processing' AND created_at<UTC_TIMESTAMP()-INTERVAL 10 MINUTE");
    query('DELETE FROM ai_jobs WHERE created_at<UTC_TIMESTAMP()-INTERVAL 1 DAY');
    query("UPDATE mail_outbox SET body='' WHERE created_at<UTC_TIMESTAMP()-INTERVAL 1 DAY AND status IN ('sent','failed','local')");
    $job = transaction(function () { $j=query("SELECT * FROM ai_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE")->fetch(); if($j) { query("UPDATE ai_jobs SET status='processing',started_at=UTC_TIMESTAMP() WHERE id=?",[$j['id']]); } return $j; });
    if ($job) {
        try { $result=callAi(json_decode($job['payload'],true,64,JSON_THROW_ON_ERROR)); query("UPDATE ai_jobs SET status='done',result=?,payload='{}',finished_at=UTC_TIMESTAMP() WHERE id=?",[json_encode($result,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$job['id']]); }
        catch(Throwable $e) { query("UPDATE ai_jobs SET status='failed',error=?,payload='{}',finished_at=UTC_TIMESTAMP() WHERE id=?",[mb_substr($e instanceof RuntimeException ? $e->getMessage() : 'A IA está indisponível.',0,255),$job['id']]); }
    }
    touch(workerHeartbeat());
    $mail = transaction(function () { $m=query("SELECT * FROM mail_outbox WHERE status='queued' ORDER BY id LIMIT 1 FOR UPDATE")->fetch(); if($m) { query("UPDATE mail_outbox SET status='processing',attempts=attempts+1 WHERE id=?",[$m['id']]); } return $m; });
    if($mail) {
        try { if(strtotime($mail['created_at'].' UTC')<time()-1500 && str_contains($mail['body'],'#reset?token=')) { throw new RuntimeException('Expired'); } sendSmtp($mail); query("UPDATE mail_outbox SET status='sent',body='',finished_at=UTC_TIMESTAMP() WHERE id=?",[$mail['id']]); }
        catch(Throwable $e) { query("UPDATE mail_outbox SET status='failed',error='Entrega falhou. Verifica as definições SMTP e pede uma nova mensagem.',finished_at=UTC_TIMESTAMP() WHERE id=?",[$mail['id']]); }
    }
    if (!in_array('--once',$argv,true)) { sleep(2); }
} while (!in_array('--once',$argv,true));
