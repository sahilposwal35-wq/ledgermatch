export function formatAmount(n) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const MATCH_TYPE_LABEL = {
  exact: 'Exact',
  fuzzy: 'Fuzzy',
  split: 'Split',
  amount_mismatch: 'Mismatch',
  unmatched_a: 'Missing on B',
  unmatched_b: 'Missing on A',
  duplicate: 'Duplicate'
};

export const REASON_LABEL = {
  EXACT_MATCH: 'Exact match',
  TIMING_DIFF: 'Timing difference',
  BATCHED_SETTLEMENT: 'Batched settlement',
  AMOUNT_DISCREPANCY: 'Amount discrepancy',
  MISSING_ON_LEDGER_B: 'Missing on Ledger B',
  MISSING_ON_LEDGER_A: 'Missing on Ledger A'
};
