<?php
declare(strict_types=1);
function migrateExperience(PDO $db): void {
    $db->exec(file_get_contents(__DIR__ . '/../database/experience.sql'));
    $columns = [
        'news_articles' => ['status' => "ENUM('published','draft','scheduled') NOT NULL DEFAULT 'published'", 'publish_at' => 'DATETIME NULL', 'version' => 'INT UNSIGNED NOT NULL DEFAULT 1'],
        'products' => ['dimensions' => "VARCHAR(120) NOT NULL DEFAULT ''"],
    ];
    foreach ($columns as $table => $definitions) foreach ($definitions as $column => $definition) {
        $check = $db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');
        $check->execute([$table, $column]); if (!$check->fetchColumn()) $db->exec("ALTER TABLE $table ADD COLUMN $column $definition");
    }
    $deepColumns = [
        'products' => [
            'sustainability' => "VARCHAR(500) NOT NULL DEFAULT ''",
            'origin' => "VARCHAR(120) NOT NULL DEFAULT ''",
            'repairable' => 'TINYINT(1) NOT NULL DEFAULT 0',
            'width_cm' => 'SMALLINT UNSIGNED NULL',
            'depth_cm' => 'SMALLINT UNSIGNED NULL',
            'height_cm' => 'SMALLINT UNSIGNED NULL',
        ],
        'orders' => ['reservation_expires_at' => 'DATETIME NULL'],
    ];
    foreach ($deepColumns as $table => $definitions) foreach ($definitions as $column => $definition) {
        $check = $db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');
        $check->execute([$table, $column]); if (!$check->fetchColumn()) $db->exec("ALTER TABLE $table ADD COLUMN $column $definition");
    }
    $db->exec("UPDATE orders SET reservation_expires_at=DATE_ADD(created_at, INTERVAL 30 MINUTE) WHERE reservation_expires_at IS NULL AND status='pending' AND payment_status IN ('unpaid','pending','failed')");
    $db->exec("CREATE TABLE IF NOT EXISTS return_request_items (
        return_request_id BIGINT UNSIGNED NOT NULL, order_item_id BIGINT UNSIGNED NOT NULL,
        quantity INT UNSIGNED NOT NULL, refunded_cents INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY(return_request_id,order_item_id),
        FOREIGN KEY(return_request_id) REFERENCES return_requests(id) ON DELETE CASCADE,
        FOREIGN KEY(order_item_id) REFERENCES order_items(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    if ($db->query("SELECT version FROM schema_migrations WHERE version='experience-v1'")->fetchColumn()) return;
    $db->beginTransaction();
    try {
        $update = $db->prepare('UPDATE products SET dimensions=? WHERE id=?');
        foreach ($db->query('SELECT id,description FROM products')->fetchAll(PDO::FETCH_ASSOC) as $p) {
            if (preg_match('/(?:Dimensões|Altura|Diâmetro):\s*([^.;]+)/u', $p['description'], $match)) $update->execute([mb_substr($match[1],0,120),$p['id']]);
        }
        $revision = $db->prepare('INSERT INTO news_revisions (article_id,editor_id,snapshot) VALUES (?,?,?)');
        foreach ($db->query('SELECT * FROM news_articles')->fetchAll(PDO::FETCH_ASSOC) as $article) $revision->execute([$article['id'],$article['author_id'],json_encode($article,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        $find = $db->prepare('SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.image=? AND p.active=1 AND v.active=1 ORDER BY v.id LIMIT 1');
        $bundle = $db->prepare('INSERT INTO bundles (name,description,image) VALUES (?,?,?)');
        $item = $db->prepare('INSERT INTO bundle_items (bundle_id,variant_id,quantity) VALUES (?,?,1)');
        foreach ([
            ['O teu canto de leitura','Uma cadeira, uma luz e uma mesa de apoio. Três peças para criar um lugar só teu.','images/hero.jpg',['chair.jpg','lamp.jpg','table.jpg']],
            ['Texturas para abrandar','Uma manta e uma almofada para dar um novo conforto ao sofá.','images/manta-abrigo.jpg',['cushion.jpg','blanket.jpg']],
            ['Pequenos detalhes','Cerâmica e formas orgânicas para completar uma estante ou um aparador.','images/story.jpg',['vase.jpg','plant.jpg']],
        ] as [$name,$description,$image,$files]) {
            $variants=[]; foreach($files as $file) { $find->execute(['images/'.$file]); $id=$find->fetchColumn(); if($id) $variants[]=$id; }
            if(count($variants)!==count($files)) continue;
            $bundle->execute([$name,$description,$image]); $bid=$db->lastInsertId(); foreach($variants as $vid) $item->execute([$bid,$vid]);
        }
        $db->exec("INSERT INTO schema_migrations (version) VALUES ('experience-v1')"); $db->commit();
    } catch(Throwable $e) { $db->rollBack(); throw $e; }
}
