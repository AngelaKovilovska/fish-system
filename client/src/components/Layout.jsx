import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, Home, PenSquare, FileBarChart, Settings, Users, X, Moon, Sun, BarChart3, Shield, Scale, Package } from 'lucide-react';
import FishBackground from './FishBackground';

// ─── 4 main sections: Дома, Внес, Извештаи, Проекции ───
const sidebarSections = [
  {
    items: [
      { path: '/', label: 'Дома', icon: Home },
      { path: '/entry', label: 'Внес', icon: PenSquare },
      { path: '/reports', label: 'Извештаи', icon: FileBarChart },
      { path: '/ai-calculator', label: 'Проекции', icon: BarChart3 },
    ],
  },
];

const adminSection = {
  title: 'Админ',
  items: [
    { path: '/admin/measurements', label: 'Мерења', icon: Scale },
    { path: '/admin/inventory', label: 'Залихи', icon: Package },
    { path: '/admin/norms', label: 'Норми', icon: Settings },
    { path: '/admin/users', label: 'Корисници', icon: Users },
  ],
};

// ─── Mobile: 4 tabs (+ 5th "Админ" tab for admin users) ───
const mobilePrimaryTabs = [
  { path: '/', label: 'Дома', icon: Home },
  { path: '/entry', label: 'Внес', icon: PenSquare },
  { path: '/reports', label: 'Извештаи', icon: FileBarChart },
  { path: '/ai-calculator', label: 'Проекции', icon: BarChart3 },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const isChecklist = location.pathname === '/checklist' || location.pathname.startsWith('/checklist/');

  // Routes that belong to the "Внес" section for active state highlighting
  const entryPaths = ['/entry', '/checklist', '/meal/', '/meals'];
  const isEntryActive = entryPaths.some(p => location.pathname === p || location.pathname.startsWith(p));
  // Routes that belong to "Извештаи" section
  const reportPaths = ['/reports', '/history'];
  const isReportsActive = reportPaths.some(p => location.pathname === p || location.pathname.startsWith(p));
  // Routes that belong to "Админ" section
  const isAdminActive = location.pathname.startsWith('/admin');

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
    };
    if (showProfile) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfile]);

  // Close on navigation
  useEffect(() => {
    setShowProfile(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* ═══════ DESKTOP SIDEBAR ═══════ */}
      <aside className="sidebar hidden lg:flex">
        <div className="flex items-center justify-between px-2 mb-8">
          <Link to="/" className="flex items-center group">
            <img
              src="/images/clario-logo.png"
              alt="CLARIO"
              className="h-9 object-contain"
            />
          </Link>
          <button onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
            title={theme === 'dark' ? 'Светла тема' : 'Темна тема'}
            aria-label={theme === 'dark' ? 'Светла тема' : 'Темна тема'}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto">
          {sidebarSections.map((section, sIdx) => (
            <div key={sIdx}>
              {/* Section title */}
              {section.title && (
                <>
                  {sIdx > 0 && <div className="h-px bg-white/10 my-3 mx-2" />}
                  <p className="text-[10px] uppercase tracking-[0.1em] text-white/30 font-semibold px-3 mb-1"
                    style={{ fontFamily: 'Sora, sans-serif' }}>{section.title}</p>
                </>
              )}

              {/* Section items */}
              {section.items.map(item => {
                let isActive = location.pathname === item.path;
                // Special active logic for grouped sections
                if (item.path === '/entry') isActive = isEntryActive;
                if (item.path === '/reports') isActive = isReportsActive;
                return (
                  <Link key={item.path} to={item.path}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}>
                    <item.icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="h-px bg-white/10 my-3 mx-2" />
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/30 font-semibold px-3 mb-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>{adminSection.title}</p>
              {adminSection.items.map(item => {
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
              <p className="text-[10px] text-white/40">{isAdmin ? 'Админ' : 'Оператор'}</p>
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
          background: theme === 'dark' ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
        }}>
        <Link to="/" className="flex items-center">
          <img
            src="/images/clario-logo.png"
            alt="CLARIO"
            className="h-8 object-contain"
          />
        </Link>

        <div className="flex items-center gap-2">
          <button onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светла тема' : 'Темна тема'}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] transition-all active:scale-95 hover:bg-[var(--primary-muted)]">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="relative" ref={profileRef}>
            <button onClick={() => setShowProfile(!showProfile)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white transition-transform active:scale-95"
              style={{ background: isAdmin ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}
              aria-label="Профил мени">
              {user?.full_name?.[0] || 'U'}
            </button>

            {showProfile && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[calc(100vw-2rem)] min-[400px]:w-56 max-w-[14rem] bg-[var(--surface)] rounded-[var(--r-md)] border border-[var(--border)] p-4 animate-slide-down z-50"
                style={{ boxShadow: 'var(--sh-elevated)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold"
                    style={{ fontFamily: 'Sora, sans-serif' }}>Профил</p>
                  <button onClick={() => setShowProfile(false)} className="text-[var(--text-muted)] p-0.5"
                    aria-label="Затвори профил">
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
                    {isAdmin ? 'Админ' : 'Оператор'}
                  </span>
                </div>
                <div className="h-px bg-[var(--border)] my-2" />
                <button onClick={logout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[var(--r-sm)] text-[var(--danger)] text-sm font-medium transition-all hover:bg-[rgba(239,68,68,0.08)]"
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
        {mobilePrimaryTabs.map(item => {
          let isActive = location.pathname === item.path;
          if (item.path === '/entry') isActive = isEntryActive;
          if (item.path === '/reports') isActive = isReportsActive;
          return (
            <Link key={item.path} to={item.path}
              className={`tab-item ${isActive ? 'active' : ''}`}>
              <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Admin tab (admin only) */}
        {isAdmin && (
          <Link to="/admin"
            className={`tab-item ${isAdminActive ? 'active' : ''}`}>
            <Shield size={20} strokeWidth={isAdminActive ? 2.2 : 1.6} />
            <span>Админ</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
