/**
 * StatsPage.jsx — /resultados
 * Resumen público de resultados y efectividad de los picks de Chalaca.
 * Ahora usa el endpoint server-side /api/stats/audit (misma lógica que AuditDashboard).
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, Target, TrendingUp, BarChart3, PieChart,
  Calendar, ChevronRight, ShieldCheck, Activity, Zap,
  CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import Loader from '../components/Loader';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

function CustomDatePicker({ value, onChange, maxDate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(value + 'T12:00:00'));
  const pickerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const formatDisplayDate = (dStr) => {
    try {
      const d = new Date(dStr + 'T12:00:00');
      return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dStr;
    }
  };

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  return (
    <div className="relative w-full" ref={pickerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-surface-950 border-2 border-white/20 rounded-xl px-5 py-3 flex justify-between items-center cursor-pointer hover:border-white/40 transition-colors w-full"
      >
        <span className="text-lg md:text-xl font-black text-accent-green tracking-wider">
          {formatDisplayDate(value)}
        </span>
        <Calendar size={20} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-3 w-full sm:w-[300px] bg-[#031a14] border border-white/10 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <button onClick={handlePrevMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
              <ChevronDown size={18} className="rotate-90 text-white" />
            </button>
            <h3 className="text-lg font-black text-white capitalize">
              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h3>
            <button onClick={handleNextMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
              <ChevronDown size={18} className="-rotate-90 text-white" />
            </button>
          </div>

          {/* Days of week */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map(d => (
              <div key={d} className="text-center text-[10px] font-black uppercase text-slate-500">{d}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (!d) return <div key={i} className="h-9 w-full" />;
              
              const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isSelected = dateStr === value;
              const isFuture = maxDate && new Date(dateStr + 'T12:00:00') > new Date(maxDate + 'T12:00:00');

              return (
                <button
                  key={i}
                  disabled={isFuture}
                  onClick={() => {
                    onChange(dateStr);
                    setIsOpen(false);
                  }}
                  className={`
                    h-9 w-full rounded-lg flex items-center justify-center text-sm font-black transition-all
                    ${isSelected ? 'bg-accent-green text-[#031a14] shadow-[0_0_15px_rgba(0,255,102,0.4)] scale-110 z-10' : 
                      isFuture ? 'text-slate-700 cursor-not-allowed opacity-30' : 
                      'text-slate-300 hover:bg-white/10 hover:text-white'}
                  `}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedMatch, setExpandedMatch] = useState(null);
  
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    // Usar formato local sin manipulación de timezone
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [selectedDate, setSelectedDate] = useState(getYesterdayStr());

  useEffect(() => {
    async function fetchAudit() {
      setLoading(true);
      setAuditData(null);
      setError(null);
      setExpandedMatch(null);
      try {
        const res = await fetch(`${BACKEND}/api/stats/audit?date=${selectedDate}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${res.status}`);
        }
        const json = await res.json();
        if (json.success && json.data) {
          setAuditData(json.data);
        } else {
          setError('La auditoría no devolvió datos.');
        }
      } catch (e) {
        console.error('Error fetching audit:', e);
        setError(e.message || 'Error de conexión con el servidor.');
      } finally {
        setLoading(false);
      }
    }
    fetchAudit();
  }, [selectedDate]);

  const formatDate = (d) => {
    try {
      const date = new Date(d + 'T12:00:00');
      return date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return d; }
  };

  return (
    <div className="animate-in space-y-10 pb-20">
      
      {/* ── Header ── */}
      <div className="pt-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
            <span className="text-white">Nuestros</span>{' '}
            <span style={{ color: '#BFF102' }}>Resultados</span>
          </h1>
          <p className="text-slate-500 uppercase tracking-widest text-sm font-bold">
            Transparencia total. Auditoría de nuestro motor predictivo.
          </p>
        </div>
        
        {/* Custom Date Picker */}
        <div className="flex flex-col gap-2 bg-white/5 p-4 rounded-2xl border border-white/10 w-full md:w-auto mt-4 md:mt-0">
          <label className="text-xs md:text-sm font-black uppercase tracking-widest text-slate-300">
            📅 Selecciona una fecha:
          </label>
          <CustomDatePicker 
            value={selectedDate} 
            onChange={setSelectedDate} 
            maxDate={new Date().toISOString().split('T')[0]} 
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20"><Loader text="Ejecutando auditoría del motor predictivo..." /></div>
      ) : error ? (
        <div className="py-32 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
            <span className="text-2xl">⚠️</span>
            <div className="text-left">
              <p className="font-black uppercase tracking-widest text-sm mb-1">Error al cargar datos</p>
              <p className="text-xs opacity-70">{error}</p>
            </div>
          </div>
          <button
            onClick={() => setSelectedDate(s => s)}
            className="mt-2 text-accent-green text-xs font-black uppercase tracking-widest hover:underline"
            style={{ display: 'block', margin: '0 auto' }}
          >
            Reintentar
          </button>
        </div>
      ) : !auditData ? (
        <div className="py-32 text-center opacity-30">
          <Calendar size={64} strokeWidth={1} className="mx-auto mb-6" />
          <p className="font-black uppercase tracking-widest">Sin datos para esta fecha</p>
        </div>
      ) : (
        <>
          {/* ── Fecha Activa ── */}
          <div className="text-center">
            <p className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1">Auditoría del</p>
            <p className="text-lg font-black text-white capitalize">{formatDate(selectedDate)}</p>
          </div>

          {auditData.debugErrors && auditData.debugErrors.length > 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl mb-4 text-xs font-mono max-w-3xl mx-auto">
              <p className="font-black mb-2 uppercase tracking-wider text-[10px]">Log de Errores Internos:</p>
              {auditData.debugErrors.map((e, i) => <div key={i} className="mb-1">Match {e.id}: {e.error}</div>)}
            </div>
          )}

          {/* ── Resumen General ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-6 rounded-2xl border border-white/5 text-center relative overflow-hidden group border-l-4 border-l-purple-500">
              <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                <BarChart3 size={80} strokeWidth={1} />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Partidos Analizados</p>
              <h3 className="text-5xl font-black text-white font-mono">{auditData.totalMatches}</h3>
              <p className="text-[10px] text-slate-600 mt-1">De {auditData.rawFixturesCount}</p>
            </div>
            
            <div className="glass-card p-6 rounded-2xl border border-white/5 text-center relative overflow-hidden group border-l-4 border-l-blue-500">
              <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                <Activity size={80} strokeWidth={1} />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Apuestas Generadas</p>
              <h3 className="text-5xl font-black text-white font-mono">{auditData.totalPicks}</h3>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-white/5 text-center relative overflow-hidden group border-l-4 border-l-accent-green">
              <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                <Trophy size={80} strokeWidth={1} />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Apuestas Acertadas</p>
              <h3 className="text-5xl font-black text-accent-green font-mono">{auditData.hits}</h3>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-white/5 text-center relative overflow-hidden group border-l-4 border-l-red-500">
              <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                <Target size={80} strokeWidth={1} />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Porcentaje de Éxito</p>
              <h3 className="text-5xl font-black text-white font-mono">{auditData.winRate}%</h3>
            </div>
          </div>

          {/* ── Desglose ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
            
            {/* Por Tipo de Apuesta */}
            <div className="glass-card p-8 rounded-3xl border border-white/5">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Por Tipo de Apuesta</h2>
                <PieChart size={18} className="text-slate-500" />
              </div>
              <div className="space-y-4 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                {(() => {
                  const marketStats = {};
                  auditData.reports.forEach(r => {
                    r.picks.forEach(p => {
                      const m = p.market || 'Otros';
                      if (!marketStats[m]) marketStats[m] = { total: 0, hits: 0 };
                      marketStats[m].total++;
                      if (p.isHit) marketStats[m].hits++;
                    });
                  });
                  const marketsArray = Object.entries(marketStats).map(([name, s]) => ({
                    name, total: s.total, hits: s.hits, winRate: Math.round((s.hits / s.total) * 100)
                  })).sort((a, b) => b.winRate - a.winRate || b.hits - a.hits);
                  
                  return marketsArray.map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div>
                        <p className="text-base font-bold text-white mb-1 leading-snug">{m.name}</p>
                        <p className="text-[13px] text-slate-300 font-bold">{m.total} apuestas • {m.hits} aciertos</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="text-3xl font-black font-mono text-accent-green">{m.winRate}%</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Por Liga */}
            <div className="glass-card p-8 rounded-3xl border border-white/5">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Por Liga Principal</h2>
                <BarChart3 size={18} className="text-slate-500" />
              </div>
              <div className="space-y-4 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                {(() => {
                  const leagueStats = {};
                  auditData.reports.forEach(r => {
                    const l = r.league || 'Desconocida';
                    if (!leagueStats[l]) leagueStats[l] = { total: 0, hits: 0 };
                    r.picks.forEach(p => {
                      leagueStats[l].total++;
                      if (p.isHit) leagueStats[l].hits++;
                    });
                  });
                  const leaguesArray = Object.entries(leagueStats).map(([name, s]) => ({
                    name, total: s.total, hits: s.hits, winRate: Math.round((s.hits / s.total) * 100)
                  })).sort((a, b) => b.winRate - a.winRate || b.hits - a.hits);
                  
                  return leaguesArray.map((l, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div>
                        <p className="text-base font-bold text-white mb-1 leading-snug">{l.name}</p>
                        <p className="text-[13px] text-slate-300 font-bold">{l.total} apuestas • {l.hits} aciertos</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="text-3xl font-black font-mono text-accent-blue">{l.winRate}%</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Por Categoría (Valor/Seguras) */}
            <div className="glass-card p-8 rounded-3xl border border-white/5">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Por Categoría</h2>
                <Zap size={18} className="text-slate-500" />
              </div>
              <div className="space-y-4 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                {(() => {
                  const categoryStats = {
                    'Alto Valor (💎)': { total: 0, hits: 0, color: 'text-purple-400' },
                    'Más Seguras (🔥)': { total: 0, hits: 0, color: 'text-orange-400' },
                    'Moderadas': { total: 0, hits: 0, color: 'text-blue-400' },
                    'Otras': { total: 0, hits: 0, color: 'text-slate-400' }
                  };
                  auditData.reports.forEach(r => {
                    r.picks.forEach(p => {
                      let t = 'Otras';
                      const tier = p.tier || '';
                      const sel = p.selection || '';
                      if (tier === '💎' || sel.includes('💎')) t = 'Alto Valor (💎)';
                      else if (tier === '🔥' || sel.includes('🔥')) t = 'Más Seguras (🔥)';
                      else if (tier === '🎯' || tier === '🔵' || tier === '🟢') t = 'Moderadas';
                      
                      categoryStats[t].total++;
                      if (p.isHit) categoryStats[t].hits++;
                    });
                  });
                  const catsArray = Object.entries(categoryStats)
                    .filter(([name, s]) => s.total > 0)
                    .map(([name, s]) => ({
                      name, 
                      total: s.total, 
                      hits: s.hits, 
                      winRate: Math.round((s.hits / s.total) * 100),
                      color: s.color
                    })).sort((a, b) => b.winRate - a.winRate || b.hits - a.hits);
                  
                  return catsArray.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div>
                        <p className={`text-base font-bold mb-1 leading-snug ${c.color}`}>{c.name}</p>
                        <p className="text-[13px] text-slate-300 font-bold">{c.total} apuestas • {c.hits} aciertos</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className={`text-3xl font-black font-mono ${c.color}`}>{c.winRate}%</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

          </div>

          {/* ── Desglose de Partidos ── */}
          <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-white/[0.02]">
              <h3 className="text-sm font-black uppercase tracking-[0.15em] text-white">Desglose de Partidos</h3>
              <p className="text-[10px] text-slate-500 mt-1">Ordenado por cantidad de fallos (para estudio)</p>
            </div>
            <div className="divide-y divide-white/5">
              {auditData.reports.map(report => (
                <div key={report.id}>
                  <div 
                    onClick={() => setExpandedMatch(expandedMatch === report.id ? null : report.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {report.homeLogo && <img src={report.homeLogo} alt="" className="w-5 h-5 object-contain shrink-0 border-0 outline-none ring-0 shadow-none" />}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {report.home} {report.homeScore} - {report.awayScore} {report.away}
                        </p>
                        <p className="text-xs text-slate-500">{report.league}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {report.misses > 0 ? (
                        <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-2.5 py-1 rounded-lg">
                          {report.misses} Fallos
                        </span>
                      ) : report.hits > 0 ? (
                        <span className="text-[10px] font-bold text-accent-green bg-accent-green/10 px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <CheckCircle size={10} /> Pleno
                        </span>
                      ) : null}
                      <span className="text-[10px] font-black text-slate-400">
                        {report.hits}/{report.hits + report.misses}
                      </span>
                      {expandedMatch === report.id ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                    </div>
                  </div>
                  
                  {expandedMatch === report.id && (
                    <div className="px-4 pb-4 bg-surface-900/30 space-y-2">
                      {report.picks.map((pick, idx) => (
                        <div key={idx} className={`p-3 rounded-xl border flex gap-3 ${
                          pick.isHit ? 'bg-accent-green/5 border-accent-green/10' : 'bg-red-500/5 border-red-500/10'
                        }`}>
                          <div className="mt-0.5 shrink-0">
                            {pick.isHit ? <CheckCircle size={14} className="text-accent-green" /> : <XCircle size={14} className="text-red-400" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white flex items-center flex-wrap gap-1.5">
                              {pick.selection}
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                pick.isHit ? 'text-accent-green/70 border-accent-green/20 bg-accent-green/5' :
                                'text-slate-500 border-white/10 bg-white/3'
                              }`}>
                                {pick.market}
                              </span>
                              {pick.tier && (
                                <span className="text-[9px]">{pick.tier}</span>
                              )}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              {pick.probability && (
                                <span className="text-[10px] text-slate-500 font-bold">{pick.probability}% conf.</span>
                              )}
                              {pick.odds && (
                                <span className="text-[10px] text-slate-500 font-bold">@ {pick.odds}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {auditData.reports.length === 0 && (
                <div className="p-12 text-center">
                  <Calendar size={40} strokeWidth={1} className="mx-auto mb-4 text-slate-600" />
                  <p className="text-slate-500 text-sm font-bold">No se encontraron partidos finalizados para esta fecha.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="py-8 text-center">
            <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-accent-green/10 border border-accent-green/20 text-accent-green text-[10px] font-black uppercase tracking-widest mb-4">
              <ShieldCheck size={14} /> Sistema Auditado por IA
            </div>
            <p className="text-slate-600 text-xs font-bold max-w-xl mx-auto leading-relaxed uppercase tracking-widest">
              Los resultados mostrados corresponden al motor predictivo ejecutado en tiempo real. Cada apuesta se evalúa contra el resultado final oficial de ESPN.
            </p>
          </div>
        </>
      )}

    </div>
  );
}
