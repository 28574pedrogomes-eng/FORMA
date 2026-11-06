import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, loadLocal, saveLocal } from './api';
import { Toast } from './ui';

const Store = createContext(null);
export const useStore = () => useContext(Store);
export const cartKey = p => `${p.id}:${p.variant_id ?? p.default_variant_id ?? 0}`;
export function StoreProvider({ children }) {
  const [user, setUser] = useState(null);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [priceAlertsLoading, setPriceAlertsLoading] = useState(false);
  const [priceAlertPending, setPriceAlertPending] = useState([]);
  const priceAlertRequests = useRef(new Set());
  const [sessionLoading, setSessionLoading] = useState(true); const [sessionError, setSessionError] = useState('');
  const [cart, setCart] = useState(() => { const saved = loadLocal('forma:cart', []); return Array.isArray(saved) ? saved.filter(p => p && Number.isInteger(p.quantity) && p.quantity > 0 && p.id).slice(0, 50) : []; });
  const [favorites, setFavorites] = useState(() => { const saved = loadLocal('forma:favorites', []); return Array.isArray(saved) ? saved.filter(Number.isInteger) : []; });
  const [comparison,setComparison] = useState(()=>{const ids=loadLocal('forma:comparison',[]);return Array.isArray(ids)?ids.filter(Number.isInteger).slice(0,4):[];});
  useEffect(()=>saveLocal('forma:comparison',comparison),[comparison]);
  const toggleCompare=id=>{id=Number(id);if(!comparison.includes(id)&&comparison.length>=4){notify('Podes comparar até quatro produtos.');return;}setComparison(ids=>ids.includes(id)?ids.filter(i=>i!==id):[...ids,id]);};
  const clearCompare=()=>setComparison([]);
  const cartRef=useRef(cart); cartRef.current=cart;
  const bundlePending=useRef(false);
  async function addBundle(bundle) {
    if(bundlePending.current)return;
    bundlePending.current=true; const original=cartRef.current;
    try {
      // Recalculate every line on the server before replacing the cart atomically.
      const desired=[...cart.map(p=>({product_id:p.id,variant_id:p.variant_id??p.default_variant_id,quantity:p.quantity})),...bundle.items.map(p=>({product_id:p.id,variant_id:p.variant_id,quantity:Number(p.quantity)}))];
      const quote=await api('/cart/quote',{method:'POST',data:{items:desired}});
      if(cartRef.current!==original)throw new Error('O carrinho mudou. Volta a adicionar o conjunto.');
      setCart(quote.items.map(p=>({...p,id:p.product_id})));notify('Conjunto adicionado ao carrinho.');setCartOpen(true);
    }catch(e){notify(e.message);}finally{bundlePending.current=false;}
  }
  const [favoriteSync, setFavoriteSync] = useState(false); const favoritePending = useRef(new Set());
  const [toast, setToast] = useState(''); const toastTimer = useRef();
  const [authMode, setAuthMode] = useState(null); const [checkoutIntent, setCheckoutIntent] = useState(false);
  const [cartOpen, setCartOpen] = useState(false); const [notifications, setNotifications] = useState([]);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const refreshCatalog = () => setCatalogVersion(v => v + 1);
  useEffect(() => {
    setPriceAlerts([]);
    if (!user) { setPriceAlertsLoading(false); return; }
    const controller = new AbortController(); setPriceAlertsLoading(true);
    api('/price-alerts', { signal: controller.signal }).then(rows => { if (!controller.signal.aborted) setPriceAlerts(rows); }).catch(e => { if (e.name !== 'AbortError') notify(e.message); }).finally(() => { if (!controller.signal.aborted) setPriceAlertsLoading(false); });
    return () => controller.abort();
  }, [user?.id, catalogVersion]);
  async function togglePriceAlert(id) {
    if (!user) { setAuthMode('login'); return; }
    id = Number(id);
    if (priceAlertsLoading || favoriteSync || priceAlertRequests.current.has(id)) return;
    const enabled = priceAlerts.some(row => Number(row.product_id) === id);
    priceAlertRequests.current.add(id); setPriceAlertPending([...priceAlertRequests.current]);
    try {
      await api(`/price-alerts/${id}`, { method: enabled ? 'DELETE' : 'PUT' });
      setPriceAlerts(await api('/price-alerts'));
      notify(enabled ? 'Alerta de preço desativado.' : 'Vamos avisar-te nas notificações quando o preço baixar.');
    } catch (e) { notify(e.message); }
    finally { priceAlertRequests.current.delete(id); setPriceAlertPending([...priceAlertRequests.current]); }
  }
  const notify = message => { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(''), 3500); };
  async function refreshSession() {
    setSessionLoading(true); setSessionError('');
    try { const data = await api('/session'); setUser(data.user); } catch (e) { setSessionError(e.message); } finally { setSessionLoading(false); }
  }
  async function refreshNotifications() { try { setNotifications(await api('/notifications')); } catch { /* Tentar novamente na próxima atualização. */ } }
  useEffect(() => { refreshSession(); const expired = () => { setUser(null); setNotifications([]); }; window.addEventListener('forma:session-expired', expired); return () => { window.removeEventListener('forma:session-expired', expired); clearTimeout(toastTimer.current); }; }, []);
  useEffect(() => { saveLocal('forma:cart', cart); }, [cart]);
  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    if (!user) { const saved = loadLocal('forma:favorites', []); setFavorites(Array.isArray(saved) ? saved.filter(Number.isInteger).slice(0, 200) : []); setFavoriteSync(false); return; }
    setFavoriteSync(true); const guest = loadLocal('forma:favorites', []);
    const sync = Array.isArray(guest) && guest.length ? api('/favorites/merge', { method: 'POST', data: { ids: guest.slice(0, 200) } }) : api('/favorites');
    sync.then(ids => { if (alive) { setFavorites(ids); saveLocal('forma:favorites', []); } }).catch(e => { if (alive) notify(e.message); }).finally(() => { if (alive) setFavoriteSync(false); });
    const focus = () => { if (!favoritePending.current.size) api('/favorites').then(ids => { if (alive) setFavorites(ids); }).catch(() => {}); };
    window.addEventListener('focus', focus);
    return () => { alive = false; window.removeEventListener('focus', focus); };
  }, [user?.id, sessionLoading]);
  useEffect(() => { if (!user) { setNotifications([]); return; } refreshNotifications(); const interval = setInterval(refreshNotifications, 45000); return () => clearInterval(interval); }, [user?.id]);
  const addToCart = product => {
    const entry = { ...product, variant_id: product.variant_id ?? product.default_variant_id ?? null };
    const key = cartKey(entry); const current = cart.find(p => cartKey(p) === key);
    if ((current?.quantity || 0) >= Math.min(99, Number(entry.stock))) { notify('Já atingiste o stock disponível desta opção.'); return; }
    if (!current && cart.length >= 50) { notify('O carrinho pode ter até 50 opções diferentes.'); return; }
    setCart(items => current ? items.map(p => cartKey(p) === key ? { ...entry, quantity: p.quantity + 1 } : p) : [...items, { ...entry, quantity: 1 }]);
    notify(`${product.name} adicionado ao carrinho.`);
  };
  async function toggleFavorite(id) {
    id = Number(id); if (favoriteSync || favoritePending.current.has(id)) return;
    const wasSaved = favorites.includes(id);
    if (!wasSaved && favorites.length >= 200) { notify('Podes guardar até 200 favoritos.'); return; }
    const next = wasSaved ? favorites.filter(x => x !== id) : [...favorites, id]; setFavorites(next);
    if (!user) { saveLocal('forma:favorites', next); return; }
    favoritePending.current.add(id);
    try { await api(`/favorites/${id}`, { method: wasSaved ? 'DELETE' : 'PUT', data: {} }); if (wasSaved) setPriceAlerts(rows => rows.filter(row => Number(row.product_id) !== id)); }
    catch (e) { setFavorites(items => wasSaved ? [...new Set([...items, id])] : items.filter(x => x !== id)); notify(e.message); }
    finally { favoritePending.current.delete(id); }
  }
  const logout = async () => { try { await api('/auth/logout', { method: 'POST', data: {} }); setUser(null); notify('Sessão terminada. Até já!'); location.hash = ''; } catch (e) { notify(e.message); } };
  return <Store.Provider value={{ user, setUser, sessionLoading, sessionError, refreshSession, cart, setCart, addToCart, addBundle, comparison, toggleCompare, clearCompare, favorites, toggleFavorite, favoriteSync, priceAlerts, priceAlertsLoading, priceAlertPending, togglePriceAlert, notify, authMode, setAuthMode, checkoutIntent, setCheckoutIntent, cartOpen, setCartOpen, notifications, refreshNotifications, logout, catalogVersion, refreshCatalog }}>{children}<Toast message={toast} /></Store.Provider>;
}
