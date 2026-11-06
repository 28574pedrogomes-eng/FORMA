<?php
declare(strict_types=1);
require_once __DIR__ . '/price-notifications.php';

function variants(int $id, bool $all = false): array {
    return query('SELECT * FROM product_variants WHERE product_id=?' . ($all ? '' : ' AND active=1') . ' ORDER BY id', [$id])->fetchAll();
}
function enrichProduct(array $product, bool $detail = false): array {
    $variants = variants((int)$product['id']);
    $product['variant_count'] = count($variants);
    $product['low_stock_variants'] = count(array_filter($variants, static fn($variant) => (int)$variant['stock'] <= 5));
    $product['default_variant_id'] = $variants[0]['id'] ?? null;
    $rating = query('SELECT COUNT(*) AS count,COALESCE(ROUND(AVG(rating),1),0) AS average FROM reviews WHERE product_id=? AND visible=1', [$product['id']])->fetch();
    $product['review_count'] = (int)$rating['count']; $product['rating'] = (float)$rating['average'];
    if ($detail) { $product['variants'] = $variants; $product['gallery']=query('SELECT id,variant_id,image,alt FROM product_images WHERE product_id=? ORDER BY position,id',[$product['id']])->fetchAll(); }
    return $product;
}
function imagePath(string $path): string {
    if (!preg_match('~^(images/[a-z0-9-]+\.(jpg|png|webp)|uploads/[a-f0-9]{32}\.(jpg|png|webp))$~D', $path) || !is_file(__DIR__ . '/../public/' . $path)) { fail('Escolhe uma fotografia válida.', 422); }
    return $path;
}
function syncProduct(int $productId): void {
    $before = query('SELECT price_cents FROM products WHERE id=?', [$productId])->fetchColumn();
    query('UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=? AND active=1), price_cents=COALESCE((SELECT MIN(price_cents) FROM product_variants WHERE product_id=? AND active=1),price_cents) WHERE id=?', [$productId, $productId, $productId]);
    $product = query('SELECT name,price_cents,active FROM products WHERE id=?', [$productId])->fetch();
    if ($product && (int)$product['active'] === 1 && (int)$product['price_cents'] < (int)$before) {
        notifyPriceDrop(db(), $productId, $product['name'], (int)$product['price_cents']);
    }
}
function stockChange(int $variantId, int $delta, string $reason, ?int $orderId = null): void {
    $variant = query('SELECT v.*,p.name,p.active AS product_active FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=? FOR UPDATE', [$variantId])->fetch();
    if (!$variant || (int)$variant['stock'] + $delta < 0 || (int)$variant['stock'] + $delta > 100000) { fail('O ajuste ultrapassa os limites de stock.', 409); }
    $balance = (int)$variant['stock'] + $delta;
    query('UPDATE product_variants SET stock=? WHERE id=?', [$balance, $variantId]);
    if ($delta !== 0) { query('INSERT INTO stock_movements (product_id,variant_id,user_id,order_id,delta,balance,reason) VALUES (?,?,?,?,?,?,?)', [$variant['product_id'], $variantId, $_SESSION['user_id'] ?? null, $orderId, $delta, $balance, $reason]); }
    syncProduct((int)$variant['product_id']);
    if ((int)$variant['stock'] === 0 && $balance > 0 && (int)$variant['active'] === 1 && (int)$variant['product_active'] === 1) {
        foreach (query('SELECT user_id FROM restock_subscriptions WHERE variant_id=?', [$variantId])->fetchAll() as $watcher) { notifyUser((int)$watcher['user_id'], 'Voltou ao stock!', $variant['name'] . ' — ' . $variant['label'] . ' está novamente disponível.'); }
        query('DELETE FROM restock_subscriptions WHERE variant_id=?', [$variantId]);
    }
}
function defaultVariant(int $id): ?array { return query('SELECT * FROM product_variants WHERE product_id=? AND active=1 ORDER BY id LIMIT 1', [$id])->fetch() ?: null; }
function addBaseVariant(int $id, array $values): void {
    query('INSERT INTO product_variants (product_id,label,sku,material,image,price_cents,stock) VALUES (?,?,?,?,?,?,0)', [$id, 'Padrão', "FORMA-$id-BASE", $values[7], $values[5], $values[3]]);
    stockChange((int)db()->lastInsertId(), (int)$values[4], 'Inventário inicial');
}
function deliveryFields(array $data): array {
    $name = field($data, 'shipping_name', 2, 100); $address = field($data, 'address', 5, 255);
    $city = field($data, 'city', 2, 100); $postal = field($data, 'postal_code', 8, 8); $phone = field($data, 'phone', 9, 20);
    if (!preg_match('/^\d{4}-\d{3}$/D', $postal)) { fail('Código postal inválido. Usa o formato 1000-001.', 422); }
    if (!preg_match('/^\+?[\d\s-]{9,20}$/D', $phone)) { fail('Número de telefone inválido.', 422); }
    return [$name, $address, $city, $postal, $phone];
}
function quoteCart(array $data, bool $lock = false): array {
    if (!isset($data['items']) || !is_array($data['items']) || count($data['items']) < 1 || count($data['items']) > 50) { fail('O carrinho deve ter entre 1 e 50 artigos.', 422); }
    $input = $data['items'];
    foreach ($input as $item) { if (!is_array($item)) { fail('Artigo inválido.', 422); } integer($item['product_id'] ?? null, 1, PHP_INT_MAX, 'produto'); }
    usort($input, static fn($a, $b) => ((int)$a['product_id'] <=> (int)$b['product_id']) ?: ((int)($a['variant_id'] ?? 0) <=> (int)($b['variant_id'] ?? 0)));
    $items = []; $subtotal = 0;
    foreach ($input as $item) {
        $pid = (int)$item['product_id']; $qty = integer($item['quantity'] ?? null, 1, 99, 'quantidade');
        $product = query('SELECT * FROM products WHERE id=? AND active=1' . ($lock ? ' FOR UPDATE' : ''), [$pid])->fetch();
        if (!$product) { fail('Um artigo do carrinho já não está disponível.', 409); }
        $vid = isset($item['variant_id']) && $item['variant_id'] !== null ? integer($item['variant_id'], 1, PHP_INT_MAX, 'variante') : (defaultVariant($pid)['id'] ?? 0);
        $variant = query('SELECT * FROM product_variants WHERE id=? AND product_id=? AND active=1' . ($lock ? ' FOR UPDATE' : ''), [$vid, $pid])->fetch();
        if (!$variant) { fail('A opção escolhida já não está disponível.', 409); }
        $qty += $items[$vid]['quantity'] ?? 0;
        if ($qty > 99) { fail('Máximo de 99 unidades por opção.', 422); }
        if ((int)$variant['stock'] < $qty) { fail('Stock insuficiente para ' . $product['name'] . ' (' . $variant['label'] . ').', 409); }
        $items[$vid] = ['product_id' => $pid, 'variant_id' => (int)$vid, 'variant_label' => $variant['label'], 'name' => $product['name'], 'image' => $variant['image'], 'price_cents' => (int)$variant['price_cents'], 'quantity' => $qty, 'stock' => (int)$variant['stock']];
    }
    foreach ($items as $item) { $subtotal += $item['price_cents'] * $item['quantity']; }
    if ($subtotal > 1000000000) { fail('O valor da encomenda excede o limite.', 422); }
    $code = strtoupper(trim((string)($data['coupon_code'] ?? ''))); $coupon = null; $discount = 0;
    if ($code !== '') {
        if (!preg_match('/^[A-Z0-9_-]{3,40}$/D', $code)) { fail('Código de desconto inválido.', 422); }
        $coupon = query('SELECT * FROM coupons WHERE code=? AND active=1 AND starts_at<=UTC_TIMESTAMP() AND expires_at>UTC_TIMESTAMP()' . ($lock ? ' FOR UPDATE' : ''), [$code])->fetch();
        if (!$coupon || (int)$coupon['used_count'] >= (int)$coupon['max_uses']) { fail('Este cupão expirou, está indisponível ou atingiu o limite de utilizações.', 422); }
        if ($subtotal < (int)$coupon['minimum_cents']) { fail('A encomenda não atinge o valor mínimo deste cupão (' . number_format($coupon['minimum_cents'] / 100, 2, ',', '') . ' €).', 422); }
        $discount = min($subtotal, $coupon['type'] === 'percent' ? intdiv($subtotal * (int)$coupon['value'], 100) : (int)$coupon['value']);
    }
    $delivery = $data['shipping_method'] ?? 'standard';
    if (!in_array($delivery, ['standard','express'], true)) { fail('Método de entrega inválido.', 422); }
    $shipping = $delivery === 'express' ? 990 : ($subtotal - $discount >= 7500 ? 0 : 490);
    return ['items' => array_values($items), 'subtotal_cents' => $subtotal, 'discount_cents' => $discount, 'shipping_cents' => $shipping, 'total_cents' => $subtotal - $discount + $shipping, 'coupon_code' => $coupon['code'] ?? '', 'coupon_id' => $coupon['id'] ?? null, 'shipping_method' => $delivery];
}
function applyPayment(int $orderId, string $outcome, string $key): array {
    if (!in_array($outcome, ['approved','refused','pending'], true)) { fail('Resultado de pagamento de teste inválido.', 422); }
    if (!preg_match('/^[a-f0-9-]{36}$/D', $key)) { fail('Identificador de pagamento inválido.', 422); }
    $order = query('SELECT * FROM orders WHERE id=? FOR UPDATE', [$orderId])->fetch();
    if (query('SELECT id FROM payment_attempts WHERE order_id=? AND request_key=?', [$orderId,$key])->fetchColumn()) { return $order; }
    if ($order['status'] !== 'pending' || in_array($order['payment_status'], ['paid','refunded'], true)) { fail('Esta encomenda já não aceita pagamentos.', 409); }
    $status = ['approved'=>'paid','refused'=>'failed','pending'=>'pending'][$outcome];
    query('INSERT INTO payment_attempts (order_id,outcome,amount_cents,request_key) VALUES (?,?,?,?)', [$orderId,$outcome,$order['total_cents'],$key]);
    query('UPDATE orders SET payment_status=? WHERE id=?', [$status,$orderId]);
    $labels = ['paid'=>'aprovado','failed'=>'recusado','pending'=>'pendente'];
    notifyUser((int)$order['user_id'], 'Pagamento de teste ' . $labels[$status], "Encomenda #$orderId. Não foi efetuada qualquer cobrança real.");
    activity('Pagamento simulado', "Encomenda #$orderId: $status");
    return query('SELECT * FROM orders WHERE id=?', [$orderId])->fetch();
}
function checkoutOrder(array $actor, array $data): array {
    $key = field($data, 'checkout_key', 36, 36);
    if (!preg_match('/^[a-f0-9-]{36}$/D', $key)) { fail('Identificador de encomenda inválido.', 422); }
    $delivery = deliveryFields($data);
    return transaction(function () use ($actor,$data,$key,$delivery) {
        query('SELECT id FROM users WHERE id=? FOR UPDATE', [$actor['id']]);
        $existing = query('SELECT * FROM orders WHERE user_id=? AND checkout_key=?', [$actor['id'],$key])->fetch();
        if ($existing) { return orderWithItems($existing); }
        $quote = quoteCart($data, true);
        query("INSERT INTO orders (user_id,subtotal_cents,shipping_cents,total_cents,shipping_name,address,city,postal_code,phone,checkout_key,discount_cents,coupon_id,coupon_code,shipping_method,payment_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'unpaid')", [$actor['id'],$quote['subtotal_cents'],$quote['shipping_cents'],$quote['total_cents'],...$delivery,$key,$quote['discount_cents'],$quote['coupon_id'],$quote['coupon_code'],$quote['shipping_method']]);
        $id = (int)db()->lastInsertId();
        orderEvent($id,'pending','Encomenda registada');
        foreach ($quote['items'] as $item) {
            query('INSERT INTO order_items (order_id,product_id,product_name,image,quantity,unit_price_cents,variant_id,variant_label) VALUES (?,?,?,?,?,?,?,?)', [$id,$item['product_id'],$item['name'],$item['image'],$item['quantity'],$item['price_cents'],$item['variant_id'],$item['variant_label']]);
            stockChange($item['variant_id'], -$item['quantity'], 'Venda — encomenda #' . $id, $id);
        }
        if ($quote['coupon_id']) { query('UPDATE coupons SET used_count=used_count+1 WHERE id=?', [$quote['coupon_id']]); }
        if (!empty($data['save_address'])) { saveAddress((int)$actor['id'], ['label'=>$data['address_label'] ?? 'Casa', ...array_combine(['shipping_name','address','city','postal_code','phone'], $delivery)], null); }
        applyPayment($id, (string)($data['payment_outcome'] ?? 'approved'), $key);
        notifyUser((int)$actor['id'], 'Encomenda recebida', "A encomenda #$id foi registada. Podes acompanhar o estado na tua conta.");
        foreach (query("SELECT id FROM users WHERE role='admin'")->fetchAll() as $admin) { notifyUser((int)$admin['id'], 'Nova encomenda', "A encomenda #$id foi recebida. Confirma o pagamento antes de preparar."); }
        activity('Encomenda criada', "Encomenda #$id registada.");
        queueEmail($actor['email'], "Encomenda FORMA #$id recebida", "A tua encomenda #$id foi registada. Total: " . number_format($quote['total_cents']/100,2,',',' ') . " EUR.\nAcompanha os detalhes na tua conta. Esta é uma compra de demonstração, sem cobrança ou envio real.");
        return orderWithItems(query('SELECT * FROM orders WHERE id=?', [$id])->fetch());
    });
}
function restoreOrder(array $order): void {
    foreach (query('SELECT variant_id,product_id,quantity FROM order_items WHERE order_id=? ORDER BY product_id,variant_id', [$order['id']])->fetchAll() as $item) {
        query('SELECT id FROM products WHERE id=? FOR UPDATE', [$item['product_id']]);
        stockChange((int)$item['variant_id'], (int)$item['quantity'], 'Cancelamento — encomenda #' . $order['id'], (int)$order['id']);
    }
    if ($order['coupon_id']) { query('UPDATE coupons SET used_count=GREATEST(used_count-1,0) WHERE id=?', [$order['coupon_id']]); }
    if ($order['payment_status'] === 'paid') {
        query("UPDATE orders SET payment_status='refunded' WHERE id=?", [$order['id']]);
        query("INSERT INTO payment_attempts (order_id,outcome,amount_cents,request_key) VALUES (?,'refunded',?,?)", [$order['id'],$order['total_cents'], sprintf('%08x-%04x-%04x-%04x-%012x', random_int(0,0x7fffffff),random_int(0,65535),random_int(0,65535),random_int(0,65535),random_int(0,0x7fffffffffff))]);
    }
}
function saveAddress(int $userId, array $data, ?int $id): int {
    $values = deliveryFields($data); $label = field($data, 'label', 1, 60);
    query('SELECT id FROM users WHERE id=? FOR UPDATE', [$userId]);
    if ($id && !query('SELECT id FROM user_addresses WHERE id=? AND user_id=?', [$id,$userId])->fetchColumn()) { fail('Morada não encontrada.', 404); }
    $count = (int)query('SELECT COUNT(*) FROM user_addresses WHERE user_id=?', [$userId])->fetchColumn();
    if (!$id && $count >= 10) { fail('Podes guardar até 10 moradas.', 422); }
    $default = !empty($data['is_default']) || $count === 0 ? 1 : 0;
    if ($default) { query('UPDATE user_addresses SET is_default=0 WHERE user_id=?', [$userId]); }
    if ($id) { query('UPDATE user_addresses SET label=?,shipping_name=?,address=?,city=?,postal_code=?,phone=?,is_default=? WHERE id=? AND user_id=?', [$label,...$values,$default,$id,$userId]); }
    else { query('INSERT INTO user_addresses (user_id,label,shipping_name,address,city,postal_code,phone,is_default) VALUES (?,?,?,?,?,?,?,?)', [$userId,$label,...$values,$default]); $id = (int)db()->lastInsertId(); }
    if (!query('SELECT id FROM user_addresses WHERE user_id=? AND is_default=1', [$userId])->fetchColumn()) { query('UPDATE user_addresses SET is_default=1 WHERE id=?', [$id]); }
    activity('Morada guardada', "Morada #$id"); return $id;
}
function canReview(int $userId, int $productId): bool {
    return (bool)query("SELECT i.id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.user_id=? AND i.product_id=? AND o.status='delivered' AND o.payment_status='paid' LIMIT 1", [$userId,$productId])->fetchColumn();
}
function reviewRows(?int $productId = null): array {
    $rows = query("SELECT r.*,SUBSTRING_INDEX(u.name,' ',1) AS customer_name,p.name AS product_name FROM reviews r JOIN users u ON u.id=r.user_id JOIN products p ON p.id=r.product_id" . ($productId ? ' WHERE r.product_id=? AND r.visible=1' : '') . ' ORDER BY r.id DESC LIMIT 100', $productId ? [$productId] : [])->fetchAll();
    foreach ($rows as &$row) { $row['photos'] = query('SELECT m.path FROM review_photos rp JOIN media_uploads m ON m.id=rp.upload_id WHERE rp.review_id=?', [$row['id']])->fetchAll(PDO::FETCH_COLUMN); }
    return $rows;
}
function uploadImage(int $userId, string $purpose): string {
    rateLimit('upload', 60);
    $file = $_FILES['file'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024 || $file['size'] < 1) { fail('Seleciona uma imagem até 5 MB.', 422); }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $types = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp']; $size = @getimagesize($file['tmp_name']);
    if (!isset($types[$mime]) || !$size || $size[0] > 6000 || $size[1] > 6000) { fail('Usa uma imagem JPG, PNG ou WebP até 6000 × 6000 píxeis.', 422); }
    $path = 'uploads/' . bin2hex(random_bytes(16)) . '.' . $types[$mime];
    if (!move_uploaded_file($file['tmp_name'], __DIR__ . '/../public/' . $path)) { throw new RuntimeException('Erro ao guardar imagem.'); }
    query('INSERT INTO media_uploads (user_id,path,purpose) VALUES (?,?,?)', [$userId,$path,$purpose]);
    activity('Imagem carregada', $path); return $path;
}
