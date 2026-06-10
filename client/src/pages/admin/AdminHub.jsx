import { Link, useNavigate } from 'react-router-dom';
import { Scale, Package, Settings, Users, ChevronRight, ChevronLeft } from 'lucide-react';

const adminPages = [
  { path: '/admin/measurements', label: 'Мерења', desc: 'Мерења на базени', icon: Scale, color: 'var(--primary)' },
  { path: '/admin/inventory', label: 'Залихи на храна', desc: 'Управување со храна', icon: Package, color: '#16a34a' },
  { path: '/admin/norms', label: 'Норми', desc: 'Параметри и граници', icon: Settings, color: '#f59e0b' },
  { path: '/admin/users', label: 'Корисници', desc: 'Управување со корисници', icon: Users, color: '#8b5cf6' },
];

export default function AdminHub() {
  const navigate = useNavigate();
  return (
    <div>
      <div className="flex items-center gap-2 mb-1 animate-in">
        <button onClick={() => navigate('/')} className="btn-ghost p-1.5 -ml-1.5">
          <ChevronLeft size={20} />
        </button>
        <h1 className="page-title">Администрација</h1>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-5 animate-in" style={{ fontFamily: 'Sora, sans-serif' }}>
        Управување со системот
      </p>

      <div className="space-y-3 animate-in-delay-1">
        {adminPages.map(item => (
          <Link key={item.path} to={item.path}
            className="card flex items-center gap-3.5 py-3.5 px-4 transition-all active:scale-[0.98]"
            style={{ textDecoration: 'none' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${item.color}15` }}>
              <item.icon size={20} style={{ color: item.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                {item.label}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{item.desc}</p>
            </div>
            <ChevronRight size={16} className="text-[var(--text-muted)] flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
