<?php
declare(strict_types=1);

if ($route === '/price-alerts' && $method === 'GET') {
    $actor = user();
    respond(query('SELECT a.*,p.name,p.image,p.price_cents,p.active FROM price_alerts a JOIN products p ON p.id=a.product_id WHERE a.user_id=? ORDER BY a.created_at DESC,a.product_id', [$actor['id']])->fetchAll());
}
if (preg_match('~^/price-alerts/(\d+)$~D', $route, $matches) && in_array($method,['PUT','DELETE'],true)) {
    $actor = user(); $id = (int)$matches[1];
    transaction(function () use ($actor,$id,$method) {
        $product = query('SELECT price_cents,active FROM products WHERE id=? FOR UPDATE', [$id])->fetch();
        if ($method === 'DELETE') {
            query('DELETE FROM price_alerts WHERE user_id=? AND product_id=?', [$actor['id'],$id]);
            return;
        }
        if (!$product || !(int)$product['active']) fail('Produto indisponível.',404);
        if (!query('SELECT product_id FROM favorites WHERE user_id=? AND product_id=? FOR UPDATE', [$actor['id'],$id])->fetchColumn()) fail('Guarda primeiro este produto nos favoritos.',422);
        // Repeated activation is idempotent and never resets the price floor.
        query('INSERT INTO price_alerts (user_id,product_id,reference_price_cents,initial_price_cents) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)', [$actor['id'],$id,$product['price_cents'],$product['price_cents']]);
    });
    respond(['ok'=>true]);
}
