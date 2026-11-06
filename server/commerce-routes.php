<?php
declare(strict_types=1);
// Chamado depois da validação global de sessão/CSRF. Responde apenas às rotas desta extensão.
if ($route === '/addresses') {
    $actor = user();
    if ($method === 'GET') { respond(query('SELECT * FROM user_addresses WHERE user_id=? ORDER BY is_default DESC,id DESC', [$actor['id']])->fetchAll()); }
    if ($method === 'POST') { $data = body(); respond(['id'=>transaction(fn() => saveAddress((int)$actor['id'],$data,null))], 201); }
}
if (preg_match('~^/addresses/(\d+)$~', $route, $m)) {
    $actor = user(); $id = (int)$m[1];
    if ($method === 'PUT') { $data = body(); respond(['id'=>transaction(fn() => saveAddress((int)$actor['id'],$data,$id))]); }
    if ($method === 'DELETE') {
        transaction(function () use ($actor,$id) {
            query('SELECT id FROM users WHERE id=? FOR UPDATE', [$actor['id']]);
            if (!query('DELETE FROM user_addresses WHERE id=? AND user_id=?', [$id,$actor['id']])->rowCount()) { fail('Morada não encontrada.',404); }
            if (!query('SELECT id FROM user_addresses WHERE user_id=? AND is_default=1', [$actor['id']])->fetchColumn()) { query('UPDATE user_addresses SET is_default=1 WHERE user_id=? ORDER BY id LIMIT 1', [$actor['id']]); }
            activity('Morada eliminada', "Morada #$id");
        }); respond(['ok'=>true]);
    }
}
if ($route === '/favorites' && $method === 'GET') {
    $actor = user(); respond(array_map('intval', query('SELECT f.product_id FROM favorites f JOIN products p ON p.id=f.product_id WHERE f.user_id=? AND p.active=1 ORDER BY f.product_id', [$actor['id']])->fetchAll(PDO::FETCH_COLUMN)));
}
if ($route === '/favorites/merge' && $method === 'POST') {
    $actor = user(); $data = body(); $ids = $data['ids'] ?? [];
    if (!is_array($ids) || count($ids)>200) { fail('Seleção de favoritos inválida.',422); }
    transaction(function () use ($ids,$actor) {
        query('SELECT id FROM users WHERE id=? FOR UPDATE',[$actor['id']]);
        foreach ($ids as $id) { $id = integer($id,1,PHP_INT_MAX,'produto'); query('INSERT IGNORE INTO favorites (user_id,product_id) SELECT ?,id FROM products WHERE id=? AND active=1',[$actor['id'],$id]); }
        if ((int)query('SELECT COUNT(*) FROM favorites WHERE user_id=?',[$actor['id']])->fetchColumn()>200) { fail('Atingiste o limite de 200 favoritos.',422); }
    });
    respond(array_map('intval',query('SELECT product_id FROM favorites WHERE user_id=?',[$actor['id']])->fetchAll(PDO::FETCH_COLUMN)));
}
if (preg_match('~^/favorites/(\d+)$~',$route,$m)) {
    $actor = user(); $id = (int)$m[1];
    if ($method === 'PUT') {
        if (!query('SELECT id FROM products WHERE id=? AND active=1',[$id])->fetchColumn()) { fail('Produto não encontrado.',404); }
        transaction(function () use ($actor,$id) {
            query('SELECT id FROM users WHERE id=? FOR UPDATE',[$actor['id']]);
            query('INSERT IGNORE INTO favorites (user_id,product_id) VALUES (?,?)',[$actor['id'],$id]);
            if ((int)query('SELECT COUNT(*) FROM favorites WHERE user_id=?',[$actor['id']])->fetchColumn()>200) { fail('Atingiste o limite de 200 favoritos.',422); }
        }); respond(['ok'=>true]);
    }
    if ($method === 'DELETE') { query('DELETE FROM favorites WHERE user_id=? AND product_id=?',[$actor['id'],$id]); respond(['ok'=>true]); }
}
if ($route === '/restock' && $method === 'GET') {
    $actor = user(); respond(query('SELECT s.id,s.variant_id,p.id AS product_id,p.name,v.label,v.image FROM restock_subscriptions s JOIN product_variants v ON v.id=s.variant_id JOIN products p ON p.id=v.product_id WHERE s.user_id=?',[$actor['id']])->fetchAll());
}
if ($route === '/restock' && $method === 'POST') {
    $actor = user(); $vid = integer(body()['variant_id'] ?? null,1,PHP_INT_MAX,'variante');
    transaction(function () use ($actor,$vid) {
        $v = query('SELECT v.stock,v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.active=1 AND p.active=1 FOR UPDATE',[$vid])->fetch();
        if (!$v) { fail('Opção não encontrada.',404); }
        if ((int)$v['stock']>0) { fail('Esta opção já está disponível.',409); }
        query('INSERT IGNORE INTO restock_subscriptions (user_id,variant_id) VALUES (?,?)',[$actor['id'],$vid]);
    }); respond(['message'=>'Vamos avisar-te nas notificações quando esta opção voltar.']);
}
if (preg_match('~^/restock/(\d+)$~',$route,$m) && $method==='DELETE') {
    $actor=user(); query('DELETE FROM restock_subscriptions WHERE id=? AND user_id=?',[$m[1],$actor['id']]); respond(['ok'=>true]);
}
if ($route==='/checkout/quote' && $method==='POST') { user(); respond(quoteCart(body())); }
if (preg_match('~^/products/(\d+)/related$~',$route,$m) && $method==='GET') {
    $id=(int)$m[1]; $product=query('SELECT category_id,price_cents FROM products WHERE id=? AND active=1',[$id])->fetch();
    if (!$product) { fail('Produto não encontrado.',404); }
    $items=query('SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1 AND p.id<>? ORDER BY (p.category_id=?) DESC,p.featured DESC,ABS(p.price_cents-?) ASC,p.id LIMIT 4',[$id,$product['category_id'],$product['price_cents']])->fetchAll();
    respond(array_map('enrichProduct',$items));
}
if (preg_match('~^/products/(\d+)/reviews$~',$route,$m)) {
    $id=(int)$m[1];
    if (!query('SELECT id FROM products WHERE id=? AND active=1',[$id])->fetchColumn()) { fail('Produto não encontrado.',404); }
    if ($method==='GET') {
        $actor=user(false); $mine=$actor ? query('SELECT * FROM reviews WHERE product_id=? AND user_id=?',[$id,$actor['id']])->fetch() : null;
        if ($mine) { $mine['photos']=query('SELECT m.path FROM review_photos rp JOIN media_uploads m ON m.id=rp.upload_id WHERE rp.review_id=?',[$mine['id']])->fetchAll(PDO::FETCH_COLUMN); }
        respond(['items'=>reviewRows($id),'can_review'=>$actor ? canReview((int)$actor['id'],$id) : false,'mine'=>$mine ?: null]);
    }
    if ($method==='POST') {
        $actor=user(); rateLimit('review',30); $data=body();
        if (!canReview((int)$actor['id'],$id)) { fail('Só podes avaliar artigos de encomendas pagas e entregues.',403); }
        $rating=integer($data['rating']??null,1,5,'avaliação'); $comment=field($data,'comment',10,2000); $photos=$data['photos']??[];
        if (!is_array($photos)||count($photos)>3) { fail('Podes adicionar até 3 fotografias.',422); }
        transaction(function () use ($actor,$id,$rating,$comment,$photos) {
            query('INSERT INTO reviews (user_id,product_id,rating,comment) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE rating=VALUES(rating),comment=VALUES(comment)',[$actor['id'],$id,$rating,$comment]);
            $rid=(int)query('SELECT id FROM reviews WHERE user_id=? AND product_id=?',[$actor['id'],$id])->fetchColumn();
            query('DELETE FROM review_photos WHERE review_id=?',[$rid]);
            foreach (array_unique($photos) as $path) {
                if (!is_string($path)) { fail('Fotografia inválida.',422); }
                $upload=query("SELECT id FROM media_uploads WHERE path=? AND user_id=? AND purpose='review'",[$path,$actor['id']])->fetchColumn();
                if (!$upload) { fail('Só podes anexar fotografias carregadas pela tua conta.',403); }
                query('INSERT INTO review_photos (review_id,upload_id) VALUES (?,?)',[$rid,$upload]);
            }
            activity('Avaliação guardada',"Produto #$id: $rating estrelas");
        }); respond(['ok'=>true],201);
    }
}
if ($route==='/reviews/upload' && $method==='POST') {
    $actor=user(); $id=integer($_POST['product_id']??null,1,PHP_INT_MAX,'produto');
    if (!canReview((int)$actor['id'],$id)) { fail('Só compradores com uma encomenda entregue podem enviar fotografias.',403); }
    respond(['path'=>uploadImage((int)$actor['id'],'review')],201);
}
if (preg_match('~^/reviews/(\d+)$~',$route,$m) && $method==='DELETE') {
    $actor=user(); if (!query('DELETE FROM reviews WHERE id=? AND user_id=?',[$m[1],$actor['id']])->rowCount()) { fail('Avaliação não encontrada.',404); } activity('Avaliação eliminada',"Avaliação #{$m[1]}"); respond(['ok'=>true]);
}
if (preg_match('~^/orders/(\d+)/(payment|receipt|cancel)$~',$route,$m)) {
    $actor=user(); $id=(int)$m[1]; $operation=$m[2];
    $order=query('SELECT * FROM orders WHERE id=?',[$id])->fetch();
    if (!$order || ((int)$order['user_id']!==(int)$actor['id'] && $actor['role']!=='admin')) { fail('Encomenda não encontrada.',404); }
    if ($operation==='receipt' && $method==='GET') { require_once __DIR__.'/receipt.php'; renderReceipt(orderWithItems($order)); }
    if ($operation==='payment' && $method==='POST') {
        $data=body(); $outcome=field($data,'outcome',1,20); $key=field($data,'request_key',36,36);
        $result=transaction(fn()=>applyPayment($id,$outcome,$key)); respond(orderWithItems($result));
    }
    if ($operation==='cancel' && $method==='POST') {
        transaction(function () use ($id) {
            $order=query('SELECT * FROM orders WHERE id=? FOR UPDATE',[$id])->fetch();
            if ($order['status']!=='pending') { fail('Só podes cancelar encomendas ainda por preparar.',409); }
            restoreOrder($order); query("UPDATE orders SET status='cancelled' WHERE id=?",[$id]); orderEvent($id,'cancelled','Cancelada pelo cliente');
            notifyUser((int)$order['user_id'],'Encomenda cancelada',"A encomenda #$id foi cancelada. O stock foi reposto."); activity('Encomenda cancelada',"Encomenda #$id cancelada pelo utilizador.");
        }); respond(['ok'=>true]);
    }
}
if (str_starts_with($route,'/admin/')) {
    $actor=admin();
    if (preg_match('~^/admin/products/(\d+)/variants$~',$route,$m)) {
        $pid=(int)$m[1]; if (!query('SELECT id FROM products WHERE id=? AND active=1',[$pid])->fetchColumn()) { fail('Produto não encontrado.',404); }
        if ($method==='GET') { respond(variants($pid,true)); }
        if ($method==='POST') {
            $data=body(); $label=field($data,'label',1,100); $sku=strtoupper(field($data,'sku',3,80));
            if (!preg_match('/^[A-Z0-9_-]+$/D',$sku)) { fail('O SKU só pode conter letras, números, hífen e sublinhado.',422); }
            $price=integer($data['price_cents']??null,1,100000000,'preço'); $stock=integer($data['stock']??0,0,100000,'stock');
            $image=imagePath(field($data,'image',1,500)); $color=field($data,'color',0,60); $size=field($data,'size',0,60); $material=field($data,'material',0,100);
            $id=transaction(function () use ($pid,$label,$sku,$price,$stock,$image,$color,$size,$material) {
                query('SELECT id FROM products WHERE id=? FOR UPDATE',[$pid]);
                if (count(variants($pid,true))>=50) { fail('Limite de 50 variantes por produto.',422); }
                query('INSERT INTO product_variants (product_id,label,sku,color,size,material,image,price_cents,stock) VALUES (?,?,?,?,?,?,?,?,0)',[$pid,$label,$sku,$color,$size,$material,$image,$price]);
                $id=(int)db()->lastInsertId(); stockChange($id,$stock,'Entrada de nova variante'); activity('Variante criada',"Produto #$pid: $label"); return $id;
            }); respond(['id'=>$id],201);
        }
    }
    if (preg_match('~^/admin/variants/(\d+)$~',$route,$m)) {
        $id=(int)$m[1]; $variant=query('SELECT * FROM product_variants WHERE id=?',[$id])->fetch();
        if (!$variant) { fail('Variante não encontrada.',404); }
        if ($method==='PUT') {
            $data=body(); $label=field($data,'label',1,100); $price=integer($data['price_cents']??null,1,100000000,'preço'); $stock=integer($data['stock']??null,0,100000,'stock');
            $image=imagePath(field($data,'image',1,500)); $color=field($data,'color',0,60); $size=field($data,'size',0,60); $material=field($data,'material',0,100); $reason=field($data,'reason',3,200);
            transaction(function () use ($id,$variant,$label,$price,$stock,$image,$color,$size,$material,$reason) {
                query('SELECT id FROM products WHERE id=? FOR UPDATE',[$variant['product_id']]);
                $current=query('SELECT stock FROM product_variants WHERE id=? FOR UPDATE',[$id])->fetchColumn();
                query('UPDATE product_variants SET label=?,price_cents=?,image=?,color=?,size=?,material=? WHERE id=?',[$label,$price,$image,$color,$size,$material,$id]);
                stockChange($id,$stock-(int)$current,$reason); activity('Variante alterada',"Variante #$id: $label");
            }); respond(['ok'=>true]);
        }
        if ($method==='DELETE' || $method==='PATCH') {
            transaction(function () use ($id,$variant,$method) {
                query('SELECT id FROM products WHERE id=? FOR UPDATE',[$variant['product_id']]);
                if ($method==='DELETE' && (int)$variant['active']===1 && count(variants((int)$variant['product_id']))<=1) { fail('O produto deve manter pelo menos uma variante ativa.',422); }
                query('UPDATE product_variants SET active=? WHERE id=?',[$method==='PATCH'?1:0,$id]); syncProduct((int)$variant['product_id']); activity('Disponibilidade de variante alterada',"Variante #$id");
            }); respond(['ok'=>true]);
        }
    }
    if ($route==='/admin/stock' && $method==='GET') {
        $params=[]; $where=''; if (!empty($_GET['product_id'])) { $where=' WHERE s.product_id=?'; $params[] = integer($_GET['product_id'],1,PHP_INT_MAX,'produto'); }
        respond(query('SELECT s.*,p.name AS product_name,v.label AS variant_label,u.name AS user_name FROM stock_movements s JOIN products p ON p.id=s.product_id LEFT JOIN product_variants v ON v.id=s.variant_id LEFT JOIN users u ON u.id=s.user_id'.$where.' ORDER BY s.id DESC LIMIT 300',$params)->fetchAll());
    }
    if ($route==='/admin/stock' && $method==='POST') {
        $data=body(); $id=integer($data['variant_id']??null,1,PHP_INT_MAX,'variante'); $delta=integer($data['delta']??null,-100000,100000,'quantidade'); $reason=field($data,'reason',3,200);
        if ($delta===0) { fail('Indica uma quantidade diferente de zero.',422); }
        transaction(function () use ($id,$delta,$reason) {
            $variant=query('SELECT product_id FROM product_variants WHERE id=? AND active=1',[$id])->fetch(); if (!$variant) { fail('Variante não encontrada.',404); }
            query('SELECT id FROM products WHERE id=? FOR UPDATE',[$variant['product_id']]); stockChange($id,$delta,$reason); activity('Stock ajustado',"Variante #$id: $delta ($reason)");
        }); respond(['ok'=>true]);
    }
    if ($route==='/admin/coupons' && $method==='GET') { respond(query('SELECT * FROM coupons ORDER BY id DESC')->fetchAll()); }
    if (($route==='/admin/coupons' && $method==='POST') || (preg_match('~^/admin/coupons/(\d+)$~',$route,$m) && $method==='PUT')) {
        $id=$method==='PUT'?(int)$m[1]:null; $data=body(); $code=strtoupper(field($data,'code',3,40)); $type=field($data,'type',1,20);
        if (!preg_match('/^[A-Z0-9_-]+$/D',$code) || !in_array($type,['percent','fixed'],true)) { fail('Código ou tipo de cupão inválido.',422); }
        $value=integer($data['value']??null,1,$type==='percent'?100:100000000,'desconto'); $minimum=integer($data['minimum_cents']??0,0,100000000,'compra mínima'); $max=integer($data['max_uses']??null,1,1000000,'utilizações');
        $start=field($data,'starts_at',10,10); $end=field($data,'expires_at',10,10);
        foreach ([$start,$end] as $day) { $d=DateTimeImmutable::createFromFormat('!Y-m-d',$day); if (!$d || $d->format('Y-m-d')!==$day) { fail('Data inválida.',422); } }
        if ($end<$start) { fail('O fim de validade deve ser posterior ao início.',422); }
        transaction(function () use ($id,$data,$code,$type,$value,$minimum,$max,$start,$end) {
            $values=[$code,$type,$value,$minimum,$max,$start.' 00:00:00',$end.' 23:59:59',!empty($data['active'])?1:0];
            if ($id) {
                $coupon=query('SELECT used_count FROM coupons WHERE id=? FOR UPDATE',[$id])->fetch(); if (!$coupon) { fail('Cupão não encontrado.',404); }
                if ((int)$coupon['used_count']>$max) { fail('O limite não pode ser inferior às utilizações já realizadas.',422); }
                query('UPDATE coupons SET code=?,type=?,value=?,minimum_cents=?,max_uses=?,starts_at=?,expires_at=?,active=? WHERE id=?',[...$values,$id]);
            } else { query('INSERT INTO coupons (code,type,value,minimum_cents,max_uses,starts_at,expires_at,active) VALUES (?,?,?,?,?,?,?,?)',$values); }
            activity('Cupão guardado',$code);
        }); respond(['ok'=>true],$id?200:201);
    }
    if (preg_match('~^/admin/coupons/(\d+)$~',$route,$m) && $method==='DELETE') { query('UPDATE coupons SET active=0 WHERE id=?',[$m[1]]); activity('Cupão desativado',"Cupão #{$m[1]}"); respond(['ok'=>true]); }
    if ($route==='/admin/reviews' && $method==='GET') { respond(reviewRows()); }
    if (preg_match('~^/admin/reviews/(\d+)$~',$route,$m) && $method==='PATCH') {
        $data=body(); query('UPDATE reviews SET visible=? WHERE id=?',[!empty($data['visible'])?1:0,$m[1]]); activity('Moderação de avaliação',"Avaliação #{$m[1]}"); respond(['ok'=>true]);
    }
}
