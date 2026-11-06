<?php
declare(strict_types=1);
function migrateImprovements(PDO $db): void {
    $db->exec(file_get_contents(__DIR__.'/../database/improvements.sql'));
    if($db->query("SELECT version FROM schema_migrations WHERE version='improvements-v1'")->fetchColumn())return;
    $db->beginTransaction();
    try {
        $db->exec("INSERT INTO order_events (order_id,status,note,occurred_at) SELECT id,'pending','Encomenda registada',created_at FROM orders");
        $db->exec("INSERT INTO order_events (order_id,status,note,occurred_at) SELECT id,status,'Estado anterior à criação do histórico; data não disponível',NULL FROM orders WHERE status<>'pending'");
        $db->exec("INSERT INTO schema_migrations (version) VALUES ('improvements-v1')"); $db->commit();
    }catch(Throwable $e){$db->rollBack();throw $e;}
}
