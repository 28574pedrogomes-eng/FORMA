import { chromium } from '@playwright/test';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8081');
  await page.locator('.cinematic-scene[data-media="ready"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const capture = async (progress, path) => {
    await page.evaluate(p => {
      const root = document.querySelector('.cinematic-scene'); const screen = document.querySelector('.cinematic-stage');
      window.scrollTo({ top: scrollY + root.getBoundingClientRect().top - document.querySelector('.site-header').offsetHeight + p * (root.offsetHeight - screen.offsetHeight), behavior: 'instant' });
    }, progress);
    await page.waitForFunction(p => {
      const v = document.querySelector('.cinematic-video');
      return !v.seeking && Math.abs(v.currentTime - p * (v.duration - .05)) < .08;
    }, progress, { timeout: 10000 }).catch(async error => {
      console.log(await page.evaluate(() => {
        const v = document.querySelector('video'); const s = document.querySelector('.cinematic-scene'); const st = document.querySelector('.cinematic-stage');
        return { time: v.currentTime, duration: v.duration, seeking: v.seeking, ready: v.readyState, network: v.networkState, error: v.error?.message, progress: document.querySelector('.cinematic-timeline').textContent, scroll: scrollY, sectionTop: s.getBoundingClientRect().top, height: s.offsetHeight, stageHeight: st.offsetHeight, seekable: Array.from({ length: v.seekable.length }, (_, i) => [v.seekable.start(i), v.seekable.end(i)]), buffered: Array.from({ length: v.buffered.length }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]) };
      })); await page.screenshot({ path: 'storage/cinema-debug.png' }); throw error;
    });
    await page.screenshot({ path, animations: 'disabled' });
  };
  await page.screenshot({ path: 'storage/cinema-opening.png', animations: 'disabled' });
  await capture(.33, 'storage/cinema-chair.png');
  await capture(.55, 'storage/cinema-table.png');
  await capture(.96, 'storage/cinema-transition.png');
  await capture(1, 'storage/cinema-handoff.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.cinematic-scene[data-media="ready"]').waitFor();
  await capture(0, 'storage/cinema-mobile-opening.png');
  await capture(.55, 'storage/cinema-mobile-product.png');
  console.log(JSON.stringify({ errors, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), video: await page.locator('video').evaluate(v => ({ time: v.currentTime, duration: v.duration, width: v.videoWidth, paused: v.paused })) }));
} finally { await browser.close(); }
