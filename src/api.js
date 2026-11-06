let csrf = null;
let sessionRequest = null;
const endpoint = (route, params = {}) => {
  const url = new URL('api/index.php', document.baseURI);
  url.searchParams.set('route', route);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null && value !== false) url.searchParams.set(key, value);
  });
  return url;
};

export async function api(route, { method = 'GET', data, params, signal, blob = false } = {}) {
  // O primeiro cookie tem de chegar antes de outros pedidos: respostas simultâneas
  // sem cookie poderiam criar sessões diferentes e invalidar o token CSRF inicial.
  if (route === '/session') {
    sessionRequest ||= request('/session').finally(() => { sessionRequest = null; });
    return sessionRequest;
  }
  if (!csrf) await api('/session');
  return request(route, { method, data, params, signal, blob });
}

async function request(route, { method = 'GET', data, params, signal, blob = false } = {}) {
  const headers = { Accept: blob ? '*/*' : 'application/json' };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (data && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(endpoint(route, params), {
    method, headers, credentials: 'same-origin', signal,
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
  });
  if (blob && response.ok) return response.blob();
  let result;
  try { result = await response.json(); }
  catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error;
    throw new Error('O servidor não respondeu corretamente. Verifica se o PHP está iniciado.');
  }
  if (!response.ok) {
    if (response.status === 419) csrf = null;
    if (response.status === 401 && !route.startsWith('/auth/')) window.dispatchEvent(new Event('forma:session-expired'));
    const error = new Error(result.error || 'Não foi possível concluir a operação.');
    error.status = response.status;
    throw error;
  }
  if (result.csrf) csrf = result.csrf;
  return result;
}

export async function exportCsv(type) {
  const blob = await api('/admin/export', { params: { type }, blob: true });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `forma-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const money = (cents) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(cents || 0) / 100);
export async function downloadReceipt(id) {
  const blob = await api(`/orders/${id}/receipt`, { blob: true });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `forma-encomenda-${id}.pdf`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const paymentLabels = { paid: 'Aprovado', failed: 'Recusado', pending: 'Pendente', unpaid: 'Por pagar', refunded: 'Reembolsado' };
export const date = (value) => new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value.replace(' ', 'T') + 'Z'));
export const statusLabels = { pending: 'Recebida', processing: 'Em preparação', shipped: 'Enviada', delivered: 'Entregue', cancelled: 'Cancelada' };
export const transitions = { pending: ['processing', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

export function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Carrinho continua a funcionar em memória. */ }
}
