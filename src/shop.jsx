import { SearchSuggestions } from './improvements';
import { PriceAlertButton } from './price-alerts';
import { CollectionDiscovery } from './collection-discovery';
import { CinematicIntro } from './cinematic-intro';
import { CompareButton, ShareFavorites } from './experience';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowDownRight, ArrowRight, Check, ChevronDown, Heart, ImageUp, Leaf, Minus, Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles, Truck, X } from 'lucide-react';
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

function averageImageColor(source) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 12;
        const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, 12, 12);
        const pixels = context.getImageData(0, 0, 12, 12).data; let r=0,g=0,b=0,n=0;
        for(let i=0;i<pixels.length;i+=4) if(pixels[i+3]>180 && Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])<150){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];n++;}
        resolve(n ? [r/n,g/n,b/n] : [128,128,128]);
      } catch { resolve([128,128,128]); }
    };
    image.onerror = reject; image.src = source;
  });
}

export function Shop({ favoritesOnly = false, newest = false, onProduct }) {
  const { catalogVersion, favorites } = useStore();
  const [categories, setCategories] = useState([]); const [category, setCategory] = useState('');
  const [search, setSearch] = useState(''); const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState('featured'); const [inStock, setInStock] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); const [maxPrice, setMaxPrice] = useState('');
  const [minPrice, setMinPrice] = useState(''); const [material, setMaterial] = useState(''); const [color, setColor] = useState(''); const [maxWidth,setMaxWidth]=useState(''); const [maxDepth,setMaxDepth]=useState('');
  const [facets, setFacets] = useState({ materials: [], colors: [] }); const [repairable, setRepairable] = useState(false);
  const [visualMatches, setVisualMatches] = useState(null); const [visualBusy, setVisualBusy] = useState(false); const [visualError, setVisualError] = useState('');
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
  useEffect(() => { api('/catalog-facets').then(setFacets).catch(() => {}); }, [catalogVersion, retry]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const request = favoritesOnly ? Promise.all(favorites.map(id => api(`/products/${id}`, { signal: controller.signal }).catch(e => { if (e.status === 404) return null; throw e; }))).then(items => ({ items: items.filter(Boolean), total: items.filter(Boolean).length, pages: 1 })) : visualMatches ? Promise.resolve({items:visualMatches,total:visualMatches.length,pages:1,page:1}) : api('/products', { params: { category, search: debounced, sort, in_stock: inStock ? 1 : '', max_price: maxPrice ? Math.round(Number(maxPrice) * 100) : '', min_price: minPrice ? Math.round(Number(minPrice) * 100) : '', max_width:maxWidth,max_depth:maxDepth, material, color, repairable: repairable ? 1 : '', page }, signal: controller.signal });
    request.then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [category, debounced, sort, inStock, maxPrice, minPrice, material, color, maxWidth,maxDepth,repairable, visualMatches, page, catalogVersion, favoritesOnly, favorites, retry]);
  const resetFilters = () => { setCategory(''); setSearch(''); setMaxPrice(''); setMinPrice(''); setInStock(false); setMaterial(''); setColor(''); setMaxWidth('');setMaxDepth('');setRepairable(false); setVisualMatches(null); setVisualError(''); setSort('featured'); setPage(1); };
  async function findByPhoto(file) {
    if (!file) return; setVisualBusy(true); setVisualError(''); setVisualMatches(null); setPage(1);
    try {
      const source=URL.createObjectURL(file);
      const queryColor=await averageImageColor(source); URL.revokeObjectURL(source);
      const catalogue=await api('/products',{params:{per_page:100,sort:'featured'}});
      const ranked=await Promise.all(catalogue.items.map(async p=>{try{const c=await averageImageColor(p.image);const d=Math.sqrt((c[0]-queryColor[0])**2+(c[1]-queryColor[1])**2+(c[2]-queryColor[2])**2);return {p,d};}catch{return {p,d:999};}}));
      setVisualMatches(ranked.sort((a,b)=>a.d-b.d).slice(0,12).map(x=>x.p));
    } catch { setVisualError('Não foi possível analisar essa fotografia. Escolhe outra imagem.'); }
    finally { setVisualBusy(false); }
  }
  return <>
    <div className="shop-intro">
      {!favoritesOnly && <CinematicIntro onProduct={onProduct} onExplore={scrollCatalog} />}
      <div className={favoritesOnly ? undefined : 'cinematic-handoff'}>
      {!favoritesOnly && <section className="trust-strip" aria-label="Vantagens da FORMA"><div><Truck size={21} strokeWidth={1.4} /><span>Portes grátis <b>a partir de 75 €</b></span></div><div><Leaf size={21} strokeWidth={1.4} /><span>Materiais naturais. <b>Escolhas conscientes.</b></span></div><div><Sparkles size={21} strokeWidth={1.4} /><span>Design intemporal <b>para o dia a dia</b></span></div></section>}
      {!favoritesOnly && <CollectionDiscovery categories={categories} onSelect={id => { setCategory(id); setSearch(''); setMaxPrice(''); setInStock(false); setPage(1); scrollCatalog(); }}/>}
    <section className={`catalog-section container ${favoritesOnly ? 'favorites-section' : ''}`} id="collection" ref={catalog} tabIndex={-1}>
      <div className="section-intro"><div><span className="eyebrow">{favoritesOnly ? 'A TUA SELEÇÃO PESSOAL' : 'ESCOLHIDOS PARA A TUA CASA'}</span><h2>{favoritesOnly ? <>Os teus <em>favoritos.</em></> : <>Pequenos detalhes.<br className="mobile-only" /> <em>Grandes diferenças.</em></>}</h2></div>{!favoritesOnly && <span className="section-aside">Boa forma. Boa função.<br />Uma casa mais tua.</span>}</div>
      {favoritesOnly && <><ShareFavorites/><div className="price-alert-intro"><Heart size={19}/><div><b>As peças de que gostas, ao preço certo.</b><p>Ativa o sino em cada favorito para receberes uma notificação quando atingir um novo preço mínimo. Remover o favorito também desativa o alerta.</p></div></div></>}
      {!favoritesOnly && <><div className="catalog-toolbar"><div className="category-tabs" ref={categoryTabs} role="group" aria-label="Categorias"><button className={!category ? 'active' : ''} onClick={() => { setCategory(''); setPage(1); }}>Todos os produtos</button>{categories.map(c => <button key={c.id} className={String(category) === String(c.id) ? 'active' : ''} onClick={() => { setCategory(c.id); setPage(1); }}>{c.name}</button>)}</div><button className={`filter-toggle ${filtersOpen ? 'active' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} />Filtros{(inStock || maxPrice || minPrice || maxWidth || maxDepth || material || color || repairable) && <i />}</button></div>
      <div className="catalog-search-row"><SearchSuggestions value={search} onChange={value=>{setSearch(value);if(visualMatches)setVisualMatches(null);}} onProduct={onProduct}/>{!favoritesOnly&&<label className="photo-search-btn" title="Encontrar peças com cores parecidas"><ImageUp size={16}/><span>{visualBusy?'A analisar…':'Pesquisar por fotografia'}</span><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Pesquisar produtos por fotografia" disabled={visualBusy} onChange={e=>findByPhoto(e.target.files?.[0])}/></label>}<div className="catalog-sort"><span aria-live="polite" aria-atomic="true">{loading ? 'A procurar…' : `${data.total} peças`}</span><label><span className="sr-only">Ordenar produtos</span><select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="featured">Em destaque</option><option value="newest">Mais recentes</option><option value="price_asc">Preço: menor primeiro</option><option value="price_desc">Preço: maior primeiro</option></select></label></div></div>
      {visualError&&<p className="filter-feedback" role="status">{visualError}</p>}{visualMatches&&<p className="filter-feedback" role="status">Resultados aproximados por cor. <button className="text-link" onClick={()=>setVisualMatches(null)}>Voltar à coleção</button></p>}
      {filtersOpen && <div className="filter-panel"><label className="checkbox-label"><input type="checkbox" checked={inStock} onChange={e => { setInStock(e.target.checked); setPage(1); }} />Apenas em stock</label><label>Preço mínimo (€)<input type="number" min="0" max="1000000" placeholder="Sem limite" value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(1); }} /></label><label>Preço máximo (€)<input type="number" min="0" max="1000000" placeholder="Sem limite" value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1); }} /></label><label>Largura máxima (cm)<input type="number" min="1" max="2000" placeholder="Sem limite" value={maxWidth} onChange={e=>{setMaxWidth(e.target.value);setPage(1);}}/></label><label>Profundidade máxima (cm)<input type="number" min="1" max="2000" placeholder="Sem limite" value={maxDepth} onChange={e=>{setMaxDepth(e.target.value);setPage(1);}}/></label><label>Material<select value={material} onChange={e=>{setMaterial(e.target.value);setPage(1);}}><option value="">Todos</option>{facets.materials.map(x=><option key={x} value={x}>{x}</option>)}</select></label><label>Cor<select value={color} onChange={e=>{setColor(e.target.value);setPage(1);}}><option value="">Todas</option>{facets.colors.map(x=><option key={x} value={x}>{x}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={repairable} onChange={e=>{setRepairable(e.target.checked);setPage(1);}}/>Peças reparáveis</label><button className="text-link" onClick={resetFilters}>Limpar filtros</button></div>}</>}
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
