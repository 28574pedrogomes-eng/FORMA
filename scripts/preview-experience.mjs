import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8081/#bundles');await page.locator('.bundle-card').first().waitFor();await page.locator('.bundle-card>img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));await page.screenshot({path:'storage/bundles-desktop.png',fullPage:true});
  const sizes=[];for(const width of[390,768,1024]){await page.setViewportSize({width,height:900});sizes.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})));if(width===390)await page.screenshot({path:'storage/bundles-mobile.png',fullPage:true});}
  const password=readFileSync('storage/setup-credentials.txt','utf8').match(/Palavra-passe:\s*(.+)/)?.[1].trim();if(password){await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:8081/#admin');const session=await(await page.request.get('http://127.0.0.1:8081/api/index.php?route=/session')).json();const login=await page.request.post('http://127.0.0.1:8081/api/index.php?route=/auth/login',{headers:{'X-CSRF-Token':session.csrf},data:{email:'admin@forma.pt',password}});if(!login.ok())throw new Error('Preview admin login failed');await page.reload();await page.getByRole('button',{name:'Integrações',exact:true}).click();await page.locator('.integration-panel').waitFor();await page.screenshot({path:'storage/integrations-desktop.png',fullPage:true});}
  console.log(JSON.stringify({errors,sizes}));
}finally{await browser.close();}
