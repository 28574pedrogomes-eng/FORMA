<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'||getenv('FORMA_TEST_MODE')!=='1')exit(1);
require __DIR__.'/../server/bootstrap.php';require __DIR__.'/../server/improvements.php';require __DIR__.'/../server/backups.php';session_write_close();
$action=$argv[1]??'';
if($action==='expire-email'){query('UPDATE email_changes SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE WHERE new_email=?',[$argv[2]]);}
elseif($action==='monitor'){
    query("INSERT INTO ai_jobs (id,session_hash,purpose,status,payload,result,error) VALUES (?,?,'chat','failed',?,?,'Falha de teste controlada')",[bin2hex(random_bytes(16)),str_repeat('0',64),'SECRET_QUESTION','SECRET_ANSWER']);
    query("INSERT INTO mail_outbox (recipient,subject,body,status,error) VALUES ('forma-test-monitor@example.test','Email de teste','SECRET_BODY','failed','SMTP de teste indisponível')");
}
elseif($action==='restore'){
    $id=$argv[2];if(!preg_match('/^[a-f0-9]{32}$/D',$id))exit(1);$target='forma_restore_test_'.substr($config['db_name'],strlen('forma_test_'));
    $file=backupDirectory().'/'.$id.'.zip';$result=restoreBackup($file,$target);
    $restored=new PDO("mysql:host={$config['db_host']};port={$config['db_port']};dbname=$target;charset=utf8mb4",$config['db_user'],$config['db_password']);
    $result['products']=(int)$restored->query('SELECT COUNT(*) FROM products')->fetchColumn();$result['tokens']=(int)$restored->query('SELECT COUNT(*) FROM email_changes')->fetchColumn();$result['bodies']=(int)$restored->query("SELECT COUNT(*) FROM mail_outbox WHERE body<>''")->fetchColumn();
    $checked=verifyBackup($file);$result['source_products']=count($checked['tables']['products']);$checked['zip']->close();
    $result['image_matches']=hash_file('sha256',__DIR__.'/../public/images/chair.jpg')===hash_file('sha256',$result['files'].'/public/images/chair.jpg');
    try{restoreBackup($file,$target);throw new RuntimeException('Existing destination accepted');}catch(RuntimeException $e){if(!str_contains($e->getMessage(),'já existe'))throw $e;}
    echo json_encode($result);
}
elseif($action==='tamper'){
    $file=backupDirectory().'/'.$argv[2].'.zip';$bad=backupDirectory().'/tampered.zip';copy($file,$bad);$z=new ZipArchive();$z->open($bad);$z->addFromString('database.json','{}');$z->close();$rejected=false;try{$v=verifyBackup($bad);$v['zip']->close();}catch(Throwable $e){$rejected=true;}unlink($bad);if(!$rejected)throw new RuntimeException('Damaged backup accepted');echo 'rejected';
}
elseif($action==='admin-email'){
    query("UPDATE users SET email=? WHERE role='admin'",[$argv[2]]);echo query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn();
}
