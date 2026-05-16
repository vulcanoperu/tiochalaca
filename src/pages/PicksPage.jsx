import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Trash2, BarChart2, Calendar, ChevronRight, CheckCircle2, XCircle, Clock, Target, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PendingWall from '../components/PendingWall';

import { getDbPicks, updateDbPick, deleteDbPick, clearAllDbPicks } from '../services/backendApi';

function ProbBadge({ prob }) {
  const colorClass = prob >= 85 ? 'text-accent-green' : 'text-blue-400';
  return (
    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/5 ${colorClass}`}>
      {prob}%
    </span>
  );
}

export default function PicksPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('chalaca_user') || '{}');
  const { picks, setPicks } = useApp();
  const [loaded, setLoaded] = useState([]);

  useEffect(() => {
    async function fetchPicks() {
      const res = await getDbPicks();
      if (res.success && res.picks) {
        setPicks(res.picks);
      }
    }
    fetchPicks();
  }, [setPicks]);

  useEffect(() => {
    setLoaded(picks);
  }, [picks]);

  // Actualizar estado de un pick específico
  const updatePickStatus = async (entryId, pickIndex, status) => {
    const entryToUpdate = picks.find(e => e.id === entryId);
    if (!entryToUpdate) return;
    
    const newPicks = [...entryToUpdate.picks];
    newPicks[pickIndex] = { ...newPicks[pickIndex], status };
    const updatedEntry = { ...entryToUpdate, picks: newPicks };
    
    const updatedState = picks.map(entry => entry.id === entryId ? updatedEntry : entry);
    setPicks(updatedState);
    
    await updateDbPick(entryId, updatedEntry);
  };

  const deleteEntry = async (id) => {
    const updated = picks.filter(p => p.id !== id);
    setPicks(updated);
    await deleteDbPick(id);
  };

  const clearAll = async () => {
    if (window.confirm('¿Estás seguro de borrar todo el historial?')) {
      setPicks([]);
      await clearAllDbPicks();
    }
  };

  // Cálculos estadísticos
  const stats = useMemo(() => {
    let total = 0, won = 0, lost = 0, pending = 0;
    let streak = 0, bestStreak = 0, currentStreak = 0, currentStreakType = null;

    // Flatten all picks ordered by savedAt
    const allPicks = [];
    loaded.forEach(entry => {
      entry.picks?.forEach(p => {
        allPicks.push({ ...p, savedAt: entry.savedAt || entry.date });
        total++;
        if (p.status === 'WON') won++;
        else if (p.status === 'LOST') lost++;
        else pending++;
      });
    });

    // Calculate current streak from most recent resolved pick
    const resolved = allPicks.filter(p => p.status === 'WON' || p.status === 'LOST');
    for (let i = 0; i < resolved.length; i++) {
      const s = resolved[i].status;
      if (i === 0) { currentStreakType = s; currentStreak = 1; }
      else if (resolved[i].status === currentStreakType) currentStreak++;
      else break;
    }

    const resolvedCount = won + lost;
    const winRate = resolvedCount > 0 ? Math.round((won / resolvedCount) * 100) : 0;
    return { total, won, lost, pending, winRate, currentStreak, currentStreakType };
  }, [loaded]);

  // Agrupación por Mes y Día
  const groupedPicks = useMemo(() => {
    const months = {};
    loaded.forEach(entry => {
      const date = new Date(entry.savedAt || entry.date);
      const monthLabel = date.toLocaleString('es-PE', { month: 'long', year: 'numeric' }).toUpperCase();
      const dayLabel = date.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long' });

      if (!months[monthLabel]) months[monthLabel] = {};
      if (!months[monthLabel][dayLabel]) months[monthLabel][dayLabel] = [];
      months[monthLabel][dayLabel].push(entry);
    });
    return months;
  }, [loaded]);

  if (user?.role === 'pending') {
    return (
      <div className="w-full py-8 mt-10">
        <PendingWall />
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in space-y-8">
      
      {/* ── PANEL ESTADÍSTICO ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4 border-l-4 border-l-accent-green">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Efectividad</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-white">{stats.winRate}%</span>
            <span className="text-[10px] text-accent-green font-bold">W/R</span>
          </div>
          {/* Bar de efectividad */}
          <div className="mt-2 h-1.5 rounded-full bg-surface-700 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${stats.winRate}%`,
                background: stats.winRate >= 60
                  ? 'linear-gradient(90deg,#00ff88,#00cc6a)'
                  : stats.winRate >= 40
                  ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                  : 'linear-gradient(90deg,#ff4757,#e03030)',
              }} />
          </div>
        </div>
        <div className="glass-card p-4 border-l-4 border-l-blue-500">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Total Apuestas</p>
          <span className="text-2xl font-black text-white">{stats.total}</span>
          <p className="text-[10px] text-slate-600 mt-1">{stats.pending} pendientes</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-l-accent-green/60">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Aciertos</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-white">{stats.won}</span>
            <CheckCircle2 size={16} className="text-accent-green" />
          </div>
        </div>
        <div className="glass-card p-4 border-l-4 border-l-accent-red/60">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Errores</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-white">{stats.lost}</span>
            <XCircle size={16} className="text-accent-red" />
          </div>
        </div>
      </div>

      {/* Racha actual */}
      {stats.currentStreak > 1 && (
        <div className={`glass-card p-4 flex items-center gap-4 ${
          stats.currentStreakType === 'WON' 
            ? 'border-accent-green/20 bg-accent-green/[0.04]' 
            : 'border-accent-red/20 bg-accent-red/[0.04]'
        }`}>
          <div className={`text-4xl font-black font-mono ${
            stats.currentStreakType === 'WON' ? 'text-accent-green' : 'text-accent-red'
          }`}>
            {stats.currentStreak}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-200">
              {stats.currentStreakType === 'WON' ? '🔥 Racha ganadora' : '⚠️ Racha perdedora'}
            </p>
            <p className="text-xs text-slate-500">
              {stats.currentStreakType === 'WON'
                ? 'Sigue el buen momento — mantén la disciplina.'
                : 'Revisa tu estrategia — quizás bajar las unidades.'}
            </p>
          </div>
        </div>
      )}

      {/* Header Interactivo */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
            <Target className="text-accent-green" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Historial de Pronósticos</h1>
            <p className="text-xs text-slate-500">{stats.pending} pendientes de calificación</p>
          </div>
        </div>
        {loaded.length > 0 && (
          <button onClick={clearAll} className="btn-ghost text-accent-red text-[10px] uppercase font-bold tracking-widest hover:bg-accent-red/5">
            Limpiar Todo
          </button>
        )}
      </div>

      {/* Empty state */}
      {loaded.length === 0 && (
        <div className="text-center py-20 glass-card">
          <BarChart2 size={40} className="text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 font-bold mb-1">Aún no tienes pronósticos guardados</p>
          <p className="text-slate-600 text-xs mb-6">Analiza un partido y guarda tu primera apuesta🎯</p>
          <button onClick={() => navigate('/')} className="btn-primary mx-auto">Explorar Partidos</button>
        </div>
      )}

      {/* ── LISTADO AGRUPADO ── */}
      <div className="space-y-10">
        {Object.entries(groupedPicks).map(([month, days]) => (
          <div key={month} className="space-y-6">
            <h2 className="text-xs font-black text-slate-600 tracking-[0.3em] uppercase sticky top-0 py-2 bg-surface-950/80 backdrop-blur-sm z-10 border-b border-white/5">
              {month}
            </h2>
            
            {Object.entries(days).map(([day, entries]) => (
              <div key={day} className="space-y-4">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <Calendar size={12} className="text-accent-green" />
                  <h3 className="text-[11px] font-bold uppercase tracking-wider">{day}</h3>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {entries.map(entry => (
                    <div key={entry.id} className="glass-card overflow-hidden group border-white/5 hover:border-white/10 transition-all">
                      {/* Match Header */}
                      <div className="bg-white/[0.02] p-4 flex items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white text-sm">{entry.home}</p>
                            {entry.score ? (
                              <span className="font-mono font-black text-accent-green bg-accent-green/10 px-2 py-0.5 rounded text-xs border border-accent-green/20">
                                {entry.score.home} - {entry.score.away}
                              </span>
                            ) : (
                              <span className="text-slate-600 text-[10px] px-1 uppercase font-bold">VS</span>
                            )}
                            <p className="font-bold text-white text-sm">{entry.away}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => navigate(`/analysis/${entry.fixtureId}`)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                            <Info size={14} />
                          </button>
                          <button onClick={() => deleteEntry(entry.id)}
                            className="p-1.5 rounded-lg hover:bg-accent-red/10 text-slate-500 hover:text-accent-red transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Picks List */}
                      <div className="p-0">
                        {entry.picks?.map((pick, i) => (
                          <div key={i} className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 border-b border-white/5 last:border-0 relative ${
                            pick.status === 'WON' ? 'bg-accent-green/[0.03]' : pick.status === 'LOST' ? 'bg-accent-red/[0.03]' : ''
                          }`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="text-lg shrink-0">{pick.tier}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{pick.market}</p>
                                <p className="text-sm font-semibold text-white truncate">{pick.selection}</p>
                              </div>
                              <div className="text-right shrink-0 pr-2 border-r border-white/5">
                                <ProbBadge prob={pick.probability} />
                              </div>
                            </div>

                            {/* Acciones de Calificación */}
                            <div className="flex items-center gap-1.5 sm:ml-4 bg-surface-900/50 p-1 rounded-xl border border-white/5">
                              <button 
                                onClick={() => updatePickStatus(entry.id, i, 'WON')}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                  pick.status === 'WON' ? 'bg-accent-green text-surface-950' : 'hover:bg-accent-green/10 text-slate-500'
                                }`}
                                title="Marcar como Ganado"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                              <button 
                                onClick={() => updatePickStatus(entry.id, i, 'LOST')}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                  pick.status === 'LOST' ? 'bg-accent-red text-white' : 'hover:bg-accent-red/10 text-slate-500'
                                }`}
                                title="Marcar como Perdido"
                              >
                                <XCircle size={16} />
                              </button>
                              <button 
                                onClick={() => updatePickStatus(entry.id, i, 'PENDING')}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                  !pick.status || pick.status === 'PENDING' ? 'bg-slate-700 text-white' : 'hover:bg-white/10 text-slate-500'
                                }`}
                                title="Marcar como Pendiente"
                              >
                                <Clock size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
