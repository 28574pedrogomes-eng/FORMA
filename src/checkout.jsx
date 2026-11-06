import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, CheckCircle2, CreditCard, MapPin, ShieldCheck, Tag, Truck, X } from 'lucide-react';
import { api, downloadReceipt, money, paymentLabels } from './api';
import { cartKey, useStore } from './context';
import { Button, Field, Modal, ErrorNotice, Loading } from './ui';

export function Checkout({ onClose }) {
  const { cart, setCart, user, refreshCatalog, refreshNotifications } = useStore();
  const [checking, setChecking] = useState(true); const [busy, setBusy] = useState(false); const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState(''); const [quoteError, setQuoteError] = useState(''); const [blocked, setBlocked] = useState(false);
  const [addresses, setAddresses] = useState([]); const [addressId, setAddressId] = useState('new');
  const [shipping, setShipping] = useState({ shipping_name: user?.name || '', address: '', city: '', postal_code: '', phone: '' });
  const [method, setMethod] = useState('standard'); const [couponInput, setCouponInput] = useState(''); const [couponCode, setCouponCode] = useState('');
  const [quote, setQuote] = useState(null); const [outcome, setOutcome] = useState('approved'); const [order, setOrder] = useState(null);
  const key = useRef(crypto.randomUUID());
  function chooseAddress(value, rows = addresses) {
    setAddressId(String(value)); const found = rows.find(a => String(a.id) === String(value));
    setShipping(found ? Object.fromEntries(['shipping_name', 'address', 'city', 'postal_code', 'phone'].map(k => [k, found[k]])) : { shipping_name: user?.name || '', address: '', city: '', postal_code: '', phone: '' });
  }
  useEffect(() => {
    let alive = true;
    Promise.all([Promise.all(cart.map(async p => {
      const product = await api(`/products/${p.id}`);
      const variant = product.variants.find(v => Number(v.id) === Number(p.variant_id || product.default_variant_id));
      if (!variant) throw new Error(`A opção de ${p.name} já não está disponível. Remove-a do carrinho.`);
      return { ...product, variant_id: variant.id, variant_label: variant.label, price_cents: variant.price_cents, image: variant.image, stock: variant.stock, quantity: p.quantity };
    })), api('/addresses')]).then(([fresh, rows]) => {
      if (!alive) return;
      const combined = Object.values(fresh.reduce((all, p) => { const id = cartKey(p); all[id] = all[id] ? { ...p, quantity: all[id].quantity + p.quantity } : p; return all; }, {}));
      if (combined.some(p => p.stock < p.quantity)) { setError('O stock de uma opção mudou. Ajusta as quantidades no carrinho.'); setBlocked(true); }
      setCart(combined); setAddresses(rows); const preferred = rows.find(a => Number(a.is_default)); if (preferred) chooseAddress(preferred.id, rows);
    }).catch(e => { if (alive) { setError(e.message); setBlocked(true); } }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, []);
  const signature = cart.map(p => `${cartKey(p)}:${p.quantity}`).join('|');
  const requestItems = () => cart.map(p => ({ product_id: p.id, variant_id: p.variant_id, quantity: p.quantity }));
  useEffect(() => {
    if (checking || blocked || order || !cart.length) return;
    const controller = new AbortController(); setQuoting(true); setQuoteError('');
    api('/checkout/quote', { method: 'POST', data: { items: requestItems(), coupon_code: couponCode, shipping_method: method }, signal: controller.signal }).then(setQuote).catch(e => { if (e.name !== 'AbortError') setQuoteError(e.message); }).finally(() => { if (!controller.signal.aborted) setQuoting(false); });
    return () => controller.abort();
  }, [checking, blocked, signature, couponCode, method, order?.id]);
  async function submit(e) {
    e.preventDefault(); if (!quote || quoteError || quoting) return; setBusy(true); setError('');
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api('/orders', { method: 'POST', data: { ...shipping, checkout_key: key.current, items: requestItems(), coupon_code: couponCode, shipping_method: method, payment_outcome: outcome, save_address: fields.save_address === 'on', address_label: fields.address_label || 'Casa' } });
      setOrder(result); setCart([]); refreshCatalog(); refreshNotifications();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const input = name => ({ value: shipping[name], onChange: e => setShipping(s => ({ ...s, [name]: e.target.value })) });
  async function receipt() { try { await downloadReceipt(order.id); } catch (e) { setError(e.message); } }
  return <Modal title={order ? 'A tua encomenda está registada.' : 'Finalizar encomenda'} wide onClose={() => { if (!busy) onClose(); }}>
    {order ? <div className="order-success"><div className="success-orbit"><CheckCircle2 size={42} /></div><span className="eyebrow">OBRIGADO POR ESCOLHERES A FORMA</span><h3>A tua encomenda foi recebida.</h3><p>Encomenda <b>#{String(order.id).padStart(5, '0')}</b> · {money(order.total_cents)}</p><span className={`payment-badge payment-${order.payment_status}`}><CreditCard size={15} />Pagamento de teste: {paymentLabels[order.payment_status]}</span><p className="muted">{order.payment_status === 'paid' ? 'Podes acompanhar todas as novidades na tua conta.' : 'Abre a encomenda na tua conta para repetir ou concluir o pagamento de teste.'}<br />Esta é uma demonstração. Não foi efetuada qualquer cobrança.</p><ErrorNotice message={error} /><div className="success-actions"><Button onClick={() => { location.hash = 'account'; onClose(); }}>Ver as minhas encomendas<ArrowRight size={18} /></Button><Button variant="secondary" onClick={receipt}><ArrowDownToLine size={16} />Comprovativo PDF</Button></div></div> : checking ? <Loading label="A confirmar preços, opções e moradas…" /> : <form onSubmit={submit} className="checkout-grid">
      <div className="form-stack"><span className="eyebrow">01 / DADOS DE ENTREGA</span>{addresses.length > 0 && <Field label="Usar uma morada guardada"><select value={addressId} onChange={e => chooseAddress(e.target.value)}><option value="new">Introduzir outra morada</option>{addresses.map(a => <option key={a.id} value={a.id}>{a.label} — {a.address}</option>)}</select></Field>}<Field label="Nome completo" {...input('shipping_name')} autoComplete="shipping name" required minLength={2} maxLength={100} /><Field label="Morada" {...input('address')} autoComplete="shipping street-address" placeholder="Rua, número e andar" required minLength={5} maxLength={255} /><div className="form-row"><Field label="Código postal" {...input('postal_code')} placeholder="1000-001" pattern="[0-9]{4}-[0-9]{3}" autoComplete="shipping postal-code" required /><Field label="Localidade" {...input('city')} autoComplete="shipping address-level2" required minLength={2} maxLength={100} /></div><Field label="Telefone" type="tel" {...input('phone')} autoComplete="tel" required minLength={9} maxLength={20} placeholder="912 345 678" />{addressId === 'new' && <div className="save-address-check"><label className="checkbox-label"><input type="checkbox" name="save_address" />Guardar esta morada na minha conta</label><Field label="Nome da morada" name="address_label" defaultValue="Casa" maxLength={60} /></div>}
      <span className="eyebrow mt-3">02 / COMO CHEGA ATÉ TI</span><div className="delivery-options"><label className={method === 'standard' ? 'selected' : ''}><input type="radio" name="delivery" value="standard" checked={method === 'standard'} onChange={() => setMethod('standard')} /><Truck size={19} /><div><b>Entrega standard</b><small>3–5 dias úteis · 4,90 € ou grátis desde 75 € após descontos</small></div></label><label className={method === 'express' ? 'selected' : ''}><input type="radio" name="delivery" value="express" checked={method === 'express'} onChange={() => setMethod('express')} /><Truck size={19} /><div><b>Entrega expresso</b><small>1–2 dias úteis · 9,90 €</small></div></label></div><p className="small muted">Portugal continental. Prazos e entregas ilustrativos.</p>
      <span className="eyebrow mt-3">03 / PAGAMENTO DE DEMONSTRAÇÃO</span><Field label="Resultado do pagamento de teste"><select value={outcome} onChange={e => setOutcome(e.target.value)}><option value="approved">Simular pagamento aprovado</option><option value="refused">Simular pagamento recusado</option><option value="pending">Simular pagamento pendente</option></select></Field><p className="small muted">Sem cartões, dados bancários ou cobranças reais. Podes repetir o teste na tua conta.</p></div>
      <div className="checkout-summary"><span className="eyebrow">A TUA SELEÇÃO</span>{(quote?.items || cart).map(p => <div className="checkout-product" key={`${p.product_id || p.id}:${p.variant_id}`}><img src={p.image} alt="" /><div><b>{p.name}</b><span>{p.variant_label && p.variant_label !== 'Padrão' ? `${p.variant_label} · ` : ''}Quantidade: {p.quantity}</span></div><span>{money(p.price_cents * p.quantity)}</span></div>)}
      <div className="coupon-form"><label htmlFor="checkout-coupon"><Tag size={15} />Tens um código de desconto?</label><div><input id="checkout-coupon" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setCouponCode(couponInput.trim()); } }} value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())} maxLength={40} placeholder="O TEU CÓDIGO" /><Button type="button" variant="secondary" onClick={() => setCouponCode(couponInput.trim())} disabled={quoting || !couponInput.trim()}>Aplicar</Button></div>{couponCode && <button type="button" className="text-link" onClick={() => { setCouponCode(''); setCouponInput(''); }}><X size={13} />Remover {couponCode}</button>}</div>
      {quoting && <p className="small muted" role="status">A recalcular o total…</p>}<div className="summary-line"><span>Subtotal</span><span>{money(quote?.subtotal_cents)}</span></div>{Number(quote?.discount_cents) > 0 && <div className="summary-line discount-line"><span>Desconto · {quote.coupon_code}</span><span>−{money(quote.discount_cents)}</span></div>}<div className="summary-line"><span>Portes</span><span>{quote?.shipping_cents ? money(quote.shipping_cents) : 'Grátis'}</span></div><div className="summary-line total"><b>Total</b><b>{quote ? money(quote.total_cents) : '—'}</b></div><ErrorNotice message={quoteError || error} /><label className="checkbox-label"><input type="checkbox" name="demo_consent" required /> <span>Compreendo que esta é uma loja de demonstração, sem cobrança ou envio real.</span></label><Button className="w-full" busy={busy} disabled={blocked || !cart.length || !quote || quoting || !!quoteError} type="submit">Confirmar encomenda<ArrowRight size={17} /></Button><div className="secure-note"><ShieldCheck size={15} /> Total calculado no servidor · IVA incluído</div></div>
    </form>}
  </Modal>;
}
