import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Trash2, BarChart2, Calendar, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

function ProbBadge({ prob }) {
  const color = prob >= 85 ? '#00ff88' : '#1e90ff';
  return (
    <span className="text-sm font-bold font-mono" style={{ color }}>{prob}%</span>
  );
}

export default function PicksPage() {
  const navigate = useNavigate();
  const { picks, setPicks } = useApp();
  const [loaded, setLoaded] = useState([]);

  // Cargar picks guardados de localStorage al inicio
  useEffect(() => {
    const stored = localStorage.getItem('tipster_picks');
    if (stored) {
      const parsed = JSON.parse(stored);
      setPicks(parsed);
      setLoaded(parsed);
    } else {
      setLoaded(picks);
    }
  }, []);

  useEffect(() => {
    setLoaded(picks);
  }, [picks]);

  const deleteEntry = (id) => {
    const updated = picks.filter(p => p.id !== id);
    setPicks(updated);
    localStorage.setItem('tipster_picks', JSON.stringify(updated));
  };

  const clearAll = () => {
    setPicks([]);
    localStorage.removeItem('tipster_picks');
  };

  const totalPicks = loaded.reduce((s, e) => s + (e.picks?.length || 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="section-title mb-1">Historial</p>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={22} className="text-accent-green" />
            Mis Picks
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {loaded.length} análisis guardados · {totalPicks} picks totales
          </p>
        </div>
        {loaded.length > 0 && (
          <button onClick={clearAll}
            className="btn-ghost border border-accent-red/20 text-accent-red text-xs">
            <Trash2 size={13} /> Borrar todo
          </button>
        )}
      </div>

      {/* Empty state */}
      {loaded.length === 0 && (
        <div className="text-center py-20">
          <BarChart2 size={48} className="text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold text-lg mb-2">Sin picks guardados</p>
          <p className="text-slate-600 text-sm mb-6">Analiza un partido y guarda los picks para verlos aquí</p>
          <button onClick={() => navigate('/')} className="btn-primary mx-auto">
            Ver partidos de hoy
          </button>
        </div>
      )}

      {/* Picks list */}
      <div className="space-y-4">
        {loaded.map(entry => (
          <div key={entry.id} className="glass-card-hover p-5">
            {/* Match header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-white text-sm">
                  {entry.home} <span className="text-slate-600">vs</span> {entry.away}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Calendar size={10} /> {entry.date ? new Date(entry.date).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' }) : '–'}
                  </span>
                  <span className="text-[10px] text-slate-600">·</span>
                  <span className="text-[10px] text-slate-500">{entry.league}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => navigate(`/analysis/${entry.fixtureId}`)}
                  className="btn-ghost p-1.5 border border-surface-600">
                  <ChevronRight size={14} />
                </button>
                <button onClick={() => deleteEntry(entry.id)}
                  className="btn-ghost p-1.5 border border-accent-red/20 text-accent-red">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Picks grid */}
            <div className="space-y-2">
              {entry.picks?.map((pick, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className="text-base">{pick.tier}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{pick.market}</p>
                    <p className="text-sm font-semibold text-white truncate">{pick.selection}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <ProbBadge prob={pick.probability} />
                    <p className="text-[10px] text-slate-600">{pick.units}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-slate-600 mt-3">
              Guardado {entry.savedAt ? new Date(entry.savedAt).toLocaleString('es-PE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '–'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
