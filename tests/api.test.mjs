import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (process.env.FORMA_TEST_MODE !== '1' || !process.env.DB_NAME?.startsWith('forma_test_')) throw new Error('Usa npm test para criar uma base isolada.');
class Client {
  constructor(base = process.env.TEST_BASE_URL) { this.base = base; this.cookie = ''; this.csrf = ''; }
  async request(route, method = 'GET', data, options = {}) {
    const url = new URL('api/index.php', this.base); url.searchParams.set('route', route);
    const headers = { Cookie: this.cookie };
    if (options.csrf !== false) headers['X-CSRF-Token'] = this.csrf;
    if (data && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { method, headers, body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined });
    for (const value of response.headers.getSetCookie()) if (value.startsWith('forma_session=')) this.cookie = value.split(';')[0];
    const text = await response.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    if (body?.csrf) this.csrf = body.csrf;
    return { status: response.status, body, headers: response.headers };
  }
  async ready() { assert.equal((await this.request('/session')).status, 200); return this; }
}
const admin = new Client(); const customer = new Client(); const other = new Client(process.env.TEST_SECOND_URL);
const stamp = Date.now(); const email = `forma-test-api-${stamp}@example.test`; const password = 'ClienteTeste!123';
const orderData = items => ({ checkout_key: randomUUID(), shipping_name: 'Cliente de teste', address: 'Rua de Exemplo, 10', city: 'Lisboa', postal_code: '1000-001', phone: '912345678', items });
let categoryId; let productId; let orderId; let uploadPath;
before(async () => {
  await admin.ready(); await customer.ready(); await other.ready();
  assert.equal((await admin.request('/auth/login', 'POST', { email: 'admin@forma.pt', password: process.env.TEST_ADMIN_PASSWORD })).status, 200);
  assert.equal((await customer.request('/auth/register', 'POST', { name: 'Cliente Teste', email, password, role: 'admin' })).body.user.role, 'customer');
  assert.equal((await other.request('/auth/register', 'POST', { name: 'Outro Cliente', email: `forma-test-other-${stamp}@example.test`, password })).status, 201);
});

test('API exige sessão, papel de administrador e CSRF válido', async () => {
  const guest = await new Client().ready();
  assert.equal((await guest.request('/admin/dashboard')).status, 401);
  assert.equal((await customer.request('/admin/dashboard')).status, 403);
  assert.equal((await admin.request('/admin/categories', 'POST', { name: 'Não criar', description: '' }, { csrf: false })).status, 419);
  assert.equal((await customer.request('/admin/products/1', 'DELETE')).status, 403);
  assert.equal((await guest.request('/orders')).status, 401);
});

test('autenticação preserva espaços intencionais da palavra-passe', async () => {
  const client = await new Client().ready();
  const account = { name: 'Teste de Espaços', email: `forma-test-spaces-${stamp}@example.test`, password: '  Palavra Segura!123  ' };
  assert.equal((await client.request('/auth/register', 'POST', account)).status, 201);
  await client.request('/auth/logout', 'POST', {});
  assert.equal((await client.request('/auth/login', 'POST', account)).status, 200);
});

test('consulta, pesquisa, filtros e SQL injection', async () => {
  const all = await customer.request('/products'); assert.equal(all.body.total, 60);
  assert.equal(all.body.items.length, 12); assert.equal(all.body.pages, 5);
  const url = new URL('api/index.php', customer.base); url.searchParams.set('route', '/products');
  const catalog = [...all.body.items];
  for (let page = 2; page <= all.body.pages; page++) {
    url.searchParams.set('page', String(page));
    const result = await (await fetch(url)).json(); assert.equal(result.items.length, 12);
    catalog.push(...result.items);
  }
  assert.equal(new Set(catalog.map(p => p.id)).size, 60);
  assert.equal(catalog.filter(p => p.category_name === 'Mesa e cozinha').length, 8);
  const additions = JSON.parse(readFileSync('database/catalog-2026.json', 'utf8'));
  for (const expected of additions) {
    const actual = catalog.find(p => p.name === expected.name);
    assert(actual); assert.equal(Number(actual.price_cents), expected.price_cents);
    assert.equal(actual.dimensions, expected.dimensions);
    const asset = await fetch(new URL(actual.image, customer.base));
    assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type'), /^image\//);
    assert((await asset.arrayBuffer()).byteLength > 1000);
  }
  assert(catalog.every(p => p.variant_count === 1 && p.default_variant_id && p.stock > 0));
  url.searchParams.delete('page');
  url.searchParams.set('search', "%' OR 1=1 --");
  const injection = await (await fetch(url)).json(); assert.equal(injection.total, 0);
  url.searchParams.set('search', 'Arco'); assert.equal((await (await fetch(url)).json()).items[0].name, 'Cadeira Arco');
  url.searchParams.delete('search'); url.searchParams.set('max_price', '3000');
  const affordable = await (await fetch(url)).json(); assert(affordable.items.every(p => p.price_cents <= 3000));
});

