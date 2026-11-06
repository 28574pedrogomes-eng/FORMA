<?php
declare(strict_types=1);
if($route==='/admin/backups'){
    $actor=admin();require_once __DIR__.'/backups.php';
    if($method==='GET')respond(query('SELECT b.*,u.name AS creator_name FROM backups b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.created_at DESC,b.id DESC LIMIT 50')->fetchAll());
    if($method==='POST'){currentPassword(body(),$actor);rateLimit('backup-create',5,3600);respond(createBackup((int)$actor['id']),201);}
}
if(preg_match('~^/admin/backups/([a-f0-9]{32})/download$~D',$route,$m)&&$method==='GET'){
    admin();require_once __DIR__.'/backups.php';$row=query('SELECT * FROM backups WHERE id=?',[$m[1]])->fetch();$path=backupDirectory().'/'.$m[1].'.zip';if(!$row||!is_file($path))fail('Backup não encontrado.',404);
    if(!hash_equals($row['sha256'],hash_file('sha256',$path)))fail('A verificação de integridade do backup falhou.',409);
    activity('Backup descarregado','Arquivo #'.$row['id']);header('Content-Type: application/zip');header('Content-Disposition: attachment; filename="forma-backup-'.$row['id'].'.zip"');header('Content-Length: '.filesize($path));session_write_close();readfile($path);exit;
}
