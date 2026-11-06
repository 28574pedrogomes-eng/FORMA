import { SearchSuggestions } from './improvements';
import { PriceAlertButton } from './price-alerts';
import { CollectionDiscovery } from './collection-discovery';
import { CinematicIntro } from './cinematic-intro';
import { CompareButton, ShareFavorites } from './experience';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowDownRight, ArrowRight, Check, ChevronDown, Heart, Leaf, Minus, Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles, Truck, X } from 'lucide-react';
import { api, money } from './api';
import { useStore } from './context';
import { ArrowLink, Button, Empty, ErrorNotice, Loading, Modal } from './ui';

export function ProductCard({ product, onOpen, index = 0 }) {
  const { addToCart, favorites, toggleFavorite } = useStore();
  const saved = favorites.includes(Number(product.id));
  function onPointer(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  }
  return <article className="product-card" style={{ '--delay': `${index % 4 * 65}ms` }} onPointerMove={onPointer}>
    <div className="product-image-wrap">
      <button className="product-image-button" onClick={() => onOpen(product)} aria-label={`Ver ${product.name}`}><img src={product.image} alt={product.name} loading="lazy" /></button>
      {product.badge && <span className={`product-badge ${product.badge === 'Novidade' ? 'badge-green' : ''}`}>{product.badge}</span>}
      <button className={`favorite-button ${saved ? 'is-favorite' : ''}`} onClick={() => toggleFavorite(product.id)} aria-label={saved ? `Remover ${product.name} dos favoritos` : `Guardar ${product.name} nos favoritos`} aria-pressed={saved}><Heart size={18} fill={saved ? 'currentColor' : 'none'} strokeWidth={1.5} /></button>
      <button className="quick-add" onClick={() => product.variant_count > 1 ? onOpen(product) : addToCart(product)} disabled={!Number(product.stock)}><Plus size={17} />{Number(product.stock) ? product.variant_count > 1 ? 'Escolher opções' : 'Adicionar ao carrinho' : 'Esgotado'}</button>
    </div>
    <div className="product-meta"><span>{product.category_name}</span><span>{product.material}</span></div>
    <div className="product-title-row"><button onClick={() => onOpen(product)}><h3>{product.name}</h3></button><span>{product.variant_count > 1 && <small>Desde </small>}{money(product.price_cents)}</span></div>
    <div className={`product-swatches ${Number(product.stock) ? '' : 'out-of-stock'}`} aria-label="Disponibilidade"><i /><span>{Number(product.stock) ? 'Em stock' : 'Esgotado'}</span>{Number(product.stock) > 0 && Number(product.stock) <= 5 && <small>Últimas unidades</small>}</div>
    <CompareButton product={product}/>
    {saved && <PriceAlertButton product={product}/>}
  </article>;
}

export { ProductDetail } from './product-detail';

