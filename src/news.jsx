import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Newspaper } from 'lucide-react';
import { api } from './api';
import { Button, Empty, ErrorNotice, Loading } from './ui';
import './news.css';

export const newsDate = value => new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));

export function NewsPage({ articleId }) {
  const [data, setData] = useState(null); const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const request = articleId ? api(`/news/${articleId}`, { signal: controller.signal }) : Promise.all([
      api('/news', { params: { category, page }, signal: controller.signal }), api('/news/categories', { signal: controller.signal }),
    ]).then(([articles, cats]) => { setCategories(cats); return articles; });
    request.then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [articleId, category, page, retry]);
  useEffect(() => { if (articleId && data?.title) document.title = `${data.title} — Notícias FORMA`; }, [articleId, data]);
  function changePage(next) { setPage(next); window.scrollTo({ top: 0, behavior: 'instant' }); }
  if (articleId) return <div className="news-page container">
    <a className="news-back" href="#news"><ArrowLeft size={16} />Todas as notícias</a>
    {loading ? <Loading /> : error ? <ErrorNotice message={error} retry={() => setRetry(v => v + 1)} /> : data && <article className="news-article">
      <header><div className="news-meta"><span>{data.category_name}</span><time dateTime={data.publication_date}>{newsDate(data.publication_date)}</time></div><h1>{data.title}</h1></header>
      {data.image && <img className="news-cover" src={data.image} alt={`Imagem de capa: ${data.title}`} />}
      <div className="news-reading"><span className="eyebrow">DIÁRIO FORMA</span><p>{data.content}</p><a className="news-back" href="#news"><ArrowLeft size={16} />Voltar às notícias</a></div>
    </article>}
  </div>;
  return <div className="news-page container">
    <header className="news-heading"><span className="eyebrow">O DIÁRIO DA FORMA</span><h1>Notícias. <em>Ideias para ficar.</em></h1><p>Novidades da coleção, inspiração e pequenos gestos para uma casa mais tua.</p></header>
    <div className="news-filters" role="group" aria-label="Categorias de notícias"><button className={!category ? 'active' : ''} onClick={() => { setCategory(''); setPage(1); }}>Todas as notícias</button>{categories.map(c => <button key={c.id} className={String(category) === String(c.id) ? 'active' : ''} onClick={() => { setCategory(c.id); setPage(1); }}>{c.name}</button>)}</div>
    {loading ? <Loading /> : error ? <ErrorNotice message={error} retry={() => setRetry(v => v + 1)} /> : data?.items.length ? <>
      <div className="news-list-caption"><span>{data.total} {data.total === 1 ? 'notícia' : 'notícias'}</span><span>Da mais recente à mais antiga</span></div>
      <div className="news-grid">{data.items.map(article => <article className="news-card" key={article.id}>
        <a href={`#news/${article.id}`} className="news-card-image" tabIndex={-1} aria-hidden="true">{article.image ? <img src={article.image} alt="" loading="lazy" /> : <div className="news-no-image"><Newspaper size={44} strokeWidth={1} /><span>DIÁRIO FORMA</span></div>}<span><ArrowUpRight size={23} /></span></a>
        <div className="news-meta"><span>{article.category_name}</span><time dateTime={article.publication_date}>{newsDate(article.publication_date)}</time></div>
        <h2><a href={`#news/${article.id}`}>{article.title}</a></h2><p>{article.excerpt}{article.excerpt.length >= 220 ? '…' : ''}</p>
        <a className="news-read-more" href={`#news/${article.id}`} aria-label={`Ler notícia: ${article.title}`}>Ler notícia <ArrowUpRight size={16} /></a>
      </article>)}</div>
      {data.pages > 1 && <div className="pagination"><Button variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Anterior</Button><span>{page} / {data.pages}</span><Button variant="secondary" disabled={page >= data.pages} onClick={() => changePage(page + 1)}>Seguinte</Button></div>}
    </> : <Empty title="Ainda não há notícias por aqui." icon={Newspaper}>Volta em breve para descobrir novidades e inspiração.</Empty>}
  </div>;
}
