import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try { await login(email, password); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex justify-center items-center px-5 py-8"
      style={{
        background: 'var(--bg)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>

      {/* ── Card container ── */}
      <div className="w-full"
        style={{
          maxWidth: 420,
          background: 'var(--surface)',
          borderRadius: 20,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          padding: '50px 40px',
          border: '1px solid var(--border)',
        }}>

        {/* ── Logo ── */}
        <div className="flex justify-center" style={{ marginBottom: 30 }}>
          <img
            src="/pwa-512x512.png"
            alt="CLARIO"
            style={{ width: 200, height: 200, objectFit: 'contain' }}
          />
        </div>

        {/* ── Error display ── */}
        {error && (
          <div style={{
            background: 'var(--danger-muted, #fef2f2)',
            border: '1px solid var(--danger)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            color: 'var(--danger)',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* ── Form ── */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="login-input"
              style={{
                width: '100%',
                padding: '16px 18px',
                border: '1.5px solid var(--border)',
                borderRadius: 10,
                fontSize: 15,
                color: 'var(--text-primary)',
                background: 'var(--surface)',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
            />
          </div>

          <div style={{ marginBottom: 18, position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="login-input"
              style={{
                width: '100%',
                padding: '16px 48px 16px 18px',
                border: '1.5px solid var(--border)',
                borderRadius: 10,
                fontSize: 15,
                color: 'var(--text-primary)',
                background: 'var(--surface)',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-btn"
            style={{
              width: '100%',
              padding: 16,
              border: 'none',
              borderRadius: 10,
              background: 'var(--primary)',
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              marginTop: 10,
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.3s ease',
              fontFamily: 'Sora, -apple-system, sans-serif',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
