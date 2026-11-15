import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const childScript=path.join(root,'scripts','publish-online-from-stdin.ps1');
const html=`<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publicar FORMA</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f0e9;color:#30372c;font:16px system-ui}main{width:min(520px,calc(100% - 32px));padding:34px;background:#fff;border:1px solid #ddd9cd}h1{font:500 32px Georgia;margin:0 0 12px}p{line-height:1.65;color:#6b7065}label{display:block;margin:24px 0 8px;font-size:13px}input{width:100%;padding:13px;border:1px solid #cbc8bc;font:16px system-ui}button{margin-top:16px;padding:13px 18px;border:0;background:#394532;color:#fff;font:inherit;cursor:pointer}button:disabled{opacity:.6}#status{min-height:30px;margin-top:18px;font-size:13px}small{display:block;margin-top:20px;color:#74776f}</style><main><h1>Publicar a FORMA</h1><p>Introduz a palavra-passe FTP para atualizar o site InfinityFree. O envio preserva ficheiros remotos e não publica configurações locais nem dados de armazenamento.</p><form id="form"><label for="password">Palavra-passe FTP da conta if0_43368458</label><input id="password" type="password" autocomplete="off" required><button id="submit">Ligar e publicar</button></form><div id="status" role="status" aria-live="polite"></div><small>Ligação FTPS ao ftpupload.net · destino /htdocs</small></main><script>const form=document.querySelector('#form'),input=document.querySelector('#password'),button=document.querySelector('#submit'),status=document.querySelector('#status');form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;status.textContent='A preparar e enviar a versão…';let password=input.value;input.value='';try{const r=await fetch('/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});password='';const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'A publicação falhou.');status.textContent='Concluído: '+data.transferred+' ficheiro(s) transferidos e ficheiros principais confirmados no servidor.';}catch(e){status.textContent='Não foi possível publicar: '+e.message;button.disabled=false;}});</script></html>`;

const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'");
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
  if(req.method!=='POST'||req.url!=='/publish'){res.writeHead(404);res.end();return;}
  const host=req.headers.host||'';
  if(!['127.0.0.1:8765','localhost:8765'].includes(host)){res.writeHead(403);res.end();return;}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096){res.writeHead(413);res.end();return;}}
  let payload;try{payload=JSON.parse(raw)}catch{res.writeHead(400);res.end();return;}
  const password=typeof payload.password==='string'?payload.password:'';
  if(!password||password.length>512){res.writeHead(422,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Palavra-passe inválida.'}));return;}
  const ps=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',childScript],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  let stdout='';ps.stdout.setEncoding('utf8');ps.stdout.on('data',chunk=>stdout+=chunk);
  ps.on('error',()=>{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Não consegui iniciar o publicador local.'}));});
  ps.on('close',code=>{let result;try{result=JSON.parse(stdout.trim())}catch{result={ok:false,error:'O publicador terminou sem confirmar o resultado.'}}res.writeHead(code===0&&result.ok?200:502,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result));});
  ps.stdin.end(JSON.stringify({password}));
});
server.listen(8765,'127.0.0.1',()=>process.stdout.write('ready\n'));
