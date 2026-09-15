import { useState, useEffect, useCallback } from 'react';
import StatBar from './components/StatBar';
import LedgerTable from './components/LedgerTable';
import MatchDrawer from './components/MatchDrawer';
import AuditTrail from './components/AuditTrail';
import BreakdownChart from './components/BreakdownChart';
import UploadPanel from './components/UploadPanel';
import SettingsView from './components/SettingsView';
import AuthScreen from './components/AuthScreen';
import { runReconciliation, getMatches, getAuditTrail, getBatches, createBatch, getBatch, getMe } from './services/api';
import { exportMatchesCsv } from './utils/format';

const LAST_BATCH_KEY = 'ledgermatch:lastBatchId';
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'auto_matched', label: 'Matched' },
  { key: 'resolved', label: 'Resolved' }
];

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [batches, setBatches] = useState([]);
  const [activeBatchName, setActiveBatchName] = useState(() => localStorage.getItem(LAST_BATCH_KEY) || '');
  const [activeBatch, setActiveBatch] = useState(null);
  
  const [newBatchName, setNewBatchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [matches, setMatches] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (token) {
      getMe()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        });
    } else {
      setUser(null);
    }
  }, [token]);

  const isMaker = user?.role === 'maker';

  const loadBatches = useCallback(async () => {
    try {
      const data = await getBatches();
      setBatches(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadBatchData = useCallback(async (batchName, currentFilter) => {
    if (!batchName) {
      setActiveBatch(null);
      setMatches([]);
      setAuditLogs([]);
      return;
    }
    
    setError(null);
    try {
      const batchData = await getBatch(batchName);
      setActiveBatch(batchData);
      
      setLoadingMatches(true);
      setLoadingAudit(true);
      
      const status = currentFilter === 'all' ? undefined : currentFilter;
      const [matchesResponse, auditData] = await Promise.all([
        getMatches(batchName, { status }),
        getAuditTrail(batchName)
      ]);
      
      setMatches(matchesResponse.matches || []);
      setAuditLogs(auditData);
      
    } catch (e) {
      setError(e.message);
      setActiveBatch(null);
      if (e.message.toLowerCase().includes('not found')) {
        setActiveBatchName('');
        localStorage.removeItem(LAST_BATCH_KEY);
      }
    } finally {
      setLoadingMatches(false);
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadBatches();
    }
  }, [loadBatches, token]);

  useEffect(() => {
    if (!token) return;
    if (activeBatchName) {
      localStorage.setItem(LAST_BATCH_KEY, activeBatchName);
    }
    loadBatchData(activeBatchName, filter);
  }, [activeBatchName, filter, loadBatchData, token]);

  async function handleCreateBatch(e) {
    e.preventDefault();
    if (!newBatchName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const batch = await createBatch(newBatchName);
      await loadBatches();
      setActiveBatchName(batch.name);
      setNewBatchName('');
    } catch (e) {
      setError(e.message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRun() {
    if (!activeBatchName) return;
    setRunning(true);
    setError(null);
    setCurrentView('dashboard');
    try {
      await runReconciliation(activeBatchName);
      await loadBatchData(activeBatchName, filter);
      setToast('Reconciliation complete');
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
    getAuditTrail(activeBatchName).then(setAuditLogs);
    setToast('Decision recorded');
    setTimeout(() => setToast(null), 2500);
  }

  function handleExport() {
    if (matches.length === 0) return;
    exportMatchesCsv(matches, activeBatchName);
    setToast('CSV exported');
    setTimeout(() => setToast(null), 2500);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem(LAST_BATCH_KEY);
    setToken(null);
    setUser(null);
    setActiveBatchName('');
    setActiveBatch(null);
  }

  if (!token) {
    return <AuthScreen onLogin={() => setToken(localStorage.getItem('token'))} />;
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark">Ledger<span>Match</span></div>
          {user && (
            <div style={{ fontSize: 11, color: 'var(--sidebar-text)', marginTop: 6 }}>
              {user.email}
              <span style={{
                display: 'inline-block',
                marginLeft: 6,
                padding: '1px 6px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                background: isMaker ? 'rgba(13,148,136,0.2)' : 'rgba(217,119,6,0.2)',
                color: isMaker ? '#5eead4' : '#fbbf24'
              }}>
                {user.role}
              </span>
            </div>
          )}
        </div>
        <div className="sidebar-nav">
          <div
            data-label="Dashboard"
            className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            Dashboard
          </div>
          <div
            data-label="Settings"
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            Settings
          </div>
        </div>
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button className="btn-ghost" style={{ width: '100%', color: 'var(--sidebar-text)', textAlign: 'left' }} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="page-header">
          <div className="page-title">
            {currentView === 'dashboard' ? 'Reconciliation Overview' : 'Settings'}
          </div>
          <div className="header-actions">
            <div className="batch-field">
              <label htmlFor="batchSelect">Batch</label>
              <select 
                id="batchSelect" 
                className="batch-select"
                value={activeBatchName}
                onChange={e => setActiveBatchName(e.target.value)}
              >
                <option value="">Select batch</option>
                {batches.map(b => (
                  <option key={b._id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            {/* Run Reconciliation shown for makers only.
                UI hiding is convenience, server enforces authorization. */}
            {isMaker && (
              <button 
                className="btn-primary" 
                onClick={handleRun} 
                disabled={running || !activeBatch || activeBatch.status === 'created'}
              >
                {running ? 'Running...' : 'Run Reconciliation'}
              </button>
            )}
          </div>
        </div>

        <div className="page-body">
          {error && <div className="error-banner">{error}</div>}

          {currentView === 'settings' ? (
            <SettingsView batch={activeBatch} onUpdate={setActiveBatch} />
          ) : (
            !activeBatchName || !activeBatch ? (
              <div className="empty-state">
                <div className="empty-state-title">No batch selected</div>
                <div style={{ marginBottom: 20 }}>
                  {isMaker 
                    ? 'Create a new batch or select an existing one to begin.'
                    : 'Select an existing batch to review and approve matches.'}
                </div>
                {isMaker && (
                  <form onSubmit={handleCreateBatch} style={{ display: 'inline-flex', gap: 8 }}>
                    <input 
                      className="batch-select" 
                      placeholder="e.g. AUG-RECON-01" 
                      value={newBatchName}
                      onChange={e => setNewBatchName(e.target.value)}
                      style={{ background: '#fff' }}
                    />
                    <button type="submit" className="btn-secondary" disabled={isCreating}>
                      {isCreating ? 'Creating...' : 'Create Batch'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <>
                {isMaker && (
                  <UploadPanel 
                    batch={activeBatch} 
                    onUploaded={() => loadBatchData(activeBatchName, filter)} 
                  />
                )}

                {activeBatch?.summary && (
                  <StatBar summary={activeBatch.summary} />
                )}

                {activeBatch?.status === 'reconciled' && (
                  <div className="dashboard-layout">
                    <div className="table-panel">
                      <div className="panel-header">
                        <div className="panel-title">Exception Queue</div>
                        <div className="panel-actions">
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
                          <button
                            className="btn-ghost"
                            onClick={handleExport}
                            disabled={matches.length === 0}
                            title="Export results as CSV"
                          >
                            Export CSV
                          </button>
                        </div>
                      </div>
                      
                      <LedgerTable
                        matches={matches}
                        selectedId={selected?._id}
                        onSelect={setSelected}
                        loading={loadingMatches}
                      />
                    </div>

                    <div className="sidebar-right">
                      {activeBatch?.summary?.breakdown && (
                        <BreakdownChart breakdown={activeBatch.summary.breakdown} />
                      )}
                      <AuditTrail logs={auditLogs} loading={loadingAudit} />
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>

      {selected && (
        <MatchDrawer
          match={selected}
          onClose={() => setSelected(null)}
          onResolved={handleResolved}
          user={user}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}