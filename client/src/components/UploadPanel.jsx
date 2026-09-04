import { useState, useRef } from 'react';
import { uploadCsvs, ApiError } from '../services/api';

const LEDGER_A_EXPECTED = [
  { key: 'txnId', label: 'Transaction ID' },
  { key: 'amount', label: 'Amount' },
  { key: 'date', label: 'Date (YYYY-MM-DD)' },
  { key: 'refId', label: 'Reference ID' },
  { key: 'description', label: 'Description' }
];

const LEDGER_B_EXPECTED = [
  { key: 'statementId', label: 'Statement ID' },
  { key: 'amount', label: 'Amount' },
  { key: 'date', label: 'Date (YYYY-MM-DD)' },
  { key: 'refId', label: 'Reference ID' },
  { key: 'narration', label: 'Narration' }
];

function parseHeaders(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const firstLine = text.split('\n')[0];
      if (!firstLine) return reject(new Error('File is empty'));
      const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      resolve(headers);
    };
    reader.onerror = reject;
    reader.readAsText(file.slice(0, 4096)); // Read first 4KB
  });
}

export default function UploadPanel({ batch, onUploaded }) {
  const [step, setStep] = useState('select'); // 'select' | 'map'
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [result, setResult] = useState(null);
  
  const aRef = useRef(null);
  const bRef = useRef(null);

  const [headersA, setHeadersA] = useState([]);
  const [headersB, setHeadersB] = useState([]);
  const [mappingA, setMappingA] = useState({});
  const [mappingB, setMappingB] = useState({});

  if (!batch) return null;

  async function handleFilesSelected(e) {
    e.preventDefault();
    const aFile = aRef.current?.files?.[0];
    const bFile = bRef.current?.files?.[0];
    
    if (!aFile || !bFile) {
      setError('Select both a Ledger A and a Ledger B CSV file.');
      return;
    }

    try {
      const ha = await parseHeaders(aFile);
      const hb = await parseHeaders(bFile);
      setHeadersA(ha);
      setHeadersB(hb);
      
      // Auto-map logic based on exact or lowercase match
      const ma = {};
      LEDGER_A_EXPECTED.forEach(f => {
        const found = ha.find(h => h.toLowerCase() === f.key.toLowerCase());
        if (found) ma[f.key] = found;
      });
      setMappingA(ma);

      const mb = {};
      LEDGER_B_EXPECTED.forEach(f => {
        const found = hb.find(h => h.toLowerCase() === f.key.toLowerCase());
        if (found) mb[f.key] = found;
      });
      setMappingB(mb);

      setStep('map');
      setError(null);
      setWarning(null);
    } catch(err) {
      setError('Failed to read files: ' + err.message);
    }
  }

  async function handleUpload(e, force = false) {
    if (e) e.preventDefault();
    
    // Validate mapping
    const missingA = LEDGER_A_EXPECTED.filter(f => !mappingA[f.key]);
    const missingB = LEDGER_B_EXPECTED.filter(f => !mappingB[f.key]);
    
    if (missingA.length > 0 || missingB.length > 0) {
      setError('Please map all required columns for both ledgers before uploading.');
      return;
    }

    setUploading(true);
    setError(null);
    setWarning(null);
    setResult(null);

    const aFile = aRef.current?.files?.[0];
    const bFile = bRef.current?.files?.[0];

    try {
      const res = await uploadCsvs(batch.name, aFile, bFile, mappingA, mappingB, force);
      setResult(res);
      setStep('select');
      if (aRef.current) aRef.current.value = '';
      if (bRef.current) bRef.current.value = '';
      onUploaded?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.requireConfirmation) {
        setWarning(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setUploading(false);
    }
  }

  const hasUploadedBefore = batch.status === 'uploaded' || batch.status === 'reconciled';

  return (
    <div className="upload-panel">
      <div className="upload-title">Data Ingestion</div>
      
      {hasUploadedBefore && !result && step === 'select' && (
        <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
          <div><strong>Current Data:</strong></div>
          <div>Ledger A: {batch.ledgerAFileName} ({batch.ledgerACount} records)</div>
          <div>Ledger B: {batch.ledgerBFileName} ({batch.ledgerBCount} records)</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>Uploading new files will replace the existing data for this batch.</div>
        </div>
      )}

      {step === 'select' && (
        <form className="upload-form" onSubmit={handleFilesSelected}>
          <div className="upload-field">
            <label>Ledger A (Internal) CSV</label>
            <input type="file" accept=".csv" ref={aRef} />
          </div>
          <div className="upload-field">
            <label>Ledger B (External) CSV</label>
            <input type="file" accept=".csv" ref={bRef} />
          </div>
          <button className="btn-secondary" type="submit">
            {hasUploadedBefore ? 'Replace Data (Configure Mapping)' : 'Select Files & Map Columns'}
          </button>
        </form>
      )}

      {step === 'map' && (
        <div className="mapping-container" style={{ display: 'flex', gap: '32px', marginBottom: '24px' }}>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '14px', marginBottom: '16px' }}>Map Ledger A Columns</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {LEDGER_A_EXPECTED.map(field => (
                <div key={field.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '13px', fontWeight: 500 }}>{field.label}</label>
                  <select 
                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ddd', width: '200px' }}
                    value={mappingA[field.key] || ''}
                    onChange={e => setMappingA({ ...mappingA, [field.key]: e.target.value })}
                  >
                    <option value="">-- Select Column --</option>
                    {headersA.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '14px', marginBottom: '16px' }}>Map Ledger B Columns</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {LEDGER_B_EXPECTED.map(field => (
                <div key={field.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '13px', fontWeight: 500 }}>{field.label}</label>
                  <select 
                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ddd', width: '200px' }}
                    value={mappingB[field.key] || ''}
                    onChange={e => setMappingB({ ...mappingB, [field.key]: e.target.value })}
                  >
                    <option value="">-- Select Column --</option>
                    {headersB.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
      
      {step === 'map' && (
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" onClick={e => handleUpload(e, false)} disabled={uploading}>
            {uploading ? 'Uploading & Processing...' : 'Confirm Mapping & Upload'}
          </button>
          <button className="btn-secondary" onClick={() => setStep('select')} disabled={uploading}>
            Cancel
          </button>
        </div>
      )}
      
      {error && <div className="upload-error" style={{ marginTop: '16px' }}>{error}</div>}
      
      {warning && (
        <div className="error-banner" style={{ marginTop: 20, background: 'var(--status-warning-bg)', color: 'var(--status-warning-text)', borderColor: 'var(--status-warning)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Identical Files Detected</div>
          <div style={{ marginBottom: 12 }}>{warning}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-primary" onClick={() => handleUpload(null, true)} disabled={uploading}>
              Continue Anyway
            </button>
            <button className="btn-secondary" onClick={() => setWarning(null)} disabled={uploading}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && step === 'select' && (
        <div className="upload-success" style={{ marginTop: '16px' }}>
          Success: Loaded {result.ledgerACount} Ledger A and {result.ledgerBCount} Ledger B records into "{result.batchId}".
        </div>
      )}
    </div>
  );
}