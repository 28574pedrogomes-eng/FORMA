import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { X, ArrowRight, PackageOpen, LoaderCircle, Check, AlertCircle } from 'lucide-react';

export function Button({ children, variant = 'primary', className = '', busy, ...props }) {
  return <button {...props} disabled={busy || props.disabled} className={`btn btn-${variant} ${className}`}>{busy && <LoaderCircle size={17} className="spin" />}{children}</button>;
}
export function Field({ label, children, className = '', ...props }) {
  const id = useId();
  const labelId = `${id}-label`;
  return <label className={`field ${className}`} htmlFor={id}><span id={labelId}>{label}</span>{isValidElement(children) ? cloneElement(children, { id, 'aria-labelledby': children.props['aria-labelledby'] || (children.props['aria-label'] ? undefined : labelId) }) : <input id={id} aria-labelledby={props['aria-label'] ? undefined : labelId} {...props} />}</label>;
}
export function Modal({ title, children, onClose, wide = false, drawer = false, className = '' }) {
  const ref = useRef(null); const titleId = useId(); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = ref.current;
    const focusable = () => [...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')].filter(el => el.offsetParent !== null);
    (focusable()[0] || panel).focus();
    const onKey = e => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const els = focusable(); const first = els[0]; const last = els.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className={`modal-backdrop ${drawer ? 'drawer-backdrop' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal ${wide ? 'modal-wide' : ''} ${drawer ? 'drawer' : ''} ${className}`}>
      <div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={22} /></button></div>
      {children}
    </section>
  </div>;
}
export function ErrorNotice({ message, retry }) {
  if (!message) return null;
  return <div className="error-notice" role="alert"><AlertCircle size={19} /><span>{message}</span>{retry && <button className="text-link" onClick={retry}>Tentar novamente</button>}</div>;
}
export function Empty({ title, children, action, icon: Icon = PackageOpen }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={30} strokeWidth={1.4} /></div><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function Loading({ label = 'A carregar…' }) { return <div className="loading" role="status"><LoaderCircle className="spin" size={25} /><span>{label}</span></div>; }
export function Status({ value }) {
  const labels = { pending: 'Recebida', processing: 'Em preparação', shipped: 'Enviada', delivered: 'Entregue', cancelled: 'Cancelada' };
  return <span className={`status status-${value}`}><i />{labels[value] || value}</span>;
}
export function Toast({ message }) { return message ? <div className="toast" role="status"><Check size={18} />{message}</div> : null; }
export function ArrowLink({ children, ...props }) { return <button className="arrow-link" {...props}>{children}<ArrowRight size={18} /></button>; }
