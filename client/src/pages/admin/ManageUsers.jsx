import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Trash2, Plus, X, ChevronLeft, KeyRound } from 'lucide-react';

export default function ManageUsers() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'operator' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = () => {
    api.getUsers()
      .then(d => setUsers(d.users))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      await api.createUser(form);
      setForm({ email: '', full_name: '', password: '', role: 'operator' });
      setShowForm(false);
      loadUsers();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const [savingRole, setSavingRole] = useState(null);
  const handleRoleChange = async (u, role) => {
    if (role === u.role) return;
    const label = role === 'admin' ? 'Админ' : 'Оператор';
    if (!confirm(`Да се смени улогата на ${u.full_name} во „${label}“?`)) return;
    setSavingRole(u.id);
    try {
      await api.updateUser(u.id, { role });
      setUsers(list => list.map(x => (x.id === u.id ? { ...x, role } : x)));
    } catch (err) { alert('Грешка: ' + err.message); }
    finally { setSavingRole(null); }
  };

  // Сопствената улога не се менува; за другите — паѓачко мени
  const renderRole = (u) => (u.id === currentUser.id ? (
    <span className={`pill ${u.role === 'admin' ? 'pill-warning' : 'pill-blue'}`}>
      {u.role === 'admin' ? 'Админ' : 'Оператор'}
    </span>
  ) : (
    <select value={u.role} disabled={savingRole === u.id} onChange={(e) => handleRoleChange(u, e.target.value)}
      aria-label={`Улога на ${u.full_name}`}
      className="input-base !w-auto !py-1 !px-2 !text-xs font-semibold">
      <option value="operator">Оператор</option>
      <option value="admin">Админ</option>
    </select>
  ));

  const handleDelete = async (id, name) => {
    if (!confirm(`Дали сте сигурни дека сакате да го избришете ${name}?`)) return;
    try {
      const r = await api.deleteUser(id);
      if (r?.deactivated) alert(r.message);
      loadUsers();
    }
    catch (err) { alert('Грешка: ' + err.message); }
  };

  // Нова лозинка за корисник (ако ја заборавил) — ја поставува админ
  const handleResetPassword = async (u) => {
    const pw = prompt(`Нова лозинка за ${u.full_name} (минимум 8 знаци):`);
    if (pw == null) return;
    if (pw.length < 8) { alert('Лозинката мора да има минимум 8 знаци.'); return; }
    try { await api.updateUser(u.id, { password: pw }); alert('Лозинката е сменета.'); }
    catch (err) { alert('Грешка: ' + err.message); }
  };

  if (loading) return (
    <div className="max-w-[700px] mx-auto space-y-3">
      {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12" />)}
    </div>
  );

  return (
    <div className="max-w-[700px] mx-auto">
      <div className="flex justify-between items-center mb-5 animate-in">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/admin')} className="btn-ghost p-1.5 -ml-1.5" aria-label="Назад">
            <ChevronLeft size={20} />
          </button>
          <h1 className="page-title">Корисници</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={showForm ? 'btn-secondary py-2 px-3 text-sm' : 'btn-primary py-2 px-3 text-sm'}
        >
          {showForm ? <><X size={15} /> Откажи</> : <><Plus size={15} /> Нов</>}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card mb-5 space-y-3.5 animate-in">
          <h3 className="section-title">Нов корисник</h3>
          {error && <div className="alert-danger text-xs">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Е-пошта</label>
            <input type="email" placeholder="нпр. korisnik@firma.mk"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-base" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Целосно име</label>
            <input type="text" placeholder="Име Презиме"
              value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input-base" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Лозинка</label>
            <input type="password" placeholder="••••••••"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input-base" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Улога</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="input-base">
              <option value="operator">Оператор</option>
              <option value="admin">Админ</option>
            </select>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
            {submitting ? (
              <span className="flex items-center gap-2">
                <div className="wave-loader"><span /><span /><span /><span /></div>
                Се креира...
              </span>
            ) : 'Креирај корисник'}
          </button>
        </form>
      )}

      {/* Users table — desktop */}
      <div className="hidden sm:block bg-(--surface) rounded-(--r-md) overflow-hidden animate-in-delay-1" style={{ boxShadow: 'var(--sh-card)' }}>
        <table className="table-modern">
          <thead>
            <tr>
              <th>Корисник</th>
              <th>Е-пошта</th>
              <th className="text-center">Улога</th>
              <th className="text-right">Акции</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{
                        background: u.role === 'admin'
                          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                          : 'linear-gradient(135deg, var(--primary), var(--primary-deep))',
                      }}>
                      {u.full_name?.[0] || 'U'}
                    </div>
                    <span className="font-semibold text-sm" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {u.full_name}
                    </span>
                  </div>
                </td>
                <td className="text-(--text-secondary) text-xs">{u.email}</td>
                <td className="text-center">
                  {renderRole(u)}
                </td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={() => handleResetPassword(u)} className="btn-ghost p-2" title="Нова лозинка"
                    aria-label={`Нова лозинка за ${u.full_name}`}>
                    <KeyRound size={15} />
                  </button>
                  {u.id !== currentUser.id && (
                    <button onClick={() => handleDelete(u.id, u.full_name)}
                      className="btn-ghost text-(--danger) hover:bg-red-50 p-2"
                      aria-label={`Избриши ${u.full_name}`}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Users cards — mobile */}
      <div className="sm:hidden space-y-3 animate-in-delay-1">
        {users.map((u) => (
          <div key={u.id} className="card !p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{
                  background: u.role === 'admin'
                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                    : 'linear-gradient(135deg, var(--primary), var(--primary-deep))',
                }}>
                {u.full_name?.[0] || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-(--text-primary) truncate" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {u.full_name}
                </p>
                <p className="text-xs text-(--text-muted) truncate">{u.email}</p>
              </div>
              {renderRole(u)}
              <button onClick={() => handleResetPassword(u)} className="btn-ghost p-2" title="Нова лозинка"
                aria-label={`Нова лозинка за ${u.full_name}`}>
                <KeyRound size={16} />
              </button>
              {u.id !== currentUser.id && (
                <button onClick={() => handleDelete(u.id, u.full_name)}
                  className="btn-ghost text-(--danger) p-2"
                  aria-label={`Избриши ${u.full_name}`}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
