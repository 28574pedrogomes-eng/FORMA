<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || getenv('FORMA_TEST_MODE') !== '1') exit(1);
require __DIR__ . '/../server/bootstrap.php';
if (!preg_match('/^forma_test_[a-zA-Z0-9_]+$/D', $config['db_name'])) throw new RuntimeException('Base de teste inválida.');
require __DIR__ . '/../server/google-auth.php';
require __DIR__ . '/../vendor/autoload.php';

use Firebase\JWT\JWT;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;

function ensureGoogle(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
function rejectsGoogle(callable $fn, string $message): void {
    try { $fn(); } catch (Throwable $e) { return; }
    throw new RuntimeException($message);
}
$key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA, 'config' => 'C:/xampp/apache/conf/openssl.cnf']);
if (!$key) throw new RuntimeException('Não foi possível criar a chave RSA temporária.');
openssl_pkey_export($key, $privateKey, null, ['config' => 'C:/xampp/apache/conf/openssl.cnf']);
$details = openssl_pkey_get_details($key);
$b64 = static fn($s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
$jwks = ['keys' => [['kty' => 'RSA', 'kid' => 'forma-test', 'alg' => 'RS256', 'use' => 'sig', 'n' => $b64($details['rsa']['n']), 'e' => $b64($details['rsa']['e'])]]];
$id = '123456-forma-test.apps.googleusercontent.com';
$settings = ['enabled' => true, 'client_id' => $id, 'client_secret' => 'test-only-secret'];
$created = [];
function mockGoogleClient(array $settings, string $jwt, array $jwks, array &$history): Google\Client {
    $client = googleClient($settings);
    $stack = HandlerStack::create(new MockHandler([
        new Response(200, ['Content-Type' => 'application/json'], json_encode(['access_token' => 'test-token', 'id_token' => $jwt, 'expires_in' => 3600, 'token_type' => 'Bearer'])),
        new Response(200, ['Content-Type' => 'application/json'], json_encode($jwks)),
    ]));
    $stack->push(GuzzleHttp\Middleware::history($history));
    $client->setHttpClient(new GuzzleHttp\Client(['handler' => $stack]));
    return $client;
}
function freshGoogleClaims(string $id, array $overrides = []): array {
    return array_replace(['iss' => 'https://accounts.google.com', 'aud' => $id, 'sub' => 'forma-test-subject', 'email' => 'forma-test-google@example.test', 'email_verified' => true, 'name' => 'Cliente Google', 'iat' => time(), 'exp' => time() + 3600, 'nonce' => $_SESSION['google_oauth']['nonce']], $overrides);
}
try {
    saveGoogleSettings($settings);
    ensureGoogle(!array_key_exists('client_secret', googleAdminSettings()), 'Segredo exposto na configuração pública.');
    saveGoogleSettings(['enabled' => true, 'client_id' => $id, 'client_secret' => '']);
    ensureGoogle(googleSettings()['client_secret'] === 'test-only-secret', 'Guardar em branco apagou o segredo.');
    $url = startGoogleAuth(['intent' => 'login', 'checkout' => true]);
    parse_str(parse_url($url, PHP_URL_QUERY), $params);
    ensureGoogle(parse_url($url, PHP_URL_HOST) === 'accounts.google.com', 'Host OAuth incorreto.');
    ensureGoogle($params['scope'] === 'openid email profile' && $params['response_type'] === 'code', 'Âmbitos ou fluxo incorretos.');
    ensureGoogle($params['redirect_uri'] === googleCallbackUrl() && $params['code_challenge_method'] === 'S256', 'Redirect ou PKCE incorreto.');
    ensureGoogle($params['code_challenge'] === $b64(hash('sha256', $_SESSION['google_oauth']['verifier'], true)), 'PKCE não corresponde à sessão.');
    $verifier = $_SESSION['google_oauth']['verifier'];
    $jwt = JWT::encode(freshGoogleClaims($id), $privateKey, 'RS256', 'forma-test');
    $history = [];
    $oldSession = session_id();
    $result = completeGoogleAuth(['state' => $params['state'], 'code' => 'test-code'], mockGoogleClient($settings, $jwt, $jwks, $history));
    $account = user(); $created[] = $account['id'];
    ensureGoogle($result['ok'] && $result['checkout'] && $account['role'] === 'customer', 'Login não criou um cliente ou perdeu o checkout.');
    ensureGoogle(session_id() !== $oldSession && strlen($_SESSION['csrf']) === 64, 'Sessão/CSRF não foram renovados.');
    parse_str((string)$history[0]['request']->getBody(), $exchange);
    ensureGoogle($exchange['code_verifier'] === $verifier && $exchange['client_secret'] === 'test-only-secret', 'Troca de código sem PKCE/segredo.');
    ensureGoogle(!isset($_SESSION['google_oauth']) && !isset($_SESSION['access_token']), 'Token/estado retido.');
    rejectsGoogle(fn() => completeGoogleAuth(['state' => $params['state'], 'code' => 'test-code']), 'Replay aceite.');

    // Subsequent login resolves the stable subject, even after the Google email changes.
    $_SESSION = []; startGoogleAuth(['intent' => 'login']);
    $state = $_SESSION['google_oauth']['state'];
    $jwt = JWT::encode(freshGoogleClaims($id, ['email' => 'forma-test-new-google@example.test']), $privateKey, 'RS256', 'forma-test');
    $history = []; completeGoogleAuth(['state' => $state, 'code' => 'another-code'], mockGoogleClient($settings, $jwt, $jwks, $history));
    ensureGoogle(user()['id'] === $account['id'], 'Foi criada uma conta duplicada para o mesmo subject.');

    $_SESSION = []; startGoogleAuth(['intent' => 'login']);
    rejectsGoogle(fn() => completeGoogleAuth(['state' => 'wrong', 'code' => 'x']), 'Estado incorreto aceite.');
    startGoogleAuth(['intent' => 'login']); $_SESSION['google_oauth']['created_at'] = time() - 601;
    rejectsGoogle(fn() => completeGoogleAuth(['state' => $_SESSION['google_oauth']['state'], 'code' => 'x']), 'Estado expirado aceite.');
    startGoogleAuth(['intent' => 'login']);
    rejectsGoogle(fn() => completeGoogleAuth(['state' => $_SESSION['google_oauth']['state'], 'error' => 'access_denied']), 'Cancelamento ignorado.');
    startGoogleAuth(['intent' => 'login']);
    $claims = freshGoogleClaims($id); $nonce = $claims['nonce'];
    foreach (['aud' => 'wrong-client', 'iss' => 'https://example.test', 'nonce' => 'wrong', 'email_verified' => false, 'exp' => time() - 1, 'iat' => time() + 1000] as $field => $invalid) {
        rejectsGoogle(fn() => validateGoogleClaims(array_replace($claims, [$field => $invalid]), $id, $nonce), 'Claim inválida aceite: ' . $field);
    }
    $jwt = JWT::encode($claims, $privateKey, 'RS256', 'forma-test');
    $parts = explode('.', $jwt); $changed = $claims; $changed['email'] = 'forma-test-attacker@example.test'; $parts[1] = $b64(json_encode($changed));
    $history = [];
    rejectsGoogle(fn() => completeGoogleAuth(['state' => $_SESSION['google_oauth']['state'], 'code' => 'tampered'], mockGoogleClient($settings, implode('.', $parts), $jwks, $history)), 'JWT com assinatura inválida aceite.');

    $admin = query("SELECT * FROM users WHERE role='admin' LIMIT 1")->fetch();
    $_SESSION = []; startGoogleAuth(['intent' => 'login']);
    $claims = freshGoogleClaims($id, ['sub' => 'forma-test-admin-sub', 'email' => $admin['email']]);
    rejectsGoogle(fn() => resolveGoogleUser($claims, $_SESSION['google_oauth']), 'Email de administrador associado automaticamente.');
    loginUser($admin); startGoogleAuth(['intent' => 'link']);
    $linkFlow = $_SESSION['google_oauth'];
    rejectsGoogle(fn() => resolveGoogleUser(array_replace($claims, ['email' => 'forma-test-other@example.test']), $linkFlow), 'Associação com outro email aceite.');
    $linked = resolveGoogleUser($claims, $linkFlow);
    ensureGoogle((int)$linked['id'] === (int)$admin['id'] && $linked['role'] === 'admin', 'Associação alterou permissões.');
    $_SESSION['version']++;
    rejectsGoogle(fn() => resolveGoogleUser($claims, $linkFlow), 'Associação com sessão alterada aceite.');
    query('DELETE FROM google_identities WHERE user_id=?', [$admin['id']]);
    echo "Google OAuth: assinatura RSA, claims, PKCE, state, nonce, replay, sessões e associação de contas verificados.\n";
} finally {
    foreach ($created as $userId) query('DELETE FROM users WHERE id=?', [$userId]);
    if (isset($admin)) query('DELETE FROM google_identities WHERE user_id=?', [$admin['id']]);
    foreach ([googleSettingsPath(), googleSettingsPath() . '.lock'] as $path) if (is_file($path)) unlink($path);
}
