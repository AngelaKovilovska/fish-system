import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Trash2, Plus, X, ChevronLeft } from 'lucide-react';

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
      .catch(console.error)
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

  const handleDelete = async (id, name) => {
    if (!confirm(`Дали сте сигурни дека сакате да го избришете ${name}?`)) return;
    try { await api.deleteUser(id); loadUsers(); }
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
          <button onClick={() => navigate('/admin')} className="btn-ghost p-1.5 -ml-1.5">
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
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Email</label>
            <input type="email" placeholder="email@example.com"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-base" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Целосно име</label>
            <input type="text" placeholder="Име Презиме"
              value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input-base" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Лозинка</label>
            <input type="password" placeholder="••••••••"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input-base" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Улога</label>
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

      {/* Users table */}
      <div className="bg-[var(--surface)] rounded-[var(--r-md)] overflow-hidden animate-in-delay-1" style={{ boxShadow: 'var(--sh-card)' }}>
        <table className="table-modern">
          <thead>
            <tr>
              <th>Корисник</th>
              <th>Email</th>
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
                <td className="text-[var(--text-secondary)] text-xs">{u.email}</td>
                <td className="text-center">
                  <span className={`pill ${u.role === 'admin' ? 'pill-warning' : 'pill-blue'}`}>
                    {u.role === 'admin' ? 'Админ' : 'Оператор'}
                  </span>
                </td>
                <td className="text-right">
                  {u.id !== currentUser.id && (
                    <button onClick={() => handleDelete(u.id, u.full_name)}
                      className="btn-ghost text-[var(--danger)] hover:bg-red-50 p-2"
                      title="Избриши">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
