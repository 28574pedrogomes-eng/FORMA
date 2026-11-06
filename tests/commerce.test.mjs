import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
if (process.env.FORMA_TEST_MODE !== '1') throw new Error('Usa npm test.');
class Client {
  constructor(base = process.env.TEST_BASE_URL) { this.base = base; this.cookie = ''; this.csrf = ''; }
  async call(route, method = 'GET', data) {
    const url = new URL('api/index.php', this.base); url.searchParams.set('route', route);
    const headers = { Cookie: this.cookie, 'X-CSRF-Token': this.csrf };
    if (data && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { method, headers, body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined });
    for (const cookie of response.headers.getSetCookie()) if (cookie.startsWith('forma_session=')) this.cookie = cookie.split(';')[0];
    const bytes = Buffer.from(await response.arrayBuffer()); let body; try { body = JSON.parse(bytes.toString()); } catch { body = bytes; }
    if (body.csrf) this.csrf = body.csrf;
    return { status: response.status, body, headers: response.headers };
  }
}
const admin = new Client(); const buyer = new Client(); const other = new Client(process.env.TEST_SECOND_URL);
const stamp = Date.now(); const email = `forma-test-commerce-${stamp}@example.test`; const password = 'CommerceSeguro!123';
const delivery = { shipping_name: 'Cliente Comércio', address: 'Rua da Demonstração, 25', city: 'Porto', postal_code: '4000-001', phone: '912345678' };
const address = extra => ({ label: 'Casa', ...delivery, ...extra });
const product = extra => ({ category_id: 1, name: 'Produto Teste Comércio', description: 'Descrição de teste de todas as novas funcionalidades.', price_cents: 2000, stock: 20, image: 'images/chair.jpg', badge: '', material: 'Madeira', featured: false, ...extra });
const checkout = (items, extra) => ({ ...delivery, items, checkout_key: randomUUID(), ...extra });
let pid, baseVariant, variantId, receiptOrder, photoPath;
before(async () => {
  for (const client of [admin, buyer, other]) assert.equal((await client.call('/session')).status, 200);
  assert.equal((await admin.call('/auth/login', 'POST', { email: 'admin@forma.pt', password: process.env.TEST_ADMIN_PASSWORD })).status, 200);
  assert.equal((await buyer.call('/auth/register', 'POST', { name: 'Comprador Comércio', email, password })).status, 201);
  assert.equal((await other.call('/auth/register', 'POST', { name: 'Outro Comprador', email: `forma-test-commerce-other-${stamp}@example.test`, password })).status, 201);
  const result = await admin.call('/admin/products', 'POST', product()); assert.equal(result.status, 201); pid = result.body.id;
  baseVariant = (await buyer.call(`/products/${pid}`)).body.default_variant_id;
});
after(async () => { if (pid) await admin.call(`/admin/products/${pid}`, 'DELETE'); if (photoPath) unlinkSync(`public/${photoPath}`); });

test('variantes têm imagem, preço, stock próprios e ligação obrigatória ao produto', async () => {
  const result = await admin.call(`/admin/products/${pid}/variants`, 'POST', { label: 'Cinza / L', sku: `TEST-${stamp}`, color: 'Cinza', size: 'L', material: 'Linho', image: 'images/chair.jpg', price_cents: 2500, stock: 2 });
  assert.equal(result.status, 201); variantId = result.body.id;
  const p = (await buyer.call(`/products/${pid}`)).body; assert.equal(p.variants.length, 2); assert.equal(Number(p.stock), 22); assert.equal(Number(p.price_cents), 2000);
  assert.equal((await buyer.call('/checkout/quote', 'POST', { items: [{ product_id: pid, variant_id: variantId, quantity: 1 }] })).body.subtotal_cents, 2500);
  assert.equal((await buyer.call('/checkout/quote', 'POST', { items: [{ product_id: 1, variant_id: variantId, quantity: 1 }] })).status, 409);
  assert.equal((await buyer.call(`/admin/variants/${variantId}`, 'DELETE')).status, 403);
});

test('moradas: CRUD, principal e isolamento entre utilizadores', async () => {
  const first = await buyer.call('/addresses', 'POST', address()); assert.equal(first.status, 201);
  const second = await buyer.call('/addresses', 'POST', address({ label: 'Trabalho', is_default: true })); assert.equal(second.status, 201);
  let rows = (await buyer.call('/addresses')).body; assert.equal(rows.filter(a => Number(a.is_default)).length, 1); assert.equal(rows[0].id, second.body.id);
  assert.equal((await other.call(`/addresses/${first.body.id}`, 'PUT', address())).status, 404);
  assert.equal((await other.call(`/addresses/${first.body.id}`, 'DELETE')).status, 404);
  assert.equal((await other.call('/addresses')).body.length, 0);
  assert.equal((await buyer.call(`/addresses/${first.body.id}`, 'PUT', address({ city: 'Lisboa', is_default: true }))).status, 200);
  assert.equal((await buyer.call(`/addresses/${first.body.id}`, 'DELETE')).status, 200);
  rows = (await buyer.call('/addresses')).body; assert.equal(rows.length, 1); assert.equal(Number(rows[0].is_default), 1);
});

