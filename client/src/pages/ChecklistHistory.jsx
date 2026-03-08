import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Search, X, ChevronLeft, ChevronRight, Clock, AlertTriangle } from 'lucide-react';

const PER_PAGE = 10;

export default function ChecklistHistory() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadRecords = async (p, from, to) => {
    setLoading(true);
    try {
      const params = { limit: PER_PAGE, offset: p * PER_PAGE };
      if (from) params.from = from;
      if (to) params.to = to;
      const data = await api.getRecords(params);
      setRecords(data.records);
      setTotal(data.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadRecords(0, '', ''); }, []);

  const handleSearch = () => { setPage(0); loadRecords(0, dateFrom, dateTo); };
  const handleClear = () => { setDateFrom(''); setDateTo(''); setPage(0); loadRecords(0, '', ''); };
  const handlePageChange = (newPage) => { setPage(newPage); loadRecords(newPage, dateFrom, dateTo); };

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <h1 className="page-title mb-4 animate-in">Историја на записи</h1>

      {/* Inline filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4 animate-in-delay-1
        bg-white rounded-[var(--r-md)] px-4 py-3" style={{ boxShadow: 'var(--sh-card)' }}>
        <span className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap hidden sm:block"
          style={{ fontFamily: 'Sora, sans-serif' }}>Од:</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="input-base !py-2 !text-sm flex-1" />
        <span className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap hidden sm:block"
          style={{ fontFamily: 'Sora, sans-serif' }}>До:</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="input-base !py-2 !text-sm flex-1" />
        <div className="flex gap-2">
          <button onClick={handleSearch} className="btn-primary py-2 px-4 text-sm">
            <Search size={15} /> Пребарај
          </button>
          {(dateFrom || dateTo) && (
            <button onClick={handleClear} className="btn-secondary py-2 px-3 text-sm">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-[var(--text-muted)] mb-3 animate-in-delay-2" style={{ fontFamily: 'Sora, sans-serif' }}>
        {total} {total === 1 ? 'запис' : 'записи'}
        {(dateFrom || dateTo) && ' за избраниот период'}
      </p>

      {/* Records */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="card text-center py-10">
          <Clock size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
          <p className="text-[var(--text-muted)] text-sm">Нема записи.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <div className="bg-white rounded-[var(--r-md)] overflow-hidden animate-in-delay-2" style={{ boxShadow: 'var(--sh-card)' }}>
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Датум</th>
                    <th>Ден</th>
                    <th>Проверил</th>
                    <th className="text-center">Аларми</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="group">
                      <td className="font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                        {new Date(record.date).toLocaleDateString('mk-MK', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </td>
                      <td className="text-[var(--text-secondary)]">
                        {new Date(record.date).toLocaleDateString('mk-MK', { weekday: 'long' })}
                      </td>
                      <td className="text-[var(--text-secondary)]">{record.checked_by_name}</td>
                      <td className="text-center">
                        {record.alert_count > 0 ? (
                          <span className="pill pill-danger inline-flex items-center gap-1">
                            <AlertTriangle size={11} /> {record.alert_count}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">--</span>
                        )}
                      </td>
                      <td className="text-right">
                        <Link to={`/history/${record.id}`}
                          className="btn-ghost text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          Детали <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card list */}
          <div className="lg:hidden space-y-2.5">
            {records.map((record, i) => (
              <Link key={record.id} to={`/history/${record.id}`}
                className={`card-hover block animate-in-delay-${Math.min(i + 1, 6)}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-sm text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {new Date(record.date).toLocaleDateString('mk-MK', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </span>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Проверил: {record.checked_by_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.alert_count > 0 && (
                      <span className="pill pill-danger flex items-center gap-1">
                        <AlertTriangle size={11} />
                        {record.alert_count}
                      </span>
                    )}
                    <ChevronRight size={18} className="text-[var(--text-muted)]" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => handlePageChange(page - 1)} disabled={page === 0}
            className="btn-secondary py-2 px-3 text-sm disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <div className="flex gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => handlePageChange(i)}
                className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
                  i === page ? 'chip-active' : 'chip-inactive'
                }`}>
                {i + 1}
              </button>
            ))}
          </div>
          <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages - 1}
            className="btn-secondary py-2 px-3 text-sm disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
