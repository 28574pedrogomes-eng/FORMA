import { ArrowUpRight } from 'lucide-react';

const collections = {
  'Mobiliário': { image: 'images/collection-700549.jpg', text: 'Formas que fazem casa.', position: 'center 65%' },
  'Iluminação': { image: 'images/collection-8834624.jpg', text: 'Uma nova luz, outro ambiente.' },
  'Decoração': { image: 'images/jarras-duna.jpg', text: 'O detalhe faz a diferença.' },
  'Têxteis': { image: 'images/collection-8762876.jpg', text: 'Conforto em cada textura.' },
  'Mesa e cozinha': { image: 'images/collection-11371877.jpg', text: 'À mesa, com tempo.' },
};

export function CollectionDiscovery({ categories, onSelect }) {
  const visible = categories.filter(category => collections[category.name]);
  if (!visible.length) return null;
  return <section className="collection-discovery container" aria-labelledby="discovery-title">
    <div className="discovery-heading"><div><span className="eyebrow">ENCONTRA A TUA FORMA</span><h2 id="discovery-title">Uma casa. <em>Tantas possibilidades.</em></h2></div><p>Escolhe por onde começar.</p></div>
    <div className="discovery-grid">{visible.map(category => {
      const collection = collections[category.name];
      return <button className="discovery-card" key={category.id} onClick={() => onSelect(category.id)} aria-label={`Explorar ${category.name}`}>
        <div className="discovery-image"><img src={collection.image} style={{ objectPosition: collection.position }} alt="" loading="lazy"/><span><ArrowUpRight size={20}/></span></div>
        <h3>{category.name}</h3><p>{collection.text}</p>
      </button>;
    })}</div>
  </section>;
}