test('reinstalar preserva o catálogo e não duplica o inventário inicial', async () => {
  const products = (await admin.request('/admin/products')).body;
  const inventory = (await admin.request('/admin/stock')).body;
  const result = spawnSync(process.env.PHP_BIN, ['server/install.php'], { env: process.env, windowsHide: true });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual((await admin.request('/admin/products')).body, products);
  assert.deepEqual((await admin.request('/admin/stock')).body, inventory);
  assert.equal(inventory.filter(row => row.reason === 'Inventário inicial — nova coleção').length, 12);
  assert.equal(inventory.filter(row => row.reason === 'Inventário inicial — coleção 2026').length, 40);
});

test('CRUD de categorias e validação de unicidade', async () => {
  const created = await admin.request('/admin/categories', 'POST', { name: 'Categoria API', description: 'Teste isolado' });
  assert.equal(created.status, 201); categoryId = created.body.id;
  assert.equal((await admin.request('/admin/categories', 'POST', { name: 'Categoria API', description: '' })).status, 409);
  assert.equal((await admin.request(`/admin/categories/${categoryId}`, 'PUT', { name: 'Categoria API editada', description: 'Alterada' })).status, 200);
  assert((await admin.request('/categories')).body.some(c => c.id === categoryId && c.name.endsWith('editada')));
  const temporary = await admin.request('/admin/categories', 'POST', { name: 'Categoria a eliminar', description: '' });
  assert.equal((await admin.request(`/admin/categories/${temporary.body.id}`, 'DELETE')).status, 200);
});

test('upload valida conteúdo e rejeita scripts disfarçados', async () => {
  const invalid = new FormData(); invalid.append('file', new Blob(['<?php echo "unsafe"; ?>'], { type: 'image/png' }), 'image.png');
  assert.equal((await admin.request('/admin/upload', 'POST', invalid)).status, 422);
  const valid = new FormData(); valid.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'pixel.png');
  const uploaded = await admin.request('/admin/upload', 'POST', valid); assert.equal(uploaded.status, 201);
  uploadPath = uploaded.body.path; assert.match(uploadPath, /^uploads\/[a-f0-9]{32}\.png$/);
  assert.equal((await fetch(new URL(uploadPath, admin.base))).status, 200);
});

const product = extra => ({ category_id: categoryId, name: '=2+2', description: 'Produto para testes de integração.', price_cents: 1200, stock: 3, image: uploadPath || 'images/vase.jpg', badge: '', material: 'Teste', featured: false, ...extra });
test('CRUD de produtos, stock e validação no servidor', async () => {
  assert.equal((await admin.request('/admin/products', 'POST', product({ price_cents: -1 }))).status, 422);
  assert.equal((await admin.request('/admin/products', 'POST', product({ stock: -1 }))).status, 422);
  assert.equal((await admin.request('/admin/products', 'POST', product({ image: 'uploads/../../server/config.php' }))).status, 422);
  const result = await admin.request('/admin/products', 'POST', product()); assert.equal(result.status, 201); productId = result.body.id;
  assert.equal((await admin.request(`/admin/products/${productId}`, 'PUT', product({ stock: 4 }))).status, 200);
  assert.equal(Number((await customer.request(`/products/${productId}`)).body.stock), 4);
  assert.equal((await admin.request(`/admin/categories/${categoryId}`, 'DELETE')).status, 409);
});

