/**
 * HistorialPage.jsx — /resultados/historial
 * Lista cronológica de picks día por día.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2, XCircle, Clock, ChevronRight } from 'lucide-react';
import Loader from '../components/Loader';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildLast30Days() {
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(localDay(d));
  }
  return days;
}

function StatusIcon({ status }) {
  if (status === 'WON') return <CheckCircle2 size={14} className="text-accent-green shrink-0" />;
  if (status === 'LOST') return <XCircle size={14} className="text-red-500 shrink-0" />;
  return <Clock size={14} className="text-slate-500 shrink-0" />;
}

export default function HistorialPage() {
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistorial() {
      setLoading(true);
      try {
        const res = await fetch(`${BACKEND}/api/picks/history`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setHistorial(json.picks || []);
      } catch {
        setHistorial([]);
      } finally {
        setLoading(false);
      }
    }
    fetchHistorial();
  }, []);

  // Group picks by day
  const byDay = historial.reduce((acc, entry) => {
    const d = entry.savedAt || entry.date || entry.created_at;
    const day = d ? localDay(new Date(d)) : 'unknown';
    if (!acc[day]) acc[day] = [];
    acc[day].push(entry);
    return acc;
  }, {});

  // Sort days descending
  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  const formatDay = (dayKey) => {
    try {
      const d = new Date(dayKey + 'T12:00:00');
      return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch { return dayKey; }
  };

  const getDayStats = (entries) => {
    let total = 0, wins = 0, losses = 0;
    entries.forEach(e => {
      (e.picks || []).forEach(p => {
        total++;
        if (p.status === 'WON') wins++;
        if (p.status === 'LOST') losses++;
      });
    });
    return { total, wins, losses, pending: total - wins - losses };
  };

  return (
    <div className="animate-in pb-20">

      {/* Header */}
      <div className="pt-8 mb-12">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/resultados" className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm font-bold">
            <ArrowLeft size={16} /> Resultados
          </Link>
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
          <span className="text-white">Historial de</span>{' '}
          <span style={{ color: '#BFF102' }}>Picks</span>
        </h1>
        <p className="text-slate-500 text-sm uppercase tracking-widest font-bold">
          Registro cronológico de todos nuestros pronósticos
        </p>
      </div>

      {loading ? (
        <Loader text="Cargando historial..." />
      ) : days.length === 0 ? (
        <div className="py-32 text-center opacity-30">
          <Calendar size={64} strokeWidth={1} className="mx-auto mb-6" />
          <p className="font-black uppercase tracking-widest">Sin historial disponible</p>
        </div>
      ) : (
        <div className="space-y-8">
          {days.map(day => {
            const entries = byDay[day];
            const stats = getDayStats(entries);
            const allResolved = stats.wins + stats.losses;
            const dayWinRate = allResolved > 0 ? Math.round((stats.wins / allResolved) * 100) : null;

            return (
              <div key={day} className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                {/* Day header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <Calendar size={15} className="text-accent-green" />
                    <span className="text-sm font-black text-white capitalize">{formatDay(day)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {dayWinRate !== null && (
                      <span className="text-[11px] font-black px-2 py-1 rounded-lg"
                        style={{
                          background: dayWinRate >= 70 ? 'rgba(114,191,1,0.15)' : dayWinRate >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.1)',
                          color: dayWinRate >= 70 ? '#BFF102' : dayWinRate >= 50 ? '#f59e0b' : '#ef4444',
                        }}>
                        {dayWinRate}% efectividad
                      </span>
                    )}
                    <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">
                      <span className="text-accent-green">{stats.wins} ✅</span>
                      <span className="text-red-500">{stats.losses} ❌</span>
                      {stats.pending > 0 && <span className="text-slate-500">{stats.pending} ⏳</span>}
                    </div>
                  </div>
                </div>

                {/* Entries */}
                <div className="divide-y divide-white/5">
                  {entries.map((entry, i) => (
                    <div key={entry.id || i} className="px-6 py-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-bold text-slate-200">{entry.home}</span>
                            <span className="text-xs text-slate-600 font-black">vs</span>
                            <span className="text-sm font-bold text-slate-200">{entry.away}</span>
                            {entry.score && (
                              <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded bg-accent-green/10 text-accent-green border border-accent-green/20">
                                {entry.score.home} - {entry.score.away}
                              </span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {(entry.picks || []).map((pick, j) => (
                              <div key={j} className="flex items-center gap-3">
                                <StatusIcon status={pick.status} />
                                <span className="text-xs font-semibold text-slate-300">{pick.selection}</span>
                                <span className="text-[10px] text-slate-500 font-bold">{pick.probability}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {entry.fixtureId && (
                          <Link to={`/partido/${entry.fixtureId}`}
                            className="p-2 rounded-lg text-slate-600 hover:text-white hover:bg-white/5 transition-all shrink-0">
                            <ChevronRight size={16} />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
