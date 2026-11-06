import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
if (process.env.FORMA_TEST_MODE !== '1') throw new Error('Usa npm test.');
class Client {
  cookie = ''; csrf = '';
  async call(route, method = 'GET', data, csrf = true) {
    const url = new URL('api/index.php', process.env.TEST_BASE_URL); url.searchParams.set('route', route);
    const response = await fetch(url, { method, headers: { Cookie: this.cookie, 'X-CSRF-Token': csrf ? this.csrf : '', 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    for (const cookie of response.headers.getSetCookie()) if (cookie.startsWith('forma_session=')) this.cookie = cookie.split(';')[0];
    const body = await response.json(); if (body.csrf) this.csrf = body.csrf;
    return { status: response.status, body };
  }
}
const admin = new Client(), guest = new Client(), customer = new Client();
const clientId = '123456-browser-test.apps.googleusercontent.com';
const secret = 'test-only-oauth-secret';
before(async () => {
  for (const client of [admin, guest, customer]) await client.call('/session');
  assert.equal((await admin.call('/auth/login', 'POST', { email: 'admin@forma.pt', password: process.env.TEST_ADMIN_PASSWORD })).status, 200);
  await customer.call('/auth/register', 'POST', { name: 'Cliente Google API', email: `forma-test-google-api-${Date.now()}@example.test`, password: 'GoogleSeguro!123' });
});
after(async () => { await admin.call('/admin/auth/google', 'PUT', { enabled: false, client_id: '', client_secret: '', clear_secret: true }); });
test('Google: configuração privada exige administrador e CSRF; login desativado falha sem redirecionar', async () => {
  assert.equal((await guest.call('/admin/auth/google')).status, 401);
  assert.equal((await customer.call('/admin/auth/google')).status, 403);
  assert.equal((await guest.call('/auth/google/status')).body.enabled, false);
  assert.equal((await guest.call('/auth/google/start', 'POST', { intent: 'login' })).status, 503);
  assert.equal((await admin.call('/admin/auth/google', 'PUT', { client_id: clientId, client_secret: secret, enabled: true }, false)).status, 419);
  const result = await admin.call('/admin/auth/google', 'PUT', { client_id: clientId, client_secret: secret, enabled: true });
  assert.equal(result.status, 200); assert.equal(result.body.ready, true); assert.equal(result.body.secret_configured, true);
  assert(!JSON.stringify(result.body).includes(secret)); assert(!('client_secret' in result.body));
  assert.equal((await guest.call('/auth/google/status')).body.enabled, true);
  assert.deepEqual(Object.keys((await guest.call('/auth/google/status')).body).sort(), ['enabled', 'linked']);
});
test('Google: o início exige CSRF e gera autorização com state, nonce e PKCE', async () => {
  assert.equal((await guest.call('/auth/google/start', 'POST', { intent: 'login' }, false)).status, 419);
  assert.equal((await guest.call('/auth/google/start', 'POST', { intent: 'link' })).status, 401);
  const result = await guest.call('/auth/google/start', 'POST', { intent: 'login', return_to: 'https://example.test' });
  assert.equal(result.status, 200);
  const url = new URL(result.body.url);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('client_id'), clientId);
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state').length, 64); assert.equal(url.searchParams.get('nonce').length, 64);
  assert.equal(url.searchParams.get('redirect_uri'), new URL('auth/google/callback.php', process.env.TEST_BASE_URL).href);
  assert(!result.body.url.includes(secret)); assert(!result.body.url.includes('example.test'));
  const callback = new URL('auth/google/callback.php', process.env.TEST_BASE_URL);
  callback.searchParams.set('state', url.searchParams.get('state')); callback.searchParams.set('error', 'access_denied');
  const response = await fetch(callback, { headers: { Cookie: guest.cookie }, redirect: 'manual' });
  await response.arrayBuffer(); assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), new URL('#google-result', process.env.TEST_BASE_URL).href);
  const flash = await guest.call('/auth/google/result'); assert.equal(flash.body.ok, false); assert.match(flash.body.message, /cancelado/);
  assert.equal((await guest.call('/session')).body.user, null);
  assert.match((await guest.call('/auth/google/result')).body.message, /já terminou/);
});
test('Google: guardar segredo vazio preserva; apagar desativa; ficheiros nunca são públicos', async () => {
  const saved = await admin.call('/admin/auth/google', 'PUT', { client_id: clientId, client_secret: '', enabled: true });
  assert.equal(saved.body.ready, true);
  const changed = await admin.call('/admin/auth/google', 'PUT', { client_id: '987-new.apps.googleusercontent.com', client_secret: '', enabled: true });
  assert.equal(changed.status, 422);
  assert.equal((await admin.call('/admin/auth/google')).body.client_id, clientId);
  const removed = await admin.call('/admin/auth/google', 'PUT', { client_id: clientId, client_secret: '', enabled: false, clear_secret: true });
  assert.equal(removed.body.ready, false); assert.equal(removed.body.secret_configured, false);
  for (const path of ['storage/google-oauth.json', 'vendor/autoload.php', 'composer.lock']) {
    const response = await fetch(new URL(path, process.env.TEST_BASE_URL)); await response.arrayBuffer(); assert.equal(response.status, 404);
  }
});
