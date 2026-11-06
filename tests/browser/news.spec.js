import { test, expect } from '@playwright/test';
import { unlinkSync } from 'node:fs';

test('notícias públicas: ordem, categoria, página completa, ligação direta e responsividade', async ({ page }) => {
  await page.goto('/#news');
  await expect(page.locator('.news-card')).toHaveCount(3);
  const dates = await page.locator('.news-card time').evaluateAll(nodes => nodes.map(n => n.dateTime));
  expect(dates).toEqual([...dates].sort().reverse());
  await page.getByRole('button', { name: 'Guias', exact: true }).click();
  await expect(page.locator('.news-card')).toHaveCount(1);
  await page.getByRole('link', { name: /^Ler notícia:/ }).click();
  await expect(page.locator('.news-reading')).toContainText('Antes de acrescentar uma peça');
  await page.reload(); await expect(page.locator('.news-article h1')).toContainText('Escolher peças');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('link', { name: 'Todas as notícias', exact: true }).click();
  await expect(page.locator('.news-card')).toHaveCount(3);
  await page.goto('/#news/99999999');
  await expect(page.getByRole('alert')).toContainText('não foi encontrada');
});

test('administração de notícias: categoria, imagem, CRUD, confirmação e texto sem execução', async ({ page }) => {
  if (process.env.FORMA_TEST_MODE !== '1') throw new Error('Usa npm test.');
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const title = 'Notícia Browser'; const renamed = 'Notícia Browser atualizada'; let uploaded;
  await page.goto('/#admin');
  await page.getByRole('button', { name: 'Iniciar sessão', exact: true }).last().click();
  await page.getByLabel('Email', { exact: true }).fill('admin@forma.pt');
  await page.getByRole('textbox', { name: 'Palavra-passe', exact: true }).fill(process.env.TEST_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('button', { name: 'Notícias', exact: true }).click();
  await page.getByRole('button', { name: 'Categorias de notícias', exact: true }).click();
  await page.getByLabel('Nome da nova categoria').fill('Atelier Browser');
  await page.getByRole('button', { name: 'Criar categoria', exact: true }).click();
  await page.getByRole('button', { name: 'Nova notícia', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill(title);
  await page.getByLabel('Categoria da notícia').selectOption({ label: 'Atelier Browser' });
  await page.getByLabel('Data da notícia').fill('2040-01-02');
  await page.getByLabel('Conteúdo', { exact: true }).fill('Primeiro parágrafo da notícia.\n\n<script>window.newsInjected = true</script>');
  const uploadResponse = page.waitForResponse(response => response.url().includes(encodeURIComponent('/admin/news/upload')) && response.request().method() === 'POST');
  await page.getByLabel('Imagem da notícia', { exact: true }).setInputFiles({ name: 'news.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=', 'base64') });
  uploaded = (await (await uploadResponse).json()).path;
  try {
    await expect(page.getByAltText('Pré-visualização da imagem da notícia')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar notícia', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toContainText('Atelier Browser');
    await page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: 'Consultar notícia' }).click();
    await expect(page.locator('.news-article h1')).toHaveText(title);
    await expect(page.locator('.news-reading')).toContainText('<script>');
    expect(await page.evaluate(() => window.newsInjected)).toBeUndefined();
    await expect(page.locator('.news-cover')).toHaveAttribute('src', uploaded);
    await page.getByRole('link', { name: 'Administração', exact: true }).click();
    await page.getByRole('button', { name: 'Notícias', exact: true }).click();
    await page.getByRole('button', { name: `Editar notícia: ${title}`, exact: true }).click();
    await page.getByLabel('Título', { exact: true }).fill(renamed);
    await page.getByLabel('Conteúdo', { exact: true }).fill('Conteúdo atualizado da notícia completa.');
    await page.getByRole('button', { name: 'Remover imagem', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar notícia', exact: true }).click();
    await page.getByRole('row').filter({ hasText: renamed }).getByRole('link', { name: 'Consultar notícia' }).click();
    await expect(page.locator('.news-reading')).toContainText('Conteúdo atualizado');
    await expect(page.locator('.news-cover')).toHaveCount(0);
    const detailUrl = page.url();
    await page.getByRole('link', { name: 'Administração', exact: true }).click();
    await page.getByRole('button', { name: 'Notícias', exact: true }).click();
    await page.getByRole('button', { name: `Eliminar notícia: ${renamed}`, exact: true }).click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('button', { name: `Editar notícia: ${renamed}`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Eliminar notícia: ${renamed}`, exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar eliminação', exact: true }).click();
    await expect(page.getByRole('button', { name: `Editar notícia: ${renamed}`, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Categorias de notícias', exact: true }).click();
    await page.getByRole('button', { name: 'Eliminar categoria de notícias: Atelier Browser', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar eliminação', exact: true }).click();
    await page.goto(detailUrl); await expect(page.getByRole('alert')).toContainText('não foi encontrada');
    expect(errors).toEqual([]);
  } finally { if (uploaded) unlinkSync(`public/${uploaded}`); }
});
