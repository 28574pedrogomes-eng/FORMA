<?php
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: DENY');
$build = __DIR__ . '/build/index.html';
if (!is_file($build)) {
    http_response_code(503);
    echo 'A FORMA ainda não foi compilada. Executa iniciar.bat ou npm run build.';
    exit;
}
// Mantém os assets relativos para funcionar também em /forma/public/ no Apache.
echo str_replace(['src="./assets/', 'href="./assets/'], ['src="./build/assets/', 'href="./build/assets/'], file_get_contents($build));
