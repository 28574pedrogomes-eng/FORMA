import { PriceAlertsPanel } from './price-alerts';
import { GoogleAccount } from './google-auth';
import { ProfileEditor, OrderTimeline } from './improvements';
import { SupportPanel, ReturnsPanel } from './experience';
import { AddressBook, RestockList, OrderTools } from './customer-tools';
import { useEffect, useState } from 'react';
import { ArrowRight, Bell, CheckCheck, LogOut, Package, ShieldCheck, UserRound } from 'lucide-react';
import { api, date, money } from './api';
import { useStore } from './context';
import { Button, Empty, ErrorNotice, Loading, Modal, Status } from './ui';

export function Notifications({ onClose }) {
  const { notifications, refreshNotifications } = useStore(); const [error, setError] = useState('');
  async function read() { try { await api('/notifications/read', { method: 'POST', data: {} }); refreshNotifications(); } catch (e) { setError(e.message); } }
  useEffect(() => { refreshNotifications(); }, []);
  return <Modal title="As tuas novidades" drawer onClose={onClose}><ErrorNotice message={error} />{notifications.length ? <><button className="mark-read" onClick={read}><CheckCheck size={16} />Marcar todas como lidas</button><div className="notification-list">{notifications.map(n => <article key={n.id} className={Number(n.is_read) ? '' : 'unread'}><span className="notification-icon"><Bell size={18} /></span><div><h3>{n.title}</h3><p>{n.message}</p><time>{date(n.created_at)}</time></div>{!Number(n.is_read) && <i />}</article>)}</div></> : <Empty title="Tudo em dia." icon={Bell}>As novidades das tuas encomendas aparecem aqui.</Empty>}</Modal>;
}

export function Account() {
  const { user, sessionLoading, setAuthMode, logout } = useStore();
  const [orders, setOrders] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => { if (!user) { setLoading(false); return; } let alive = true; setLoading(true); setError(''); api('/orders').then(data => { if (alive) setOrders(data); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [user?.id, retry]);
  useEffect(() => { const update = () => setRetry(v => v + 1); window.addEventListener('forma:orders-changed', update); return () => window.removeEventListener('forma:orders-changed', update); }, []);
  if (sessionLoading) return <Loading />;
  if (!user) return <div className="container page-space"><Empty title="O teu cantinho na FORMA." icon={UserRound} action={<Button onClick={() => setAuthMode('login')}>Iniciar sessão<ArrowRight size={17} /></Button>}>Inicia sessão para acompanhares as tuas encomendas.</Empty></div>;
  return <div className="container account-page"><div className="page-heading"><div><span className="eyebrow">A TUA CONTA</span><h1>Olá, <em>{user.name.split(' ')[0]}.</em></h1><p className="muted">Tudo o que precisas, no mesmo lugar.</p></div><Button variant="secondary" onClick={logout}><LogOut size={16} />Terminar sessão</Button></div><div className="account-grid"><div className="account-sidebar"><aside className="account-profile"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><h3>{user.name}</h3><p>{user.email}</p><span className="profile-badge">{user.role === 'admin' ? 'Administrador' : 'Cliente FORMA'}</span><div><Package size={17} />{orders.length} encomenda{orders.length === 1 ? '' : 's'}</div>{user.role === 'admin' && <a className="text-link" href="#admin"><ShieldCheck size={16} />Abrir administração<ArrowRight size={14} /></a>}</aside><ProfileEditor/><GoogleAccount/><AddressBook /><PriceAlertsPanel /><RestockList /></div><section><div className="orders-heading"><h2>As tuas encomendas</h2><span>HISTÓRICO</span></div><ErrorNotice message={error} retry={() => setRetry(v => v + 1)} />{loading ? <Loading /> : !orders.length && !error ? <Empty title="O primeiro capítulo está por escrever." action={<Button variant="secondary" onClick={() => { location.hash = ''; }}>Explorar a coleção<ArrowRight size={17} /></Button>}>Quando fizeres uma encomenda, podes acompanhá-la aqui.</Empty> : orders.map(order => <OrderCard key={order.id} order={order} />)}<ReturnsPanel orders={orders}/><SupportPanel/></section></div></div>;
}

export function OrderCard({ order, adminAction }) {
  const [expanded, setExpanded] = useState(false);
  return <article className="order-card"><div className="order-card-heading"><div><h3>Encomenda #{String(order.id).padStart(5, '0')}</h3><span>{date(order.created_at)}{order.email ? ` · ${order.shipping_name}` : ''}</span></div><Status value={order.status} /></div><div className="order-preview"><div className="order-thumbnails">{order.items.slice(0, 4).map(item => <img src={item.image} key={item.id} alt={item.product_name} />)}<span>{order.items.reduce((sum, i) => sum + Number(i.quantity), 0)} artigo(s)</span></div><b>{money(order.total_cents)}</b></div><button className="text-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Ocultar detalhes' : 'Ver detalhes da encomenda'}<ArrowRight size={15} /></button>{expanded && <div className="order-expanded">{order.items.map(item => <div key={item.id}><span>{item.quantity} × {item.product_name}{item.variant_label && item.variant_label !== 'Padrão' ? ` / ${item.variant_label}` : ''}</span><b>{money(item.unit_price_cents * item.quantity)}</b></div>)}<div><span>Portes</span><b>{money(order.shipping_cents)}</b></div><p><b>Entrega:</b> {order.shipping_name}<br />{order.address}, {order.postal_code} {order.city}<br />{order.phone}{order.email && <><br />{order.email}</>}</p></div>}{expanded&&<OrderTimeline events={order.timeline}/>}<OrderTools order={order} />{adminAction}</article>;
}
