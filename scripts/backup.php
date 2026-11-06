<?php
if(PHP_SAPI!=='cli')exit;
require __DIR__.'/../server/bootstrap.php';require __DIR__.'/../server/improvements.php';require __DIR__.'/../server/backups.php';session_write_close();
try{
    $command=$argv[1]??'';
    if($command==='create'){$result=createBackup(null);$result['file']=realpath(backupDirectory().'/'.$result['id'].'.zip');}
    elseif($command==='verify'&&isset($argv[2])){$r=verifyBackup($argv[2]);$r['zip']->close();$result=['valid'=>true,'files'=>count($r['manifest']['files'])];}
    elseif($command==='restore'&&isset($argv[2],$argv[3]))$result=restoreBackup($argv[2],$argv[3]);
    else throw new RuntimeException('Uso: php scripts/backup.php create | verify caminho.zip | restore caminho.zip forma_restore_nome_novo');
    echo json_encode($result,JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),PHP_EOL;
}catch(Throwable $e){fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
