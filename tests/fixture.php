<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || getenv('FORMA_TEST_MODE') !== '1') { exit(1); }
$config = require __DIR__ . '/../server/config.php';
if (!preg_match('/^forma_test_[a-zA-Z0-9_]+$/D', $config['db_name'])) { throw new RuntimeException('Base de teste inválida.'); }
$db = new PDO("mysql:host={$config['db_host']};port={$config['db_port']};dbname={$config['db_name']};charset=utf8mb4", $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
if (($argv[1] ?? '') === 'cleanup') {
    $restoreName='forma_restore_test_'.substr($config['db_name'],strlen('forma_test_'));
    if(!preg_match('/^forma_restore_test_[a-zA-Z0-9_]+$/D',$restoreName))throw new RuntimeException('Invalid cleanup database');
    $db->exec("DROP DATABASE IF EXISTS `$restoreName`");
    $storage=realpath(__DIR__.'/../storage');
    foreach(['backups-'.$config['db_name'],'support-'.$config['db_name'],'restores/'.$restoreName] as $relative){
        $path=realpath($storage.'/'.$relative);if(!$path)continue;
        if(!str_starts_with($path,$storage.DIRECTORY_SEPARATOR)||is_link($path))throw new RuntimeException('Unsafe cleanup path');
        $files=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
        foreach($files as $file){if($file->isLink()||!str_starts_with($file->getRealPath(),$path.DIRECTORY_SEPARATOR))throw new RuntimeException('Unsafe cleanup file');if($file->isDir())rmdir($file->getPathname());else unlink($file->getPathname());}rmdir($path);
    }
    $db->exec("DROP DATABASE `{$config['db_name']}`");
    foreach (['.json','.json.lock','.json.tmp'] as $suffix) {
        $oauthFile = __DIR__ . '/../storage/google-oauth-' . $config['db_name'] . $suffix;
        if (is_file($oauthFile)) unlink($oauthFile);
    }
    echo "Base temporária eliminada: {$config['db_name']}\n";
} elseif (($argv[1] ?? '') === 'reset-limits') {
    $db->exec('DELETE FROM rate_limits');
} elseif (($argv[1] ?? '') === 'expire' && isset($argv[2])) {
    $stmt = $db->prepare('UPDATE password_resets SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE token_hash = ?');
    $stmt->execute([hash('sha256', $argv[2])]);
}
