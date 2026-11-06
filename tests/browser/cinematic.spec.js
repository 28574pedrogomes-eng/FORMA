import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function scrollFilm(page, progress) {
  await page.evaluate(p => {
    const root = document.querySelector('.cinematic-scene'); const stage = document.querySelector('.cinematic-stage');
    window.scrollTo({ top: scrollY + root.getBoundingClientRect().top - document.querySelector('.site-header').offsetHeight + p * (root.offsetHeight - stage.offsetHeight), behavior: 'instant' });
  }, progress);
  await expect(page.locator('.cinematic-timeline>span')).toHaveText(`${String(Math.round(progress * 100)).padStart(2, '0')}%`);
}
async function expectFrame(page, progress) {
  await expect.poll(() => page.locator('.cinematic-video').evaluate((v, p) => !v.seeking && Math.abs(v.currentTime - (v.duration - .05) * p) < .09, progress)).toBe(true);
}

test('vídeo local suporta intervalos HTTP para saltos exatos', async ({ request }) => {
  const file = readFileSync('public/images/room-tour.mp4');
  const range = await request.get('/images/room-tour.mp4', { headers: { Range: 'bytes=32-95' } });
  expect(range.status()).toBe(206);
  expect(range.headers()['content-range']).toBe(`bytes 32-95/${file.length}`);
  expect(await range.body()).toEqual(file.subarray(32, 96));
  const suffix = await request.get('/images/room-tour.mp4', { headers: { Range: 'bytes=-32' } });
  expect(suffix.status()).toBe(206); expect(await suffix.body()).toEqual(file.subarray(-32));
  for (const value of [`bytes=${file.length}-`, 'bytes=-0', 'bytes=20-10', 'bytes=0-1,4-8']) {
    const response = await request.get('/images/room-tour.mp4', { headers: { Range: value } });
    expect(response.status()).toBe(416); expect((await response.body()).length).toBe(0);
  }
  const head = await request.head('/images/room-tour.mp4'); expect(head.status()).toBe(200);
  expect(head.headers()['content-length']).toBe(String(file.length));
  expect((await request.post('/images/room-tour.mp4')).status()).toBe(405);
});

test('filme acompanha scroll nos dois sentidos, pausa e abre produto real', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('.cinematic-scene')).toHaveAttribute('data-media', 'ready');
  await scrollFilm(page, .33); await expectFrame(page, .33);
  const card = page.getByRole('button', { name: 'Descobrir Cadeira Arco', exact: true });
  await expect(card).toBeVisible(); await card.click();
  await expect(page.getByRole('dialog')).toContainText('Cadeira Arco');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar vídeo', exact: true }).click();
  const time = await page.locator('video').evaluate(v => v.currentTime);
  await scrollFilm(page, .55); expect(await page.locator('video').evaluate(v => v.currentTime)).toBe(time);
  await page.getByRole('button', { name: 'Retomar vídeo com o scroll' }).click();
  await expectFrame(page, .55);
  await expect(page.getByRole('button', { name: 'Descobrir Mesa lateral Noma' })).toBeVisible();
  await scrollFilm(page, .12); await expectFrame(page, .12);
  expect(await page.locator('video').evaluate(v => v.paused && v.muted && v.playsInline)).toBe(true);
  await page.getByRole('button', { name: 'Saltar introdução' }).click();
  await expect(page.locator('.cinematic-scene')).toHaveAttribute('data-ended', 'true');
  await expect(page.locator('.product-card').first()).toBeInViewport();
  expect(errors).toEqual([]);
});

test('telemóvel usa vídeo leve e uma etiqueta de cada vez, sem sobreposição', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('.cinematic-scene')).toHaveAttribute('data-media', 'ready');
  await expect(page.locator('video')).toHaveAttribute('src', 'images/room-tour-mobile.mp4');
  await scrollFilm(page, .55); await expectFrame(page, .55);
  await expect(page.locator('.cinematic-tag.is-visible')).toHaveCount(1);
  const box = await page.locator('.cinematic-tag.is-visible').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Descobrir Mesa lateral Noma' }).click();
  await expect(page.getByRole('dialog')).toContainText('Mesa lateral Noma');
});

test('movimento reduzido apresenta fotografia, evita download e encurta a introdução', async ({ page }) => {
  const videos = []; page.on('request', request => { if (/room-tour.*\.mp4/.test(request.url())) videos.push(request.url()); });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.locator('.cinematic-scene')).toHaveAttribute('data-media', 'poster');
  await expect(page.locator('.cinematic-intro-copy')).toBeVisible();
  expect(await page.locator('.cinematic-scene').evaluate(el => el.offsetHeight <= innerHeight)).toBe(true);
  await page.getByRole('button', { name: 'Saltar introdução' }).click();
  await expect(page.locator('.product-card').first()).toBeInViewport();
  expect(videos).toHaveLength(0);
});

test('erro no vídeo mantém fotografia e acesso à loja', async ({ page }) => {
  await page.route('**/room-tour*.mp4', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.cinematic-scene')).toHaveAttribute('data-media', 'poster');
  await expect(page.locator('.cinematic-poster')).toBeVisible();
  await page.locator('.cinematic-enter').click();
  await expect(page.locator('.product-card').first()).toBeInViewport();
});
