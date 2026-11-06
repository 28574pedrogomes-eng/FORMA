import { IntegrationMonitor } from './operations';
import { GoogleAdmin } from './google-auth';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Settings, Mail } from 'lucide-react';
import { api, money } from './api';
import { useStore } from './context';
import { Button, ErrorNotice, Field, Modal } from './ui';

export function IntegrationsAdmin({ data, onReload }) {
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [message,setMessage]=useState('');
  const [provider,setProvider]=useState(data.ai_provider || 'openai');
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage(''); const fields=Object.fromEntries(new FormData(e.currentTarget));
    try { await api('/admin/integrations',{method:'PUT',data:{...fields,smtp_port:Number(fields.smtp_port),smtp_enabled:fields.smtp_enabled==='on',clear_openai_key:fields.clear_openai_key==='on',clear_gemini_key:fields.clear_gemini_key==='on',clear_smtp_password:fields.clear_smtp_password==='on'}}); e.target.reset(); setMessage('Configuração guardada.'); onReload(); } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function testMail() { setBusy(true); setError(''); try { const r=await api('/admin/integrations/test-email',{method:'POST',data:{test:true}}); setMessage(r.local?'Email de teste guardado em storage/mail (modo local).':'Email de teste colocado na fila para o endereço da tua conta. Atualiza os dados para consultar o resultado.'); onReload(); } catch(e) { setError(e.message); } finally { setBusy(false); } }
  return <section className="admin-panel integration-panel"><form className="form-stack" onSubmit={save}><div className="panel-heading"><div><h2><Sparkles size={20}/> Inteligência artificial</h2><p>Escolhe o serviço usado pelo assistente de compras e pelo resumo de gestão.</p></div></div>
    <Field label="Fornecedor de IA"><select name="ai_provider" value={provider} onChange={e=>setProvider(e.target.value)}><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option></select></Field>
    {provider==='gemini'?<div className="form-stack" key="gemini">
      <p>{data.gemini_configured?'Chave Gemini configurada.':'Introduz a chave da tua conta Google AI Studio para ativar o Gemini.'}</p>
      <Field label="Chave API Gemini" name="gemini_key" type="password" autoComplete="new-password" maxLength={512} placeholder={data.gemini_configured?'Deixa vazio para manter a chave atual':'Cola aqui a chave do Google AI Studio'}/>
      <label className="checkbox-label"><input type="checkbox" name="clear_gemini_key"/>Remover a chave Gemini guardada</label>
      <Field label="Modelo Gemini" name="gemini_model" required maxLength={100} defaultValue={data.gemini_model}/>
      <input type="hidden" name="model" value={data.model}/>
      <p className="small muted"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Criar ou consultar chave no Google AI Studio</a>. A disponibilidade e os limites dependem do modelo e do teu projeto. Guarda as integrações e experimenta «Gerar resumo» na visão geral.</p>
    </div>:<div className="form-stack" key="openai"><p>{data.openai_configured?'Chave configurada.':'Introduz a chave da tua conta OpenAI para ativar a IA.'}</p>
    <Field label="Chave API OpenAI" name="openai_key" type="password" autoComplete="new-password" maxLength={512} placeholder={data.openai_configured?'Deixa vazio para manter a chave atual':'sk-…'}/>
    <label className="checkbox-label"><input type="checkbox" name="clear_openai_key"/>Remover a chave guardada</label>
    <Field label="Modelo OpenAI" name="model" required maxLength={100} defaultValue={data.model}/>
    <p className="small muted">Uma chave guardada ainda precisa de acesso ao modelo e saldo disponível. Se aparecer «saldo esgotado», adiciona créditos antes de repetir o pedido. <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noopener noreferrer">Abrir faturação OpenAI</a> · <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noopener noreferrer">Consultar limites</a></p>
    </div>}
    <p className="small muted">A chave guardada fica no servidor e não é devolvida ao navegador. Os pedidos à API podem ter custos na conta do fornecedor escolhido. O assistente exige início de sessão e tem limites de utilização. Deixar o campo vazio mantém a chave desse fornecedor.</p>
    <hr/><h2><Mail size={20}/> Email SMTP</h2><label className="checkbox-label"><input name="smtp_enabled" type="checkbox" defaultChecked={data.smtp_enabled}/>Ativar entrega de emails reais</label>
    <p className="small muted">Sem SMTP ativo, as mensagens ficam em storage/mail. Com SMTP, são enviadas as recuperações de acesso e confirmações de novas encomendas.</p>
    <div className="form-row"><Field label="Servidor SMTP" name="smtp_host" defaultValue={data.smtp_host} placeholder="smtp.exemplo.pt" maxLength={190}/><Field label="Porta SMTP" name="smtp_port" type="number" min={1} max={65535} defaultValue={data.smtp_port} required/></div>
    <Field label="Encriptação SMTP"><select name="smtp_encryption" defaultValue={data.smtp_encryption}><option value="tls">STARTTLS (habitualmente 587)</option><option value="ssl">TLS direto (habitualmente 465)</option></select></Field>
    <Field label="Utilizador SMTP" name="smtp_user" defaultValue={data.smtp_user} autoComplete="off" maxLength={190}/><Field label="Palavra-passe SMTP" name="smtp_password" type="password" autoComplete="new-password" maxLength={512} placeholder={data.smtp_password_configured?'Guardada. Deixa vazio para manter.':''}/>
    <label className="checkbox-label"><input type="checkbox" name="clear_smtp_password"/>Remover a palavra-passe SMTP</label><Field label="Email do remetente" name="smtp_from" type="email" defaultValue={data.smtp_from} maxLength={190}/>
    <ErrorNotice message={error}/>{message&&<p role="status" className="info-notice">{message}</p>}<div className="modal-actions"><Button type="button" variant="secondary" busy={busy} onClick={testMail}>Enviar email de teste</Button><Button type="submit" busy={busy}><Settings size={16}/>Guardar integrações</Button></div>
  </form><div className="integration-status"><b>Processamento: {data.worker_running?'ativo':'parado — executa iniciar.bat'}</b><p>Emails: {data.mail_counts.length?data.mail_counts.map(r=>`${({queued:'em fila',processing:'a enviar',sent:'enviados',failed:'falharam',local:'locais'})[r.status]}: ${r.count}`).join(' · '):'ainda sem mensagens'}</p></div><GoogleAdmin/><IntegrationMonitor/></section>;
}