export function Shop({ favoritesOnly = false, newest = false, onProduct }) {
  const { catalogVersion, favorites } = useStore();
  const [categories, setCategories] = useState([]); const [category, setCategory] = useState('');
  const [search, setSearch] = useState(''); const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState('featured'); const [inStock, setInStock] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1); const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const catalog = useRef(null);
  const categoryTabs = useRef(null);
  useEffect(() => {
    const row = categoryTabs.current; const active = row?.querySelector('button.active');
    if (active) row.scrollTo({ left: Math.max(0, active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2), behavior: 'instant' });
  }, [category, categories]);
  const scrollCatalog = () => {
    catalog.current?.focus({ preventScroll: true });
    catalog.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  };
  useEffect(() => { if (newest) { setSort('newest'); setPage(1); scrollCatalog(); } }, [newest]);
  useEffect(() => { const timer = setTimeout(() => { setDebounced(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { api('/categories').then(setCategories).catch(() => {}); }, [catalogVersion, retry]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const request = favoritesOnly ? Promise.all(favorites.map(id => api(`/products/${id}`, { signal: controller.signal }).catch(e => { if (e.status === 404) return null; throw e; }))).then(items => ({ items: items.filter(Boolean), total: items.filter(Boolean).length, pages: 1 })) : api('/products', { params: { category, search: debounced, sort, in_stock: inStock ? 1 : '', max_price: maxPrice ? Math.round(Number(maxPrice) * 100) : '', page }, signal: controller.signal });
    request.then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [category, debounced, sort, inStock, maxPrice, page, catalogVersion, favoritesOnly, favorites, retry]);
  const resetFilters = () => { setCategory(''); setSearch(''); setMaxPrice(''); setInStock(false); setSort('featured'); setPage(1); };
  return <>
    <div className="shop-intro">
      {!favoritesOnly && <CinematicIntro onProduct={onProduct} onExplore={scrollCatalog} />}
      <div className={favoritesOnly ? undefined : 'cinematic-handoff'}>
      {!favoritesOnly && <section className="trust-strip" aria-label="Vantagens da FORMA"><div><Truck size={21} strokeWidth={1.4} /><span>Portes grátis <b>a partir de 75 €</b></span></div><div><Leaf size={21} strokeWidth={1.4} /><span>Materiais naturais. <b>Escolhas conscientes.</b></span></div><div><Sparkles size={21} strokeWidth={1.4} /><span>Design intemporal <b>para o dia a dia</b></span></div></section>}
      {!favoritesOnly && <CollectionDiscovery categories={categories} onSelect={id => { setCategory(id); setSearch(''); setMaxPrice(''); setInStock(false); setPage(1); scrollCatalog(); }}/>}
    <section className={`catalog-section container ${favoritesOnly ? 'favorites-section' : ''}`} id="collection" ref={catalog} tabIndex={-1}>
      <div className="section-intro"><div><span className="eyebrow">{favoritesOnly ? 'A TUA SELEÇÃO PESSOAL' : 'ESCOLHIDOS PARA A TUA CASA'}</span><h2>{favoritesOnly ? <>Os teus <em>favoritos.</em></> : <>Pequenos detalhes.<br className="mobile-only" /> <em>Grandes diferenças.</em></>}</h2></div>{!favoritesOnly && <span className="section-aside">Boa forma. Boa função.<br />Uma casa mais tua.</span>}</div>
      {favoritesOnly && <><ShareFavorites/><div className="price-alert-intro"><Heart size={19}/><div><b>As peças de que gostas, ao preço certo.</b><p>Ativa o sino em cada favorito para receberes uma notificação quando atingir um novo preço mínimo. Remover o favorito também desativa o alerta.</p></div></div></>}
      {!favoritesOnly && <><div className="catalog-toolbar"><div className="category-tabs" ref={categoryTabs} role="group" aria-label="Categorias"><button className={!category ? 'active' : ''} onClick={() => { setCategory(''); setPage(1); }}>Todos os produtos</button>{categories.map(c => <button key={c.id} className={String(category) === String(c.id) ? 'active' : ''} onClick={() => { setCategory(c.id); setPage(1); }}>{c.name}</button>)}</div><button className={`filter-toggle ${filtersOpen ? 'active' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} />Filtros{(inStock || maxPrice) && <i />}</button></div>
      <div className="catalog-search-row"><SearchSuggestions value={search} onChange={setSearch} onProduct={onProduct}/><div className="catalog-sort"><span>{loading ? 'A procurar…' : `${data.total} peças`}</span><label><span className="sr-only">Ordenar produtos</span><select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="featured">Em destaque</option><option value="newest">Mais recentes</option><option value="price_asc">Preço: menor primeiro</option><option value="price_desc">Preço: maior primeiro</option></select></label></div></div>
      {filtersOpen && <div className="filter-panel"><label className="checkbox-label"><input type="checkbox" checked={inStock} onChange={e => { setInStock(e.target.checked); setPage(1); }} />Apenas em stock</label><label>Preço máximo (€)<input type="number" min="0" max="1000000" placeholder="Sem limite" value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1); }} /></label><button className="text-link" onClick={resetFilters}>Limpar filtros</button></div>}</>}
      {error ? <ErrorNotice message={error} retry={() => setRetry(x => x + 1)} /> : loading ? <div className="product-grid" aria-label="A carregar produtos" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <div className="product-skeleton" key={i}><div /><span /><span /></div>)}</div> : data.items.length ? <div className="product-grid">{data.items.map((p, i) => <ProductCard key={p.id} product={p} onOpen={onProduct} index={i} />)}</div> : <Empty title={favoritesOnly ? 'Guarda aquilo de que gostas.' : 'Ainda não encontrámos essa peça.'} icon={favoritesOnly ? Heart : Search} action={<Button variant="secondary" onClick={favoritesOnly ? () => { location.hash = ''; } : resetFilters}>{favoritesOnly ? 'Explorar a coleção' : 'Limpar filtros'}<ArrowRight size={17} /></Button>}>{favoritesOnly ? 'Toca no coração de um produto para o guardares aqui.' : 'Experimenta outra pesquisa ou ajusta os filtros.'}</Empty>}
      {data.pages > 1 && !loading && !error && <div className="pagination"><Button variant="secondary" disabled={page <= 1} onClick={() => { setPage(p => p - 1); scrollCatalog(); }}>Anterior</Button><span>{page} / {data.pages}</span><Button variant="secondary" disabled={page >= data.pages} onClick={() => { setPage(p => p + 1); scrollCatalog(); }}>Seguinte</Button></div>}
      {!favoritesOnly && <div className="bundle-teaser"><img src="images/hero-evening.jpg" alt="Uma sala com luz suave e texturas naturais" loading="lazy"/><div><span className="eyebrow">MELHOR EM CONJUNTO</span><h2>Peças que<br/><em>se completam.</em></h2><p>A luz certa. Uma textura nova. Um canto só teu. Descobre combinações que fazem sentido juntas.</p><a className="btn btn-primary" href="#bundles">Explorar conjuntos <ArrowRight size={18}/></a></div></div>}
      {!favoritesOnly && <div className="catalog-bottom"><span>Feito para fazer parte da tua vida.</span><span>COM INTENÇÃO, SEM EXCESSO <ArrowDownRight size={16} /></span></div>}
    </section>
      </div>
    </div>
    {!favoritesOnly && <>
      <section className="story-section container" id="philosophy"><div className="story-photo"><img src="images/story.jpg" loading="lazy" alt="Interior sereno com peças de design natural" /><span>MAIS DO QUE OBJETOS. UM MODO DE ESTAR.</span></div><div className="story-copy"><span className="eyebrow">A NOSSA FORMA DE VER</span><h2>Uma casa não se enche.<br /><em>Constrói-se aos poucos.</em></h2><p>Acreditamos nas peças que ficam. Nas texturas que apetece tocar. Nos detalhes simples que transformam um espaço num lugar onde queremos estar.</p><p>A FORMA é uma seleção cuidada de objetos para viver melhor — um pequeno detalhe de cada vez.</p><ArrowLink onClick={scrollCatalog}>Encontra a tua próxima peça</ArrowLink><div className="story-signature">Com tempo. Com intenção. <span>Com forma.</span></div></div></section>
      <section className="closing-note container"><div className="closing-mark">f.</div><span className="eyebrow">O MELHOR LUGAR DO MUNDO</span><h2>Pode ser a tua <em>casa.</em></h2><p>Inspira-te. Escolhe com calma. Faz espaço para o que importa.</p><Button variant="secondary" onClick={scrollCatalog}>Descobrir os essenciais<ArrowRight size={18} /></Button></section>
    </>}
  </>;
}
function ArrowUpRightIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 18 18 6M6 6h12v12" /></svg>; }
