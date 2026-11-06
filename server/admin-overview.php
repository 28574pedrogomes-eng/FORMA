<?php
declare(strict_types=1);

if ($route === '/admin/customers' && $method === 'GET') {
    admin();
    respond(query("SELECT u.id,u.name,u.email,u.created_at,COALESCE(o.order_count,0) AS order_count,COALESCE(o.paid_cents,0) AS paid_cents,o.last_order_at FROM users u LEFT JOIN (SELECT user_id,COUNT(*) AS order_count,SUM(CASE WHEN payment_status='paid' AND status<>'cancelled' THEN total_cents ELSE 0 END) AS paid_cents,MAX(created_at) AS last_order_at FROM orders GROUP BY user_id) o ON o.user_id=u.id WHERE u.role='customer' ORDER BY u.created_at DESC,u.id DESC LIMIT 200")->fetchAll());
}
if ($route === '/admin/overview' && $method === 'GET') {
    admin();
    $days = integer($_GET['days'] ?? 30, 1, 90, 'período');
    if (!in_array($days,[7,30,90],true)) fail('Escolhe 7, 30 ou 90 dias.',422);
    $end = new DateTimeImmutable('tomorrow', new DateTimeZone('UTC'));
    $start = $end->modify("-$days days");
    $previous = $start->modify("-$days days");
    $bounds = [$start->format('Y-m-d H:i:s'),$end->format('Y-m-d H:i:s')];
    $metrics = static function (string $from,string $to): array {
        $row = query("SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN payment_status='paid' AND status<>'cancelled' THEN total_cents ELSE 0 END),0) AS paid_cents,COALESCE(SUM(payment_status='paid' AND status<>'cancelled'),0) AS paid_orders,COALESCE(SUM(status='cancelled'),0) AS cancelled_orders FROM orders WHERE created_at>=? AND created_at<?",[$from,$to])->fetch();
        $row = array_map('intval',$row);
        $row['average_cents'] = $row['paid_orders'] ? (int)round($row['paid_cents']/$row['paid_orders']) : 0;
        $row['new_customers'] = (int)query("SELECT COUNT(*) FROM users WHERE role='customer' AND created_at>=? AND created_at<?",[$from,$to])->fetchColumn();
        return $row;
    };
    $dailyRows = query("SELECT DATE(created_at) AS day,COUNT(*) AS orders,COALESCE(SUM(CASE WHEN payment_status='paid' AND status<>'cancelled' THEN total_cents ELSE 0 END),0) AS total FROM orders WHERE created_at>=? AND created_at<? GROUP BY DATE(created_at) ORDER BY day",$bounds)->fetchAll();
    $dailyByDate = array_column($dailyRows,null,'day'); $daily = [];
    for ($day=$start;$day<$end;$day=$day->modify('+1 day')) {
        $key=$day->format('Y-m-d'); $daily[]=['day'=>$key,'total'=>(int)($dailyByDate[$key]['total']??0),'orders'=>(int)($dailyByDate[$key]['orders']??0)];
    }
    $operations = array_map('intval', query("SELECT COALESCE(SUM(status='pending' AND payment_status='paid'),0) AS to_prepare,COALESCE(SUM(status='processing'),0) AS to_ship,COALESCE(SUM(status='pending' AND payment_status IN ('pending','failed','unpaid')),0) AS awaiting_payment FROM orders")->fetch());
    $operations['support']=(int)query("SELECT COUNT(*) FROM support_tickets WHERE status='open'")->fetchColumn();
    $operations['returns']=(int)query("SELECT COUNT(*) FROM return_requests WHERE status IN ('requested','approved')")->fetchColumn();
    $operations['low_stock']=(int)query('SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.active=1 AND v.active=1 AND v.stock<=5')->fetchColumn();
    $lowStock=query('SELECT v.id,v.product_id,p.name,v.label,v.stock,v.image FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.active=1 AND v.active=1 AND v.stock<=5 ORDER BY v.stock,p.name,v.id LIMIT 6')->fetchAll();
    $top=query("SELECT i.product_id,i.product_name,SUM(i.quantity) AS units,SUM(i.quantity*i.unit_price_cents) AS gross_cents FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.payment_status='paid' AND o.status<>'cancelled' AND o.created_at>=? AND o.created_at<? GROUP BY i.product_id,i.product_name ORDER BY units DESC,gross_cents DESC,i.product_id LIMIT 5",$bounds)->fetchAll();
    $alerts=query('SELECT COUNT(*) AS subscriptions,COUNT(DISTINCT user_id) AS subscribers,COALESCE(SUM(notification_count),0) AS notifications FROM price_alerts')->fetch();
    $watched=query('SELECT p.id,p.name,p.image,p.price_cents,COUNT(*) AS watchers FROM price_alerts a JOIN products p ON p.id=a.product_id WHERE p.active=1 GROUP BY p.id,p.name,p.image,p.price_cents ORDER BY watchers DESC,p.id LIMIT 5')->fetchAll();
    respond([
        'days'=>$days,'from'=>$start->format('Y-m-d'),'to'=>$end->modify('-1 day')->format('Y-m-d'),'generated_at'=>gmdate('Y-m-d H:i:s'),
        'metrics'=>$metrics(...$bounds),'previous'=>$metrics($previous->format('Y-m-d H:i:s'),$bounds[0]),'daily'=>$daily,
        'operations'=>$operations,'low_stock'=>$lowStock,'top_products'=>$top,'price_alerts'=>array_map('intval',$alerts),'watched_products'=>$watched,
        'product_count'=>(int)query('SELECT COUNT(*) FROM products WHERE active=1')->fetchColumn(),
        'customer_count'=>(int)query("SELECT COUNT(*) FROM users WHERE role='customer'")->fetchColumn(),
        'recent_orders'=>query('SELECT id,shipping_name,total_cents,status,payment_status,created_at FROM orders ORDER BY id DESC LIMIT 6')->fetchAll(),
        'recent_activity'=>query('SELECT id,action,details,created_at FROM activity_logs ORDER BY id DESC LIMIT 5')->fetchAll(),
        'worker_running'=>is_file(workerHeartbeat()) && filemtime(workerHeartbeat())>time()-90,
    ]);
}
