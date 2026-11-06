<?php
declare(strict_types=1);
require_once __DIR__ . '/price-notifications.php';

function migrateCatalogRefresh(PDO $db): array {
    $version = 'catalog-refresh-2026-v1';
    $db->beginTransaction();
    try {
        // The unique marker also prevents concurrent installers from duplicating stock.
        $claim = $db->prepare('INSERT IGNORE INTO schema_migrations (version) VALUES (?)');
        $claim->execute([$version]);
        if (!$claim->rowCount()) { $db->commit(); return ['added' => 0, 'repriced' => 0]; }
        $products = json_decode(file_get_contents(__DIR__ . '/../database/catalog-2026.json'), true, 512, JSON_THROW_ON_ERROR);
        $findCategory = $db->prepare('SELECT id FROM categories WHERE name=?');
        $addCategory = $db->prepare('INSERT INTO categories (name,description) VALUES (?,?)');
        $findProduct = $db->prepare('SELECT id FROM products WHERE name=? OR image=? LIMIT 1');
        $addProduct = $db->prepare('INSERT INTO products (category_id,name,description,price_cents,stock,image,badge,material,featured,dimensions) VALUES (?,?,?,?,?,?,?,?,?,?)');
        $addVariant = $db->prepare("INSERT INTO product_variants (product_id,label,sku,material,image,price_cents,stock) VALUES (?,'Padrão',?,?,?,?,?)");
        $movement = $db->prepare('INSERT INTO stock_movements (product_id,variant_id,delta,balance,reason) VALUES (?,?,?,?,?)');
        $added = 0; $repriced = 0;
        foreach ($products as $product) {
            $findProduct->execute([$product['name'], $product['image']]);
            if ($findProduct->fetchColumn()) continue;
            if (!preg_match('~^images/collection-[0-9]+\.jpg$~D', $product['image']) || !is_file(__DIR__ . '/../public/' . $product['image'])) {
                throw new RuntimeException('Fotografia em falta: ' . $product['name']);
            }
            $findCategory->execute([$product['category']]);
            $categoryId = $findCategory->fetchColumn();
            if (!$categoryId) {
                $addCategory->execute([$product['category'], 'Peças para os pequenos rituais do dia a dia.']);
                $categoryId = $db->lastInsertId();
            }
            $addProduct->execute([$categoryId, $product['name'], $product['description'], $product['price_cents'], $product['stock'], $product['image'], $product['badge'], $product['material'], $product['featured'], $product['dimensions']]);
            $productId = (int)$db->lastInsertId();
            $addVariant->execute([$productId, "FORMA-$productId-BASE", $product['material'], $product['image'], $product['price_cents'], $product['stock']]);
            $movement->execute([$productId, $db->lastInsertId(), $product['stock'], $product['stock'], 'Inventário inicial — coleção 2026']);
            $added++;
        }
        $find = $db->prepare('SELECT id,name,price_cents FROM products WHERE name=? AND image=? AND active=1 FOR UPDATE');
        $variants = $db->prepare('SELECT id,price_cents,active,sku FROM product_variants WHERE product_id=? FOR UPDATE');
        $updateVariant = $db->prepare('UPDATE product_variants SET price_cents=? WHERE id=?');
        $updateProduct = $db->prepare('UPDATE products SET price_cents=? WHERE id=?');
        foreach (require __DIR__ . '/../database/catalog-price-review.php' as [$name, $image, $before, $after]) {
            if ($before === $after) continue;
            $find->execute([$name, 'images/' . $image]);
            $product = $find->fetch(PDO::FETCH_ASSOC);
            if (!$product || (int)$product['price_cents'] !== $before) continue;
            $variants->execute([$product['id']]); $options = $variants->fetchAll(PDO::FETCH_ASSOC);
            // Only untouched seed prices with their original, single variant are revised.
            if (count($options) !== 1 || (int)$options[0]['active'] !== 1 || (int)$options[0]['price_cents'] !== $before || $options[0]['sku'] !== 'FORMA-' . $product['id'] . '-BASE') continue;
            $updateVariant->execute([$after, $options[0]['id']]);
            $updateProduct->execute([$after, $product['id']]);
            if ($after < $before) notifyPriceDrop($db, (int)$product['id'], $name, $after);
            $repriced++;
        }
        $db->commit();
        return ['added' => $added, 'repriced' => $repriced];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}
