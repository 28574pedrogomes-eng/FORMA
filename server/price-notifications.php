<?php
declare(strict_types=1);

/** Called inside the price update transaction, with the product row locked. */
function notifyPriceDrop(PDO $db, int $productId, string $name, int $price): void {
    $watchers = $db->prepare('SELECT user_id,reference_price_cents FROM price_alerts WHERE product_id=? AND reference_price_cents>? FOR UPDATE');
    $watchers->execute([$productId, $price]);
    $notification = $db->prepare('INSERT INTO notifications (user_id,title,message) VALUES (?,?,?)');
    $update = $db->prepare('UPDATE price_alerts SET reference_price_cents=?,notification_count=notification_count+1,last_notified_at=UTC_TIMESTAMP() WHERE user_id=? AND product_id=?');
    foreach ($watchers->fetchAll(PDO::FETCH_ASSOC) as $watcher) {
        $old = number_format((int)$watcher['reference_price_cents'] / 100, 2, ',', ' ');
        $new = number_format($price / 100, 2, ',', ' ');
        $notification->execute([$watcher['user_id'], 'Um favorito baixou de preço', $name . ': de ' . $old . ' € para ' . $new . ' €. Consulta os teus favoritos; preço mínimo entre as opções ativas.']);
        $update->execute([$price, $watcher['user_id'], $productId]);
    }
}
