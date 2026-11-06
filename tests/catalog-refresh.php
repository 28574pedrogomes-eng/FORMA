<?php
declare(strict_types=1);
// Exercise the migration against edited prices, variants, archived products and watchers.
if (PHP_SAPI !== 'cli' || getenv('FORMA_TEST_MODE') !== '1') exit(1);
$config = require __DIR__ . '/../server/config.php';
if (!preg_match('/^forma_test_[a-zA-Z0-9_]+$/D', $config['db_name'])) throw new RuntimeException('Base de teste inválida.');
$db = new PDO("mysql:host={$config['db_host']};port={$config['db_port']};dbname={$config['db_name']};charset=utf8mb4", $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
require_once __DIR__ . '/../server/catalog-refresh-migration.php';
function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$products = $db->query('SELECT id,price_cents,stock,active FROM products WHERE id IN (2,3,4,5) ORDER BY id')->fetchAll();
$variants = $db->query('SELECT id,product_id,price_cents,stock FROM product_variants WHERE product_id IN (2,3,4,5) ORDER BY id')->fetchAll();
$stockCount = (int)$db->query('SELECT COUNT(*) FROM stock_movements')->fetchColumn();
$adminId = (int)$db->query("SELECT id FROM users WHERE role='admin' LIMIT 1")->fetchColumn();
$extraId = 0;
try {
    $db->exec("UPDATE products SET price_cents=6900,stock=3 WHERE id=2");
    $db->exec("UPDATE product_variants SET price_cents=6900,stock=3 WHERE product_id=2");
    $db->exec("UPDATE products SET price_cents=3400 WHERE id=3");
    $db->exec("UPDATE product_variants SET price_cents=3400 WHERE product_id=3");
    $db->exec("INSERT INTO product_variants (product_id,label,sku,price_cents,stock,image) VALUES (3,'Extra','TEST-CATALOG-EXTRA',4400,2,'images/vase.jpg')");
    $extraId = (int)$db->lastInsertId();
    $db->exec("UPDATE products SET price_cents=7000 WHERE id=4");
    $db->exec("UPDATE product_variants SET price_cents=7000 WHERE product_id=4");
    $db->exec("UPDATE products SET price_cents=2900,active=0 WHERE id=5");
    $db->exec("UPDATE product_variants SET price_cents=2900 WHERE product_id=5");
    $db->prepare('INSERT INTO favorites (user_id,product_id) VALUES (?,2)')->execute([$adminId]);
    $db->prepare('INSERT INTO price_alerts (user_id,product_id,reference_price_cents,initial_price_cents) VALUES (?,2,6900,6900)')->execute([$adminId]);
    $db->exec("DELETE FROM schema_migrations WHERE version='catalog-refresh-2026-v1'");
    $result = migrateCatalogRefresh($db);
    check($result === ['added' => 0, 'repriced' => 1], 'A migração deve alterar apenas o preço original elegível.');
    check((int)$db->query('SELECT price_cents FROM products WHERE id=2')->fetchColumn() === 3900, 'Preço do produto incorreto.');
    check((int)$db->query('SELECT price_cents FROM product_variants WHERE product_id=2')->fetchColumn() === 3900, 'Preço da opção incorreto.');
    check((int)$db->query('SELECT stock FROM products WHERE id=2')->fetchColumn() === 3, 'A migração repôs stock.');
    check((int)$db->query('SELECT price_cents FROM products WHERE id=3')->fetchColumn() === 3400, 'Produto com opções editado.');
    check((int)$db->query('SELECT price_cents FROM products WHERE id=4')->fetchColumn() === 7000, 'Preço personalizado sobrescrito.');
    check((int)$db->query('SELECT active FROM products WHERE id=5')->fetchColumn() === 0, 'Produto arquivado reativado.');
    check((int)$db->query('SELECT COUNT(*) FROM stock_movements')->fetchColumn() === $stockCount, 'Movimentos de stock duplicados.');
    $watch = $db->query('SELECT reference_price_cents,notification_count FROM price_alerts WHERE product_id=2')->fetch();
    check((int)$watch['reference_price_cents'] === 3900 && (int)$watch['notification_count'] === 1, 'Alerta de redução não atualizado.');
    check(migrateCatalogRefresh($db) === ['added' => 0, 'repriced' => 0], 'A migração não é idempotente.');
    check((int)$db->query("SELECT COUNT(*) FROM notifications WHERE user_id=$adminId AND title='Um favorito baixou de preço'")->fetchColumn() === 1, 'Notificação em falta ou duplicada.');
    echo "Migração do catálogo: preços, opções, arquivo, stock e alertas verificados.\n";
} finally {
    if ($extraId) $db->prepare('DELETE FROM product_variants WHERE id=?')->execute([$extraId]);
    foreach ($products as $p) $db->prepare('UPDATE products SET price_cents=?,stock=?,active=? WHERE id=?')->execute([$p['price_cents'],$p['stock'],$p['active'],$p['id']]);
    foreach ($variants as $v) $db->prepare('UPDATE product_variants SET price_cents=?,stock=? WHERE id=?')->execute([$v['price_cents'],$v['stock'],$v['id']]);
    $db->prepare('DELETE FROM favorites WHERE user_id=? AND product_id=2')->execute([$adminId]);
    $db->prepare("DELETE FROM notifications WHERE user_id=? AND title='Um favorito baixou de preço'")->execute([$adminId]);
}
