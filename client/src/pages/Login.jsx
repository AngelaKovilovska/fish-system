import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Login() {
  const { login } = useAuth();
  const { theme } = useTheme();
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
    <div className="min-h-screen flex justify-center items-center px-5 py-8 relative overflow-hidden"
      style={{
        background: theme === 'dark'
          ? 'linear-gradient(145deg, #0B1120 0%, #0F172A 40%, #1a2744 100%)'
          : 'linear-gradient(145deg, #e0ecf8 0%, #F1F5F9 40%, #dbeafe 100%)',
      }}>

      {/* ── Decorative background circles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[200px] -right-[200px] w-[500px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-[150px] -left-[150px] w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }} />
      </div>

      {/* ── Card container ── */}
      <div className="w-full max-w-[400px] relative z-10 animate-in">
        {/* ── Logo area (above card) ── */}
        <div className="flex flex-col items-center mb-6">
          <img
            src="/images/clario-logo.png"
            alt="CLARIO"
            className="w-[140px] h-[140px] object-contain"
            style={{ mixBlendMode: theme === 'dark' ? 'screen' : 'multiply' }}
          />
          <p className="text-xs text-[var(--text-muted)] mt-1 tracking-wide"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            Систем за управување со RAS систем
          </p>
        </div>

        {/* ── Form card ── */}
        <div className="bg-[var(--surface)] rounded-[var(--r-lg)] p-8 max-[400px]:p-6 border border-[var(--border)]"
          style={{ boxShadow: theme === 'dark' ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.08)' }}>

          {/* ── Error display ── */}
          {error && (
            <div className="alert-danger text-center text-[13px] mb-5 animate-in">
              {error}
            </div>
          )}

          {/* ── Form ── */}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Е-пошта"
                required
                autoComplete="email"
                aria-label="Е-пошта"
                className="input-base w-full !py-3.5 !px-4 !text-[15px]"
              />
            </div>

            <div className="mb-5 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Лозинка"
                required
                autoComplete="current-password"
                aria-label="Лозинка"
                className="input-base w-full !py-3.5 !pl-4 !pr-12 !text-[15px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Сокриј лозинка' : 'Покажи лозинка'}
                className="absolute right-3 top-1/2 -translate-y-1/2 btn-ghost p-1.5 text-[var(--text-muted)]"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full !h-12 !text-[15px]"
              style={{ fontFamily: 'Sora, -apple-system, sans-serif' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="wave-loader"><span /><span /><span /><span /></div>
                  Се најавува...
                </span>
              ) : 'Најави се'}
            </button>
          </form>
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-[11px] text-[var(--text-muted)] mt-5 opacity-60"
          style={{ fontFamily: 'Sora, sans-serif' }}>
          Фамаком Аквакултура &middot; v2.0
        </p>
      </div>
    </div>
  );
}
