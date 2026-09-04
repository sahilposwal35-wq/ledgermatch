const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed: ${res.status}`, res.status, body);
  }
  return res.json();
}

export async function getBatches() {
  const res = await fetch(`${BASE}/batches`);
  return handle(res);
}

export async function createBatch(name) {
  const res = await fetch(`${BASE}/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return handle(res);
}

export async function getBatch(name) {
  const res = await fetch(`${BASE}/batches/${name}`);
  return handle(res);
}

export async function updateRules(batchId, rules) {
  const res = await fetch(`${BASE}/batches/${batchId}/rules`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rules)
  });
  return handle(res);
}

export async function runReconciliation(batchId) {
  const res = await fetch(`${BASE}/reconcile/${batchId}`, { method: 'POST' });
  return handle(res);
}

export async function getMatches(batchId, { status, page = 1, limit = 50 } = {}) {
  const qs = new URLSearchParams();
  if (status) qs.append('status', status);
  qs.append('page', page);
  qs.append('limit', limit);
  
  const res = await fetch(`${BASE}/matches/${batchId}?${qs.toString()}`);
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

export async function uploadCsvs(batchId, fileA, fileB, mappingA, mappingB, force = false) {
  const fd = new FormData();
  fd.append('ledgerA', fileA);
  fd.append('ledgerB', fileB);
  fd.append('mappingA', JSON.stringify(mappingA));
  fd.append('mappingB', JSON.stringify(mappingB));
  const url = `${BASE}/upload/${batchId}${force ? '?force=true' : ''}`;
  const res = await fetch(url, { method: 'POST', body: fd });
  return handle(res);
}