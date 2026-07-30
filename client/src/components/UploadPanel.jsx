import { useState, useRef } from 'react';
import { uploadCsvs } from '../services/api';

export default function UploadPanel({ batchId, onUploaded }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const aRef = useRef(null);
  const bRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const aFile = aRef.current?.files?.[0];
    const bFile = bRef.current?.files?.[0];
    if (!aFile || !bFile) {
      setError('Select both a Ledger A and a Ledger B CSV file.');
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadCsvs(batchId, aFile, bFile);
      setResult(res);
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="upload-panel">
      <button className="upload-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} Upload your own CSVs (optional — falls back to seeded demo data if skipped)
      </button>
      {open && (
        <form className="upload-form" onSubmit={handleSubmit}>
          <div className="upload-field">
            <label>Ledger A (internal) CSV</label>
            <input type="file" accept=".csv" ref={aRef} />
            <span className="upload-hint">columns: txnId, amount, date, refId, description</span>
          </div>
          <div className="upload-field">
            <label>Ledger B (bank/external) CSV</label>
            <input type="file" accept=".csv" ref={bRef} />
            <span className="upload-hint">columns: statementId, amount, date, refId, narration</span>
          </div>
          <button className="btn-upload" type="submit" disabled={uploading}>
            {uploading ? 'Uploading…' : `Upload to batch "${batchId}"`}
          </button>
          {error && <div className="upload-error">{error}</div>}
          {result && (
            <div className="upload-success">
              Loaded {result.ledgerACount} Ledger A + {result.ledgerBCount} Ledger B rows into "{result.batchId}". Click Run reconciliation above.
            </div>
          )}
        </form>
      )}
    </div>
  );
}