import { ProductGallery } from './improvements';
import { CompareButton } from './experience';
import { useEffect, useState } from 'react';
import { ArrowRight, BellRing, Heart, Leaf, ShoppingBag, Star, Trash2, Upload } from 'lucide-react';
import { api, date, money } from './api';
import { useStore } from './context';
import { Button, Empty, ErrorNotice, Loading, Modal } from './ui';

export function ProductDetail({ product, onClose }) {
  const { addToCart, favorites, toggleFavorite, user, setAuthMode, notify } = useStore();
  const [id, setId] = useState(product.id); const [fresh, setFresh] = useState(null); const [selected, setSelected] = useState('');
  const [related, setRelated] = useState([]); const [error, setError] = useState(''); const [watching, setWatching] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setFresh(null); setError('');
    Promise.all([api(`/products/${id}`, { signal: controller.signal }), api(`/products/${id}/related`, { signal: controller.signal })]).then(([p, suggestions]) => { setFresh(p); setSelected(String(p.variants[0]?.id || '')); setRelated(suggestions); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [id]);
  const variant = fresh?.variants.find(v => String(v.id) === selected);
  async function watch() {
    if (!user) { onClose(); setAuthMode('login'); notify('Entra na tua conta para pedir um aviso de reposição.'); return; }
    setWatching(true);
    try { const result = await api('/restock', { method: 'POST', data: { variant_id: variant.id } }); notify(result.message); } catch (e) { setError(e.message); } finally { setWatching(false); }
  }
  return <Modal title="Um olhar mais próximo" wide onClose={onClose} className="product-details-modal"><ErrorNotice message={error} />{!fresh ? !error && <Loading /> : <>
    <div className="product-detail"><ProductGallery product={fresh} variant={variant}/><div className="detail-copy"><span className="eyebrow">{fresh.category_name} / COLEÇÃO ESSENCIAL</span><h3>{fresh.name}</h3><span className="detail-price">{money(variant?.price_cents ?? fresh.price_cents)}</span>{fresh.review_count > 0 && <div className="product-rating"><Star size={15} fill="currentColor" />{fresh.rating} <span>({fresh.review_count} avaliações)</span></div>}<p className="detail-description">{fresh.description}</p><CompareButton product={fresh}/>
      {fresh.variants.length > 1 && <div className="variant-selector"><span>Escolhe a tua opção</span><div>{fresh.variants.map(v => <button key={v.id} className={selected === String(v.id) ? 'selected' : ''} aria-pressed={selected === String(v.id)} onClick={() => { setSelected(String(v.id)); setError(''); }}><b>{v.label}</b><small>{[v.color, v.size].filter(Boolean).join(' · ') || v.material}</small><span>{money(v.price_cents)}{!Number(v.stock) && ' · Esgotado'}</span></button>)}</div></div>}
      <div className="detail-property"><span>Material</span><b>{variant?.material || fresh.material || '—'}</b></div>{fresh.dimensions && <div className="detail-property"><span>Dimensões</span><b>{fresh.dimensions}</b></div>}<div className="detail-property"><span>Disponibilidade</span><b>{Number(variant?.stock) > 0 ? `${variant.stock} unidades em stock` : 'Temporariamente esgotado'}</b></div>
      {Number(variant?.stock) > 0 ? <Button className="w-full" onClick={() => addToCart({ ...fresh, variant_id: variant.id, variant_label: variant.label, price_cents: variant.price_cents, stock: variant.stock, image: variant.image })}><ShoppingBag size={18} />Adicionar ao carrinho</Button> : <Button className="w-full" variant="secondary" busy={watching} disabled={!variant} onClick={watch}><BellRing size={17} />Avisar quando voltar</Button>}
      <button className="save-detail" onClick={() => toggleFavorite(fresh.id)}><Heart size={16} fill={favorites.includes(Number(fresh.id)) ? 'currentColor' : 'none'} />{favorites.includes(Number(fresh.id)) ? 'Guardado nos favoritos' : 'Guardar para mais tarde'}</button><div className="detail-perks"><span><Leaf size={16} />Design para ficar · Preços com IVA incluído</span></div>
    </div></div>
    <Reviews key={fresh.id} productId={fresh.id} />
    {related.length > 0 && <section className="related-section"><div><span className="eyebrow">PEÇAS QUE CONVERSAM ENTRE SI</span><h3>Também pode fazer parte da tua casa.</h3></div><div className="related-grid">{related.map(p => <button key={p.id} onClick={() => { setId(p.id); document.querySelector('.product-details-modal')?.scrollTo({ top: 0, behavior: 'smooth' }); }}><img src={p.image} alt={p.name} loading="lazy" /><b>{p.name}</b><span>{money(p.price_cents)}<ArrowRight size={14} /></span></button>)}</div></section>}
  </>}</Modal>;
}

function Reviews({ productId }) {
  const { user, notify, refreshCatalog } = useStore();
  const [data, setData] = useState(null); const [version, setVersion] = useState(0); const [error, setError] = useState('');
  const [rating, setRating] = useState(5); const [comment, setComment] = useState(''); const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false); const [editing, setEditing] = useState(false);
  useEffect(() => { let alive = true; api(`/products/${productId}/reviews`).then(result => { if (!alive) return; setData(result); if (result.mine) { setRating(Number(result.mine.rating)); setComment(result.mine.comment); setPhotos(result.mine.photos || result.items.find(r => r.id === result.mine.id)?.photos || []); } }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [productId, user?.id, version]);
  async function upload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError('');
    try { const payload = new FormData(); payload.append('file', file); payload.append('product_id', productId); const result = await api('/reviews/upload', { method: 'POST', data: payload }); setPhotos(p => [...p, result.path].slice(0, 3)); } catch (e) { setError(e.message); } finally { setUploading(false); }
  }
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { await api(`/products/${productId}/reviews`, { method: 'POST', data: { rating, comment, photos } }); setEditing(false); setVersion(v => v + 1); refreshCatalog(); notify('A tua avaliação foi guardada.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function remove() { setBusy(true); try { await api(`/reviews/${data.mine.id}`, { method: 'DELETE' }); setComment(''); setPhotos([]); setVersion(v => v + 1); refreshCatalog(); notify('Avaliação eliminada.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <section className="reviews-section"><div className="reviews-heading"><div><span className="eyebrow">EXPERIÊNCIAS REAIS, COMPRAS VERIFICADAS</span><h3>O que dizem os nossos clientes</h3></div>{data?.can_review && <Button variant="secondary" onClick={() => setEditing(!editing)}>{data.mine ? 'Editar a minha avaliação' : 'Escrever avaliação'}</Button>}</div><ErrorNotice message={error} />
    {editing && data?.can_review && <form className="review-form" onSubmit={submit}><fieldset><legend>A tua classificação</legend><div className="star-picker">{[1, 2, 3, 4, 5].map(n => <label key={n}><input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} aria-label={`${n} estrela${n === 1 ? '' : 's'}`} /><Star size={24} fill={n <= rating ? 'currentColor' : 'none'} /></label>)}</div></fieldset><label className="field"><span>A tua experiência</span><textarea aria-label="A tua experiência" value={comment} onChange={e => setComment(e.target.value)} required minLength={10} maxLength={2000} rows={3} /></label><div className="review-photos">{photos.map(path => <div key={path}><img src={path} alt="Fotografia para avaliação" /><button type="button" aria-label="Remover fotografia" onClick={() => setPhotos(p => p.filter(x => x !== path))}><Trash2 size={13} /></button></div>)}{photos.length < 3 && <label className="review-upload"><Upload size={17} /><span>{uploading ? 'A carregar…' : 'Adicionar foto'}</span><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Fotografia da avaliação" onChange={upload} disabled={uploading} /></label>}</div><div className="modal-actions">{data.mine && <Button variant="secondary" type="button" disabled={busy} onClick={remove}>Eliminar avaliação</Button>}<Button type="submit" busy={busy} disabled={uploading}>Guardar avaliação</Button></div></form>}
    {!data ? <Loading /> : data.items.length ? <div className="review-list">{data.items.map(r => <article key={r.id}><div><b>{r.customer_name}</b><span className="verified-purchase">Compra verificada</span><time>{date(r.created_at)}</time></div><span className="review-stars" aria-label={`${r.rating} em 5 estrelas`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={13} fill={n <= r.rating ? 'currentColor' : 'none'} />)}</span><p>{r.comment}</p>{r.photos.length > 0 && <div className="review-photo-gallery">{r.photos.map(path => <a href={path} target="_blank" rel="noreferrer" key={path}><img src={path} alt={`Fotografia de ${r.customer_name}`} loading="lazy" /></a>)}</div>}</article>)}</div> : <p className="review-empty">Ainda não há avaliações. Depois de receberes a tua encomenda, podes partilhar a tua experiência.</p>}
  </section>;
}
