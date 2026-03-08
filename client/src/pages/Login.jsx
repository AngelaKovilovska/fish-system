import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        background: 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>

      {/* ── White card container ── */}
      <div className="w-full"
        style={{
          maxWidth: 420,
          background: '#ffffff',
          borderRadius: 20,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          padding: '50px 40px',
        }}>

        {/* ── Logo + Title ── */}
        <div className="text-center" style={{ marginBottom: 10 }}>
          <div className="flex justify-center mb-3">
            <img
              src="/images/clario-logo.png"
              alt="CLARIO"
              className="rounded-full"
              style={{ width: 60, height: 60, objectFit: 'cover' }}
            />
          </div>
          <h1 style={{
            fontSize: 34,
            fontWeight: 600,
            color: '#1a548c',
            marginBottom: 8,
            letterSpacing: -0.5,
            fontFamily: 'Sora, -apple-system, sans-serif',
          }}>
            Clario
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', fontWeight: 400 }}>
            Fish Farm Monitor
          </p>
        </div>

        {/* ── Koi fish illustration ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          margin: '20px 0 30px',
        }}>
          <img
            src="/images/koi-fish.png"
            alt="Koi fish"
            style={{
              width: 200,
              height: 200,
              objectFit: 'contain',
              opacity: 0.85,
            }}
          />
        </div>

        {/* ── Error display ── */}
        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            color: '#dc2626',
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
                border: '1.5px solid #e2e8f0',
                borderRadius: 10,
                fontSize: 15,
                color: '#1e293b',
                background: '#ffffff',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="login-input"
              style={{
                width: '100%',
                padding: '16px 18px',
                border: '1.5px solid #e2e8f0',
                borderRadius: 10,
                fontSize: 15,
                color: '#1e293b',
                background: '#ffffff',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
            />
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
              background: '#1a548c',
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
