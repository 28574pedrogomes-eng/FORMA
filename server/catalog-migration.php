<?php
declare(strict_types=1);

function migrateCatalog(PDO $db): int {
    $version = 'catalog-expansion-v1';
    $applied = $db->prepare('SELECT version FROM schema_migrations WHERE version = ?');
    $applied->execute([$version]);
    if ($applied->fetchColumn()) { return 0; }

    $products = require __DIR__ . '/../database/catalog-additions.php';
    $category = $db->prepare('SELECT id FROM categories WHERE name = ?');
    $createCategory = $db->prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
    $existing = $db->prepare('SELECT id FROM products WHERE image = ? OR name = ? LIMIT 1');
    $createProduct = $db->prepare('INSERT INTO products (category_id, name, description, price_cents, stock, image, badge, material, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $createVariant = $db->prepare("INSERT INTO product_variants (product_id, label, sku, material, image, price_cents, stock) VALUES (?, 'Padrão', ?, ?, ?, ?, ?)");
    $stock = $db->prepare('INSERT INTO stock_movements (product_id, variant_id, delta, balance, reason) VALUES (?, ?, ?, ?, ?)');
    $inserted = 0;
    $db->beginTransaction();
    try {
        foreach ($products as $product) {
            // Uma instalação posterior nunca repõe stock nem reativa peças arquivadas.
            $existing->execute([$product[5], $product[1]]);
            if ($existing->fetchColumn()) { continue; }
            if (!is_file(__DIR__ . '/../public/' . $product[5])) {
                throw new RuntimeException('Falta a fotografia do produto: ' . $product[1]);
            }
            $categoryName = $product[0];
            $category->execute([$categoryName]);
            $categoryId = $category->fetchColumn();
            if (!$categoryId) {
                $createCategory->execute([$categoryName, 'Peças da coleção FORMA.']);
                $categoryId = $db->lastInsertId();
            }
            $product[0] = (int)$categoryId;
            $createProduct->execute($product);
            $id = (int)$db->lastInsertId();
            $createVariant->execute([$id, "FORMA-$id-BASE", $product[7], $product[5], $product[3], $product[4]]);
            $variantId = (int)$db->lastInsertId();
            $stock->execute([$id, $variantId, $product[4], $product[4], 'Inventário inicial — nova coleção']);
            $inserted++;
        }
        $db->prepare('INSERT INTO schema_migrations (version) VALUES (?)')->execute([$version]);
        $db->commit();
        return $inserted;
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}