function useAiJob() {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null); const controller=useRef();
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function run(route,data) {
    controller.current?.abort(); const c=new AbortController(); controller.current=c; setBusy(true);setError('');setResult(null);
    try { const job=await api(route,{method:'POST',data,signal:c.signal}); const deadline=Date.now()+120000;
      while(Date.now()<deadline) { await new Promise(resolve=>setTimeout(resolve,1400)); if(c.signal.aborted) return; const r=await api(`/ai/jobs/${job.id}`,{signal:c.signal}); if(r.status==='failed') throw new Error(r.error); if(r.status==='done') { setResult(r); return; } }
      throw new Error('O pedido demorou demasiado. Tenta novamente mais tarde.');
    } catch(e) { if(e.name!=='AbortError') setError(e.message); } finally { if(!c.signal.aborted) setBusy(false); }
  } return {busy,error,result,run};
}
export function AiSummary() {
  const {busy,error,result,run}=useAiJob();
  return <section className="admin-panel ai-summary"><div className="panel-heading"><div><span className="eyebrow">UM OLHAR SOBRE OS NÚMEROS</span><h2>Resumo com IA</h2><p>Vendas dos últimos 30 dias e stock atual.</p></div><Button variant="secondary" busy={busy} onClick={()=>run('/admin/ai/summary',{generate:true})}><Sparkles size={16}/>Gerar resumo</Button></div><ErrorNotice message={error}/>{result&&<p className="ai-answer">{result.result.message}</p>}<small className="muted">A IA pode cometer erros. Confirma as sugestões nos indicadores do painel. Só são enviados dados agregados, sem dados pessoais dos clientes.</small></section>;
}
export function ShoppingAssistant({ onProduct }) {
  const [open,setOpen]=useState(false); const {user,setAuthMode}=useStore(); const {busy,error,result,run}=useAiJob(); const [question,setQuestion]=useState('');
  return <><button className="assistant-launch" onClick={()=>setOpen(true)} aria-label="Abrir assistente de compras"><Sparkles size={19}/><span>Ajuda a escolher</span></button>{open&&<Modal title="Encontra o teu próximo essencial" onClose={()=>setOpen(false)}><p className="muted">Diz-nos o espaço, o estilo e quanto queres gastar.</p>{!user?<div className="mt-5"><Button onClick={()=>{setOpen(false);setAuthMode('login');}}>Iniciar sessão para usar a IA</Button></div>:<form className="form-stack mt-5" onSubmit={e=>{e.preventDefault();run('/ai/chat',{message:question});}}><Field label="O que procuras?"><textarea aria-label="O que procuras?" rows={3} value={question} onChange={e=>setQuestion(e.target.value)} minLength={3} maxLength={1000} required placeholder="Quero uma sala acolhedora, com peças até 100 €."/></Field><small className="muted">A tua pergunta e o catálogo são enviados ao fornecedor de IA configurado pela loja (Google Gemini ou OpenAI). Não incluas dados pessoais. A IA pode cometer erros; confirma os detalhes dos produtos.</small><Button busy={busy} type="submit"><Send size={16}/>{busy?'A consultar o catálogo…':'Pedir sugestões'}</Button><ErrorNotice message={error}/>{result&&<div aria-live="polite"><p className="ai-answer">{result.result.message}</p><div className="ai-products">{result.result.products.map(p=><button type="button" key={p.id} onClick={()=>{setOpen(false);onProduct(p);}}><img src={p.image} alt=""/><span>{p.name}<b>{money(p.price_cents)}</b></span></button>)}</div></div>}</form>}</Modal>}</>;
}
