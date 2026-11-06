<?php
declare(strict_types=1);
function backupDirectory():string {
    global $config;$dir=__DIR__.'/../storage/backups'.(getenv('FORMA_TEST_MODE')==='1'?'-'.$config['db_name']:'');
    if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new RuntimeException('Backup directory unavailable');return $dir;
}
function backupTables():array {
    $tables=query('SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE'])->fetchAll(PDO::FETCH_COLUMN);
    foreach($tables as $table)if(!preg_match('/^[a-z_]+$/D',$table))throw new RuntimeException('Unexpected table name');sort($tables);return $tables;
}
function createBackup(?int $actorId):array {
    set_time_limit(180);$id=bin2hex(random_bytes(16));$path=backupDirectory().'/'.$id.'.zip';$zip=new ZipArchive();
    if($zip->open($path,ZipArchive::CREATE|ZipArchive::EXCL)!==true)throw new RuntimeException('Cannot create backup');
    $closed=false;$manifest=['format'=>'forma-backup-v1','created_at'=>gmdate('c'),'files'=>[],'excluded'=>'Credenciais Gemini/OpenAI/SMTP, sessões, tokens, trabalhos IA, corpos de emails, vídeos e backups anteriores.'];
    try{
        db()->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');db()->beginTransaction();$tables=[];
        foreach(backupTables() as $table){
            $rows=in_array($table,['backups','password_resets','email_changes','rate_limits','ai_jobs'],true)?[]:query("SELECT * FROM `$table`")->fetchAll();
            if($table==='mail_outbox')foreach($rows as &$mail){$mail['body']='';if(in_array($mail['status'],['queued','processing'],true)){$mail['status']='failed';$mail['error']='Envio não retomado após recuperação de backup.';}}unset($mail);
            if($table==='support_attachments')$rows=array_values(array_filter($rows,fn($row)=>$row['message_id']!==null));
            $tables[$table]=$rows;
        }
        db()->commit();$json=json_encode(['tables'=>$tables],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        $zip->addFromString('database.json',$json);$manifest['files']['database.json']=['bytes'=>strlen($json),'sha256'=>hash('sha256',$json)];
        $paths=[];
        foreach(['images','uploads'] as $folder){foreach(glob(__DIR__.'/../public/'.$folder.'/*')?:[] as $file){if(is_file($file)&&!is_link($file)&&preg_match('/^[a-z0-9-]+\.(jpg|jpeg|png|webp|svg)$/D',basename($file)))$paths['public/'.$folder.'/'.basename($file)]=$file;}}
        foreach($tables['support_attachments'] as $a){$file=attachmentDirectory().'/'.$a['id'];if(!is_file($file))throw new RuntimeException('Falta um anexo privado necessário ao backup.');$paths['private/support/'.$a['id']]=$file;}
        $total=strlen($json);
        foreach($paths as $entry=>$file){$bytes=filesize($file);$total+=$bytes;if($total>1024*1024*1024)throw new RuntimeException('O backup excede 1 GB. Usa uma ferramenta de backup dedicada.');$hash=hash_file('sha256',$file);if(!$zip->addFile($file,$entry))throw new RuntimeException('Cannot add backup file');$manifest['files'][$entry]=['bytes'=>$bytes,'sha256'=>$hash];}
        $zip->addFromString('manifest.json',json_encode($manifest,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));if(!$zip->close())throw new RuntimeException('Cannot finalize backup');$closed=true;
        // Verify compressed contents before exposing the archive for download.
        $verified=verifyBackup($path);$verified['zip']->close();
        $bytes=filesize($path);$hash=hash_file('sha256',$path);query('INSERT INTO backups (id,size_bytes,sha256,created_by) VALUES (?,?,?,?)',[$id,$bytes,$hash,$actorId]);activity('Backup criado','Base de dados, imagens e anexos privados.',$actorId);
        return ['id'=>$id,'size_bytes'=>$bytes,'sha256'=>$hash];
    }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();if(!$closed)$zip->close();if(is_file($path))unlink($path);throw $e;}
}
function verifyBackup(string $path):array {
    $zip=new ZipArchive();if($zip->open($path)!==true)throw new RuntimeException('Arquivo ZIP inválido.');
    try{
        $stat=$zip->statName('manifest.json');if(!$stat||$stat['size']>5*1024*1024)throw new RuntimeException('Manifesto inválido.');
        $manifest=json_decode($zip->getFromName('manifest.json'),true,64,JSON_THROW_ON_ERROR);
        if(($manifest['format']??'')!=='forma-backup-v1'||!is_array($manifest['files']??null)||count($manifest['files'])>10000||$zip->numFiles!==count($manifest['files'])+1)throw new RuntimeException('Formato de backup inválido.');
        $total=0;foreach($manifest['files'] as $name=>$meta){
            if(!preg_match('~^(database\.json|public/(images|uploads)/[a-z0-9-]+\.(jpg|jpeg|png|webp|svg)|private/support/[a-f0-9]{32})$~D',$name))throw new RuntimeException('Caminho não permitido no backup.');
            $stat=$zip->statName($name);if(!$stat||$stat['size']!==$meta['bytes']||($name==='database.json'&&$stat['size']>100*1024*1024))throw new RuntimeException('Tamanho de ficheiro inválido.');$total+=$stat['size'];if($total>1024*1024*1024)throw new RuntimeException('Backup demasiado grande.');
            $stream=$zip->getStream($name);if(!$stream)throw new RuntimeException('Não foi possível verificar um ficheiro.');$hash=hash_init('sha256');hash_update_stream($hash,$stream);fclose($stream);if(!hash_equals($meta['sha256'],hash_final($hash)))throw new RuntimeException('O backup contém um ficheiro alterado ou danificado.');
        }
        $database=json_decode($zip->getFromName('database.json'),true,128,JSON_THROW_ON_ERROR);
        if(!is_array($database['tables']??null))throw new RuntimeException('Dados inválidos.');return ['zip'=>$zip,'manifest'=>$manifest,'tables'=>$database['tables']];
    }catch(Throwable $e){$zip->close();throw $e;}
}
function restoreBackup(string $path,string $target):array {
    // CLI-only recovery into a new database. Never overwrite the running shop.
    if(PHP_SAPI!=='cli'||!preg_match('/^forma_restore_[a-zA-Z0-9_]{1,40}$/D',$target))throw new RuntimeException('Usa um nome novo com prefixo forma_restore_.');
    global $config;$checked=verifyBackup($path);$zip=$checked['zip'];$known=backupTables();$incoming=array_keys($checked['tables']);sort($incoming);
    if($incoming!==$known){$zip->close();throw new RuntimeException('As versões do esquema não coincidem. Usa a versão do projeto que criou o backup.');}
    $root=__DIR__.'/../storage/restores';if(!is_dir($root))mkdir($root,0700,true);$destination=$root.'/'.$target;
    if(file_exists($destination)||query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[$target])->fetchColumn()){$zip->close();throw new RuntimeException('O destino já existe. Escolhe outro nome.');}
    $schemas=[];foreach($known as $table)$schemas[$table]=query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1];
    db()->exec("CREATE DATABASE `$target` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $restored=new PDO("mysql:host={$config['db_host']};port={$config['db_port']};dbname=$target;charset=utf8mb4",$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
    $restored->exec("SET time_zone = '+00:00'");
    try{
        $restored->exec('SET FOREIGN_KEY_CHECKS=0');foreach($schemas as $sql)$restored->exec($sql);
        $restored->beginTransaction();
        foreach($known as $table){
            $columns=$restored->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_COLUMN);$rows=$checked['tables'][$table];
            if(in_array($table,['backups','email_changes','password_resets','ai_jobs','rate_limits'],true))continue;
            foreach($rows as $row){if(array_diff(array_keys($row),$columns)||!$row)throw new RuntimeException('Colunas desconhecidas no backup.');
                if($table==='users')$row['session_version']=(int)$row['session_version']+1;
                if($table==='mail_outbox'){$row['body']='';if(in_array($row['status'],['queued','processing'],true))$row['status']='failed';}
                $names=implode(',',array_map(fn($c)=>"`$c`",array_keys($row)));$placeholders=implode(',',array_fill(0,count($row),'?'));
                $restored->prepare("INSERT INTO `$table` ($names) VALUES ($placeholders)")->execute(array_values($row));
            }
        }
        $restored->commit();$restored->exec('SET FOREIGN_KEY_CHECKS=1');
        if(!mkdir($destination,0700))throw new RuntimeException('Não foi possível criar o destino.');
        foreach($checked['manifest']['files'] as $name=>$meta){if($name==='database.json')continue;$output=$destination.'/'.$name;$parent=dirname($output);if(!is_dir($parent))mkdir($parent,0700,true);$in=$zip->getStream($name);$out=fopen($output,'xb');if(!$in||!$out)throw new RuntimeException('Não foi possível restaurar um ficheiro.');$copied=stream_copy_to_stream($in,$out);fclose($in);fclose($out);if($copied!==$meta['bytes'])throw new RuntimeException('Cópia incompleta.');}
        $zip->close();return ['database'=>$target,'files'=>realpath($destination),'tables'=>count($known)];
    }catch(Throwable $e){if($restored->inTransaction())$restored->rollBack();$zip->close();throw new RuntimeException('Recuperação incompleta no destino novo '.$target.'. A loja original foi preservada. '.$e->getMessage());}
}
