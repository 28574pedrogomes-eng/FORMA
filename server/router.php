<?php
// Router exclusivo para o servidor de desenvolvimento PHP.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$public = realpath(__DIR__ . '/../public');
$file = realpath($public . $path);
if ($file && str_starts_with($file, $public . DIRECTORY_SEPARATOR) && is_file($file)
    && !preg_match('~(^|[/\\\\])\.~', $path)) {
    if (strtolower(pathinfo($file, PATHINFO_EXTENSION)) === 'mp4') {
        require_once __DIR__ . '/media.php';
        serveVideo($file);
    }
    return false;
}
if ($path === '/' || $path === '/index.php') {
    require $public . '/index.php';
    return true;
}
http_response_code(404);
echo 'Página não encontrada.';
