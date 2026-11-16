import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, KeyRound } from 'lucide-react';
import { api } from '../lib/api';

// Промена на сопствената лозинка (достапно за секој корисник од менито со профилот)
export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 8) return setError('Новата лозинка мора да има минимум 8 знаци');
    if (next !== repeat) return setError('Двете нови лозинки не се исти');
    setSaving(true); setError('');
    try {
      await api.changePassword(current, next);
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title text-sm flex items-center gap-2"><KeyRound size={16} /> Смени лозинка</h3>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Затвори"><X size={16} /></button>
        </div>
        {error && <div className="alert-danger text-xs">{error}</div>}
        {done && <div className="alert-success text-xs">Лозинката е сменета.</div>}
        <div>
          <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5">Тековна лозинка</label>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="input-base" required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5">Нова лозинка (мин. 8 знаци)</label>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="input-base" required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5">Повтори ја новата лозинка</label>
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className="input-base" required />
        </div>
        <button type="submit" disabled={saving || done} className="btn-primary w-full py-2.5">{saving && !done ? 'Се зачувува...' : 'Зачувај'}</button>
      </form>
    </div>,
    document.body
  );
}
