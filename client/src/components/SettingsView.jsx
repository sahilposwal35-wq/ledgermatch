import { useState } from 'react';
import { updateRules } from '../services/api';

export default function SettingsView({ batch, onUpdate }) {
  const [dateTolerance, setDateTolerance] = useState(batch?.rules?.dateToleranceDays ?? 2);
  const [amountTolerance, setAmountTolerance] = useState(batch?.rules?.amountTolerance ?? 0.01);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await updateRules(batch.name, { 
        dateToleranceDays: Number(dateTolerance), 
        amountTolerance: Number(amountTolerance) 
      });
      onUpdate(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!batch) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No Batch Selected</div>
        <div>Please select a batch from the dashboard to configure its rules.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '600px' }}>
      <h2 style={{ marginBottom: '8px' }}>Matching Rules Configuration</h2>
      <p style={{ color: '#8892b0', marginBottom: '32px' }}>
        Configure the mathematical tolerances used by the reconciliation engine for batch <strong>{batch.name}</strong>.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {success && <div style={{ padding: '12px', background: 'rgba(76, 175, 80, 0.1)', color: '#4caf50', border: '1px solid #4caf50', borderRadius: '4px', marginBottom: '24px' }}>Rules updated successfully! Re-run reconciliation to apply them.</div>}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Date Tolerance (Days)</label>
          <div style={{ color: '#8892b0', fontSize: '13px', marginBottom: '8px' }}>
            Maximum number of days a bank transaction can be delayed and still be considered a fuzzy match.
          </div>
          <input 
            type="number" 
            min="0" 
            max="30" 
            value={dateTolerance}
            onChange={e => setDateTolerance(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd', width: '100px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Amount Tolerance (Variance)</label>
          <div style={{ color: '#8892b0', fontSize: '13px', marginBottom: '8px' }}>
            Maximum allowed absolute difference in amount (e.g. 0.01 for rounding, 5.00 for bank fees).
          </div>
          <input 
            type="number" 
            step="0.01" 
            min="0" 
            value={amountTolerance}
            onChange={e => setAmountTolerance(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd', width: '100px' }}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={saving} style={{ width: 'fit-content', marginTop: '16px' }}>
          {saving ? 'Saving...' : 'Save Rules'}
        </button>
      </form>
    </div>
  );
}
