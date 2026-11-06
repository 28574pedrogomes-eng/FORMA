<?php
declare(strict_types=1);
// Incluído depois da validação global de CSRF. Gestão editorial reservada a administradores.
function newsFields(array $data): array {
    $category = integer($data['category_id'] ?? null, 1, PHP_INT_MAX, 'categoria');
    if (!query('SELECT id FROM news_categories WHERE id=?', [$category])->fetchColumn()) { fail('Seleciona uma categoria de notícias existente.', 422); }
    $title = field($data, 'title', 2, 160);
    $content = field($data, 'content', 10, 20000);
    $date = field($data, 'publication_date', 10, 10);
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date || $parsed->format('Y') < '1000') { fail('Introduz uma data válida.', 422); }
    $image = field($data + ['image' => ''], 'image', 0, 500);
    if ($image !== '') { imagePath($image); }
    $status = $data['status'] ?? 'published'; $publishAt = null;
    if (!in_array($status, ['published','draft','scheduled'], true)) { fail('Estado editorial inválido.', 422); }
    if ($status === 'scheduled') {
        $publishAt = field($data, 'publish_at', 19, 19);
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $publishAt);
        if (!$parsed || $parsed->format('Y-m-d H:i:s') !== $publishAt) { fail('Data de agendamento inválida (UTC).', 422); }
    }
    return [$category, $title, $content, $date, $image, $status, $publishAt];
}
function newsSnapshot(int $id): void {
    $article = query('SELECT * FROM news_articles WHERE id=?', [$id])->fetch();
    query('INSERT INTO news_revisions (article_id,editor_id,snapshot) VALUES (?,?,?)', [$id,$_SESSION['user_id'] ?? null,json_encode($article,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
$newsPublished = "(n.status='published' OR (n.status='scheduled' AND n.publish_at<=UTC_TIMESTAMP()))";

if ($route === '/news/categories' && $method === 'GET') {
    $filter = user(false)['role'] ?? '';
    respond(query('SELECT c.id,c.name,COUNT(n.id) AS article_count FROM news_categories c LEFT JOIN news_articles n ON n.category_id=c.id' . ($filter === 'admin' ? '' : ' AND ' . $newsPublished) . ' GROUP BY c.id,c.name ORDER BY c.name')->fetchAll());
}
if ($route === '/news' && $method === 'GET') {
    $page = integer($_GET['page'] ?? 1, 1, 1000000, 'página');
    $where = ' WHERE ' . $newsPublished; $params = [];
    if (isset($_GET['category']) && $_GET['category'] !== '') {
        $where .= ' AND n.category_id=?'; $params[] = integer($_GET['category'], 1, PHP_INT_MAX, 'categoria');
    }
    $total = (int)query('SELECT COUNT(*) FROM news_articles n' . $where, $params)->fetchColumn();
    $offset = ($page - 1) * 12;
    $items = query('SELECT n.id,n.title,LEFT(n.content,220) AS excerpt,n.publication_date,n.image,c.name AS category_name FROM news_articles n JOIN news_categories c ON c.id=n.category_id' . $where . " ORDER BY n.publication_date DESC,n.id DESC LIMIT 12 OFFSET $offset", $params)->fetchAll();
    respond(['items' => $items, 'total' => $total, 'page' => $page, 'pages' => max(1, (int)ceil($total / 12))]);
}
if (preg_match('~^/news/(\d+)$~D', $route, $match) && $method === 'GET') {
    $article = query('SELECT n.*,c.name AS category_name FROM news_articles n JOIN news_categories c ON c.id=n.category_id WHERE n.id=? AND ' . $newsPublished, [$match[1]])->fetch();
    if (!$article) { fail('Esta notícia não foi encontrada ou já foi removida.', 404); }
    respond($article);
}
if ($route === '/admin/news' || str_starts_with($route, '/admin/news/')) {
    $actor = admin();
    if ($route === '/admin/news' && $method === 'GET') {
        respond(query('SELECT n.*,c.name AS category_name FROM news_articles n JOIN news_categories c ON c.id=n.category_id ORDER BY n.publication_date DESC,n.id DESC')->fetchAll());
    }
    if ($route === '/admin/news' && $method === 'POST') {
        $values = newsFields(body());
        $id = transaction(function () use ($values, $actor) {
            query('INSERT INTO news_articles (category_id,title,content,publication_date,image,status,publish_at,author_id) VALUES (?,?,?,?,?,?,?,?)', [...$values, $actor['id']]);
            $id = (int)db()->lastInsertId(); newsSnapshot($id); activity('Notícia criada', "Notícia #$id: {$values[1]}"); return $id;
        });
        respond(['id' => $id], 201);
    }
    if ($route === '/admin/news/upload' && $method === 'POST') { respond(['path' => uploadImage((int)$actor['id'], 'news')], 201); }
    if (preg_match('~^/admin/news/(\d+)$~D', $route, $match) && in_array($method, ['PUT', 'DELETE'], true)) {
        $id = (int)$match[1]; $data = body();
        if ($method === 'DELETE' && ($data['confirm'] ?? null) !== true) { fail('Confirma a eliminação da notícia.', 422); }
        $values = $method === 'PUT' ? newsFields($data) : [];
        transaction(function () use ($id, $method, $values, $data) {
            $article = query('SELECT title,version FROM news_articles WHERE id=? FOR UPDATE', [$id])->fetch();
            if (!$article) { fail('Notícia não encontrada.', 404); }
            if ($method === 'PUT') {
                if (isset($data['version']) && (int)$data['version'] !== (int)$article['version']) { fail('Esta notícia foi alterada por outra sessão. Atualiza antes de guardar.', 409); }
                query('UPDATE news_articles SET category_id=?,title=?,content=?,publication_date=?,image=?,status=?,publish_at=?,version=version+1 WHERE id=?', [...$values, $id]);
                newsSnapshot($id);
                activity('Notícia alterada', "Notícia #$id: {$values[1]}");
            } else {
                query('DELETE FROM news_articles WHERE id=?', [$id]);
                activity('Notícia eliminada', "Notícia #$id: {$article['title']}");
            }
        });
        respond(['ok' => true]);
    }
    if (preg_match('~^/admin/news/(\d+)/revisions$~D', $route, $m) && $method === 'GET') {
        respond(query('SELECT r.id,r.snapshot,r.created_at,u.name AS editor_name FROM news_revisions r LEFT JOIN users u ON u.id=r.editor_id WHERE r.article_id=? ORDER BY r.id DESC LIMIT 100', [$m[1]])->fetchAll());
    }
    if (preg_match('~^/admin/news/(\d+)/restore/(\d+)$~D', $route, $m) && $method === 'POST') {
        $input=body(); if(($input['confirm']??false)!==true) { fail('Confirma a restauração.',422); }
        transaction(function() use($m,$input) {
            $current=query('SELECT version FROM news_articles WHERE id=? FOR UPDATE',[$m[1]])->fetchColumn();
            if(!$current) { fail('Notícia não encontrada.',404); }
            if(integer($input['version']??null,1,PHP_INT_MAX,'versão')!==(int)$current) { fail('A notícia mudou. Atualiza antes de restaurar.',409); }
            $snapshot=query('SELECT snapshot FROM news_revisions WHERE id=? AND article_id=?',[$m[2],$m[1]])->fetchColumn();
            if(!$snapshot) { fail('Revisão não encontrada.',404); }
            $values=newsFields(array_replace(json_decode($snapshot,true),['status'=>'draft','publish_at'=>null]));
            query('UPDATE news_articles SET category_id=?,title=?,content=?,publication_date=?,image=?,status=?,publish_at=?,version=version+1 WHERE id=?',[...$values,$m[1]]);
            newsSnapshot((int)$m[1]); activity('Revisão restaurada',"Notícia #{$m[1]}, revisão #{$m[2]}, guardada como rascunho.");
        }); respond(['ok'=>true]);
    }
    if ($route === '/admin/news/categories' && $method === 'POST') {
        $name = field(body(), 'name', 2, 80);
        $id = transaction(function () use ($name) {
            query('INSERT INTO news_categories (name) VALUES (?)', [$name]);
            $id = (int)db()->lastInsertId(); activity('Categoria de notícias criada', $name); return $id;
        });
        respond(['id' => $id], 201);
    }
    if (preg_match('~^/admin/news/categories/(\d+)$~D', $route, $match) && in_array($method, ['PUT', 'DELETE'], true)) {
        $id = (int)$match[1]; $data = body();
        $name = $method === 'PUT' ? field($data, 'name', 2, 80) : '';
        if ($method === 'DELETE' && ($data['confirm'] ?? null) !== true) { fail('Confirma a eliminação da categoria.', 422); }
        transaction(function () use ($id, $method, $name) {
            if (!query('SELECT id FROM news_categories WHERE id=? FOR UPDATE', [$id])->fetchColumn()) { fail('Categoria não encontrada.', 404); }
            if ($method === 'DELETE') {
                if (query('SELECT id FROM news_articles WHERE category_id=? LIMIT 1', [$id])->fetchColumn()) { fail('Esta categoria tem notícias associadas. Altera a categoria dessas notícias antes de a eliminar.', 409); }
                query('DELETE FROM news_categories WHERE id=?', [$id]); activity('Categoria de notícias eliminada', "Categoria #$id");
            } else {
                query('UPDATE news_categories SET name=? WHERE id=?', [$name, $id]); activity('Categoria de notícias alterada', $name);
            }
        });
        respond(['ok' => true]);
    }
}
