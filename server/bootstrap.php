<?php
declare(strict_types=1);

date_default_timezone_set('UTC');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../storage/php-error.log');
$config = require __DIR__ . '/config.php';
session_name('forma_session');
session_start([
    'cookie_httponly' => true,
    'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'cookie_samesite' => 'Lax',
    'use_strict_mode' => true,
    'cookie_path' => '/',
]);
if (!isset($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(32)); }
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

final class ApiError extends RuntimeException {
    public function __construct(string $message, public int $status = 400) { parent::__construct($message); }
}
function fail(string $message, int $status = 400): never { throw new ApiError($message, $status); }
function respond(mixed $data = [], int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function db(): PDO {
    static $db;
    global $config;
    if (!$db) {
        $db = new PDO("mysql:host={$config['db_host']};port={$config['db_port']};dbname={$config['db_name']};charset=utf8mb4", $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $db->exec("SET time_zone = '+00:00'");
    }
    return $db;
}
function query(string $sql, array $params = []): PDOStatement {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}
function body(): array {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 100000) { fail('Pedido demasiado grande.', 413); }
    try { $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { fail('O pedido JSON é inválido.'); }
    if (!is_array($data) || array_is_list($data)) { fail('Os dados do pedido são inválidos.'); }
    return $data;
}
function field(array $data, string $key, int $min, int $max): string {
    if (!isset($data[$key]) || !is_string($data[$key])) { fail("Preenche o campo $key.", 422); }
    $value = trim($data[$key]);
    if (mb_strlen($value) < $min || mb_strlen($value) > $max) { fail("O campo $key deve ter entre $min e $max caracteres.", 422); }
    return $value;
}
function integer(mixed $value, int $min, int $max, string $name): int {
    if (filter_var($value, FILTER_VALIDATE_INT) === false || $value < $min || $value > $max) { fail("Valor inválido: $name.", 422); }
    return (int)$value;
}
function emailField(array $data): string {
    $email = mb_strtolower(field($data, 'email', 3, 190));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { fail('Introduz um email válido.', 422); }
    return $email;
}
function passwordField(array $data): string {
    $password = $data['password'] ?? null;
    if (!is_string($password) || strlen($password) < 10 || strlen($password) > 72) { fail('A palavra-passe deve ter entre 10 e 72 caracteres.', 422); }
    return $password;
}
function user(bool $required = true): ?array {
    $user = isset($_SESSION['user_id']) ? query('SELECT id,name,email,role,session_version FROM users WHERE id = ?', [$_SESSION['user_id']])->fetch() : false;
    if ($user && (int)$user['session_version'] !== ($_SESSION['version'] ?? 0)) { $user = false; unset($_SESSION['user_id'], $_SESSION['version']); }
    if (!$user && $required) { fail('Inicia sessão para continuar.', 401); }
    if ($user) { unset($user['session_version']); }
    return $user ?: null;
}
function admin(): array {
    $user = user();
    if ($user['role'] !== 'admin') { fail('Não tens acesso a esta área.', 403); }
    return $user;
}
function loginUser(array $user): void {
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['version'] = (int)$user['session_version'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
function rateLimit(string $scope, int $max, int $seconds = 900): void {
    $bucket = hash('sha256', $scope . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'local'));
    query('DELETE FROM rate_limits WHERE expires_at < UTC_TIMESTAMP()');
    query('INSERT INTO rate_limits (bucket, attempts, expires_at) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE attempts = attempts + 1', [$bucket, gmdate('Y-m-d H:i:s', time() + $seconds)]);
    if ((int)query('SELECT attempts FROM rate_limits WHERE bucket = ?', [$bucket])->fetchColumn() > $max) {
        header('Retry-After: ' . $seconds);
        fail('Demasiadas tentativas. Tenta novamente dentro de 15 minutos.', 429);
    }
}
function activity(string $action, string $details, ?int $userId = null): void {
    query('INSERT INTO activity_logs (user_id,action,details) VALUES (?,?,?)', [$userId ?? ($_SESSION['user_id'] ?? null), $action, mb_substr($details, 0, 500)]);
}
function notifyUser(int $userId, string $title, string $message): void {
    query('INSERT INTO notifications (user_id,title,message) VALUES (?,?,?)', [$userId, $title, $message]);
}
function transaction(callable $fn): mixed {
    db()->beginTransaction();
    try { $result = $fn(); db()->commit(); return $result; }
    catch (Throwable $e) { if (db()->inTransaction()) { db()->rollBack(); } throw $e; }
}
function productFields(array $data): array {
    $category = integer($data['category_id'] ?? null, 1, PHP_INT_MAX, 'categoria');
    if (!query('SELECT id FROM categories WHERE id = ?', [$category])->fetchColumn()) { fail('Seleciona uma categoria existente.', 422); }
    $image = field($data, 'image', 1, 500);
    if (!preg_match('~^(images/[a-z0-9-]+\.(jpg|png|webp)|uploads/[a-f0-9]{32}\.(jpg|png|webp))$~D', $image) || !is_file(__DIR__ . '/../public/' . $image)) { fail('Carrega uma fotografia válida.', 422); }
    return [$category, field($data, 'name', 2, 120), field($data, 'description', 10, 5000), integer($data['price_cents'] ?? null, 1, 100000000, 'preço'), integer($data['stock'] ?? null, 0, 100000, 'stock'), $image, field($data, 'badge', 0, 30), field($data, 'material', 0, 100), !empty($data['featured']) ? 1 : 0, field($data + ['dimensions'=>''], 'dimensions', 0, 120)];
}
function orderWithItems(array $order): array {
    $order['items'] = query('SELECT * FROM order_items WHERE order_id = ?', [$order['id']])->fetchAll();
    $order['payments'] = query('SELECT id,outcome,amount_cents,created_at FROM payment_attempts WHERE order_id=? ORDER BY id DESC', [$order['id']])->fetchAll();
    $order['timeline'] = query('SELECT status,note,occurred_at FROM order_events WHERE order_id=? ORDER BY id',[$order['id']])->fetchAll();
    return $order;
}