test('favoritos são sincronizados entre sessões e não expostos a outra conta', async () => {
  assert.equal((await buyer.call('/favorites/merge', 'POST', { ids: [pid, 1, 1] })).status, 200);
  const second = new Client(); await second.call('/session'); await second.call('/auth/login', 'POST', { email, password });
  assert.deepEqual((await second.call('/favorites')).body.sort((a, b) => a - b), [1, pid]);
  assert.deepEqual((await other.call('/favorites')).body, []);
  await second.call(`/favorites/${pid}`, 'DELETE'); assert(!(await buyer.call('/favorites')).body.includes(pid));
});

const coupon = (code, extra = {}) => ({ code, type: 'percent', value: 10, minimum_cents: 1000, max_uses: 100, starts_at: '2020-01-01', expires_at: '2035-12-31', active: true, ...extra });
test('cupões aplicam percentagem, valor fixo, mínimo, validade e portes após desconto', async () => {
  assert.equal((await admin.call('/admin/coupons', 'POST', coupon('TESTE10'))).status, 201);
  assert.equal((await admin.call('/admin/coupons', 'POST', coupon('TESTE5EUR', { type: 'fixed', value: 500 }))).status, 201);
  await admin.call('/admin/coupons', 'POST', coupon('EXPIRADO', { expires_at: '2020-01-02' }));
  await admin.call('/admin/coupons', 'POST', coupon('MINIMO', { minimum_cents: 100000 }));
  const items = [{ product_id: pid, variant_id: baseVariant, quantity: 4 }];
  let result = await buyer.call('/checkout/quote', 'POST', { items, coupon_code: 'teste10' });
  assert.equal(result.status, 200); assert.equal(result.body.discount_cents, 800); assert.equal(result.body.shipping_cents, 490); assert.equal(result.body.total_cents, 7690);
  result = await buyer.call('/checkout/quote', 'POST', { items, coupon_code: 'TESTE5EUR', shipping_method: 'express' });
  assert.equal(result.body.discount_cents, 500); assert.equal(result.body.shipping_cents, 990); assert.equal(result.body.total_cents, 8490);
  for (const code of ['EXPIRADO', 'MINIMO', 'INEXISTENTE']) assert.equal((await buyer.call('/checkout/quote', 'POST', { items, coupon_code: code })).status, 422);
});

test('última utilização de cupão é atómica e cancelamento liberta a utilização', async () => {
  await admin.call('/admin/coupons', 'POST', coupon('ULTIMO', { max_uses: 1 }));
  const payload = () => checkout([{ product_id: pid, variant_id: baseVariant, quantity: 1 }], { coupon_code: 'ULTIMO' });
  const results = await Promise.all([buyer.call('/orders', 'POST', payload()), other.call('/orders', 'POST', payload())]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 422]);
  const order = results.find(r => r.status === 201).body;
  assert.equal((await admin.call(`/admin/orders/${order.id}`, 'PATCH', { status: 'cancelled' })).status, 200);
  const coupons = (await admin.call('/admin/coupons')).body; assert.equal(Number(coupons.find(c => c.code === 'ULTIMO').used_count), 0);
});

test('pagamentos recusados e pendentes ficam separados da preparação e podem ser repetidos', async () => {
  const result = await buyer.call('/orders', 'POST', checkout([{ product_id: pid, variant_id: baseVariant, quantity: 1 }], { payment_outcome: 'refused', coupon_code: 'TESTE10', save_address: true, address_label: 'Encomenda' }));
  assert.equal(result.status, 201); receiptOrder = result.body.id; assert.equal(result.body.status, 'pending'); assert.equal(result.body.payment_status, 'failed');
  assert((await buyer.call('/addresses')).body.some(a => a.label === 'Encomenda'));
  assert.equal((await admin.call(`/admin/orders/${receiptOrder}`, 'PATCH', { status: 'processing' })).status, 422);
  assert.equal((await other.call(`/orders/${receiptOrder}/payment`, 'POST', { outcome: 'approved', request_key: randomUUID() })).status, 404);
  assert.equal((await buyer.call(`/orders/${receiptOrder}/payment`, 'POST', { outcome: 'pending', request_key: randomUUID() })).body.payment_status, 'pending');
  const key = randomUUID(); const approved = await buyer.call(`/orders/${receiptOrder}/payment`, 'POST', { outcome: 'approved', request_key: key });
  assert.equal(approved.body.payment_status, 'paid'); assert.equal(approved.body.payments.length, 3);
  const again = await buyer.call(`/orders/${receiptOrder}/payment`, 'POST', { outcome: 'approved', request_key: key }); assert.equal(again.body.payments.length, 3);
});

