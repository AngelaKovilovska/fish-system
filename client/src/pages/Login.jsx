import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { useTheme } from '../context/ThemeContext';

export default function Login() {
  const { login } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Заборавена лозинка: 'login' → 'forgot' (внеси е-пошта) → 'reset' (код од е-пошта + нова лозинка)
  const [mode, setMode] = useState('login');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState('');

  const goTo = (m) => { setMode(m); setError(''); setInfo(''); };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      const r = await api.forgotPassword(email);
      setMode('reset'); setCode(''); setNewPassword('');
      setInfo(r.message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (newPassword.length < 8) return setError('Новата лозинка мора да има минимум 8 знаци');
    setLoading(true);
    try {
      const r = await api.resetPassword(email, code.trim(), newPassword);
      setMode('login'); setPassword(''); setCode(''); setNewPassword('');
      setInfo(r.message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

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
          <p className="text-xs text-(--text-muted) mt-1 tracking-wide"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            Систем за управување со RAS систем
          </p>
        </div>

        {/* ── Form card ── */}
        <div className="bg-(--surface) rounded-(--r-lg) p-8 max-[400px]:p-6 border border-(--border)"
          style={{ boxShadow: theme === 'dark' ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.08)' }}>

          {/* ── Error display ── */}
          {error && (
            <div className="alert-danger text-center text-[13px] mb-5 animate-in">
              {error}
            </div>
          )}

          {info && (
            <div className="alert-success text-center text-[13px] mb-5 animate-in">
              {info}
            </div>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot}>
              <p className="text-[13px] text-(--text-secondary) mb-4 text-center">
                Внесете ја вашата е-пошта. Ќе добиете код за поставување нова лозинка.
              </p>
              <div className="mb-5">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Е-пошта" required
                  autoComplete="email" aria-label="Е-пошта" className="input-base w-full !py-3.5 !px-4 !text-[15px]" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full !h-12 !text-[15px]">
                {loading ? 'Се испраќа...' : 'Испрати код'}
              </button>
              <button type="button" onClick={() => goTo('login')} className="w-full text-center text-[13px] text-(--primary) font-semibold mt-4">
                Назад кон најава
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleReset}>
              <div className="mb-4">
                <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-цифрен код од е-поштата" required
                  autoComplete="one-time-code" aria-label="Код" className="input-base w-full !py-3.5 !px-4 !text-[15px] tracking-widest text-center" />
              </div>
              <div className="mb-5 relative">
                <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Нова лозинка (мин. 8 знаци)" required autoComplete="new-password" aria-label="Нова лозинка"
                  className="input-base w-full !py-3.5 !pl-4 !pr-12 !text-[15px]" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Сокриј лозинка' : 'Покажи лозинка'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 btn-ghost p-1.5 text-(--text-muted)">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full !h-12 !text-[15px]">
                {loading ? 'Се зачувува...' : 'Постави нова лозинка'}
              </button>
              <div className="flex justify-between mt-4 text-[13px] font-semibold text-(--primary)">
                <button type="button" onClick={() => goTo('forgot')}>Испрати нов код</button>
                <button type="button" onClick={() => goTo('login')}>Назад кон најава</button>
              </div>
            </form>
          )}

          {/* ── Form ── */}
          {mode === 'login' && <form onSubmit={handleSubmit}>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 btn-ghost p-1.5 text-(--text-muted)"
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
            <button type="button" onClick={() => goTo('forgot')}
              className="w-full text-center text-[13px] text-(--primary) font-semibold mt-4">
              Заборавена лозинка?
            </button>
          </form>}
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-[11px] text-(--text-muted) mt-5 opacity-60"
          style={{ fontFamily: 'Sora, sans-serif' }}>
          Фамаком Аквакултура &middot; v2.0
        </p>
      </div>
    </div>
  );
}
