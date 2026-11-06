import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Bell, Heart, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { StoreProvider, useStore } from './context';
import { AuthModal } from './auth';
import { GoogleAuthResult } from './google-auth';
import { CartDrawer, Checkout } from './cart';
import { Shop, ProductDetail } from './shop';
import { Account, Notifications } from './account';
import { Admin } from './admin';
import { NewsPage } from './news';
import { ErrorNotice, Modal } from './ui';
import './palette.css';
import './styles.css';
import './commerce.css';
import './cinema.css';
import './experience.css';
import './improvements.css';
import './storefront.css';
import { ConfirmEmail } from './improvements';
import { ShoppingAssistant } from './integrations';
import { SharedFavorites, Comparison, BundlesPage } from './experience';

function App() {
  const [route, setRoute] = useState(location.hash.slice(1));
  const isNews = route === 'news' || route.startsWith('news/');
  const [product, setProduct] = useState(null); const [checkout, setCheckout] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false); const [menuOpen, setMenuOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const scrollProgress = useRef(null);
  const { user, authMode, setAuthMode, cartOpen, setCartOpen, cart, notifications, sessionError, refreshSession, checkoutIntent, setCheckoutIntent } = useStore();
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = window.scrollY;
      setScrolled(top > 20);
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollProgress.current) scrollProgress.current.style.width = `${total > 0 ? Math.min(100, Math.max(0, (top / total) * 100)) : 0}%`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in-view');
        }
      });
    }, { threshold: 0.05, rootMargin: '40px 0px -20px 0px' });
    const observeTargets = () => {
      document.querySelectorAll('.product-card, .trust-strip>div, .section-intro, .catalog-toolbar, .catalog-search-row, .story-section, .closing-note').forEach(el => io.observe(el));
    };
    observeTargets();
    const mo = new MutationObserver(observeTargets);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [route]);
  useEffect(() => { const onHash = () => { const next = location.hash.slice(1); setRoute(next); setMenuOpen(false); if (!['collection', 'philosophy', 'new'].includes(next)) window.scrollTo({ top: 0 }); else setTimeout(() => document.getElementById(next === 'new' ? 'collection' : next)?.scrollIntoView({ behavior: 'smooth' }), 60); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { document.title = route === 'admin' ? 'Administração — FORMA' : route === 'account' ? 'A tua conta — FORMA' : route === 'favorites' ? 'Os teus favoritos — FORMA' : isNews ? 'Notícias — FORMA' : route === 'bundles' ? 'Conjuntos — FORMA' : route.startsWith('shared/') ? 'Favoritos partilhados — FORMA' : 'FORMA — Objetos com intenção'; }, [route]);
  useEffect(() => { if (user && checkoutIntent && cart.length) { setCheckoutIntent(false); setCheckout(true); } }, [user, checkoutIntent, cart.length]);
  const search = () => { if (route !== '' && route !== 'collection' && route !== 'philosophy') location.hash = 'collection'; document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => document.querySelector('input[aria-label="Pesquisar produtos"]')?.focus({ preventScroll: true }), 150); };
  const count = cart.reduce((sum, p) => sum + p.quantity, 0); const unread = notifications.filter(n => !Number(n.is_read)).length;
  const account = () => { if (user) location.hash = 'account'; else setAuthMode('login'); };
  return <>
    <a className="skip-link" href="#main">Saltar para o conteúdo</a>
    <div ref={scrollProgress} className="scroll-progress-bar" aria-hidden="true" />
    <div className="announcement"><span>Objetos com intenção. Uma casa mais tua.</span><span>Portes grátis em encomendas a partir de 75 € <ArrowRight size={13} /></span></div>
    <header className={`site-header ${scrolled ? 'header-scrolled' : ''}`}><div className="header-inner"><button className="icon-btn mobile-menu-button" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}><Menu size={23} /></button><a className="wordmark" href="#" aria-label="FORMA, início">forma<span>®</span></a><nav className="main-nav" aria-label="Navegação principal"><a className={!isNews && !['account', 'admin', 'favorites', 'bundles'].includes(route) && !route.startsWith('shared/') ? 'active' : ''} href="#collection">Coleção<span className="nav-dot" /></a><a href="#bundles" className={route === 'bundles' ? 'active' : ''}>Conjuntos</a><a href="#philosophy">A nossa essência</a><a href="#news" className={isNews ? 'active' : ''}>Notícias</a>{user?.role === 'admin' && <a href="#admin" className={route === 'admin' ? 'active' : ''}>Administração</a>}</nav><div className="header-tools"><button className="icon-btn search-nav" aria-label="Pesquisar" onClick={search}><Search size={21} strokeWidth={1.6} /></button><a className="icon-btn favorites-nav" href="#favorites" aria-label="Favoritos"><Heart size={21} strokeWidth={1.6} /></a><button className="icon-btn" aria-label={user ? 'A minha conta' : 'Iniciar sessão'} onClick={account}><UserRound size={21} strokeWidth={1.6} /></button>{user && <button className="icon-btn notification-button" aria-label={`Notificações${unread ? `, ${unread} por ler` : ''}`} onClick={() => setNotificationsOpen(true)}><Bell size={20} strokeWidth={1.6} />{!!unread && <i />}</button>}<span className="nav-divider" /><button className="cart-nav" aria-label={`Carrinho, ${count} artigos`} onClick={() => setCartOpen(true)}><ShoppingBag size={20} strokeWidth={1.6} /><span className="cart-label">Carrinho</span><span className="cart-count">{count}</span></button></div></div></header>
    {sessionError && <div className="container mt-4"><ErrorNotice message={sessionError} retry={refreshSession} /></div>}
    <div id="main" tabIndex={-1}>{route === 'admin' ? <Admin /> : route === 'google-result' ? <GoogleAuthResult/> : route.startsWith('verify-email') ? <main><ConfirmEmail token={new URLSearchParams(route.split('?')[1]||'').get('token')||''}/></main> : route === 'account' ? <Account /> : route === 'bundles' ? <main><BundlesPage/></main> : route.startsWith('shared/') ? <main><SharedFavorites token={route.slice(7)} onProduct={setProduct}/></main> : isNews ? <main><NewsPage key={route} articleId={route === 'news' ? undefined : route.slice(5)} /></main> : <main><Shop key={route === 'favorites' ? 'favorites' : 'shop'} favoritesOnly={route === 'favorites'} newest={route === 'new'} onProduct={setProduct} /></main>}</div>
    {route !== 'admin' && <footer className="site-footer"><div className="container footer-top"><div className="footer-brand"><a className="wordmark" href="#">forma<span>®</span></a><p>Objetos com intenção.<br />Para os espaços onde a vida acontece.</p><span>DESIGN SIMPLES. VIDA COM MAIS FORMA.</span></div><div className="footer-links"><span>EXPLORAR</span><a href="#collection">A coleção</a><a href="#bundles">Conjuntos para a casa</a><a href="#favorites">Os teus favoritos</a><a href="#philosophy">A nossa essência</a><a href="#news" className={isNews ? 'active' : ''}>Notícias</a></div><div className="footer-links"><span>ESTAMOS POR AQUI</span><button onClick={account}>A minha conta</button><button onClick={() => setInfo('delivery')}>Entregas e devoluções</button><button onClick={() => setInfo('contact')}>Fala connosco</button></div><div className="footer-note"><div className="footer-flower">✳</div><p>Menos, mas<br /><em>com significado.</em></p></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} FORMA. Projeto académico de demonstração.</span><div><button onClick={() => setInfo('privacy')}>Privacidade</button><span>Portugal · EUR €</span></div></div></footer>}
    {route !== 'admin' && <><Comparison/><ShoppingAssistant onProduct={setProduct}/></>}
    {authMode && <AuthModal initialMode={authMode} onClose={signedIn => { setAuthMode(null); if (!signedIn) setCheckoutIntent(false); }} />}
    {route.startsWith('reset?') && <AuthModal initialMode="reset" token={new URLSearchParams(route.slice(6)).get('token') || ''} onClose={() => { location.hash = ''; }} />}
    {cartOpen && <CartDrawer onCheckout={() => setCheckout(true)} />}
    {checkout && <Checkout onClose={() => setCheckout(false)} />}
    {product && <ProductDetail product={product} onClose={() => setProduct(null)} />}
    {notificationsOpen && <Notifications onClose={() => setNotificationsOpen(false)} />}
    {menuOpen && <Modal title="Explorar a FORMA" onClose={() => setMenuOpen(false)} drawer><nav className="mobile-nav"><a href="#collection" onClick={() => setMenuOpen(false)}>A coleção<ArrowRight size={20} /></a><a href="#bundles">Conjuntos<ArrowRight size={20}/></a><a href="#favorites">Os teus favoritos<Heart size={20} /></a><a href="#news">Notícias<ArrowRight size={20} /></a><a href="#philosophy" onClick={() => setMenuOpen(false)}>A nossa essência<ArrowRight size={20} /></a><button onClick={() => { setMenuOpen(false); account(); }}>A minha conta<UserRound size={20} /></button>{user?.role === 'admin' && <a href="#admin">Administração<ArrowRight size={20} /></a>}</nav></Modal>}
    {info && <Modal title={{ delivery: 'Entregas e devoluções', contact: 'Fala connosco', privacy: 'A tua privacidade' }[info]} onClose={() => setInfo(null)}><div className="info-copy">{info === 'delivery' ? <><p>Esta é uma loja de demonstração. As encomendas permitem testar o funcionamento da aplicação e não originam pagamentos, envios ou devoluções reais.</p><p>Para efeitos de simulação, os portes são de 4,90 € para Portugal continental, com oferta a partir de 75 €. O prazo ilustrativo é de 3 a 5 dias úteis.</p></> : info === 'contact' ? <><p>A FORMA é um projeto académico de comércio eletrónico.</p><p>Entra na tua conta e abre um pedido na secção Apoio ao cliente. Podes acompanhar as respostas no mesmo lugar.</p></> : <><p>Esta aplicação guarda os dados de conta, moradas de encomendas e operações realizadas na base de dados local do projeto. As palavras-passe são guardadas através de hashes.</p><p>É utilizado um cookie de sessão para autenticação e segurança. O carrinho e os favoritos ficam no armazenamento local do navegador. Não são utilizados serviços de publicidade ou análise. Ao pedires sugestões ao assistente, a tua pergunta e os dados do catálogo são enviados ao fornecedor de IA configurado pela loja (Google Gemini ou OpenAI). O resumo de gestão envia apenas indicadores agregados. As respostas da IA ficam guardadas durante até 24 horas para permitir a consulta do resultado.</p><p>Ao escolheres entrar com Google, o Google confirma a tua identidade. Guardamos o nome, o email e um identificador da conta Google para autenticação. Não guardamos a tua palavra-passe Google nem tokens de acesso às suas aplicações.</p><p>As fontes são carregadas através do Google Fonts; as imagens são servidas localmente. Para eliminar dados pessoais da instalação, contacta o administrador do projeto. Evita introduzir dados pessoais reais nesta demonstração.</p></>}</div></Modal>}
  </>;
}

class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="fatal-error"><h1>Vamos tentar outra vez.</h1><p>A página encontrou um problema inesperado.</p><button className="btn btn-primary" onClick={() => location.reload()}>Recarregar a página</button></div> : this.props.children; }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><StoreProvider><App /></StoreProvider></ErrorBoundary>);
