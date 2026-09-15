export function formatAmount(n) {
  if (n === undefined || n === null) return '-';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '-';
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

/**
 * Exports the current match results as a downloadable CSV file.
 * Runs entirely client-side using the match data already loaded in memory.
 */
export function exportMatchesCsv(matches, batchName) {
  const headers = ['Type', 'Reference ID', 'Date', 'Amount (A)', 'Amount (B)', 'Delta', 'Reason', 'Status', 'Resolved By', 'Resolution Note'];

  const rows = matches.map(m => {
    const a = m.ledgerAIds?.[0];
    const b = m.ledgerBIds?.[0];
    return [
      MATCH_TYPE_LABEL[m.matchType] || m.matchType,
      a?.refId || b?.refId || '',
      (a?.date || b?.date) ? new Date(a?.date || b?.date).toISOString().split('T')[0] : '',
      a?.amount ?? '',
      b?.amount ?? '',
      m.amountDelta || '',
      REASON_LABEL[m.reasonCode] || m.reasonCode || '',
      m.status?.replace('_', ' ') || '',
      typeof m.resolution?.resolvedBy === 'object' ? m.resolution.resolvedBy.email : '',
      m.resolution?.reason || ''
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${batchName}-results.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
