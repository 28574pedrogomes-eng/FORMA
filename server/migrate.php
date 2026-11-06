<?php
declare(strict_types=1);
function migrateCommerce(PDO $db): void {
    $db->exec(file_get_contents(__DIR__ . '/../database/commerce.sql'));
    $columns = [
        'orders' => [
            'discount_cents' => 'INT UNSIGNED NOT NULL DEFAULT 0',
            'coupon_id' => 'BIGINT UNSIGNED NULL', 'coupon_code' => "VARCHAR(40) NOT NULL DEFAULT ''",
            'shipping_method' => "VARCHAR(20) NOT NULL DEFAULT 'standard'",
            'payment_status' => "VARCHAR(20) NOT NULL DEFAULT 'paid'",
        ],
        'order_items' => ['variant_id' => 'BIGINT UNSIGNED NULL', 'variant_label' => "VARCHAR(100) NOT NULL DEFAULT ''"],
    ];
    foreach ($columns as $table => $definitions) {
        foreach ($definitions as $column => $definition) {
            $stmt = $db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');
            $stmt->execute([$table, $column]);
            if (!(int)$stmt->fetchColumn()) { $db->exec("ALTER TABLE $table ADD COLUMN $column $definition"); }
        }
    }
    if ($db->query("SELECT version FROM schema_migrations WHERE version='commerce-v1'")->fetchColumn()) { return; }
    $db->beginTransaction();
    try {
        $db->exec("INSERT INTO product_variants (product_id,label,sku,material,image,price_cents,stock) SELECT p.id,'Padrão',CONCAT('FORMA-',p.id,'-BASE'),p.material,p.image,p.price_cents,p.stock FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id)");
        $db->exec("UPDATE order_items i JOIN product_variants v ON v.product_id=i.product_id AND v.sku=CONCAT('FORMA-',i.product_id,'-BASE') SET i.variant_id=v.id,i.variant_label=v.label WHERE i.variant_id IS NULL");
        $db->exec("INSERT INTO stock_movements (product_id,variant_id,delta,balance,reason) SELECT product_id,id,stock,stock,'Inventário inicial' FROM product_variants");
        $db->exec("INSERT INTO schema_migrations (version) VALUES ('commerce-v1')");
        $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
}
