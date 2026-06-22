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
    <div className="min-h-screen flex justify-center items-center px-5 py-8 bg-[var(--bg)]">

      {/* ── Card container ── */}
      <div className="w-full max-w-[420px] bg-[var(--surface)] rounded-[var(--r-lg)] p-[50px_40px] max-[400px]:p-[40px_24px] border border-[var(--border)]"
        style={{ boxShadow: 'var(--sh-card)' }}>

        {/* ── Logo ── */}
        <div className="flex justify-center mb-8">
          <img
            src="/pwa-512x512.png"
            alt="CLARIO"
            className="w-[200px] h-[200px] object-contain"
          />
        </div>

        {/* ── Error display ── */}
        {error && (
          <div className="alert-danger text-center text-[13px] mb-5">
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
              aria-label="Е-пошта"
              className="input-base w-full !py-4 !px-[18px] !text-[15px]"
            />
          </div>

          <div className="mb-4 relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Лозинка"
              required
              aria-label="Лозинка"
              className="input-base w-full !py-4 !pl-[18px] !pr-12 !text-[15px]"
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
            className="btn-primary w-full !py-4 !text-base mt-2.5"
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
    </div>
  );
}
