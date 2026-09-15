import { useState } from 'react';
import { login, register } from '../services/api';

export default function AuthScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('maker');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = isLogin ? await login(email, password) : await register(email, password, role);
      localStorage.setItem('token', res.token);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f8f7f6', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: '36px 32px', borderRadius: '6px', border: '1px solid #e8e6e3', width: '100%', maxWidth: '380px' }}>
        
        <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px', textAlign: 'center', color: '#0f1729', letterSpacing: '-0.3px' }}>
          Ledger<span style={{ color: '#0d9488' }}>Match</span>
        </div>
        <p style={{ textAlign: 'center', color: '#8a8a8a', marginBottom: '28px', fontSize: '13px' }}>
          Bank Reconciliation Platform
        </p>

        {error && <div className="error-banner" style={{ marginBottom: '14px' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 500, color: '#5c5c5c' }}>Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', borderRadius: '4px', border: '1px solid #d4d1cd', fontSize: '13px' }}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 500, color: '#5c5c5c' }}>Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', borderRadius: '4px', border: '1px solid #d4d1cd', fontSize: '13px' }}
              placeholder="Enter password"
            />
          </div>

          {!isLogin && (
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 500, color: '#5c5c5c' }}>Role</label>
              <div style={{ display: 'flex', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '13px', color: '#1a1a1a' }}>
                  <input 
                    type="radio" 
                    name="role" 
                    value="maker" 
                    checked={role === 'maker'} 
                    onChange={() => setRole('maker')}
                    style={{ accentColor: '#0d9488' }}
                  />
                  Maker
                  <span style={{ fontSize: '11px', color: '#8a8a8a' }}>(upload, reconcile)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '13px', color: '#1a1a1a' }}>
                  <input 
                    type="radio" 
                    name="role" 
                    value="checker" 
                    checked={role === 'checker'} 
                    onChange={() => setRole('checker')}
                    style={{ accentColor: '#0d9488' }}
                  />
                  Checker
                  <span style={{ fontSize: '11px', color: '#8a8a8a' }}>(review, approve)</span>
                </label>
              </div>
            </div>
          )}
          
          <button type="submit" className="btn-primary" style={{ marginTop: '4px', width: '100%', padding: '10px' }} disabled={loading}>
            {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: '#8a8a8a' }}>
          {isLogin ? "No account? " : "Already registered? "}
          <span 
            style={{ color: '#0d9488', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => { setIsLogin(!isLogin); setError(null); }}
          >
            {isLogin ? 'Register' : 'Sign In'}
          </span>
        </div>

      </div>
    </div>
  );
}
