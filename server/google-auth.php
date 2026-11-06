<?php
declare(strict_types=1);

function googleSettingsPath(): string {
    global $config;
    return __DIR__ . '/../storage/google-oauth' . (getenv('FORMA_TEST_MODE') === '1' ? '-' . $config['db_name'] : '') . '.json';
}
function googleSettings(): array {
    $path = googleSettingsPath();
    return array_replace(['enabled' => false, 'client_id' => '', 'client_secret' => ''], is_file($path) ? json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR) : []);
}
function googleCallbackUrl(): string {
    global $config;
    return rtrim($config['app_url'], '/') . '/auth/google/callback.php';
}
function googleReady(?array $settings = null): bool {
    $settings ??= googleSettings();
    return $settings['enabled'] && $settings['client_id'] !== '' && $settings['client_secret'] !== '' && is_file(__DIR__ . '/../vendor/autoload.php');
}
function googleAdminSettings(): array {
    $settings = googleSettings();
    return ['enabled' => $settings['enabled'], 'client_id' => $settings['client_id'], 'secret_configured' => $settings['client_secret'] !== '', 'ready' => googleReady($settings), 'sdk_installed' => is_file(__DIR__ . '/../vendor/autoload.php'), 'redirect_uri' => googleCallbackUrl()];
}
function saveGoogleSettings(array $input): void {
    $lock = fopen(googleSettingsPath() . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Configuration lock failed');
    try {
        $settings = googleSettings();
        $id = field($input, 'client_id', 0, 255);
        if ($id !== '' && !preg_match('/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/D', $id)) fail('Introduz um Client ID OAuth válido do Google.', 422);
        $secret = field($input + ['client_secret' => ''], 'client_secret', 0, 512);
        if (preg_match('/[\s\x00]/', $secret)) fail('O Client Secret contém caracteres inválidos.', 422);
        if ($id !== $settings['client_id'] && $secret === '' && ($input['enabled'] ?? false) === true) fail('Ao mudar o Client ID, introduz também o respetivo Client Secret.', 422);
        if ($id !== $settings['client_id']) $settings['client_secret'] = '';
        $settings['client_id'] = $id;
        if (($input['clear_secret'] ?? false) === true) $settings['client_secret'] = '';
        if ($secret !== '') $settings['client_secret'] = $secret;
        $settings['enabled'] = ($input['enabled'] ?? false) === true;
        if ($settings['enabled'] && ($id === '' || $settings['client_secret'] === '')) fail('Preenche o Client ID e o Client Secret antes de ativar o Google.', 422);
        if ($settings['enabled'] && !is_file(__DIR__ . '/../vendor/autoload.php')) fail('Instala as dependências PHP com Composer antes de ativar o Google.', 422);
        $temporary = googleSettingsPath() . '.tmp';
        if (file_put_contents($temporary, json_encode($settings, JSON_THROW_ON_ERROR), LOCK_EX) === false || !rename($temporary, googleSettingsPath())) throw new RuntimeException('Configuration write failed');
        @chmod(googleSettingsPath(), 0600);
    } finally { flock($lock, LOCK_UN); fclose($lock); }
    activity('Login Google configurado', 'Configuração OAuth atualizada. Credenciais omitidas.');
}
function googleClient(array $settings): Google\Client {
    require_once __DIR__ . '/../vendor/autoload.php';
    $client = new Google\Client();
    $client->setClientId($settings['client_id']);
    $client->setClientSecret($settings['client_secret']);
    $client->setRedirectUri(googleCallbackUrl());
    $client->setScopes(['openid', 'email', 'profile']);
    $client->setAccessType('online');
    $client->setPrompt('select_account');
    $client->setHttpClient(new GuzzleHttp\Client(['timeout' => 15, 'connect_timeout' => 8]));
    return $client;
}
function startGoogleAuth(array $input): string {
    $settings = googleSettings();
    if (!googleReady($settings)) fail('O início de sessão com Google está temporariamente indisponível.', 503);
    $intent = $input['intent'] ?? 'login';
    if (!in_array($intent, ['login', 'link'], true)) fail('Pedido inválido.', 422);
    $actor = user($intent === 'link');
    if ($intent === 'login' && $actor) fail('Já tens uma sessão iniciada.', 409);
    if ($intent === 'link' && query('SELECT user_id FROM google_identities WHERE user_id=?', [$actor['id']])->fetchColumn()) fail('A tua conta já está associada ao Google.', 409);
    $state = bin2hex(random_bytes(32));
    $nonce = bin2hex(random_bytes(32));
    $verifier = bin2hex(random_bytes(32));
    $_SESSION['google_oauth'] = ['state' => $state, 'nonce' => $nonce, 'verifier' => $verifier, 'created_at' => time(), 'client_id' => $settings['client_id'], 'intent' => $intent, 'user_id' => $actor ? (int)$actor['id'] : null, 'version' => $_SESSION['version'] ?? null, 'checkout' => ($input['checkout'] ?? false) === true];
    unset($_SESSION['google_result']);
    $client = googleClient($settings);
    $client->setState($state);
    $url = $client->createAuthUrl();
    // PKCE S256 binds the code to this browser session, in addition to state and nonce.
    return $url . '&' . http_build_query(['nonce' => $nonce, 'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='), 'code_challenge_method' => 'S256'], '', '&', PHP_QUERY_RFC3986);
}
function validateGoogleClaims(array $claims, string $clientId, string $nonce): void {
    if (!in_array($claims['iss'] ?? '', ['https://accounts.google.com', 'accounts.google.com'], true)
        || ($claims['aud'] ?? '') !== $clientId
        || (isset($claims['azp']) && $claims['azp'] !== $clientId)
        || !is_numeric($claims['exp'] ?? null) || (int)$claims['exp'] <= time()
        || !is_numeric($claims['iat'] ?? null) || (int)$claims['iat'] > time() + 60
        || !is_string($claims['nonce'] ?? null) || !hash_equals($nonce, $claims['nonce'])
        || !is_string($claims['sub'] ?? null) || !preg_match('/^[\x21-\x7e]{1,255}$/D', $claims['sub'])
        || !in_array($claims['email_verified'] ?? false, [true, 'true'], true)
        || !is_string($claims['email'] ?? null) || strlen($claims['email']) > 190 || !filter_var($claims['email'], FILTER_VALIDATE_EMAIL)) {
        fail('Não foi possível confirmar a identidade Google. Tenta novamente.', 401);
    }
}
function resolveGoogleUser(array $claims, array $flow): array {
    $email = mb_strtolower($claims['email']);
    $actor = user(false);
    if ($flow['intent'] === 'link' && (!$actor || (int)$actor['id'] !== $flow['user_id'] || ($_SESSION['version'] ?? null) !== $flow['version'])) fail('A sessão mudou. Inicia sessão novamente antes de associar o Google.', 401);
    if ($flow['intent'] === 'login' && $actor) fail('A sessão mudou. Termina a sessão antes de entrar com outra conta.', 409);
    return transaction(function () use ($claims, $email, $flow, $actor) {
        $identity = query('SELECT u.* FROM google_identities g JOIN users u ON u.id=g.user_id WHERE g.subject=? FOR UPDATE', [$claims['sub']])->fetch();
        if ($identity) {
            if ($flow['intent'] === 'link' && (int)$identity['id'] !== (int)$actor['id']) fail('Esta conta Google já está associada a outra conta FORMA.', 409);
            return $identity;
        }
        if ($flow['intent'] === 'link') {
            $current = query('SELECT * FROM users WHERE id=? FOR UPDATE', [$actor['id']])->fetch();
            if ((int)$current['session_version'] !== $flow['version']) fail('A sessão expirou. Inicia sessão novamente.', 401);
            if (mb_strtolower($current['email']) !== $email) fail('Escolhe a conta Google com o mesmo email da tua conta FORMA.', 409);
            if (query('SELECT user_id FROM google_identities WHERE user_id=?', [$actor['id']])->fetchColumn()) fail('A tua conta já tem um Google associado.', 409);
            $id = (int)$actor['id'];
        } else {
            // Never link by email alone, even when Google marks it verified.
            if (query('SELECT id FROM users WHERE email=? FOR UPDATE', [$email])->fetchColumn()) fail('Já existe uma conta com este email. Entra com a tua palavra-passe e escolhe Associar Google na tua conta.', 409);
            $name = is_string($claims['name'] ?? null) ? trim(mb_substr($claims['name'], 0, 100)) : '';
            if (mb_strlen($name) < 2) $name = 'Cliente FORMA';
            query("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'customer')", [$name, $email, password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT)]);
            $id = (int)db()->lastInsertId();
            notifyUser($id, 'Bem-vindo à FORMA', 'A tua conta Google está associada. Já podes guardar favoritos e acompanhar as tuas encomendas.');
        }
        query('INSERT INTO google_identities (user_id,subject) VALUES (?,?)', [$id, $claims['sub']]);
        activity('Google associado', 'Identidade Google associada à conta.', $id);
        return query('SELECT * FROM users WHERE id=?', [$id])->fetch();
    });
}
function completeGoogleAuth(array $params, ?Google\Client $client = null): array {
    $flow = $_SESSION['google_oauth'] ?? null;
    unset($_SESSION['google_oauth']); // Every callback consumes its state, including denial and failure.
    if (!$flow || !is_string($params['state'] ?? null) || !hash_equals($flow['state'], $params['state']) || time() - $flow['created_at'] > 600) fail('O pedido de login expirou ou é inválido. Tenta novamente.', 401);
    if (isset($params['error'])) fail('O início de sessão com Google foi cancelado. Podes tentar novamente ou usar o teu email.', 400);
    $settings = googleSettings();
    if (!googleReady($settings) || $flow['client_id'] !== $settings['client_id']) fail('A configuração Google mudou. Tenta novamente.', 409);
    $code = field($params, 'code', 1, 4096);
    $client ??= googleClient($settings);
    $tokens = $client->fetchAccessTokenWithAuthCode($code, $flow['verifier']);
    if (!empty($tokens['error']) || !is_string($tokens['id_token'] ?? null)) fail('O Google não confirmou o início de sessão. Tenta novamente.', 401);
    $claims = $client->verifyIdToken($tokens['id_token']);
    if (!is_array($claims)) fail('Não foi possível validar a identidade Google.', 401);
    validateGoogleClaims($claims, $settings['client_id'], $flow['nonce']);
    $account = resolveGoogleUser($claims, $flow);
    loginUser($account);
    activity('Início de sessão Google', 'Autenticação Google concluída.');
    // Tokens are deliberately not persisted: this app only needs an authenticated session.
    return ['ok' => true, 'message' => $flow['intent'] === 'link' ? 'A tua conta Google ficou associada.' : 'Sessão iniciada com Google.', 'checkout' => $flow['checkout']];
}
