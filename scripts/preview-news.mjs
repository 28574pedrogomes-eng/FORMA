import { chromium } from '@playwright/test';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8081/#news');
  await page.locator('.news-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.news-card img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
  await page.screenshot({ path: 'storage/news-desktop.png', fullPage: true, animations: 'disabled' });
  const views = [];
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    views.push(await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth })));
    if (width === 390) await page.screenshot({ path: 'storage/news-mobile.png', fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.news-read-more').first().click();
  await page.locator('.news-reading').waitFor();
  await page.locator('.news-cover').evaluate(i => i.decode());
  await page.screenshot({ path: 'storage/news-article.png', fullPage: true, animations: 'disabled' });
  console.log(JSON.stringify({ errors, views, article: await page.locator('.news-article h1').innerText() }));
} finally { await browser.close(); }
