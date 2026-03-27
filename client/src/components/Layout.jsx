import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, Home, ClipboardList, Clock, FileBarChart, Settings, Users, Scale, Package, X, Moon, Sun, Brain, ChevronDown, MoreHorizontal, UtensilsCrossed } from 'lucide-react';
import FishBackground from './FishBackground';

// ─── Sidebar sections ───
const sidebarSections = [
  {
    items: [
      { path: '/', label: 'Почетна', icon: Home },
    ],
  },
  {
    title: 'Дневни задачи',
    items: [
      { path: '/checklist', label: 'Запис', icon: ClipboardList },
      { path: '/history', label: 'Историја', icon: Clock },
    ],
  },
  {
    title: 'Аналитика',
    items: [
      { path: '/ai-calculator', label: 'AI Храна', icon: Brain },
      { path: '/reports', label: 'Извештаи', icon: FileBarChart },
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

// ─── Mobile: main tabs (max 4) + More ───
const mobilePrimaryTabs = [
  { path: '/', label: 'Почетна', icon: Home },
  { path: '/checklist', label: 'Запис', icon: ClipboardList },
  { path: '/ai-calculator', label: 'AI Храна', icon: Brain },
  { path: '/reports', label: 'Извештаи', icon: FileBarChart },
];

const mobileMoreItems = [
  { path: '/history', label: 'Историја', icon: Clock },
];

const mobileAdminItems = [
  { path: '/admin/measurements', label: 'Мерења', icon: Scale },
  { path: '/admin/inventory', label: 'Залихи', icon: Package },
  { path: '/admin/norms', label: 'Норми', icon: Settings },
  { path: '/admin/users', label: 'Корисници', icon: Users },
];

// Helper to check if any item in section is active
function isSectionActive(items, pathname) {
  return items.some(item => pathname === item.path || pathname.startsWith(item.path + '/'));
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const profileRef = useRef(null);
  const moreRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const isChecklist = location.pathname === '/checklist' || location.pathname.startsWith('/checklist/');

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false);
    };
    if (showProfile || showMore) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfile, showMore]);

  // Close on navigation
  useEffect(() => {
    setShowProfile(false);
    setShowMore(false);
  }, [location.pathname]);

  // Check if "More" section has an active item
  const moreItems = [...mobileMoreItems, ...(isAdmin ? mobileAdminItems : [])];
  const isMoreActive = moreItems.some(item =>
    location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* ═══════ DESKTOP SIDEBAR ═══════ */}
      <aside className="sidebar hidden lg:flex">
        <div className="flex items-center justify-between px-2 mb-8">
          <Link to="/" className="flex items-center gap-2.5 group">
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
          <button onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
            title={theme === 'dark' ? 'Светла тема' : 'Темна тема'}>
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
                const isActive = location.pathname === item.path;
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
          background: theme === 'dark' ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)',
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
          <button onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] transition-all active:scale-95 hover:bg-[var(--primary-muted)]">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="relative" ref={profileRef}>
            <button onClick={() => setShowProfile(!showProfile)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white transition-transform active:scale-95"
              style={{ background: isAdmin ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
              {user?.full_name?.[0] || 'U'}
            </button>

            {showProfile && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[calc(100vw-2rem)] min-[400px]:w-56 max-w-[14rem] bg-[var(--surface)] rounded-[var(--r-md)] border border-[var(--border)] p-4 animate-slide-down z-50"
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
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path}
              className={`tab-item ${isActive ? 'active' : ''}`}>
              <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* More button */}
        {moreItems.length > 0 && (
          <div className="relative" ref={moreRef}>
            <button onClick={() => setShowMore(!showMore)}
              className={`tab-item ${isMoreActive ? 'active' : ''}`}>
              <MoreHorizontal size={20} strokeWidth={isMoreActive ? 2.2 : 1.6} />
              <span>Повеќе</span>
            </button>

            {showMore && (
              <div className="absolute bottom-[calc(100%+8px)] right-0 w-48 bg-[var(--surface)] rounded-[var(--r-md)] border border-[var(--border)] py-1.5 animate-slide-down z-50"
                style={{ boxShadow: 'var(--sh-elevated)' }}>
                {moreMoreItems(moreItems, location.pathname)}
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

/* Render the "More" dropdown items */
function moreMoreItems(items, pathname) {
  // Group admin items separately
  const regular = items.filter(i => !i.path.startsWith('/admin'));
  const admin = items.filter(i => i.path.startsWith('/admin'));

  return (
    <>
      {regular.map(item => {
        const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
        return (
          <Link key={item.path} to={item.path}
            className={`flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition-colors ${
              isActive
                ? 'text-[var(--primary)] bg-[var(--primary-muted)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--primary-muted)] hover:text-[var(--text-primary)]'
            }`}
            style={{ fontFamily: 'Sora, sans-serif' }}>
            <item.icon size={16} strokeWidth={isActive ? 2.2 : 1.6} />
            {item.label}
          </Link>
        );
      })}

      {admin.length > 0 && (
        <>
          <div className="h-px bg-[var(--border)] my-1.5 mx-2" />
          <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)] font-semibold px-3 py-1"
            style={{ fontFamily: 'Sora, sans-serif' }}>Админ</p>
          {admin.map(item => {
            const isActive = pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-[var(--primary)] bg-[var(--primary-muted)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--primary-muted)] hover:text-[var(--text-primary)]'
                }`}
                style={{ fontFamily: 'Sora, sans-serif' }}>
                <item.icon size={16} strokeWidth={isActive ? 2.2 : 1.6} />
                {item.label}
              </Link>
            );
          })}
        </>
      )}
    </>
  );
}
