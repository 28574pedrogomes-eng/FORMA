import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Pause, Play } from 'lucide-react';
import { api, money } from './api';
import { useStore } from './context';
import './cinematic-intro.css';

const clamp = value => Math.max(0, Math.min(1, value));
const ramp = (value, from, to) => clamp((value - from) / (to - from));
const chapters = ['Um espaço para abrandar.', 'Os detalhes fazem a casa.', 'Agora, dá-lhe a tua forma.'];
const windows = [[.24, .43], [.45, .64], [.66, .84]];

function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query); const update = () => setMatches(media.matches);
    media.addEventListener('change', update); update();
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function CinematicIntro({ onProduct, onExplore }) {
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const mobile = useMedia('(max-width: 760px)');
  const saveData = !!navigator.connection?.saveData;
  const [failed, setFailed] = useState(false); const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false); const [chapter, setChapter] = useState(0);
  const [activeTag, setActiveTag] = useState(-1); const [ended, setEnded] = useState(false); const [introVisible, setIntroVisible] = useState(true);
  const [products, setProducts] = useState([]);
  const { catalogVersion } = useStore();
  const root = useRef(null); const stage = useRef(null); const video = useRef(null);
  const progress = useRef(0); const timeline = useRef(null); const counter = useRef(null);
  const still = reduced || saveData || failed;

  // The film suggests an atmosphere. Cards always use current catalogue data.
  useEffect(() => {
    const controller = new AbortController();
    api('/products', { params: { sort: 'featured' }, signal: controller.signal }).then(({ items }) => {
      const chosen = [];
      for (const image of ['chair.jpg', 'table.jpg', 'vase.jpg']) {
        const product = items.find(p => p.image.endsWith(image) && !chosen.includes(p)) || items.find(p => !chosen.includes(p));
        if (product) chosen.push(product);
      }
      if (!controller.signal.aborted) setProducts(chosen);
    }).catch(() => { /* The introduction remains usable when the catalogue is unavailable. */ });
    return () => controller.abort();
  }, [catalogVersion]);

  useEffect(() => { setReady(false); }, [mobile, still]);

  useEffect(() => {
    const section = root.current; const screen = stage.current; const media = video.current;
    let frame = 0; let target = 0; let disposed = false;
    const header = document.querySelector('.site-header');
    const schedule = () => { if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(draw); };
    const measure = () => {
      const offset = header?.getBoundingClientRect().height || 0;
      section.parentElement.style.setProperty('--cinema-header', `${offset}px`);
      const distance = Math.max(1, section.offsetHeight - screen.offsetHeight);
      target = still ? 0 : clamp((offset - section.getBoundingClientRect().top) / distance);
      schedule();
    };
    function draw() {
      frame = 0;
      const delta = target - progress.current;
      const p = still ? 0 : Math.abs(delta) < .0004 ? target : progress.current + delta * .22;
      progress.current = p;
      screen.style.setProperty('--intro-opacity', 1 - ramp(p, .08, .22));
      screen.style.setProperty('--intro-lift', `${-ramp(p, .06, .23) * 45}px`);
      screen.style.setProperty('--letterbox', 1 - ramp(p, 0, .18));
      screen.style.setProperty('--exit', still ? 0 : ramp(p, .89, 1));
      screen.style.setProperty('--outro-opacity', still ? 0 : ramp(p, .82, .87) * (1 - ramp(p, .88, .92)));
      screen.style.setProperty('--controls-opacity', still ? 1 : 1 - ramp(p, .88, .94));
      screen.style.setProperty('--scrim', .32 - ramp(p, .1, .26) * .19);
      timeline.current?.style.setProperty('transform', `scaleX(${p})`);
      if (counter.current) counter.current.textContent = `${String(Math.round(p * 100)).padStart(2, '0')}%`;
      setChapter(p < .32 ? 0 : p < .66 ? 1 : 2);
      setActiveTag(still ? -1 : windows.findIndex(([start, end]) => p >= start && p < end));
      setIntroVisible(still || p < .2);
      setEnded(!still && p > .94);
      if (!still && !paused && media.readyState >= 2 && Number.isFinite(media.duration)) {
        const time = p * Math.max(0, media.duration - .05);
        // One seek at a time; seeked schedules the latest target, including fast reverse scrolling.
        if (!media.seeking && Math.abs(media.currentTime - time) > 1 / 30) media.currentTime = time;
      }
      if (!still && Math.abs(target - p) > .0004) schedule();
    }
    const observer = new ResizeObserver(measure);
    observer.observe(section); if (header) observer.observe(header);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    document.addEventListener('visibilitychange', measure);
    media.addEventListener('loadeddata', schedule); media.addEventListener('seeked', schedule);
    measure();
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', measure);
      media.removeEventListener('loadeddata', schedule); media.removeEventListener('seeked', schedule);
    };
  }, [still, paused, mobile]);

  function begin() {
    const section = root.current; const offset = document.querySelector('.site-header')?.offsetHeight || 0;
    window.scrollTo({ top: scrollY + section.getBoundingClientRect().top - offset + (section.offsetHeight - stage.current.offsetHeight) * .31, behavior: 'smooth' });
  }

  return <section ref={root} className={`cinematic-scene${still ? ' is-still' : ''}`} aria-label="Um passeio pela casa FORMA" data-ended={ended} data-media={still ? 'poster' : ready ? 'ready' : 'loading'}>
    <div ref={stage} className="cinematic-stage" inert={ended}>
      <img className="cinematic-poster" src="images/room-tour-poster.jpg" alt="Sala contemporânea com sofás, mesa de madeira e luz natural" fetchPriority="high" />
      <video ref={video} className={`cinematic-video${ready && !still ? ' is-ready' : ''}`} src={still ? undefined : `images/room-tour${mobile ? '-mobile' : ''}.mp4`} poster="images/room-tour-poster.jpg" muted playsInline preload={still ? 'none' : 'auto'} disablePictureInPicture aria-hidden="true" onLoadedData={() => setReady(true)} onError={() => setFailed(true)} />
      <div className="cinematic-scrim" aria-hidden="true" />
      <div className="cinematic-letterbox cinema-top" aria-hidden="true" />
      <div className="cinematic-letterbox cinema-bottom" aria-hidden="true" />

      <div className="cinematic-topline"><span>FORMA <i /> UM LUGAR PARA VIVER</span><button type="button" onClick={onExplore}>Saltar introdução <ArrowDown size={14} /></button></div>
      <div className="cinematic-intro-copy" inert={!introVisible} aria-hidden={!introVisible}>
        <span className="cinematic-eyebrow"><i /> A ARTE DE HABITAR</span>
        <h1>Há espaços.<br />E há <em>casa.</em></h1>
        <p>Uma luz que abraça. Uma peça que fica.<br />O teu lugar começa nos detalhes.</p>
        <button type="button" className="cinematic-enter" onClick={still ? onExplore : begin}>{still ? 'Descobrir a coleção' : 'Entra. Sente-te em casa.'}<ArrowDown size={16} /></button>
      </div>

      <div className="cinematic-products" aria-label="Peças para recriar este ambiente">
        {products.map((product, index) => <div key={product.id} className={`cinematic-tag tag-position-${index}${activeTag === index ? ' is-visible' : ''}`} aria-hidden={activeTag !== index} inert={activeTag !== index}>
          <span className="cinematic-pin" aria-hidden="true"><i /><span /></span>
          <button type="button" className="cinematic-product" tabIndex={activeTag === index ? 0 : -1} onClick={() => onProduct(product)} aria-label={`Descobrir ${product.name}`}>
            <img src={product.image} alt="" loading="lazy" />
            <span><small>DA NOSSA COLEÇÃO</small><b>{product.name}</b><span>{product.variant_count > 1 ? 'Desde ' : ''}{money(product.price_cents)}</span></span><ArrowUpRight size={18} />
          </button>
        </div>)}
      </div>

      <div className="cinematic-outro" aria-hidden="true"><span>COM TEMPO. COM INTENÇÃO.</span><p>A próxima história<br /><em>é tua.</em></p></div>
      <div className="cinematic-footer">
        <div className="cinematic-chapter"><span>0{chapter + 1} <i>/ 03</i></span><p>{chapters[chapter]}</p></div>
        <div className="cinematic-timeline" aria-hidden="true"><div><span ref={timeline} /></div><span ref={counter}>00%</span></div>
        {!still && <button type="button" className="cinematic-pause" onClick={() => setPaused(p => !p)} aria-label={paused ? 'Retomar vídeo com o scroll' : 'Pausar vídeo'} title={paused ? 'Retomar vídeo com o scroll' : 'Pausar vídeo'}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>}
        <span className="cinematic-scroll-hint">{still ? 'A TUA CASA, À TUA MANEIRA' : 'DESLIZA PARA EXPLORAR'}{!still && <ArrowDown size={14} />}</span>
      </div>
    </div>
  </section>;
}
