const BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function handle(res) {
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.reload();
  }
  
  if (!res.ok) {
    let err;
    try { err = await res.json(); } catch(e) {}
    throw new ApiError(res.status, err?.error || res.statusText, err);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return handle(res);
}

export async function register(email, password, role) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role })
  });
  return handle(res);
}

export async function getMe() {
  const res = await fetch(`${BASE}/auth/me`, { headers: getAuthHeaders() });
  return handle(res);
}

export async function resetAccount() {
  const res = await fetch(`${BASE}/reset`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return handle(res);
}

export async function getBatches() {
  const res = await fetch(`${BASE}/batches`, { headers: getAuthHeaders() });
  return handle(res);
}

export async function createBatch(name) {
  const res = await fetch(`${BASE}/batches`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name })
  });
  return handle(res);
}

export async function getBatch(name) {
  const res = await fetch(`${BASE}/batches/${name}`, { headers: getAuthHeaders() });
  return handle(res);
}

export async function updateRules(batchId, rules) {
  const res = await fetch(`${BASE}/batches/${batchId}/rules`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(rules)
  });
  return handle(res);
}

export async function runReconciliation(batchId) {
  const res = await fetch(`${BASE}/reconcile/${batchId}`, { 
    method: 'POST',
    headers: getAuthHeaders()
  });
  return handle(res);
}

export async function getMatches(batchId, { status, page = 1, limit = 50 } = {}) {
  const qs = new URLSearchParams();
  if (status) qs.append('status', status);
  qs.append('page', page);
  qs.append('limit', limit);
  
  const res = await fetch(`${BASE}/matches/${batchId}?${qs.toString()}`, { headers: getAuthHeaders() });
  return handle(res);
}

// resolvedBy is no longer sent by the client - the server determines identity from the JWT.
// Only reason and newStatus are sent.
export async function resolveMatch(id, reason, newStatus) {
  const res = await fetch(`${BASE}/matches/${id}/resolve`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ reason, newStatus })
  });
  return handle(res);
}

export async function getAuditTrail(batchId) {
  const res = await fetch(`${BASE}/audit/${batchId}`, { headers: getAuthHeaders() });
  return handle(res);
}

export async function uploadCsvs(batchId, fileA, fileB, mappingA, mappingB, force = false) {
  const fd = new FormData();
  fd.append('ledgerA', fileA);
  fd.append('ledgerB', fileB);
  fd.append('mappingA', JSON.stringify(mappingA));
  fd.append('mappingB', JSON.stringify(mappingB));
  
  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {}; 

  const url = `${BASE}/upload/${batchId}${force ? '?force=true' : ''}`;
  const res = await fetch(url, { method: 'POST', body: fd, headers });
  return handle(res);
}