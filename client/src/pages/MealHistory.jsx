import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { UtensilsCrossed, Search, X, ChevronLeft, ChevronRight, Sunrise, Sun, Moon, Calendar } from 'lucide-react';

const PER_PAGE = 15;

const MEAL_INFO = {
  breakfast: { label: 'Појадок', icon: <Sunrise size={14} className="text-amber-500" /> },
  lunch: { label: 'Ручек', icon: <Sun size={14} className="text-yellow-500" /> },
  dinner: { label: 'Вечера', icon: <Moon size={14} className="text-indigo-400" /> },
};

export default function MealHistory() {
  const navigate = useNavigate();
  const [dates, setDates] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadDates = async (p, from, to) => {
    setLoading(true);
    try {
      const data = await api.getMealHistory({ limit: PER_PAGE, offset: p * PER_PAGE, from, to });
      setDates(data.dates);
      setTotal(data.total);
    } catch { setDates([]); setTotal(0); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadDates(0, '', ''); }, []);

  const handleSearch = () => { setPage(0); loadDates(0, dateFrom, dateTo); };
  const handleClear = () => { setDateFrom(''); setDateTo(''); setPage(0); loadDates(0, '', ''); };
  const handlePageChange = (newPage) => { setPage(newPage); loadDates(newPage, dateFrom, dateTo); };

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="overflow-hidden">
      <div className="flex items-center gap-3 mb-4 animate-in">
        <button onClick={() => navigate('/entry')} className="btn-ghost p-1.5 -ml-1.5 flex-shrink-0" aria-label="Назад">
          <ChevronLeft size={20} />
        </button>
        <div className="icon-box"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
          <UtensilsCrossed size={18} />
        </div>
        <div>
          <h1 className="page-title">Историја на оброци</h1>
          <p className="text-xs text-[var(--text-secondary)]">Прегледај и измени оброци по датум</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4 animate-in-delay-1
        bg-[var(--surface)] rounded-[var(--r-md)] px-4 py-3 overflow-hidden" style={{ boxShadow: 'var(--sh-card)' }}>
        <label htmlFor="mh-from" className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap hidden sm:block"
          style={{ fontFamily: 'Sora, sans-serif' }}>Од:</label>
        <input id="mh-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="input-base !py-2 !text-sm sm:flex-1 w-full min-w-0" style={{ maxWidth: '100%' }} />
        <label htmlFor="mh-to" className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap hidden sm:block"
          style={{ fontFamily: 'Sora, sans-serif' }}>До:</label>
        <input id="mh-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="input-base !py-2 !text-sm sm:flex-1 w-full min-w-0" style={{ maxWidth: '100%' }} />
        <div className="flex gap-2">
          <button onClick={handleSearch} className="btn-primary py-2 px-4 text-sm">
            <Search size={15} /> Пребарај
          </button>
          {(dateFrom || dateTo) && (
            <button onClick={handleClear} className="btn-secondary py-2 px-3 text-sm" aria-label="Исчисти филтри">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-[var(--text-muted)] mb-3 animate-in-delay-2" style={{ fontFamily: 'Sora, sans-serif' }}>
        {total} {total === 1 ? 'датум' : 'датуми'}
        {(dateFrom || dateTo) && ' за избраниот период'}
      </p>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
      ) : dates.length === 0 ? (
        <div className="card text-center py-10">
          <Calendar size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
          <p className="text-[var(--text-muted)] text-sm">Нема внесени оброци.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <div className="bg-[var(--surface)] rounded-[var(--r-md)] overflow-hidden animate-in-delay-2" style={{ boxShadow: 'var(--sh-card)' }}>
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Датум</th>
                    <th>Ден</th>
                    <th>Оброци</th>
                    <th className="text-right">Вкупно храна</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map((entry) => {
                    const d = new Date(entry.date);
                    return (
                      <tr key={entry.date} className="group">
                        <td className="font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                          {d.toLocaleDateString('mk-MK', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </td>
                        <td className="text-[var(--text-secondary)]">
                          {d.toLocaleDateString('mk-MK', { weekday: 'long' })}
                        </td>
                        <td>
                          <div className="flex gap-1.5">
                            {['breakfast', 'lunch', 'dinner'].map(mt => {
                              const filled = entry.meal_types.includes(mt);
                              return (
                                <Link
                                  key={mt}
                                  to={`/meal/${mt}?date=${entry.date}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all hover:scale-105 border"
                                  style={{
                                    background: filled ? 'rgba(34,197,94,0.08)' : 'var(--bg)',
                                    color: filled ? 'var(--success)' : 'var(--text-muted)',
                                    borderColor: filled ? 'rgba(34,197,94,0.25)' : 'var(--border)',
                                  }}
                                  title={`${filled ? 'Измени' : 'Додај'} ${MEAL_INFO[mt].label}`}
                                >
                                  {MEAL_INFO[mt].icon}
                                  <span className="hidden xl:inline">{MEAL_INFO[mt].label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </td>
                        <td className="text-right text-[var(--text-secondary)]">
                          {entry.total_food_gr > 0 ? `${(entry.total_food_gr).toFixed(0)} gr` : '-'}
                        </td>
                        <td className="text-right">
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {['breakfast', 'lunch', 'dinner'].map(mt => (
                              <Link key={mt} to={`/meal/${mt}?date=${entry.date}`}
                                className="btn-ghost text-xs py-1 px-2"
                                title={`${entry.meal_types.includes(mt) ? 'Измени' : 'Додај'} ${MEAL_INFO[mt].label}`}>
                                {MEAL_INFO[mt].icon}
                              </Link>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card list */}
          <div className="lg:hidden space-y-2.5">
            {dates.map((entry, i) => {
              const d = new Date(entry.date);
              return (
                <div key={entry.date}
                  className={`card !p-0 overflow-hidden animate-in-delay-${Math.min(i + 1, 6)}`}>
                  <div className="px-4 py-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-semibold text-sm text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                          {d.toLocaleDateString('mk-MK', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                          })}
                        </span>
                        {entry.total_food_gr > 0 && (
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            Вкупно: {entry.total_food_gr.toFixed(0)} gr
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {['breakfast', 'lunch', 'dinner'].map(mt => {
                        const filled = entry.meal_types.includes(mt);
                        return (
                          <Link
                            key={mt}
                            to={`/meal/${mt}?date=${entry.date}`}
                            className="flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-[var(--r-sm)] transition-all active:scale-95 border"
                            style={{
                              background: filled ? 'rgba(34,197,94,0.08)' : 'var(--bg)',
                              borderColor: filled ? 'rgba(34,197,94,0.25)' : 'var(--border)',
                            }}
                          >
                            {MEAL_INFO[mt].icon}
                            <span className={`text-[10px] font-medium ${filled ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
                              {MEAL_INFO[mt].label}
                            </span>
                            <span className={`text-[9px] ${filled ? 'text-[var(--success)]' : 'text-[var(--text-muted)] opacity-50'}`}>
                              {filled ? '✓ Измени' : '+ Додај'}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => handlePageChange(page - 1)} disabled={page === 0}
            className="btn-secondary py-2 px-3 text-sm disabled:opacity-30" aria-label="Претходна страница">
            <ChevronLeft size={16} />
          </button>
          <div className="flex gap-1.5">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum;
              if (totalPages <= 7) {
                pageNum = i;
              } else if (page < 4) {
                pageNum = i;
              } else if (page >= totalPages - 4) {
                pageNum = totalPages - 7 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                  className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
                    pageNum === page ? 'chip-active' : 'chip-inactive'
                  }`}>
                  {pageNum + 1}
                </button>
              );
            })}
          </div>
          <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages - 1}
            className="btn-secondary py-2 px-3 text-sm disabled:opacity-30" aria-label="Следна страница">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
