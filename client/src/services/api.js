const BASE = '/api';

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
