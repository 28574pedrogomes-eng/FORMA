import { readFileSync, writeFileSync } from 'node:fs';
const source = new URL('./paletas-proposta.html', import.meta.url);
let html = readFileSync(source, 'utf8');
const replacements = {
  'ESTUDO DE COR / 01': 'ESTUDO DE COR / 02',
  'Três novas direções.': 'Mais três possibilidades.',
  '<span class="recommended">Recomendada</span>': '',
  'A · Barro &amp; Linho': 'D · Preto &amp; Porcelana',
  'B · Ardósia &amp; Névoa': 'E · Petróleo &amp; Areia',
  'C · Vinho &amp; Marfim': 'F · Ocre &amp; Papel',
  '#F7F3EC': '#FAFAF7', '#E6DCCD': '#E7E6E1', '#292321': '#20201F', '#793F32': '#30302D', '#6B5E57': '#63635D',
  '#F5F6F4': '#F6F3EB', '#DFE5E8': '#E3DFD1', '#202932': '#203332', '#304D65': '#215B59', '#58646E': '#576965',
  '#FAF7F2': '#FCF8EE', '#E9DFD7': '#EEE1C3', '#30242A': '#322B21', '#633648': '#825F18', '#6E5B62': '#72634B',
  'Quente e ligada à cerâmica e à madeira. Botões em barro escuro, fundos em linho e areia.': 'Minimalista e intemporal. Preto suave, branco porcelana e cinzentos quentes deixam os produtos em destaque.',
  'Mais fresca e sóbria. Azul ardósia nos elementos de ação, cinzentos claros nas superfícies.': 'Petróleo profundo sobre areia clara. Uma combinação serena, com cor e contraste.',
  'Mais expressiva, com inspiração editorial. Vinho profundo em pequenos apontamentos sobre marfim.': 'Ocre dourado sobre papel claro. Uma proposta solar, acolhedora e ligada aos materiais naturais.',
  'height:190px': 'height:145px',
  'padding:48px': 'padding:32px',
  'font:44px/1.1': 'font:38px/1.1',
  'font:35px/1.12': 'font:30px/1.12',
  'margin:0 0 36px': 'margin:0 0 26px',
  'padding:26px 22px 24px': 'padding:20px 22px',
};
for (const [before, after] of Object.entries(replacements)) html = html.replaceAll(before, after);
html = html.replace('<title>', '<link rel="icon" href="data:,"><title>');
html = html.replace('</main>', '<p><a href="paletas-proposta.html" style="color:#444">← Comparar com as paletas A, B e C</a></p></main>');
writeFileSync(new URL('./mais-paletas.html', import.meta.url), html);
const luminance = hex => {
  const c = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};
for (const [label,bg,accent] of [['D','#FAFAF7','#30302D'],['E','#F6F3EB','#215B59'],['F','#FCF8EE','#825F18']]) {
  console.log(`${label}: contraste texto/botão ${((luminance(bg)+.05)/(luminance(accent)+.05)).toFixed(2)}:1`);
}