test('checkout calcula preço, portes e total no servidor; impede duplicação', async () => {
  const data = { ...orderData([{ product_id: productId, quantity: 2, price_cents: 1 }]), total_cents: 1 };
  const result = await customer.request('/orders', 'POST', data); assert.equal(result.status, 201); orderId = result.body.id;
  assert.equal(Number(result.body.subtotal_cents), 2400); assert.equal(Number(result.body.shipping_cents), 490); assert.equal(Number(result.body.total_cents), 2890);
  assert.equal(Number((await customer.request(`/products/${productId}`)).body.stock), 2);
  const repeated = await customer.request('/orders', 'POST', data); assert.equal(repeated.body.id, orderId);
  assert.equal(Number((await customer.request(`/products/${productId}`)).body.stock), 2);
  assert(!(await other.request('/orders')).body.some(o => o.id === orderId));
});

test('stock insuficiente e dados inválidos não criam encomendas', async () => {
  const previous = (await customer.request('/orders')).body.length;
  assert.equal((await customer.request('/orders', 'POST', orderData([{ product_id: productId, quantity: 3 }]))).status, 409);
  assert.equal((await customer.request('/orders', 'POST', orderData([{ product_id: productId, quantity: 0 }]))).status, 422);
  assert.equal((await customer.request('/orders', 'POST', { ...orderData([{ product_id: productId, quantity: 1 }]), postal_code: '12345678' })).status, 422);
  assert.equal((await customer.request('/orders')).body.length, previous);
  assert.equal(Number((await customer.request(`/products/${productId}`)).body.stock), 2);
});

test('transação faz rollback de todos os artigos quando um falha', async () => {
  const before = Number((await customer.request('/products/1')).body.stock);
  const result = await customer.request('/orders', 'POST', orderData([{ product_id: 1, quantity: 1 }, { product_id: productId, quantity: 50 }]));
  assert.equal(result.status, 409); assert.equal(Number((await customer.request('/products/1')).body.stock), before);
});

test('notificações e cancelamento repõem o stock exatamente uma vez', async () => {
  assert((await customer.request('/notifications')).body.some(n => n.title === 'Encomenda recebida'));
  assert.equal((await admin.request(`/admin/orders/${orderId}`, 'PATCH', { status: 'delivered' })).status, 422);
  assert.equal((await admin.request(`/admin/orders/${orderId}`, 'PATCH', { status: 'cancelled' })).status, 200);
  assert.equal(Number((await customer.request(`/products/${productId}`)).body.stock), 4);
  assert.equal((await admin.request(`/admin/orders/${orderId}`, 'PATCH', { status: 'cancelled' })).status, 422);
  assert.equal(Number((await customer.request(`/products/${productId}`)).body.stock), 4);
  await customer.request('/notifications/read', 'POST', {});
  assert((await customer.request('/notifications')).body.every(n => Number(n.is_read) === 1));
  assert((await admin.request('/notifications')).body.some(n => Number(n.is_read) === 0));
});

