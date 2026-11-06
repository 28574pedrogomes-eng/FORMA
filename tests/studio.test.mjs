import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
if (process.env.FORMA_TEST_MODE !== '1') throw new Error('Usa npm test.');

class Client {
  constructor() { this.cookie=''; this.csrf=''; }
  async call(route,method='GET',data,csrf=true) {
    const [name,search='']=route.split('?'); const url=new URL('api/index.php',process.env.TEST_BASE_URL);
    url.searchParams.set('route',name); for(const [key,value] of new URLSearchParams(search)) url.searchParams.set(key,value);
    const response=await fetch(url,{method,headers:{Cookie:this.cookie,'X-CSRF-Token':csrf?this.csrf:'','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
    for(const cookie of response.headers.getSetCookie())if(cookie.startsWith('forma_session='))this.cookie=cookie.split(';')[0];
    const body=await response.json();if(body.csrf)this.csrf=body.csrf;return {status:response.status,body};
  }
}
const admin=new Client(),buyer=new Client(),other=new Client(),guest=new Client();
const stamp=Date.now(); let pid,vid,alternative;
const product=price=>({category_id:1,name:`Peça Alertas ${stamp}`,description:'Peça de teste para alertas de preço e painel de gestão.',price_cents:price,stock:30,image:'images/chair.jpg',badge:'',material:'Madeira',featured:false});
const watchCount=async()=> (await buyer.call('/notifications')).body.filter(n=>n.title==='Um favorito baixou de preço').length;
before(async()=>{
  for(const client of [admin,buyer,other,guest])assert.equal((await client.call('/session')).status,200);
  assert.equal((await admin.call('/auth/login','POST',{email:'admin@forma.pt',password:process.env.TEST_ADMIN_PASSWORD})).status,200);
  for(const [client,label] of [[buyer,'buyer'],[other,'other']])assert.equal((await client.call('/auth/register','POST',{name:'Cliente Alertas',email:`forma-test-studio-${label}-${stamp}@example.test`,password:'StudioSeguro!123'})).status,201);
  const created=await admin.call('/admin/products','POST',product(5000));assert.equal(created.status,201);pid=created.body.id;
  vid=(await buyer.call(`/products/${pid}`)).body.default_variant_id;
});
after(async()=>{if(pid)await admin.call(`/admin/products/${pid}`,'DELETE');});

test('alertas: sessão, favorito obrigatório, CSRF, idempotência e isolamento',async()=>{
  assert.equal((await guest.call('/price-alerts')).status,401);
  assert.equal((await buyer.call(`/price-alerts/${pid}`,'PUT')).status,422);
  assert.equal((await buyer.call(`/favorites/${pid}`,'PUT')).status,200);
  assert.equal((await buyer.call(`/price-alerts/${pid}`,'PUT',null,false)).status,419);
  assert.equal((await buyer.call(`/price-alerts/${pid}`,'PUT')).status,200);
  assert.equal((await buyer.call(`/price-alerts/${pid}`,'PUT')).status,200);
  assert.equal((await other.call('/price-alerts')).body.length,0);
  await other.call(`/price-alerts/${pid}`,'DELETE');
  const rows=(await buyer.call('/price-alerts')).body;assert.equal(rows.length,1);assert.equal(Number(rows[0].reference_price_cents),5000);
});
test('alertas: redução notifica uma vez, subidas e repetição não duplicam',async()=>{
  const baseline=await watchCount();
  assert.equal((await admin.call(`/admin/products/${pid}`,'PUT',product(4000))).status,200);
  assert.equal(await watchCount(),baseline+1);
  for(const price of [4000,4500,4000])assert.equal((await admin.call(`/admin/products/${pid}`,'PUT',product(price))).status,200);
  assert.equal(await watchCount(),baseline+1);
  await buyer.call(`/price-alerts/${pid}`,'PUT');
  assert.equal(Number((await buyer.call('/price-alerts')).body[0].reference_price_cents),4000);
  assert.equal((await admin.call(`/admin/products/${pid}`,'PUT',product(3500))).status,200);
  assert.equal(await watchCount(),baseline+2);
  assert.equal((await other.call('/notifications')).body.filter(n=>n.title==='Um favorito baixou de preço').length,0);
});
test('alertas: preço mínimo de variantes, alterações de stock e cancelamento',async()=>{
  const baseline=await watchCount();
  const created=await admin.call(`/admin/products/${pid}/variants`,'POST',{label:'Alternativa',sku:`STUDIO-${stamp}`,color:'',size:'',material:'Madeira',image:'images/chair.jpg',price_cents:6000,stock:10});assert.equal(created.status,201);alternative=created.body.id;
  const fields=price=>({label:'Alternativa',color:'',size:'',material:'Madeira',image:'images/chair.jpg',price_cents:price,stock:10,reason:'Teste de preço'});
  await admin.call(`/admin/variants/${alternative}`,'PUT',fields(5000)); assert.equal(await watchCount(),baseline);
  await admin.call(`/admin/variants/${alternative}`,'PUT',fields(3000)); assert.equal(await watchCount(),baseline+1);
  await admin.call('/admin/stock','POST',{variant_id:alternative,delta:1,reason:'Reposição de teste'}); assert.equal(await watchCount(),baseline+1);
  await buyer.call(`/price-alerts/${pid}`,'DELETE'); assert.equal((await buyer.call('/price-alerts')).body.length,0);
  await admin.call(`/admin/variants/${alternative}`,'PUT',fields(2500)); assert.equal(await watchCount(),baseline+1);
  await buyer.call(`/price-alerts/${pid}`,'PUT'); await buyer.call(`/favorites/${pid}`,'DELETE'); assert.equal((await buyer.call('/price-alerts')).body.length,0);
});
test('dashboard: autorização, períodos válidos, datas contínuas e totais coerentes',async()=>{
  assert.equal((await guest.call('/admin/overview')).status,401);assert.equal((await buyer.call('/admin/overview')).status,403);
  assert.equal((await admin.call('/admin/overview?days=8')).status,422);
  for(const days of [7,30,90]){const result=await admin.call(`/admin/overview?days=${days}`);assert.equal(result.status,200);const d=result.body;assert.equal(d.days,days);assert.equal(d.daily.length,days);assert.equal(d.daily[0].day,d.from);assert.equal(d.daily.at(-1).day,d.to);assert.equal(d.daily.reduce((sum,x)=>sum+x.total,0),d.metrics.paid_cents);assert.equal(d.daily.reduce((sum,x)=>sum+x.orders,0),d.metrics.orders);for(let i=1;i<days;i++)assert.equal(new Date(d.daily[i].day)-new Date(d.daily[i-1].day),86400000);}
});
test('dashboard: receita aprovada, valor médio e cancelamento calculados no servidor',async()=>{
  const before=(await admin.call('/admin/overview')).body;
  const order=await buyer.call('/orders','POST',{shipping_name:'Cliente Alertas',address:'Rua de Teste, 10',city:'Lisboa',postal_code:'1000-001',phone:'912345678',checkout_key:randomUUID(),items:[{product_id:pid,variant_id:vid,quantity:1}],payment_outcome:'approved'});assert.equal(order.status,201);
  const after=(await admin.call('/admin/overview')).body;
  assert.equal(after.metrics.paid_cents,before.metrics.paid_cents+Number(order.body.total_cents));assert.equal(after.metrics.orders,before.metrics.orders+1);assert.equal(after.operations.to_prepare,before.operations.to_prepare+1);
  assert.equal(after.metrics.average_cents,Math.round(after.metrics.paid_cents/after.metrics.paid_orders));assert(after.top_products.some(p=>Number(p.product_id)===pid)||after.top_products.length===5);
  assert.equal((await buyer.call(`/orders/${order.body.id}/cancel`,'POST')).status,200);
  const cancelled=(await admin.call('/admin/overview')).body;assert.equal(cancelled.metrics.paid_cents,before.metrics.paid_cents);assert.equal(cancelled.metrics.cancelled_orders,before.metrics.cancelled_orders+1);
});
test('clientes: só administração, sem passwords ou tokens e com compras reais',async()=>{
  assert.equal((await guest.call('/admin/customers')).status,401);assert.equal((await buyer.call('/admin/customers')).status,403);
  const result=await admin.call('/admin/customers');assert.equal(result.status,200);
  const row=result.body.find(u=>u.email===`forma-test-studio-buyer-${stamp}@example.test`);assert(row);assert.equal(Number(row.order_count),1);assert.equal(Number(row.paid_cents),0);assert(row.last_order_at);
  for(const customer of result.body)assert.deepEqual(Object.keys(customer).sort(),['id','name','email','created_at','order_count','paid_cents','last_order_at'].sort());
});
