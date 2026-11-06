import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const files = fs.readdirSync('src').filter(f => f.endsWith('.css') && f !== 'palette.css');
const backup = 'storage/palette-before-d';
if (fs.existsSync(backup)) throw new Error('Backup already exists; this migration runs once.');
fs.mkdirSync(backup, { recursive: true });
const token = name => `var(--forma-${name})`;
const preserved = /(?:success|error|danger|warning|payment-|status-|paid|refunded|failed|stock|verified|rating|review-stars|star-picker)/i;
const known = new Map([
  ['#344c3d', 'accent'], ['#274e3c', 'accent'], ['#293e32', 'accent'],
  ['#263c30', 'ink'], ['#262a25', 'ink'], ['#24382d', 'ink'],
  ['#fcfbf8', 'porcelain'], ['#f6f5f0', 'porcelain'], ['#f5f4ee', 'surface-soft'],
  ['#f5f7f5', 'porcelain'], ['#eaece2', 'surface'], ['#f0eee6', 'surface'],
  ['#f1f0e9', 'surface-soft'], ['#dedfd6', 'line'], ['#e7e8e1', 'line'],
]);
function neutralize(r,g,b,prop) {
  const max=Math.max(r,g,b), min=Math.min(r,g,b), delta=max-min;
  if (!delta) return null;
  let h = max===r ? ((g-b)/delta)%6 : max===g ? (b-r)/delta+2 : (r-g)/delta+4;
  h=(h*60+360)%360;
  // Only the former green brand and warm neutral surfaces; status colours are excluded above.
  if (!(h>=65 && h<=180) && !(max>205 && delta<36 && h>=25 && h<65)) return null;
  const l=.2126*r+.7152*g+.0722*b;
  if (prop === 'color' || prop === 'fill' || prop === 'stroke') {
    if(l>205) return 'porcelain';
    if(l>165) return 'inverse-muted';
    return l>85 ? 'muted' : l>45 ? 'accent' : 'ink';
  }
  if(/border|outline/.test(prop)) return l>170 ? 'line' : l>100 ? 'muted' : 'accent';
  return l>246 ? 'porcelain' : l>231 ? 'surface-soft' : l>195 ? 'surface' : l>150 ? 'inverse-muted' : l>95 ? 'muted' : l>40 ? 'accent' : 'ink';
}
const rgbTokens = {porcelain:[250,250,247],surface:[231,230,225],'surface-soft':[241,241,236],accent:[48,48,45],ink:[32,32,31],muted:[99,99,93],line:[211,211,203],'inverse-muted':[199,199,191]};
const report=[];
for (const file of files) {
  const full=path.join('src',file), original=fs.readFileSync(full,'utf8');
  fs.writeFileSync(path.join(backup,file),original);
  const root=postcss.parse(original); let changed=0;
  root.walkDecls(decl => {
    const selector=decl.parent.selector || '';
    if(preserved.test(selector) || preserved.test(decl.prop)) return;
    const before=decl.value;
    decl.value=before.replace(/#[\da-f]{3,8}\b/gi, hex => {
      let expanded=hex.slice(1).toLowerCase();
      if(expanded.length===3||expanded.length===4) expanded=[...expanded].map(c=>c+c).join('');
      if(expanded.length!==6&&expanded.length!==8) return hex;
      const r=parseInt(expanded.slice(0,2),16),g=parseInt(expanded.slice(2,4),16),b=parseInt(expanded.slice(4,6),16);
      const name=known.get('#'+expanded.slice(0,6)) || neutralize(r,g,b,decl.prop);
      if(!name) return hex;
      if(expanded.length===8) return `rgba(${rgbTokens[name].join(',')},${(parseInt(expanded.slice(6),16)/255).toFixed(3)})`;
      return token(name);
    }).replace(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g,(value,r,g,b,a)=>{
      const name=neutralize(+r,+g,+b,decl.prop);
      if(!name) return value;
      return a!==undefined ? `rgba(${rgbTokens[name].join(',')},${a})` : token(name);
    });
    if(decl.value!==before) changed++;
  });
  fs.writeFileSync(full,root.toString());
  report.push({file,changed});
}
fs.writeFileSync(path.join(backup,'changes.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
