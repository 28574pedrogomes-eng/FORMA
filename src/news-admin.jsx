import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, FolderTree, Newspaper, Pencil, Plus, Trash2, X } from 'lucide-react';
import { NewsRevisions } from './experience-admin';
import { History } from 'lucide-react';
import { api } from './api';
import { newsDate } from './news';
import { useStore } from './context';
import { Button, Empty, ErrorNotice, Field, Loading, Modal } from './ui';

export function NewsAdmin({ data, onReload }) {
  const { notify } = useStore();
  const [categories, setCategories] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [history,setHistory]=useState(null);
  const [editing, setEditing] = useState(null); const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState(null); const [busy, setBusy] = useState(false); const [deleteError, setDeleteError] = useState('');
  useEffect(() => { const controller = new AbortController(); api('/news/categories', { signal: controller.signal }).then(setCategories).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  async function remove() {
    setBusy(true); setDeleteError('');
    try { await api(`/admin/news/${deleting.id}`, { method: 'DELETE', data: { confirm: true } }); setDeleting(null); notify('Notícia eliminada.'); onReload(); }
    catch (e) { setDeleteError(e.message); } finally { setBusy(false); }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorNotice message={error} retry={onReload} />;
  return <>
    <div className="news-admin-actions"><Button onClick={() => setEditing({})} disabled={!categories.length}><Plus size={16} />Nova notícia</Button><Button variant="secondary" onClick={() => setManaging(true)}><FolderTree size={16} />Categorias de notícias</Button><a href="#news" className="text-link">Ver página pública <ArrowUpRight size={15} /></a></div>
    {!categories.length && <p className="info-notice">Cria uma categoria de notícias para começar a publicar.</p>}
    {data.length ? <div className="table-wrap"><table><thead><tr><th>Notícia</th><th>Categoria</th><th>Data</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{data.map(article => <tr key={article.id}>
      <td><div className="table-product news-admin-title">{article.image && <img src={article.image} alt="" />}<div><b>{article.title}</b><span className="news-state">{article.status==='draft'?'Rascunho':article.status==='scheduled'?(new Date(article.publish_at.replace(' ','T')+'Z')>new Date()?'Agendada':'Publicada por agendamento'):'Publicada'} · v{article.version}</span><a href={`#news/${article.id}`}>Consultar notícia <ArrowUpRight size={12} /></a></div></div></td><td>{article.category_name}</td><td className="nowrap"><time dateTime={article.publication_date}>{newsDate(article.publication_date)}</time></td>
      <td><div className="row-actions"><button className="icon-btn" aria-label={`Histórico: ${article.title}`} onClick={()=>setHistory(article)}><History size={16}/></button><button className="icon-btn" aria-label={`Editar notícia: ${article.title}`} onClick={() => setEditing(article)}><Pencil size={16} /></button><button className="icon-btn danger-text" aria-label={`Eliminar notícia: ${article.title}`} onClick={() => { setDeleting(article); setDeleteError(''); }}><Trash2 size={16} /></button></div></td>
    </tr>)}</tbody></table></div> : <Empty title="Ainda não há notícias nesta seleção." icon={Newspaper}>Publica a primeira notícia ou ajusta a pesquisa.</Empty>}
    {history && <NewsRevisions article={history} onClose={()=>setHistory(null)} onSaved={()=>{setHistory(null);notify('Versão restaurada como rascunho.');onReload();}}/>}
    {editing && <NewsForm article={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify('Notícia guardada.'); onReload(); }} />}
    {managing && <NewsCategories categories={categories} onClose={() => setManaging(false)} onSaved={() => { setManaging(false); notify('Categorias atualizadas.'); onReload(); }} />}
    {deleting && <Modal title="Eliminar esta notícia?" onClose={() => { if (!busy) setDeleting(null); }}><p className="muted mb-5">“{deleting.title}” será removida da página pública. Esta ação não pode ser anulada.</p><ErrorNotice message={deleteError} /><div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" busy={busy} onClick={remove}>Confirmar eliminação</Button></div></Modal>}
  </>;
}

function NewsForm({ article, categories, onClose, onSaved }) {
  const [status,setStatus]=useState(article.status||'published');
  const [image, setImage] = useState(article.image || ''); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false); const [error, setError] = useState('');
  async function upload(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(true); setError(''); const data = new FormData(); data.append('file', file);
    try { setImage((await api('/admin/news/upload', { method: 'POST', data })).path); } catch (e) { setError(e.message); } finally { setUploading(false); event.target.value = ''; }
  }
  async function submit(event) {
    event.preventDefault(); if (uploading) return; setBusy(true); setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try { await api(`/admin/news${article.id ? `/${article.id}` : ''}`, { method: article.id ? 'PUT' : 'POST', data: { ...fields, category_id: Number(fields.category_id), image, version: article.version, publish_at: status==='scheduled'?new Date(fields.publish_at).toISOString().slice(0,19).replace('T',' '):null } }); onSaved(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const today = new Date(); const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return <Modal title={article.id ? 'Editar notícia' : 'Nova notícia'} wide onClose={() => { if (!busy && !uploading) onClose(); }}><form className="form-stack" onSubmit={submit}>
    <Field label="Título" name="title" defaultValue={article.title} required minLength={2} maxLength={160} />
    <div className="form-row"><Field label="Categoria da notícia"><select name="category_id" defaultValue={article.category_id || categories[0]?.id} required>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Data da notícia" name="publication_date" type="date" defaultValue={article.publication_date || localDate} required min="1000-01-01" max="9999-12-31" /></div>
    <div className="form-row"><Field label="Estado de publicação"><select name="status" value={status} onChange={e=>setStatus(e.target.value)}><option value="published">Publicar agora</option><option value="draft">Guardar rascunho</option><option value="scheduled">Agendar publicação</option></select></Field>{status==='scheduled'&&<Field label="Publicar em (hora local)" name="publish_at" type="datetime-local" required defaultValue={article.publish_at?new Date(new Date(article.publish_at.replace(' ','T')+'Z').getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):''}/>}</div>
    <Field label="Conteúdo"><textarea aria-label="Conteúdo" name="content" rows={10} defaultValue={article.content} required minLength={10} maxLength={20000} placeholder="Escreve a notícia completa. Separa os parágrafos com uma linha em branco." /></Field>
    <div className="news-image-field"><label className="field"><span>Imagem da notícia (opcional)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy || uploading} aria-label="Imagem da notícia" /></label><small>JPG, PNG ou WebP · até 5 MB.</small>{uploading && <Loading label="A carregar imagem…" />}{image && <div className="news-image-preview"><img src={image} alt="Pré-visualização da imagem da notícia" /><Button type="button" variant="secondary" disabled={busy || uploading} onClick={() => setImage('')}><X size={15} />Remover imagem</Button></div>}</div>
    <ErrorNotice message={error} /><div className="modal-actions"><Button type="button" variant="secondary" disabled={busy || uploading} onClick={onClose}>Cancelar</Button><Button type="submit" busy={busy} disabled={uploading}><Check size={16} />Guardar notícia</Button></div>
  </form></Modal>;
}

function NewsCategories({ categories, onClose, onSaved }) {
  const [editing, setEditing] = useState(null); const [name, setName] = useState(''); const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(`/admin/news/categories${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PUT' : 'POST', data: { name } }); onSaved(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await api(`/admin/news/categories/${deleting.id}`, { method: 'DELETE', data: { confirm: true } }); onSaved(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Modal title="Categorias de notícias" onClose={() => { if (!busy) onClose(); }}>
    {deleting ? <><p>Eliminar a categoria “{deleting.name}”?</p><p className="small muted mt-3">Uma categoria com notícias associadas só pode ser eliminada depois de essas notícias mudarem de categoria.</p><ErrorNotice message={error} /><div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={() => { setDeleting(null); setError(''); }}>Cancelar</Button><Button variant="danger" busy={busy} onClick={remove}>Confirmar eliminação</Button></div></> : <>
      <ul className="news-category-list">{categories.map(c => <li key={c.id}><div><b>{c.name}</b><span>{c.article_count} notícia(s)</span></div><div className="row-actions"><button className="icon-btn" disabled={busy} aria-label={`Editar categoria de notícias: ${c.name}`} onClick={() => { setEditing(c); setName(c.name); setError(''); }}><Pencil size={15} /></button><button className="icon-btn danger-text" disabled={busy} aria-label={`Eliminar categoria de notícias: ${c.name}`} onClick={() => { setDeleting(c); setError(''); }}><Trash2 size={15} /></button></div></li>)}</ul>
      <form className="form-stack" onSubmit={save}><Field label={editing ? 'Alterar nome da categoria' : 'Nome da nova categoria'} value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} /><ErrorNotice message={error} /><div className="modal-actions">{editing && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(null); setName(''); setError(''); }}>Cancelar edição</Button>}<Button type="submit" busy={busy}>{editing ? 'Guardar categoria' : 'Criar categoria'}</Button></div></form>
    </>}
  </Modal>;
}
