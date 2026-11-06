import { useState } from 'react';
import { GoogleSignIn } from './google-auth';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, CheckCircle2 } from 'lucide-react';
import { api } from './api';
import { useStore } from './context';
import { Button, Field, Modal, ErrorNotice } from './ui';

export function AuthModal({ initialMode = 'login', token = '', onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [success, setSuccess] = useState(''); const [visible, setVisible] = useState(false);
  const { setUser, notify } = useStore();
  const changeMode = next => { setMode(next); setError(''); setSuccess(''); };
  const titles = { login: 'Bem-vindo de volta.', register: 'A tua casa começa aqui.', forgot: 'Vamos recuperar o acesso.', reset: 'Um novo começo.' };
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api(`/auth/${mode}`, { method: 'POST', data: { ...data, ...(mode === 'reset' ? { token } : {}) } });
      if (mode === 'forgot' || mode === 'reset') { setSuccess(result.message); }
      else { setUser(result.user); notify(mode === 'register' ? 'A tua conta está pronta. Bem-vindo à FORMA!' : `Olá, ${result.user.name.split(' ')[0]}!`); onClose(true); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Modal title="A tua conta FORMA" onClose={onClose} className="auth-modal">
    <div className="auth-symbol"><span>f.</span></div>
    <h3 className="auth-title">{titles[mode]}</h3>
    <p className="muted text-center mb-7">{mode === 'login' ? 'Os teus favoritos, encomendas e pequenos planos.' : mode === 'register' ? 'Cria uma conta e encontra o teu próximo essencial.' : 'Segue os passos para voltares à tua conta.'}</p>
    {!success && ['login', 'register'].includes(mode) && <><GoogleSignIn/><div className="auth-divider">ou continua com email</div></>}
    {success ? <div className="success-panel"><CheckCircle2 size={34} /><p>{success}</p><Button variant="secondary" onClick={() => changeMode('login')}>Voltar ao início de sessão</Button></div> : <form onSubmit={submit} className="form-stack">
      {mode === 'register' && <Field label="Nome completo" name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Como te chamas?" />}
      {mode !== 'reset' && <Field label="Email" type="email" name="email" autoComplete="email" required maxLength={190} placeholder="o.teu@email.pt" />}
      {mode !== 'forgot' && <label className="field"><span>{mode === 'reset' ? 'Nova palavra-passe' : 'Palavra-passe'}</span><div className="password-field"><input aria-label={mode === 'reset' ? 'Nova palavra-passe' : 'Palavra-passe'} type={visible ? 'text' : 'password'} name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 10} maxLength={72} placeholder={mode === 'login' ? 'A tua palavra-passe' : 'Pelo menos 10 caracteres'} /><button type="button" className="icon-btn" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
      {mode === 'login' && <button type="button" className="text-link self-end" onClick={() => changeMode('forgot')}>Esqueceste-te da palavra-passe?</button>}
      <ErrorNotice message={error} />
      <Button busy={busy} type="submit" className="w-full">{({ login: 'Entrar na minha conta', register: 'Criar conta', forgot: 'Enviar link de recuperação', reset: 'Guardar palavra-passe' })[mode]}<ArrowRight size={18} /></Button>
      <p className="auth-switch">{mode === 'login' ? <>Ainda não tens conta? <button type="button" onClick={() => changeMode('register')}>Criar conta</button></> : <button type="button" onClick={() => changeMode('login')}><ArrowLeft size={14} /> Voltar ao início de sessão</button>}</p>
    </form>}
    <div className="auth-assurance"><LockKeyhole size={14} /> A tua sessão é protegida e os teus dados são privados.</div>
  </Modal>;
}