test('pedidos concorrentes em dois servidores não vendem a última unidade duas vezes', async () => {
  await admin.request(`/admin/products/${productId}`, 'PUT', product({ stock: 1 }));
  const results = await Promise.all([customer.request('/orders', 'POST', orderData([{ product_id: productId, quantity: 1 }])), other.request('/orders', 'POST', orderData([{ product_id: productId, quantity: 1 }]))]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(Number((await customer.request(`/products/${productId}`)).body.stock), 0);
  const winner = results.find(r => r.status === 201); await admin.request(`/admin/orders/${winner.body.id}`, 'PATCH', { status: 'cancelled' });
});

test('portes grátis, transições e métricas derivadas das encomendas', async () => {
  const result = await customer.request('/orders', 'POST', orderData([{ product_id: 1, quantity: 1 }]));
  assert.equal(result.status, 201); assert.equal(Number(result.body.shipping_cents), 0);
  for (const status of ['processing', 'shipped', 'delivered']) assert.equal((await admin.request(`/admin/orders/${result.body.id}`, 'PATCH', { status })).status, 200);
  assert.equal((await admin.request(`/admin/orders/${result.body.id}`, 'PATCH', { status: 'cancelled' })).status, 422);
  const dashboard = (await admin.request('/admin/dashboard')).body;
  assert.equal(Number(dashboard.revenue_cents), 12900); assert.equal(dashboard.daily.length, 1);
  assert((await admin.request('/admin/activity')).body.some(log => log.action === 'Encomenda criada'));
});

test('exportação CSV é autenticada e neutraliza fórmulas', async () => {
  const url = new URL('api/index.php', admin.base); url.searchParams.set('route', '/admin/export'); url.searchParams.set('type', 'products');
  const response = await fetch(url, { headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf } });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(await response.text(), /'=2\+2/);
  assert.equal((await fetch(url, { headers: { Cookie: customer.cookie, 'X-CSRF-Token': customer.csrf } })).status, 403);
});

test('recuperação usa mensagem genérica, token único e invalida sessões', async () => {
  const first = await customer.request('/auth/forgot', 'POST', { email });
  const unknown = await other.request('/auth/forgot', 'POST', { email: 'inexistente@example.test' });
  assert.deepEqual(first.body, unknown.body); assert(!first.body.token);
  const messages = readdirSync('storage/mail').map(file => readFileSync(`storage/mail/${file}`, 'utf8'));
  const token = messages.find(m => m.includes(`Para: ${email}\n`) && m.includes('#reset?token=')).match(/token=([a-f0-9]{64})/)[1];
  const guest = await new Client().ready();
  assert.equal((await guest.request('/auth/reset', 'POST', { token, password: 'NovaPalavra!123456' })).status, 200);
  assert.equal((await customer.request('/session')).body.user, null);
  assert.equal((await guest.request('/auth/reset', 'POST', { token, password: 'OutroSegredo!123' })).status, 422);
  assert.equal((await guest.request('/auth/login', 'POST', { email, password })).status, 401);
  assert.equal((await guest.request('/auth/login', 'POST', { email, password: 'NovaPalavra!123456' })).status, 200);
});

test('tokens expirados são rejeitados e login tem limite de tentativas', async () => {
  const guest = await new Client().ready(); const otherEmail = `forma-test-other-${stamp}@example.test`;
  await guest.request('/auth/forgot', 'POST', { email: otherEmail });
  const message = readdirSync('storage/mail').map(file => readFileSync(`storage/mail/${file}`, 'utf8')).find(m => m.includes(`Para: ${otherEmail}\n`) && m.includes('#reset?token='));
  const token = message.match(/token=([a-f0-9]{64})/)[1];
  const expire = spawnSync(process.env.PHP_BIN, ['tests/fixture.php', 'expire', token], { env: process.env, windowsHide: true }); assert.equal(expire.status, 0);
  assert.equal((await guest.request('/auth/reset', 'POST', { token, password: 'SenhaDeTeste!123' })).status, 422);
  let last; for (let i = 0; i < 9; i++) last = await guest.request('/auth/login', 'POST', { email: 'limite@example.test', password: 'Errada!123456' });
  assert.equal(last.status, 429);
});

test('eliminação de produto preserva as linhas históricas', async () => {
  assert.equal((await admin.request(`/admin/products/${productId}`, 'DELETE')).status, 200);
  assert.equal((await admin.request(`/products/${productId}`)).status, 404);
  const order = (await admin.request('/admin/orders')).body.find(o => o.id === orderId);
  assert.equal(order.items[0].product_name, '=2+2');
  if (uploadPath) unlinkSync(`public/${uploadPath}`);
});

test('ficheiros privados não são servidos pelo document root', async () => {
  for (const path of ['/server/config.php', '/storage/setup-credentials.txt', '/database/schema.sql', '/uploads/.htaccess']) assert.equal((await fetch(new URL(path, admin.base))).status, 404);
});
