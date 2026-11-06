import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, unlinkSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';

const php = process.env.PHP_BIN || (process.platform === 'win32' ? 'C:\\xampp\\php\\php.exe' : 'php');
const env = { ...process.env, PHP_BIN: php, FORMA_TEST_MODE: '1', DB_NAME: `forma_test_${Date.now()}`, APP_URL: 'http://127.0.0.1:8091', TEST_BASE_URL: 'http://127.0.0.1:8091', TEST_SECOND_URL: 'http://127.0.0.1:8092', ADMIN_PASSWORD: 'FormaTest!123456', TEST_ADMIN_PASSWORD: 'FormaTest!123456' };
const processes = []; let installed = false;
const newsOnly = process.argv.includes('--news-only');
const experienceOnly = process.argv.includes('--experience-only');
const improvementsOnly = process.argv.includes('--improvements-only');
function run(binary, args) { const result = spawnSync(binary, args, { env, stdio: 'inherit', windowsHide: true }); if (result.error) throw result.error; if (result.status !== 0) throw new Error(`${path.basename(binary)} terminou com código ${result.status}`); }
async function startServer(port) {
  // Não reutilizar um serviço existente: os testes só podem atingir a base temporária.
  try { const result = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(700) }); if (result) throw new Error(`A porta ${port} está ocupada.`); }
  catch (e) { if (e.message.includes('ocupada')) throw e; }
  // spawnSync bloqueia o event loop: escrever diretamente em ficheiro evita encher o pipe de logs do PHP.
  const logPath = `storage/test-server-${port}.log`; const log = openSync(logPath, 'w');
  const proc = spawn(php, ['-d', 'upload_max_filesize=5M', '-d', 'post_max_size=6M', '-S', `127.0.0.1:${port}`, '-t', 'public', 'server/router.php'], { env, windowsHide: true, stdio: ['ignore', 'ignore', log] });
  closeSync(log); processes.push(proc);
  for (let i = 0; i < 30; i++) {
    if (proc.exitCode !== null) throw new Error(readFileSync(logPath, 'utf8'));
    try { const response = await fetch(`http://127.0.0.1:${port}/api/index.php?route=/session`, { signal: AbortSignal.timeout(1000) }); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('O PHP de teste não iniciou: ' + readFileSync(logPath, 'utf8'));
}
try {
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  run(php, ['server/install.php']); installed = true;
  if (!process.argv.includes('--browser-only') && !newsOnly && !experienceOnly && !improvementsOnly) run(php, ['tests/catalog-refresh.php']);
  if (!process.argv.includes('--browser-only') && !newsOnly && !experienceOnly && !improvementsOnly) run(php, ['tests/google-auth.php']);
  await startServer(8091); await startServer(8092);
  if (!process.argv.includes('--browser-only')) run(process.execPath, ['--test', '--test-concurrency=1', ...(improvementsOnly ? ['tests/improvements.test.mjs'] : experienceOnly ? ['tests/experience.test.mjs'] : newsOnly ? ['tests/news.test.mjs'] : ['tests/api.test.mjs', 'tests/commerce.test.mjs', 'tests/news.test.mjs','tests/experience.test.mjs','tests/improvements.test.mjs','tests/studio.test.mjs','tests/google-auth.test.mjs'])]);
  run(php, ['tests/fixture.php', 'reset-limits']);
  run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...(improvementsOnly ? ['tests/browser/improvements.spec.js'] : experienceOnly ? ['tests/browser/experience.spec.js'] : newsOnly ? ['tests/browser/news.spec.js'] : [])]);
  console.log(newsOnly ? '\nVerificação do módulo de notícias concluída.' : process.argv.includes('--browser-only') ? '\nVerificação de navegador concluída.' : '\nVerificação concluída: API, segurança e navegador.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  for (const proc of processes) { proc.kill(); }
  if (installed) { try { run(php, ['tests/fixture.php', 'cleanup']); } catch (error) { console.error(error.message); process.exitCode = 1; } }
  const mailDir = 'storage/mail';
  if (existsSync(mailDir)) for (const filename of readdirSync(mailDir)) {
    const file = path.join(mailDir, filename);
    if (filename.startsWith(env.DB_NAME+'-') || /^Para: forma-test-[^\r\n]*@example\.test\r?$/m.test(readFileSync(file, 'utf8'))) unlinkSync(file);
  }
}
