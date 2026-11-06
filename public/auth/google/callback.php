<?php
declare(strict_types=1);
require __DIR__ . '/../../../server/bootstrap.php';
require __DIR__ . '/../../../server/google-auth.php';
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail('Pedido inválido.', 405);
    rateLimit('google-callback', 30);
    $_SESSION['google_result'] = completeGoogleAuth($_GET);
} catch (ApiError $error) {
    $_SESSION['google_result'] = ['ok' => false, 'message' => $error->getMessage()];
} catch (Throwable $error) {
    // OAuth errors may contain secrets or tokens: never log their raw messages.
    error_log('Google OAuth callback failed: ' . get_class($error));
    $_SESSION['google_result'] = ['ok' => false, 'message' => 'Não foi possível entrar com Google. Tenta novamente dentro de momentos.'];
}
header('Content-Type: text/html; charset=utf-8');
header('Location: ' . rtrim($config['app_url'], '/') . '/#google-result', true, 303);
exit;
