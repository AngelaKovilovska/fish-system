import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Home, ClipboardList, Clock, FileBarChart, Settings, Users, Scale, Package, X, Bell } from 'lucide-react';
import FishBackground from './FishBackground';

const navItems = [
  { path: '/', label: 'Почетна', icon: Home },
  { path: '/checklist', label: 'Запис', icon: ClipboardList },
  { path: '/history', label: 'Историја', icon: Clock },
  { path: '/reports', label: 'Извештаи', icon: FileBarChart },
];

const adminItems = [
  { path: '/admin/measurements', label: 'Мерења', icon: Scale },
  { path: '/admin/inventory', label: 'Залихи', icon: Package },
  { path: '/admin/norms', label: 'Норми', icon: Settings },
  { path: '/admin/users', label: 'Корисници', icon: Users },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const isChecklist = location.pathname === '/checklist' || location.pathname.startsWith('/checklist/');
  const mobileItems = isAdmin
    ? [...navItems, { path: '/admin', label: 'Админ', icon: Settings }]
    : navItems;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false);
      }
    };
    if (showProfile) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfile]);

  useEffect(() => { setShowProfile(false); }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* ═══════ DESKTOP SIDEBAR ═══════ */}
      <aside className="sidebar hidden lg:flex">
        <Link to="/" className="flex items-center gap-2.5 px-2 mb-8 group">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 12c3-5 10-5 13 0-3 5-10 5-13 0z" />
              <path d="M3 12c-1-2-2-3-2.5-2.5.3 1 1 2.5 2 3.5-1 1-1.5 2.5-2 3.5.5.5 1.5-.5 2.5-2.5" />
              <line x1="19.5" y1="10" x2="22" y2="8.5" />
              <line x1="19.5" y1="12" x2="23" y2="12" />
              <line x1="19.5" y1="14" x2="22" y2="15.5" />
            </svg>
          </div>
          <span className="font-bold text-[15px] text-white tracking-[0.08em]"
            style={{ fontFamily: 'Sora, sans-serif' }}>CLARIO</span>
        </Link>

        <nav className="flex-1 flex flex-col gap-0.5">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                className={`sidebar-link ${isActive ? 'active' : ''}`}>
                <item.icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                {item.label}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="h-px bg-white/10 my-3 mx-2" />
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/30 font-semibold px-3 mb-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>Админ</p>
              {adminItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}>
                    <item.icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: isAdmin ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
              {user?.full_name?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/90 truncate">{user?.full_name}</p>
              <p className="text-[10px] text-white/40">{isAdmin ? 'Админ' : 'Работник'}</p>
            </div>
          </div>
          <button onClick={logout}
            className="sidebar-link w-full hover:!text-red-400 hover:!bg-red-500/10">
            <LogOut size={16} />
            Одјави се
          </button>
        </div>
      </aside>

      {/* ═══════ MOBILE HEADER ═══════ */}
      <header className="lg:hidden sticky top-0 z-40 px-4 py-3 flex items-center justify-between"
        style={{
          paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
        }}>
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 12c3-5 10-5 13 0-3 5-10 5-13 0z" />
              <path d="M3 12c-1-2-2-3-2.5-2.5.3 1 1 2.5 2 3.5-1 1-1.5 2.5-2 3.5.5.5 1.5-.5 2.5-2.5" />
            </svg>
          </div>
          <span className="font-bold text-sm tracking-[0.08em] text-[var(--text-primary)]"
            style={{ fontFamily: 'Sora, sans-serif' }}>CLARIO</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="relative" ref={profileRef}>
            <button onClick={() => setShowProfile(!showProfile)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white transition-transform active:scale-95"
              style={{ background: isAdmin ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
              {user?.full_name?.[0] || 'U'}
            </button>

            {showProfile && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[calc(100vw-2rem)] min-[400px]:w-56 max-w-[14rem] bg-white rounded-[var(--r-md)] border border-[var(--border)] p-4 animate-slide-down z-50"
                style={{ boxShadow: 'var(--sh-elevated)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold"
                    style={{ fontFamily: 'Sora, sans-serif' }}>Профил</p>
                  <button onClick={() => setShowProfile(false)} className="text-[var(--text-muted)] p-0.5">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: isAdmin ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
                    {user?.full_name?.[0] || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate" style={{ fontFamily: 'Sora, sans-serif' }}>{user?.full_name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{user?.email}</p>
                  </div>
                </div>
                <div className="mb-3">
                  <span className={`pill ${isAdmin ? 'pill-warning' : 'pill-blue'}`}>
                    {isAdmin ? 'Админ' : 'Работник'}
                  </span>
                </div>
                <div className="h-px bg-[var(--border)] mb-3" />
                <button onClick={logout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[var(--r-sm)] text-[var(--danger)] text-sm font-medium transition-all hover:bg-[#FEF2F2]"
                  style={{ fontFamily: 'Sora, sans-serif' }}>
                  <LogOut size={16} />
                  Одјави се
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══════ FISH BACKGROUND (Dashboard & Reports) ═══════ */}
      {(location.pathname === '/' || location.pathname === '/reports') && (
        <FishBackground variant="light" />
      )}

      {/* ═══════ MAIN CONTENT ═══════ */}
      <main className="relative z-1 pb-24 lg:pb-8 lg:ml-[240px]">
        {/* Decorative koi fish illustration (hidden on checklist) */}
        {!isChecklist && (
          <>
            {/* Desktop: top-right corner */}
            <div className="absolute top-0 right-0 pointer-events-none overflow-hidden hidden lg:block"
              style={{ width: 200, height: 200, zIndex: 0 }}>
              <img
                src="/images/koi-fish.png"
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -15,
                  right: -15,
                  width: 190,
                  height: 190,
                  objectFit: 'contain',
                  opacity: 0.45,
                }}
              />
            </div>
            {/* Mobile: centered faded watermark */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden lg:hidden flex items-center justify-center"
              style={{ zIndex: 0 }}>
              <img
                src="/images/koi-fish.png"
                alt=""
                aria-hidden="true"
                style={{
                  width: 280,
                  height: 280,
                  objectFit: 'contain',
                  opacity: 0.06,
                }}
              />
            </div>
          </>
        )}

        <div className="max-w-[1200px] mx-auto px-4 py-5 lg:px-8 lg:py-6 animate-in relative z-1 overflow-x-hidden">
          <Outlet />
        </div>
      </main>

      {/* ═══════ MOBILE BOTTOM TAB BAR ═══════ */}
      <nav className="bottom-tab-bar flex lg:hidden">
        {mobileItems.map(item => {
          const isActive = location.pathname === item.path ||
            (item.path === '/admin' && location.pathname.startsWith('/admin'));
          return (
            <Link key={item.path} to={item.path}
              className={`tab-item ${isActive ? 'active' : ''}`}>
              <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
