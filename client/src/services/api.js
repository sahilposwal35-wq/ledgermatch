// In local dev, Vite's proxy forwards relative /api requests to localhost:5000.
// That proxy does NOT exist in a production build — once deployed, the frontend
// and backend usually live on different domains (e.g. Vercel + Render), so we
// need an explicit backend URL. Set VITE_API_BASE_URL in the client's deploy
// environment to your backend's full URL, e.g. https://ledgermatch-api.onrender.com/api
const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function runReconciliation(batchId) {
  const res = await fetch(`${BASE}/reconcile/${batchId}`, { method: 'POST' });
  return handle(res);
}

export async function getMatches(batchId, { status, matchType } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (matchType) params.set('matchType', matchType);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${BASE}/matches/${batchId}${qs}`);
  return handle(res);
}

export async function resolveMatch(matchId, { resolvedBy, reason, newStatus }) {
  const res = await fetch(`${BASE}/matches/${matchId}/resolve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolvedBy, reason, newStatus })
  });
  return handle(res);
}

export async function getAuditTrail(batchId) {
  const res = await fetch(`${BASE}/audit/${batchId}`);
  return handle(res);
}

export async function uploadCsvs(batchId, ledgerAFile, ledgerBFile) {
  const formData = new FormData();
  formData.append('ledgerA', ledgerAFile);
  formData.append('ledgerB', ledgerBFile);
  const res = await fetch(`${BASE}/upload/${batchId}`, { method: 'POST', body: formData });
  return handle(res);
}