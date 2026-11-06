<?php
declare(strict_types=1);

$config = [
    'db_host' => getenv('DB_HOST') ?: '127.0.0.1',
    'db_port' => getenv('DB_PORT') ?: '3306',
    'db_name' => getenv('DB_NAME') ?: 'forma_shop',
    'db_user' => getenv('DB_USER') ?: 'root',
    'db_password' => getenv('DB_PASSWORD') ?: '',
    'app_url' => getenv('APP_URL') ?: 'http://localhost:8081',
];
if (is_file(__DIR__ . '/config.local.php')) {
    $config = array_replace($config, require __DIR__ . '/config.local.php');
}
if (getenv('FORMA_TEST_MODE') === '1') {
    $testDatabase = getenv('DB_NAME') ?: '';
    if (!preg_match('/^forma_test_[a-zA-Z0-9_]+$/D', $testDatabase)) { throw new RuntimeException('Os testes exigem uma base isolada com prefixo forma_test_.'); }
    $config['db_name'] = $testDatabase;
    $config['app_url'] = getenv('APP_URL') ?: 'http://127.0.0.1:8091';
}
return $config;
