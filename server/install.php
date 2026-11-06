<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$config = require __DIR__ . '/config.php';
if (!preg_match('/^[a-zA-Z0-9_]+$/', $config['db_name'])) { throw new RuntimeException('Nome da base de dados inválido.'); }
$db = new PDO("mysql:host={$config['db_host']};port={$config['db_port']};charset=utf8mb4", $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec("CREATE DATABASE IF NOT EXISTS `{$config['db_name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$db->exec("USE `{$config['db_name']}`");
$db->exec(file_get_contents(__DIR__ . '/../database/schema.sql'));
$seed = require __DIR__ . '/../database/seed.php';
$db->beginTransaction();
try {
    if ((int)$db->query('SELECT COUNT(*) FROM categories')->fetchColumn() === 0) {
        $stmt = $db->prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
        foreach ($seed as $key => $category) { if ($key !== 'products') { $stmt->execute([$category['name'], $category['description']]); } }
    }
    if ((int)$db->query('SELECT COUNT(*) FROM products')->fetchColumn() === 0) {
        $stmt = $db->prepare('INSERT INTO products (category_id, name, description, price_cents, stock, image, badge, material, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($seed['products'] as $product) { $stmt->execute($product); }
    }
    $stmt = $db->prepare('SELECT id FROM users WHERE role = ? LIMIT 1');
    $stmt->execute(['admin']);
    if (!$stmt->fetchColumn()) {
        $password = getenv('ADMIN_PASSWORD') ?: 'Forma!' . bin2hex(random_bytes(6));
        if (strlen($password) < 10) { throw new RuntimeException('ADMIN_PASSWORD deve ter pelo menos 10 caracteres.'); }
        $db->prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')")->execute(['Administrador FORMA', 'admin@forma.pt', password_hash($password, PASSWORD_DEFAULT)]);
        $credentials = "Acesso local de administração FORMA\nEmail: admin@forma.pt\nPalavra-passe: $password\n";
        if (!is_dir(__DIR__ . '/../storage')) { mkdir(__DIR__ . '/../storage', 0700, true); }
        if (getenv('FORMA_TEST_MODE') !== '1') { file_put_contents(__DIR__ . '/../storage/setup-credentials.txt', $credentials, LOCK_EX); }
        echo $credentials;
    }
    $db->commit();
    require_once __DIR__ . '/migrate.php';
    migrateCommerce($db);
    require_once __DIR__ . '/catalog-migration.php';
    $added = migrateCatalog($db);
    if ($added) { echo "Coleção ampliada: $added novos produtos, com opções e inventário inicial.\n"; }
    require_once __DIR__ . '/news-migration.php';
    migrateNews($db);
    require_once __DIR__ . '/experience-migration.php';
    migrateExperience($db);
    require_once __DIR__ . '/improvements-migration.php';
    migrateImprovements($db);
    $db->exec(file_get_contents(__DIR__ . '/../database/google-auth.sql'));
    require_once __DIR__ . '/catalog-refresh-migration.php';
    $refresh = migrateCatalogRefresh($db);
    if ($refresh['added'] || $refresh['repriced']) { echo "Coleção 2026: {$refresh['added']} artigos adicionados; {$refresh['repriced']} preços revistos.\n"; }
    echo "Base de dados {$config['db_name']} pronta. Nenhum dado existente foi apagado.\n";
} catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } throw $e; }
