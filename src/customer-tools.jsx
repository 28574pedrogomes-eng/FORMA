import { useEffect, useState } from 'react';
import { ArrowDownToLine, BellRing, CreditCard, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, date, downloadReceipt, money, paymentLabels } from './api';
import { useStore } from './context';
import { Button, ErrorNotice, Field, Loading, Modal } from './ui';

export function AddressBook() {
  const [items, setItems] = useState([]); const [editing, setEditing] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const { notify } = useStore();
  const load = () => api('/addresses').then(setItems).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); const data = Object.fromEntries(new FormData(e.currentTarget));
    try { await api(`/addresses${editing.id ? `/${editing.id}` : ''}`, { method: editing.id ? 'PUT' : 'POST', data: { ...data, is_default: data.is_default === 'on' } }); setEditing(null); load(); notify('Morada guardada.'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(id) { try { await api(`/addresses/${id}`, { method: 'DELETE' }); load(); notify('Morada eliminada.'); } catch (e) { setError(e.message); } }
  return <section className="customer-panel"><div className="customer-panel-title"><MapPin size={17} /><h3>As tuas moradas</h3><button className="icon-btn" aria-label="Nova morada" onClick={() => { setEditing({}); setError(''); }}><Plus size={16} /></button></div><ErrorNotice message={!editing ? error : ''} />{items.map(a => <div className="saved-address" key={a.id}><div><b>{a.label}</b>{!!Number(a.is_default) && <span>Principal</span>}</div><p>{a.address}<br />{a.postal_code} {a.city}</p><div className="row-actions"><button className="text-link" onClick={() => { setEditing(a); setError(''); }}><Pencil size={12} />Editar</button><button className="icon-btn danger-text" aria-label={`Eliminar morada ${a.label}`} onClick={() => remove(a.id)}><Trash2 size={13} /></button></div></div>)}{!items.length && <p className="small muted">Guarda uma morada para tornar a próxima compra mais simples.</p>}
    {editing && <Modal title={editing.id ? 'Editar morada' : 'Nova morada'} onClose={() => { if (!busy) setEditing(null); }}><form className="form-stack" onSubmit={save}><Field label="Nome desta morada" name="label" defaultValue={editing.label || 'Casa'} required maxLength={60} /><Field label="Destinatário" name="shipping_name" defaultValue={editing.shipping_name} required minLength={2} maxLength={100} /><Field label="Morada" name="address" defaultValue={editing.address} required minLength={5} maxLength={255} /><div className="form-row"><Field label="Código postal" name="postal_code" defaultValue={editing.postal_code} required pattern="[0-9]{4}-[0-9]{3}" /><Field label="Localidade" name="city" defaultValue={editing.city} required minLength={2} maxLength={100} /></div><Field label="Telefone" name="phone" defaultValue={editing.phone} required minLength={9} maxLength={20} /><label className="checkbox-label"><input type="checkbox" name="is_default" defaultChecked={!!Number(editing.is_default)} />Usar como morada principal</label><ErrorNotice message={error} /><Button type="submit" busy={busy}>Guardar morada</Button></form></Modal>}
  </section>;
}

export function RestockList() {
  const [items, setItems] = useState([]); const [error, setError] = useState('');
  useEffect(() => { api('/restock').then(setItems).catch(e => setError(e.message)); }, []);
  async function remove(id) { try { await api(`/restock/${id}`, { method: 'DELETE' }); setItems(rows => rows.filter(x => x.id !== id)); } catch (e) { setError(e.message); } }
  if (!items.length && !error) return null;
  return <section className="customer-panel"><div className="customer-panel-title"><BellRing size={17} /><h3>Avisos de reposição</h3></div><ErrorNotice message={error} />{items.map(item => <div className="restock-item" key={item.id}><img src={item.image} alt="" /><div><b>{item.name}</b><small>{item.label}</small></div><button className="icon-btn" aria-label={`Cancelar aviso de ${item.name}`} onClick={() => remove(item.id)}><Trash2 size={13} /></button></div>)}</section>;
}

export function OrderTools({ order }) {
  const [open, setOpen] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const { notify, refreshNotifications, refreshCatalog } = useStore();
  const changed = () => { window.dispatchEvent(new Event('forma:orders-changed')); refreshNotifications(); refreshCatalog(); };
  async function download() { setBusy(true); try { await downloadReceipt(order.id); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function payment(e) {
    e.preventDefault(); setBusy(true); setError(''); const outcome = new FormData(e.currentTarget).get('outcome');
    try { const result = await api(`/orders/${order.id}/payment`, { method: 'POST', data: { outcome, request_key: crypto.randomUUID() } }); setOpen(null); notify(`Pagamento de teste: ${paymentLabels[result.payment_status].toLowerCase()}.`); changed(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function cancel() { setBusy(true); setError(''); try { await api(`/orders/${order.id}/cancel`, { method: 'POST', data: {} }); setOpen(null); changed(); notify('Encomenda cancelada.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <><div className="order-payment-summary"><span className={`payment-badge payment-${order.payment_status}`}><CreditCard size={13} />{paymentLabels[order.payment_status] || '—'} <small>TESTE</small></span><span>{order.shipping_method === 'express' ? 'Entrega expresso' : 'Entrega standard'}</span>{Number(order.discount_cents) > 0 && <span>{order.coupon_code}: −{money(order.discount_cents)}</span>}</div><div className="order-tools"><button className="text-link" onClick={download} disabled={busy}><ArrowDownToLine size={14} />Comprovativo PDF</button>{order.status === 'pending' && <>{!['paid', 'refunded'].includes(order.payment_status) && <button className="text-link" onClick={() => { setOpen('payment'); setError(''); }}><CreditCard size={14} />Resolver pagamento</button>}<button className="text-link danger-text" onClick={() => { setOpen('cancel'); setError(''); }}>Cancelar encomenda</button></>}</div>{!open && <ErrorNotice message={error} />}
    {open && <Modal title={open === 'payment' ? 'Simular pagamento' : 'Cancelar encomenda?'} onClose={() => { if (!busy) setOpen(null); }}><ErrorNotice message={error} />{open === 'payment' ? <form className="form-stack" onSubmit={payment}><p className="muted small">Este simulador não recolhe dados bancários nem efetua cobranças. Total: {money(order.total_cents)}.</p><Field label="Resultado de teste"><select name="outcome"><option value="approved">Aprovado</option><option value="refused">Recusado</option><option value="pending">Pendente</option></select></Field>{order.payments?.length > 0 && <div className="payment-history">{order.payments.map(p => <div key={p.id}><span>{({ approved: 'Aprovado', refused: 'Recusado', pending: 'Pendente', refunded: 'Reembolso' })[p.outcome]}</span><time>{date(p.created_at)}</time></div>)}</div>}<Button type="submit" busy={busy}>Simular resultado</Button></form> : <><p className="muted small mb-5">A encomenda #{order.id} será cancelada e o stock reposto. Se o pagamento de teste foi aprovado, será registado um reembolso simulado.</p><Button variant="danger" busy={busy} onClick={cancel}>Confirmar cancelamento</Button></>}</Modal>}
  </>;
}
