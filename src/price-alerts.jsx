import { Bell, BellRing, TrendingDown } from 'lucide-react';
import { useStore } from './context';
import { money } from './api';

export function PriceAlertButton({ product }) {
  const { user, priceAlerts, priceAlertsLoading, priceAlertPending, togglePriceAlert, favoriteSync } = useStore();
  const active = priceAlerts.some(row => Number(row.product_id) === Number(product.id));
  return <button className={`price-alert-button ${active ? 'is-active' : ''}`} aria-pressed={active}
    aria-label={`${active ? 'Desativar' : 'Ativar'} alerta de preço de ${product.name}`}
    disabled={priceAlertsLoading || favoriteSync || priceAlertPending.includes(Number(product.id))}
    onClick={() => togglePriceAlert(product.id)}>
    {active ? <BellRing size={14}/> : <Bell size={14}/>} {active ? 'A acompanhar o preço' : user ? 'Avisar se o preço baixar' : 'Entrar para acompanhar o preço'}
  </button>;
}

export function PriceAlertsPanel() {
  const { priceAlerts, priceAlertsLoading, togglePriceAlert, priceAlertPending } = useStore();
  return <section className="customer-panel price-alert-panel"><div className="customer-panel-title"><TrendingDown size={17}/><h3>Alertas de preço</h3></div>
    <p className="small muted">Recebes uma notificação a cada novo preço mínimo desde a ativação. Acompanha o menor preço entre as opções ativas.</p>
    {priceAlertsLoading ? <p role="status">A carregar alertas…</p> : priceAlerts.map(row => <div className="price-watch-row" key={row.product_id}>
      <img src={row.image} alt=""/><div><b>{row.name}</b><small>{Number(row.active) ? `Preço atual: ${money(row.price_cents)}` : 'Produto indisponível'}</small><small>Referência: {money(row.reference_price_cents)}{Number(row.notification_count) > 0 ? ` · ${row.notification_count} aviso(s)` : ''}</small></div>
      <button className="icon-btn" aria-label={`Desativar alerta de preço de ${row.name}`} disabled={priceAlertPending.includes(Number(row.product_id))} onClick={() => togglePriceAlert(row.product_id)}><BellRing size={16}/></button>
    </div>)}
    {!priceAlertsLoading && !priceAlerts.length && <p className="small muted">Ativa o sino nos teus favoritos para começar.</p>}
    <a className="text-link" href="#favorites">Gerir nos favoritos</a>
  </section>;
}
