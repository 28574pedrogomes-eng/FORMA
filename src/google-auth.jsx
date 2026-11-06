import { useEffect, useState } from 'react';
import { api } from './api';
import { useStore } from './context';
import { Button, ErrorNotice, Field, Loading } from './ui';
import './google-auth.css';

function GoogleMark() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.6c3.9-3.6 6.1-8.9 6.1-15.1Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.2c-1.8 1.2-4 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.3 12.3 0 0 1 0-7.8v-5.3H5.8a20 20 0 0 0 0 18.4l6.8-5.3Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.7 1 7.8 3l5.8-5.8A19.6 19.6 0 0 0 24 3C16.2 3 9.5 7.4 5.8 14.3l6.8 5.3C14.2 14.8 18.7 11.2 24 11.2Z"/></svg>;
}
export function GoogleSignIn({ link = false }) {
  const { checkoutIntent } = useStore();
  const [status, setStatus] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); api('/auth/google/status', { signal: controller.signal }).then(setStatus).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  async function start() {
    setBusy(true); setError('');
    try { const result = await api('/auth/google/start', { method: 'POST', data: { intent: link ? 'link' : 'login', checkout: !link && checkoutIntent } }); window.location.assign(result.url); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  if (link && status?.linked) return <p className="google-linked"><GoogleMark/>A tua conta Google está associada.</p>;
  return <div className="google-signin"><button type="button" className="google-button" onClick={start} disabled={busy || !status?.enabled}><GoogleMark/><span>{busy ? 'A abrir o Google…' : link ? 'Associar Google' : 'Continuar com Google'}</span></button>{status && !status.enabled && <p className="google-unavailable">O login Google ainda não está disponível nesta loja.</p>}<ErrorNotice message={error}/></div>;
}
export function GoogleAccount() {
  return <section className="experience-section google-account"><h2>Entrar com Google</h2><p>Associa a conta Google com o mesmo email para entrares sem a palavra-passe da loja.</p><GoogleSignIn link/><small>Se criaste a conta com Google e quiseres definir uma palavra-passe, usa “Esqueceste-te da palavra-passe?” no início de sessão.</small></section>;
}
export function GoogleAuthResult() {
  const { setAuthMode, setCheckoutIntent, notify, refreshSession } = useStore();
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api('/auth/google/result').then(async result => {
      if (!alive) return;
      if (!result.ok) { setError(result.message); return; }
      await refreshSession();
      if (!alive) return;
      if (result.checkout) setCheckoutIntent(true);
      notify(result.message); location.hash = 'account';
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);
  return <div className="container page-space google-result">{error ? <><h1>Vamos tentar outra vez.</h1><ErrorNotice message={error}/><Button onClick={() => { location.hash = 'account'; setAuthMode('login'); }}>Voltar ao início de sessão</Button></> : <Loading/>}</div>;
}
export function GoogleAdmin() {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => { const controller = new AbortController(); api('/admin/auth/google', { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  async function save(e) {
    e.preventDefault(); const form = e.currentTarget; const values = Object.fromEntries(new FormData(form)); setBusy(true); setError(''); setMessage('');
    try { const result = await api('/admin/auth/google', { method: 'PUT', data: { ...values, enabled: values.enabled === 'on', clear_secret: values.clear_secret === 'on' } }); setData(result); form.reset(); setMessage('Configuração do login Google guardada.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="google-admin"><div className="panel-heading"><div><h2><GoogleMark/> Login com Google</h2><p>Permite entrar ou criar uma conta através do Google.</p></div></div><ErrorNotice message={error}/>{data && <>
    <div className="google-setup"><b>{data.ready ? 'Pronto para autenticar com Google' : 'Configuração necessária'}</b><p>Cria um cliente OAuth do tipo <strong>Aplicação Web</strong> na <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Auth Platform</a>. Regista este URI de redirecionamento, exatamente como aparece:</p><code>{data.redirect_uri}</code><p>Configura também o nome FORMA no ecrã de consentimento e, em modo de teste, adiciona os emails autorizados em Público-alvo.</p></div>
    <form className="form-stack" key={`${data.client_id}-${data.enabled}-${data.secret_configured}`} onSubmit={save}>
      <Field label="Google Client ID" name="client_id" defaultValue={data.client_id} maxLength={255} placeholder="…apps.googleusercontent.com" autoComplete="off"/>
      <Field label="Google Client Secret" name="client_secret" type="password" maxLength={512} autoComplete="new-password" placeholder={data.secret_configured ? 'Deixa vazio para manter o segredo atual' : 'Introduz o Client Secret do OAuth'}/>
      <small>{data.secret_configured ? 'Client Secret guardado no servidor.' : 'Ainda não existe Client Secret guardado.'} Estas credenciais são diferentes da chave Gemini.</small>
      {data.secret_configured && <label className="checkbox-label"><input type="checkbox" name="clear_secret"/>Remover o Client Secret guardado</label>}
      <label className="checkbox-label"><input type="checkbox" name="enabled" defaultChecked={data.enabled}/>Ativar início de sessão com Google</label>
      <p className="small muted">Biblioteca PHP via Composer: {data.sdk_installed ? 'instalada' : 'por instalar'}</p>
      {message && <p role="status" className="google-success">{message}</p>}
      <Button type="submit" busy={busy}>Guardar login Google</Button>
    </form>
  </>}</section>;
}
