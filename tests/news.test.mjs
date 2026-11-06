import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';

if (process.env.FORMA_TEST_MODE !== '1' || !process.env.DB_NAME?.startsWith('forma_test_')) throw new Error('Usa npm test.');
class Client {
  cookie = ''; csrf = '';
  async call(route, method = 'GET', data, params = {}, csrf = true) {
    const url = new URL('api/index.php', process.env.TEST_BASE_URL); url.searchParams.set('route', route);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const headers = { Cookie: this.cookie }; if (csrf) headers['X-CSRF-Token'] = this.csrf;
    if (data && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { method, headers, body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined });
    for (const cookie of response.headers.getSetCookie()) if (cookie.startsWith('forma_session=')) this.cookie = cookie.split(';')[0];
    const body = await response.json(); if (body.csrf) this.csrf = body.csrf;
    return { status: response.status, body };
  }
}
const admin = new Client(), guest = new Client(), customer = new Client();
const ids = []; let categoryId; let image = '';
const article = extra => ({ title: 'Notícia de integração', content: 'Conteúdo completo da notícia de demonstração.', publication_date: '2040-02-29', category_id: categoryId, image: '', ...extra });
before(async () => {
  await admin.call('/session'); await guest.call('/session'); await customer.call('/session');
  assert.equal((await admin.call('/auth/login', 'POST', { email: 'admin@forma.pt', password: process.env.TEST_ADMIN_PASSWORD })).status, 200);
  await customer.call('/auth/register', 'POST', { name: 'Leitor Notícias', email: `forma-test-news-${Date.now()}@example.test`, password: 'NoticiasTeste!123' });
  const category = await admin.call('/admin/news/categories', 'POST', { name: 'Notícias de integração' });
  assert.equal(category.status, 201); categoryId = category.body.id;
});
after(async () => {
  for (const id of ids) await admin.call(`/admin/news/${id}`, 'DELETE', { confirm: true });
  if (categoryId) await admin.call(`/admin/news/categories/${categoryId}`, 'DELETE', { confirm: true });
  if (image) unlinkSync(`public/${image}`);
});

test('notícias: leitura pública, escrita autenticada, papel e CSRF', async () => {
  assert.equal((await guest.call('/news')).status, 200);
  assert.equal((await guest.call('/admin/news')).status, 401);
  assert.equal((await guest.call('/admin/news', 'POST', article())).status, 401);
  assert.equal((await customer.call('/admin/news', 'POST', article())).status, 403);
  assert.equal((await customer.call('/admin/news/categories', 'POST', { name: 'Proibida' })).status, 403);
  assert.equal((await admin.call('/admin/news', 'POST', article(), {}, false)).status, 419);
  assert.equal((await guest.call('/news/99999999')).status, 404);
});

test('notícias: validação de campos, datas, categorias, imagens e filtros', async () => {
  for (const fields of [{ title: ' ' }, { content: 'curto' }, { publication_date: '2026-02-30' }, { publication_date: '01/02/2026' }, { category_id: 99999999 }, { image: 'uploads/../../server/config.php' }, { image: 'https://example.com/image.jpg' }]) {
    assert.equal((await admin.call('/admin/news', 'POST', article(fields))).status, 422);
  }
  assert.equal((await guest.call('/news', 'GET', undefined, { category: "1 OR 1=1" })).status, 422);
  assert.equal((await guest.call('/news', 'GET', undefined, { page: 0 })).status, 422);
  const invalid = new FormData(); invalid.append('file', new Blob(['<?php echo 1;'], { type: 'image/png' }), 'fake.png');
  assert.equal((await admin.call('/admin/news/upload', 'POST', invalid)).status, 422);
  const valid = new FormData(); valid.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'news.png');
  assert.equal((await customer.call('/admin/news/upload', 'POST', valid)).status, 403);
  const uploaded = await admin.call('/admin/news/upload', 'POST', valid); assert.equal(uploaded.status, 201); image = uploaded.body.path;
});

test('notícias: ordem por data, desempate por ID, paginação e categoria', async () => {
  for (let i = 0; i < 14; i++) {
    const created = await admin.call('/admin/news', 'POST', article({ title: `Notícia ${i}`, publication_date: i === 0 ? '2041-01-01' : '2040-02-29', image: i === 0 ? image : '' }));
    assert.equal(created.status, 201); ids.push(created.body.id);
  }
  const first = (await guest.call('/news', 'GET', undefined, { category: categoryId })).body;
  const second = (await guest.call('/news', 'GET', undefined, { category: categoryId, page: 2 })).body;
  assert.equal(first.total, 14); assert.equal(first.items.length, 12); assert.equal(second.items.length, 2);
  assert.deepEqual([...first.items, ...second.items].map(row => row.id), [ids[0], ...ids.slice(1).reverse()]);
  const detail = (await guest.call(`/news/${ids[0]}`)).body;
  assert.equal(detail.content, article().content); assert.equal(detail.image, image);
  assert.equal((await admin.call(`/admin/news/categories/${categoryId}`, 'DELETE', { confirm: true })).status, 409);
});

test('notícias: editar, retirar imagem, confirmar eliminação e registar atividade', async () => {
  const id = ids[0]; const content = '<script>window.injetado = true</script>\n\nTexto preservado como conteúdo, sem HTML ativo.';
  assert.equal((await admin.call(`/admin/news/${id}`, 'PUT', article({ title: 'Título alterado', content, publication_date: '2039-01-02' }))).status, 200);
  const detail = (await guest.call(`/news/${id}`)).body;
  assert.equal(detail.title, 'Título alterado'); assert.equal(detail.content, content); assert.equal(detail.image, '');
  assert.equal((await admin.call(`/admin/news/${id}`, 'DELETE', { confirm: false })).status, 422);
  assert.equal((await guest.call(`/news/${id}`)).status, 200);
  assert.equal((await admin.call(`/admin/news/${id}`, 'DELETE', { confirm: true })).status, 200);
  assert.equal((await guest.call(`/news/${id}`)).status, 404);
  assert.equal((await admin.call(`/admin/news/${id}`, 'PUT', article())).status, 404);
  ids.shift();
  const logs = (await admin.call('/admin/activity')).body;
  for (const action of ['Notícia criada', 'Notícia alterada', 'Notícia eliminada']) assert(logs.some(row => row.action === action));
  assert.equal((await admin.call(`/admin/news/categories/${categoryId}`, 'PUT', { name: 'Notícias renomeadas' })).status, 200);
  assert.equal((await guest.call(`/news/${ids[0]}`)).body.category_name, 'Notícias renomeadas');
});

test('notícias: reinstalar conserva conteúdo editado e não duplica exemplos', async () => {
  const before = (await admin.call('/admin/news')).body;
  const result = spawnSync(process.env.PHP_BIN, ['server/install.php'], { env: process.env, windowsHide: true });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual((await admin.call('/admin/news')).body, before);
});
