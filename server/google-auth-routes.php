<?php
declare(strict_types=1);
if ($route === '/auth/google/status' && $method === 'GET') {
    $actor = user(false);
    respond(['enabled' => googleReady(), 'linked' => $actor ? (bool)query('SELECT user_id FROM google_identities WHERE user_id=?', [$actor['id']])->fetchColumn() : false]);
}
if ($route === '/auth/google/start' && $method === 'POST') {
    rateLimit('google-start', 20);
    respond(['url' => startGoogleAuth(body())]);
}
if ($route === '/auth/google/result' && $method === 'GET') {
    $result = $_SESSION['google_result'] ?? ['ok' => false, 'message' => 'Este pedido já terminou. Inicia sessão para continuar.'];
    unset($_SESSION['google_result']);
    respond($result);
}
if ($route === '/admin/auth/google' && $method === 'GET') { admin(); respond(googleAdminSettings()); }
if ($route === '/admin/auth/google' && $method === 'PUT') { admin(); saveGoogleSettings(body()); respond(googleAdminSettings()); }
