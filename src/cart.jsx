import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Minus, Plus, ShoppingBag, Trash2, Truck, ShieldCheck } from 'lucide-react';
import { api, money } from './api';
import { cartKey, useStore } from './context';
import { Button, Field, Modal, Empty, ErrorNotice, Loading } from './ui';

export function CartDrawer({ onCheckout }) {
  const { cart, setCart, setCartOpen, user, setAuthMode, setCheckoutIntent } = useStore();
  const total = cart.reduce((sum, p) => sum + Number(p.price_cents) * p.quantity, 0);
  const quantity = (id, step) => setCart(items => items.map(p => cartKey(p) === id ? { ...p, quantity: Math.max(1, Math.min(99, Number(p.stock), p.quantity + step)) } : p));
  return <Modal title={`O teu carrinho (${cart.reduce((sum, p) => sum + p.quantity, 0)})`} drawer onClose={() => setCartOpen(false)}>
    {cart.length ? <>
      <div className="shipping-progress"><p>{total >= 7500 ? <><Check size={16} /> Já tens portes grátis!</> : <>Faltam <b>{money(7500 - total)}</b> para portes grátis.</>}</p><div><span style={{ width: `${Math.min(total / 7500 * 100, 100)}%` }} /></div></div>
      <div className="cart-items">{cart.map(p => <div className="cart-item" key={cartKey(p)}>
        <img src={p.image} alt={p.name} /><div className="cart-item-body"><span className="eyebrow">{p.category_name}</span><h3>{p.name}</h3><span className="muted small">{p.variant_label && p.variant_label !== 'Padrão' ? p.variant_label : p.material}</span><div className="cart-item-bottom"><div className="quantity-picker"><button onClick={() => quantity(cartKey(p), -1)} disabled={p.quantity <= 1} aria-label={`Diminuir ${p.name}`}><Minus size={14} /></button><span>{p.quantity}</span><button onClick={() => quantity(cartKey(p), 1)} disabled={p.quantity >= Math.min(99, Number(p.stock))} aria-label={`Aumentar ${p.name}`}><Plus size={14} /></button></div><b>{money(p.price_cents * p.quantity)}</b></div></div><button className="remove-item" aria-label={`Remover ${p.name}`} onClick={() => setCart(items => items.filter(x => cartKey(x) !== cartKey(p)))}><Trash2 size={16} /></button>
      </div>)}</div>
      <div className="cart-summary"><div><span>Subtotal</span><b>{money(total)}</b></div><div><span>Portes</span><span>{total >= 7500 ? 'Grátis' : money(490)}</span></div><div className="cart-total"><span>Total estimado</span><b>{money(total + (total >= 7500 ? 0 : 490))}</b></div><p className="small muted">IVA incluído. Entrega em Portugal continental.</p><Button className="w-full" onClick={() => { setCartOpen(false); if (!user) { setCheckoutIntent(true); setAuthMode('login'); } else onCheckout(); }}>{user ? 'Finalizar encomenda' : 'Entrar para finalizar'}<ArrowRight size={18} /></Button><p className="small text-center muted mt-3">Loja de demonstração · sem pagamentos reais</p></div>
    </> : <Empty title="Há espaço para algo especial." icon={ShoppingBag} action={<Button onClick={() => setCartOpen(false)}>Explorar a coleção<ArrowRight size={16} /></Button>}>Adiciona os teus essenciais e dá uma nova forma à tua casa.</Empty>}
  </Modal>;
}

export { Checkout } from './checkout';
