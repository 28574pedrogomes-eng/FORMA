<?php
declare(strict_types=1);

// The PHP development server does not implement byte ranges for static MP4s.
// Apache serves these directly; this handler keeps local scroll seeking equivalent.
function serveVideo(string $file): never {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        http_response_code(405); header('Allow: GET, HEAD'); exit;
    }
    $size = filesize($file); $start = 0; $end = $size - 1;
    header('Content-Type: video/mp4');
    header('X-Content-Type-Options: nosniff');
    header('Accept-Ranges: bytes');
    header('Cache-Control: public, max-age=0, must-revalidate');
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', filemtime($file)) . ' GMT');
    $range = $method === 'GET' ? ($_SERVER['HTTP_RANGE'] ?? '') : '';
    if ($range !== '') {
        if (!preg_match('/^bytes=(\d*)-(\d*)$/D', $range, $parts) || ($parts[1] === '' && $parts[2] === '')) {
            http_response_code(416); header("Content-Range: bytes */$size"); header('Content-Length: 0'); exit;
        }
        if ($parts[1] === '') {
            $suffix = min($size, (int)$parts[2]);
            $start = $size - $suffix;
        } else {
            $start = (int)$parts[1];
            if ($parts[2] !== '') $end = min($end, (int)$parts[2]);
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416); header("Content-Range: bytes */$size"); header('Content-Length: 0'); exit;
        }
        http_response_code(206); header("Content-Range: bytes $start-$end/$size");
    }
    $remaining = $end - $start + 1;
    header('Content-Length: ' . $remaining);
    if ($method === 'HEAD') exit;
    $stream = fopen($file, 'rb'); fseek($stream, $start);
    while ($remaining > 0 && !feof($stream) && !connection_aborted()) {
        $chunk = fread($stream, min(524288, $remaining));
        if ($chunk === false || $chunk === '') break;
        echo $chunk; $remaining -= strlen($chunk);
    }
    fclose($stream); exit;
}
