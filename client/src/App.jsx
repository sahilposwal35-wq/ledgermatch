import { useState, useEffect, useCallback } from 'react';
import StatBar from './components/StatBar';
import LedgerTable from './components/LedgerTable';
import MatchDrawer from './components/MatchDrawer';
import AuditTrail from './components/AuditTrail';
import BreakdownChart from './components/BreakdownChart';
import UploadPanel from './components/UploadPanel';
import { runReconciliation, getMatches, getAuditTrail } from './services/api';

const DEFAULT_BATCH = 'DEMO-BATCH-001';
const LAST_BATCH_KEY = 'ledgermatch:lastBatchId';
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'Pending review' },
  { key: 'auto_matched', label: 'Auto-matched' },
  { key: 'resolved', label: 'Resolved' }
];

export default function App() {
  // Restore whatever batch the user last worked with, so a page refresh doesn't
  // silently snap back to the seeded demo batch and make uploaded data look "lost"
  const [batchId, setBatchId] = useState(() => {
    try {
      return localStorage.getItem(LAST_BATCH_KEY) || DEFAULT_BATCH;
    } catch {
      return DEFAULT_BATCH; // localStorage can throw in some private-browsing modes
    }
  });
  const [summary, setSummary] = useState(null);
  const [matches, setMatches] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const loadMatches = useCallback(async (currentFilter) => {
    setLoadingMatches(true);
    try {
      const status = currentFilter === 'all' ? undefined : currentFilter;
      const data = await getMatches(batchId, { status });
      setMatches(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMatches(false);
    }
  }, [batchId]);

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const data = await getAuditTrail(batchId);
      setAuditLogs(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingAudit(false);
    }
  }, [batchId]);

  useEffect(() => {
    loadMatches(filter);
    loadAudit();
    try {
      localStorage.setItem(LAST_BATCH_KEY, batchId);
    } catch {
      // ignore — persistence is a nice-to-have, not required for the app to work
    }
  }, [batchId]);

  useEffect(() => {
    loadMatches(filter);
  }, [filter]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const { summary } = await runReconciliation(batchId);
      setSummary(summary);
      await loadMatches(filter);
      await loadAudit();
      setToast('Reconciliation run complete');
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  function handleResolved(updated) {
    setMatches(prev => prev.map(m => (m._id === updated._id ? { ...m, ...updated } : m)));
    setSelected(updated);
    loadAudit();
    setToast('Decision recorded to audit trail');
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">Ledger<span>Match</span></div>
          <div className="brand-sub">reconciliation worksheet</div>
        </div>
        <div className="topbar-controls">
          <div className="batch-field">
            <label htmlFor="batchId">Batch no.</label>
            <input
              id="batchId"
              className="batch-select"
              value={batchId}
              onChange={e => setBatchId(e.target.value)}
              spellCheck={false}
            />
          </div>
          <button className="btn-run" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run reconciliation'}
          </button>
        </div>
      </header>

      <UploadPanel batchId={batchId} onUploaded={() => { loadMatches(filter); loadAudit(); }} />

      {error && <div className="error-banner">{error}</div>}

      <StatBar summary={summary} />

      <div className="main-layout">
        <div className="queue-panel">
          {summary?.breakdown && <BreakdownChart breakdown={summary.breakdown} />}

          <div className="panel-header">
            <div className="panel-title">Exception queue</div>
            <div className="filter-tabs">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`filter-tab ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <LedgerTable
            matches={matches}
            selectedId={selected?._id}
            onSelect={setSelected}
            loading={loadingMatches}
          />
        </div>

        <AuditTrail logs={auditLogs} loading={loadingAudit} />
      </div>

      {selected && (
        <MatchDrawer
          match={selected}
          onClose={() => setSelected(null)}
          onResolved={handleResolved}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}