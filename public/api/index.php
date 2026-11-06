<?php
declare(strict_types=1);
require __DIR__ . '/../../server/bootstrap.php';
require __DIR__ . '/../../server/commerce.php';
require __DIR__ . '/../../server/integrations.php';
require __DIR__ . '/../../server/improvements.php';
require __DIR__ . '/../../server/google-auth.php';

try {
    $method = $_SERVER['REQUEST_METHOD'];
    $route = '/' . trim((string)($_GET['route'] ?? ''), '/');
    if (!in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) { fail('Método não suportado.', 405); }
    if ($method !== 'GET' && !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) { fail('A sessão de segurança expirou. Atualiza a página.', 419); }

    require __DIR__ . '/../../server/improvement-routes.php';
    require __DIR__ . '/../../server/google-auth-routes.php';
    require __DIR__ . '/../../server/price-alert-routes.php';
    require __DIR__ . '/../../server/admin-overview.php';
    require __DIR__ . '/../../server/backup-routes.php';
    require __DIR__ . '/../../server/commerce-routes.php';
    require __DIR__ . '/../../server/news-routes.php';
    require __DIR__ . '/../../server/integration-routes.php';
    require __DIR__ . '/../../server/experience-routes.php';

    if ($route === '/session' && $method === 'GET') {
        respond(['user' => user(false), 'csrf' => $_SESSION['csrf']]);
    }
    if ($route === '/auth/register' && $method === 'POST') {
        rateLimit('register', 10);
        $data = body();
        $name = field($data, 'name', 2, 100);
        $email = emailField($data);
        $password = passwordField($data);
        if (query('SELECT id FROM users WHERE email = ?', [$email])->fetchColumn()) { fail('Não foi possível criar a conta. Tenta iniciar sessão ou recuperar a palavra-passe.', 409); }
        $id = transaction(function () use ($name, $email, $password) {
            query('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)', [$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $id = (int)db()->lastInsertId();
            activity('Conta criada', 'Registo de novo cliente.', $id);
            notifyUser($id, 'Bem-vindo à FORMA', 'A tua casa começa aqui. Descobre objetos com intenção.');
            return $id;
        });
        loginUser(query('SELECT * FROM users WHERE id = ?', [$id])->fetch());
        respond(['user' => user(), 'csrf' => $_SESSION['csrf']], 201);
    }
    if ($route === '/auth/login' && $method === 'POST') {
        rateLimit('login-ip', 50);
        $data = body(); $email = emailField($data);
        rateLimit('login-' . $email, 8);
        $password = $data['password'] ?? null;
        if (!is_string($password) || strlen($password) < 1 || strlen($password) > 72) { fail('Introduz uma palavra-passe válida.', 422); }
        $found = query('SELECT * FROM users WHERE email = ?', [$email])->fetch();
        $dummy = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        $valid = password_verify($password, $found['password_hash'] ?? $dummy);
        if (!$found || !$valid) { fail('Email ou palavra-passe incorretos.', 401); }
        loginUser($found);
        activity('Início de sessão', 'Autenticação com sucesso.');
        respond(['user' => user(), 'csrf' => $_SESSION['csrf']]);
    }
    if ($route === '/auth/logout' && $method === 'POST') {
        if (user(false)) { activity('Fim de sessão', 'Sessão terminada.'); }
        $_SESSION = []; session_regenerate_id(true); $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['csrf' => $_SESSION['csrf']]);
    }
    if ($route === '/auth/forgot' && $method === 'POST') {
        rateLimit('forgot', 5);
        $email = emailField(body());
        $found = query('SELECT id,email FROM users WHERE email = ?', [$email])->fetch();
        if ($found) {
            $token = bin2hex(random_bytes(32));
            transaction(function () use ($found, $token) {
                query('DELETE FROM password_resets WHERE user_id = ? OR expires_at < UTC_TIMESTAMP()', [$found['id']]);
                query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)', [$found['id'], hash('sha256', $token), gmdate('Y-m-d H:i:s', time() + 1800)]);
                activity('Recuperação pedida', 'Foi pedido um link de recuperação.', (int)$found['id']);
            });
            $link = rtrim($config['app_url'], '/') . '/#reset?token=' . $token;
            $message = "Olá!\n\nPara redefinir a palavra-passe da FORMA, abre este link:\n$link\n\nO link expira em 30 minutos e só pode ser usado uma vez. Se não fizeste este pedido, ignora esta mensagem.\n";
            queueEmail($found['email'], 'Recuperar acesso à FORMA', $message);
        }
        respond(['message' => 'Se o email estiver registado, receberás um link para redefinir a palavra-passe.']);
    }
    if ($route === '/auth/reset' && $method === 'POST') {
        rateLimit('reset', 10);
        $data = body(); $token = field($data, 'token', 64, 64); $password = passwordField($data);
        transaction(function () use ($token, $password) {
            $reset = query('SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [hash('sha256', $token)])->fetch();
            if (!$reset) { fail('O link é inválido ou expirou. Pede um novo link.', 422); }
            query('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $reset['user_id']]);
            query('DELETE FROM password_resets WHERE user_id = ?', [$reset['user_id']]);
            activity('Palavra-passe alterada', 'Recuperação concluída. Sessões anteriores invalidadas.', (int)$reset['user_id']);
            notifyUser((int)$reset['user_id'], 'Palavra-passe alterada', 'A tua palavra-passe foi redefinida com sucesso.');
        });
        respond(['message' => 'Palavra-passe alterada. Já podes iniciar sessão.']);
    }
    if ($route === '/categories' && $method === 'GET') {
        respond(query('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count FROM categories c ORDER BY c.id')->fetchAll());
    }
    if ($route === '/products' && $method === 'GET') {
        $where = ['p.active = 1']; $params = [];
        $search = mb_substr(trim((string)($_GET['search'] ?? '')), 0, 100);
        if ($search !== '') { $where[] = '(p.name LIKE ? OR p.description LIKE ? OR p.material LIKE ?)'; $pattern = '%' . $search . '%'; array_push($params, $pattern, $pattern, $pattern); }
        if (!empty($_GET['category'])) { $where[] = 'p.category_id = ?'; $params[] = integer($_GET['category'], 1, PHP_INT_MAX, 'categoria'); }
        if (!empty($_GET['in_stock'])) { $where[] = 'p.stock > 0'; }
        if (isset($_GET['max_price']) && $_GET['max_price'] !== '') { $where[] = 'p.price_cents <= ?'; $params[] = integer($_GET['max_price'], 0, 100000000, 'preço máximo'); }
        $sort = ['featured' => 'p.featured DESC, p.id ASC', 'price_asc' => 'p.price_cents ASC, p.id ASC', 'price_desc' => 'p.price_cents DESC, p.id ASC', 'newest' => 'p.id DESC'][$_GET['sort'] ?? 'featured'] ?? 'p.id ASC';
        $page = integer($_GET['page'] ?? 1, 1, 100000, 'página');
        $sqlWhere = implode(' AND ', $where);
        $total = (int)query("SELECT COUNT(*) FROM products p WHERE $sqlWhere", $params)->fetchColumn();
        $offset = ($page - 1) * 12;
        $items = query("SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id WHERE $sqlWhere ORDER BY $sort LIMIT 12 OFFSET $offset", $params)->fetchAll();
        respond(['items' => array_map('enrichProduct', $items), 'total' => $total, 'pages' => max(1, (int)ceil($total / 12)), 'page' => $page]);
    }
    if (preg_match('~^/products/(\d+)$~', $route, $matches) && $method === 'GET') {
        $product = query('SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ? AND p.active = 1', [$matches[1]])->fetch();
        if (!$product) { fail('Produto não encontrado.', 404); }
        respond(enrichProduct($product, true));
    }
    if ($route === '/notifications' && $method === 'GET') {
        $actor = user(); respond(query('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', [$actor['id']])->fetchAll());
    }
    if ($route === '/notifications/read' && $method === 'POST') {
        $actor = user(); query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [$actor['id']]); respond(['ok' => true]);
    }
    if ($route === '/orders' && $method === 'GET') {
        $actor = user();
        respond(array_map('orderWithItems', query('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100', [$actor['id']])->fetchAll()));
    }
    if ($route === '/orders' && $method === 'POST') { respond(checkoutOrder(user(), body()), 201); }

    if (str_starts_with($route, '/admin/')) {
        $actor = admin();
        if ($route === '/admin/products' && $method === 'GET') { respond(array_map('enrichProduct', query('SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.active = 1 ORDER BY p.id DESC')->fetchAll())); }
        if ($route === '/admin/products' && $method === 'POST') {
            $values = productFields(body());
            $id = transaction(function () use ($values) {
                query('INSERT INTO products (category_id,name,description,price_cents,stock,image,badge,material,featured,dimensions) VALUES (?,?,?,?,?,?,?,?,?,?)', $values);
                $id = (int)db()->lastInsertId(); addBaseVariant($id, $values); activity('Produto criado', "Produto #$id: {$values[1]}"); return $id;
            });
            respond(['id' => $id], 201);
        }
        if (preg_match('~^/admin/products/(\d+)$~', $route, $matches)) {
            $id = (int)$matches[1];
            if (!query('SELECT id FROM products WHERE id = ? AND active = 1', [$id])->fetchColumn()) { fail('Produto não encontrado.', 404); }
            if ($method === 'PUT') {
                $values = productFields(body());
                transaction(function () use ($values, $id) {
                    query('SELECT id FROM products WHERE id=? FOR UPDATE', [$id]);
                    $options = variants($id);
                    query('UPDATE products SET category_id=?,name=?,description=?,image=?,badge=?,material=?,featured=?,dimensions=? WHERE id=?', [$values[0],$values[1],$values[2],$values[5],$values[6],$values[7],$values[8],$values[9],$id]);
                    if (count($options) === 1) {
                        $option = $options[0];
                        query('UPDATE product_variants SET price_cents=?,image=?,material=? WHERE id=?', [$values[3],$values[5],$values[7],$option['id']]);
                        stockChange((int)$option['id'], (int)$values[4] - (int)$option['stock'], 'Ajuste no editor de produto');
                    }
                    syncProduct($id);
                    activity('Produto alterado', "Produto #$id: {$values[1]}");
                });
                respond(['ok' => true]);
            }
            if ($method === 'DELETE') {
                transaction(function () use ($id) { query('UPDATE products SET active = 0 WHERE id = ?', [$id]); activity('Produto eliminado', "Produto #$id retirado do catálogo; histórico preservado."); });
                respond(['ok' => true]);
            }
        }
        if ($route === '/admin/categories' && $method === 'POST') {
            $data = body(); $name = field($data, 'name', 2, 80); $description = field($data, 'description', 0, 255);
            $id = transaction(function () use ($name, $description) { query('INSERT INTO categories (name,description) VALUES (?,?)', [$name, $description]); $id = (int)db()->lastInsertId(); activity('Categoria criada', $name); return $id; });
            respond(['id' => $id], 201);
        }
        if (preg_match('~^/admin/categories/(\d+)$~', $route, $matches)) {
            $id = (int)$matches[1];
            if (!query('SELECT id FROM categories WHERE id = ?', [$id])->fetchColumn()) { fail('Categoria não encontrada.', 404); }
            if ($method === 'PUT') {
                $data = body(); $name = field($data, 'name', 2, 80); $description = field($data, 'description', 0, 255);
                transaction(function () use ($name, $description, $id) { query('UPDATE categories SET name=?,description=? WHERE id=?', [$name,$description,$id]); activity('Categoria alterada', $name); });
                respond(['ok' => true]);
            }
            if ($method === 'DELETE') {
                if (query('SELECT id FROM products WHERE category_id = ? LIMIT 1', [$id])->fetchColumn()) { fail('Esta categoria tem produtos associados, incluindo produtos arquivados. Altera a categoria dos produtos antes de eliminar.', 409); }
                transaction(function () use ($id) { query('DELETE FROM categories WHERE id = ?', [$id]); activity('Categoria eliminada', "Categoria #$id"); });
                respond(['ok' => true]);
            }
        }
        if ($route === '/admin/upload' && $method === 'POST') { respond(['path'=>uploadImage((int)$actor['id'],'product')],201); }
        if ($route === '/admin/orders' && $method === 'GET') { respond(array_map('orderWithItems', query('SELECT o.*, u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 300')->fetchAll())); }
        if (preg_match('~^/admin/orders/(\d+)$~', $route, $matches) && $method === 'PATCH') {
            $id = (int)$matches[1]; $status = field(body(), 'status', 1, 20);
            transaction(function () use ($id, $status) {
                $order = query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [$id])->fetch();
                if (!$order) { fail('Encomenda não encontrada.', 404); }
                $transitions = ['pending' => ['processing','cancelled'], 'processing' => ['shipped','cancelled'], 'shipped' => ['delivered'], 'delivered' => [], 'cancelled' => []];
                if (!in_array($status, $transitions[$order['status']], true)) { fail('Esta alteração de estado não é permitida.', 422); }
                if ($status !== 'cancelled' && $order['payment_status'] !== 'paid') { fail('Confirma o pagamento de teste antes de preparar a encomenda.',422); }
                if ($status === 'cancelled') {
                    restoreOrder($order);
                }
                query('UPDATE orders SET status = ? WHERE id = ?', [$status, $id]);
                orderEvent($id,$status);
                $labels = ['processing' => 'em preparação', 'shipped' => 'enviada', 'delivered' => 'entregue', 'cancelled' => 'cancelada'];
                notifyUser((int)$order['user_id'], 'Novidades da tua encomenda', "A encomenda #$id está {$labels[$status]}.");
                activity('Estado de encomenda alterado', "Encomenda #$id: {$order['status']} → $status");
            });
            respond(['ok' => true]);
        }
        if ($route === '/admin/dashboard' && $method === 'GET') {
            $stats = query("SELECT COUNT(*) AS order_count, COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_cents ELSE 0 END),0) AS revenue_cents, SUM(status='pending') AS pending_orders FROM orders")->fetch();
            $stats['paid_cents'] = (int)query("SELECT COALESCE(SUM(total_cents),0) FROM orders WHERE payment_status='paid' AND status<>'cancelled'")->fetchColumn();
            $stats['product_count'] = (int)query('SELECT COUNT(*) FROM products WHERE active=1')->fetchColumn();
            $stats['customer_count'] = (int)query("SELECT COUNT(*) FROM users WHERE role='customer'")->fetchColumn();
            $stats['low_stock'] = query('SELECT id,name,stock FROM products WHERE active=1 AND stock<=5 ORDER BY stock LIMIT 10')->fetchAll();
            $stats['daily'] = query("SELECT DATE(created_at) AS day, SUM(total_cents) AS total FROM orders WHERE status <> 'cancelled' AND created_at >= UTC_DATE() - INTERVAL 6 DAY GROUP BY DATE(created_at) ORDER BY day")->fetchAll();
            $stats['by_category'] = query('SELECT c.name,COUNT(p.id) AS total FROM categories c LEFT JOIN products p ON p.category_id=c.id AND p.active=1 GROUP BY c.id,c.name ORDER BY c.id')->fetchAll();
            $stats['recent_orders'] = query('SELECT id,shipping_name,total_cents,status,created_at FROM orders ORDER BY id DESC LIMIT 5')->fetchAll();
            respond($stats);
        }
        if ($route === '/admin/activity' && $method === 'GET') { respond(query('SELECT a.*,u.name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200')->fetchAll()); }
        if ($route === '/admin/export' && $method === 'GET') {
            $type = $_GET['type'] ?? 'orders';
            $exports = [
                'stock' => ['SELECT s.id AS ID,p.name AS Produto,v.label AS Variante,s.delta AS Quantidade,s.balance AS Saldo,s.reason AS Motivo,u.name AS Responsavel,s.created_at AS Data_UTC FROM stock_movements s JOIN products p ON p.id=s.product_id LEFT JOIN product_variants v ON v.id=s.variant_id LEFT JOIN users u ON u.id=s.user_id ORDER BY s.id DESC', ['ID','Produto','Variante','Quantidade','Saldo','Motivo','Responsavel','Data_UTC']],
                'orders' => ['SELECT id AS Encomenda,shipping_name AS Cliente,status AS Estado,ROUND(total_cents/100,2) AS Total_EUR,created_at AS Data_UTC FROM orders ORDER BY id DESC', ['Encomenda','Cliente','Estado','Total_EUR','Data_UTC']],
                'products' => ['SELECT p.id AS ID,p.name AS Produto,c.name AS Categoria,ROUND(p.price_cents/100,2) AS Preco_EUR,p.stock AS Stock FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.id', ['ID','Produto','Categoria','Preco_EUR','Stock']],
                'activity' => ['SELECT id AS ID,action AS Operacao,details AS Detalhes,created_at AS Data_UTC FROM activity_logs ORDER BY id DESC', ['ID','Operacao','Detalhes','Data_UTC']],
            ];
            if (!isset($exports[$type])) { fail('Relatório inválido.', 422); }
            // Proteção CSRF também na exportação, que escreve no registo de atividade.
            if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) { fail('Sessão de segurança inválida.', 419); }
            $rows = query($exports[$type][0])->fetchAll(); activity('Relatório exportado', "Exportação CSV: $type");
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="forma-' . $type . '-' . gmdate('Y-m-d') . '.csv"');
            $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $exports[$type][1], ';');
            foreach ($rows as $row) { fputcsv($out, array_map(static function ($v) { $v = (string)$v; return preg_match('/^[\s]*[=+@-]|^[\t\r\n]/u', $v) ? "'" . $v : $v; }, array_values($row)), ';'); }
            fclose($out); exit;
        }
    }
    fail('Recurso não encontrado.', 404);
} catch (ApiError $e) { respond(['error' => $e->getMessage()], $e->status); }
catch (PDOException $e) {
    error_log((string)$e);
    if ($e->getCode() === '23000') { respond(['error' => 'Já existe um registo com estes dados ou há registos associados.'], 409); }
    respond(['error' => 'Não foi possível aceder à base de dados. Verifica se o MySQL está iniciado e executa a instalação.'], 503);
} catch (Throwable $e) {
    error_log((string)$e);
    respond(['error' => 'Ocorreu um erro inesperado. Tenta novamente.'], 500);
}