test('comprovativo PDF tem totais, desconto e estrutura válida; é privado', async () => {
  const result = await buyer.call(`/orders/${receiptOrder}/receipt`); assert.equal(result.status, 200); assert.match(result.headers.get('content-type'), /application\/pdf/);
  const text = result.body.toString('latin1'); assert(text.startsWith('%PDF-1.4')); assert(text.includes('TESTE10')); assert(text.includes('22,90 EUR'));
  const offset = Number(text.match(/startxref\n(\d+)/)[1]); assert.equal(result.body.subarray(offset, offset + 4).toString(), 'xref');
  assert.equal((await other.call(`/orders/${receiptOrder}/receipt`)).status, 404);
  assert.equal((await admin.call(`/orders/${receiptOrder}/receipt`)).status, 200);
});

test('avaliações exigem compra paga e entregue e validam dono das fotografias', async () => {
  assert.equal((await buyer.call(`/products/${pid}/reviews`, 'POST', { rating: 5, comment: 'Ainda não foi entregue.' })).status, 403);
  for (const status of ['processing', 'shipped', 'delivered']) assert.equal((await admin.call(`/admin/orders/${receiptOrder}`, 'PATCH', { status })).status, 200);
  assert.equal((await other.call(`/products/${pid}/reviews`, 'POST', { rating: 5, comment: 'Não comprei este artigo.' })).status, 403);
  const file = new FormData(); file.append('product_id', pid); file.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'photo.png');
  const upload = await buyer.call('/reviews/upload', 'POST', file); assert.equal(upload.status, 201); photoPath = upload.body.path;
  assert.equal((await buyer.call(`/products/${pid}/reviews`, 'POST', { rating: 5, comment: 'Boa qualidade, corresponde à descrição.', photos: [photoPath] })).status, 201);
  let reviews = (await buyer.call(`/products/${pid}/reviews`)).body; assert.equal(reviews.items.length, 1); assert.deepEqual(reviews.items[0].photos, [photoPath]);
  assert.equal((await buyer.call(`/products/${pid}`)).body.rating, 5);
  await admin.call(`/admin/reviews/${reviews.mine.id}`, 'PATCH', { visible: false });
  reviews = (await buyer.call(`/products/${pid}/reviews`)).body; assert.equal(reviews.items.length, 0); assert.deepEqual(reviews.mine.photos, [photoPath]);
  assert.equal((await other.call(`/reviews/${reviews.mine.id}`, 'DELETE')).status, 404);
  assert.equal((await buyer.call(`/reviews/${reviews.mine.id}`, 'DELETE')).status, 200);
});

test('reposição avisa apenas subscritores e gera movimentos com saldo e responsável', async () => {
  const sale = await buyer.call('/orders', 'POST', checkout([{ product_id: pid, variant_id: variantId, quantity: 2 }])); assert.equal(sale.status, 201);
  assert.equal((await buyer.call('/restock', 'POST', { variant_id: variantId })).status, 200);
  assert.equal((await buyer.call('/restock', 'POST', { variant_id: variantId })).status, 200); assert.equal((await buyer.call('/restock')).body.length, 1);
  assert.equal((await admin.call('/admin/stock', 'POST', { variant_id: variantId, delta: -1, reason: 'Teste negativo' })).status, 409);
  assert.equal((await admin.call('/admin/stock', 'POST', { variant_id: variantId, delta: 3, reason: 'Reposição de fornecedor' })).status, 200);
  assert((await buyer.call('/notifications')).body.some(n => n.title === 'Voltou ao stock!'));
  assert(!(await other.call('/notifications')).body.some(n => n.title === 'Voltou ao stock!'));
  assert.equal((await buyer.call('/restock')).body.length, 0);
  const journal = (await admin.call('/admin/stock')).body.find(m => Number(m.variant_id) === variantId && m.reason === 'Reposição de fornecedor');
  assert.equal(Number(journal.delta), 3); assert.equal(Number(journal.balance), 3); assert(journal.user_name);
  assert.equal((await buyer.call(`/orders/${sale.body.id}/cancel`, 'POST', {})).status, 200);
  assert.equal((await buyer.call(`/orders/${sale.body.id}/cancel`, 'POST', {})).status, 409);
  const order = (await buyer.call('/orders')).body.find(o => o.id === sale.body.id); assert.equal(order.payment_status, 'refunded');
});

test('produtos relacionados são reais, excluem o atual e variantes podem ser arquivadas', async () => {
  const related = await buyer.call(`/products/${pid}/related`); assert.equal(related.status, 200); assert(related.body.length > 0 && related.body.length <= 4); assert(related.body.every(p => p.id !== pid && Number(p.active) === 1));
  assert.equal((await admin.call(`/admin/variants/${variantId}`, 'DELETE')).status, 200);
  assert(!(await buyer.call(`/products/${pid}`)).body.variants.some(v => v.id === variantId));
  assert.equal((await admin.call(`/admin/variants/${baseVariant}`, 'DELETE')).status, 422);
  assert.equal((await admin.call(`/admin/variants/${variantId}`, 'PATCH', {})).status, 200);
});
