import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Trophy, Target, TrendingUp, 
  BarChart3, PieChart, Calendar, ChevronRight,
  ShieldCheck, Zap
} from 'lucide-react';

function localDay(d = new Date()) { 
  try {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
}

function buildDayStrip(centerDate) {
  const days = [];
  const isMay2026 = centerDate.getMonth() === 4 && centerDate.getFullYear() === 2026;

  if (isMay2026) {
    for (let i = 1; i <= 31; i++) {
      const d = new Date(2026, 4, i);
      days.push({
        key:     localDay(d),
        dayNum:  d.getDate(),
        dayName: d.toLocaleDateString('es-PE', { weekday: 'short' }).slice(0, 2).toUpperCase(),
        month:   d.toLocaleDateString('es-PE', { month: 'short' }),
        isToday: localDay(d) === localDay(),
      });
    }
  } else {
    for (let i = -7; i <= 7; i++) {
      const d = new Date(centerDate);
      d.setDate(d.getDate() + i);
      days.push({
        key:     localDay(d),
        dayNum:  d.getDate(),
        dayName: d.toLocaleDateString('es-PE', { weekday: 'short' }).slice(0, 2).toUpperCase(),
        month:   d.toLocaleDateString('es-PE', { month: 'short' }),
        isToday: localDay(d) === localDay(),
      });
    }
  }
  return days;
}

export default function StatsPage() {
  const [statsData, setStatsData] = useState({ leagues: [], markets: [] });
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [selected, setSelected] = useState(localDay());
  const days = buildDayStrip(new Date());
  const stripRef = useRef(null);

  useEffect(() => {
    async function fetchStats() {
      setLoadingLeagues(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/stats/leagues?date=${selected}`);
        const json = await res.json();
        if (json.success && json.data) {
          setStatsData({
            leagues: json.data.leagues.slice(0, 5),
            markets: json.data.markets.slice(0, 4)
          });
        }
      } catch (e) {
        console.error('Error al cargar stats de ligas:', e);
      } finally {
        setLoadingLeagues(false);
      }
    }
    fetchStats();
  }, [selected]);

  return (
    <div className="animate-in space-y-12 pb-20">
      
      {/* ── Header / Hero ── */}
      <div className="pt-8">
        <h1 className="text-4xl font-black tracking-tighter text-gradient-white mb-3">
          Estadísticas & Auditoría
        </h1>
        <p className="text-slate-500 uppercase tracking-[0.3em] text-xs font-black">
          Performance global del motor predictivo Chalaca
        </p>
      </div>

      {/* ── Top Metrics ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Win Rate General', value: '--%', sub: 'Últimos 30 días', icon: Target, color: 'text-accent-green' },
          { label: 'Profit / Yield', value: '--%', sub: 'Retorno inversión', icon: TrendingUp, color: 'text-accent-blue' },
          { label: 'ROI Mensual', value: '--%', sub: 'Capital acumulado', icon: Activity, color: 'text-purple-500' },
          { label: 'Picks Analizados', value: '----', sub: 'Muestra total', icon: BarChart3, color: 'text-slate-400' },
        ].map((m, i) => (
          <div key={i} className="glass-card p-8 rounded-2xl border border-white/5 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
              <m.icon size={120} strokeWidth={1} />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">{m.label}</p>
            <h3 className={`text-4xl font-black mb-2 ${m.color}`}>{m.value}</h3>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Auditoría Visual (El Semáforo) ── */}
      <div className="glass-card p-8 rounded-3xl border border-white/5">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-lg font-black uppercase tracking-widest text-white mb-2">Últimos Resultados</h2>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Racha de aciertos en tiempo real</p>
          </div>
          <ShieldCheck size={24} className="text-accent-green opacity-20" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 40 }).map((_, i) => (
            <div 
              key={i} 
              className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-xs font-black text-slate-800"
            >
              ?
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-6">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-accent-green">
            <div className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_8px_#00ff88]" /> Gana
          </div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-red-500">
            <div className="w-2 h-2 rounded-full bg-red-500" /> Pierde
          </div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-600">
            <div className="w-2 h-2 rounded-full bg-slate-600" /> Anulado
          </div>
        </div>
      </div>

      {/* ── Days Strip (Selector de Fecha) ── */}
      <div className="relative mb-12 group">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={18} className="text-slate-400" />
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Auditoría por Día</h2>
        </div>
        <div 
          ref={stripRef} 
          className="flex gap-4 overflow-x-auto scrollbar-hide py-4 cursor-grab active:cursor-grabbing select-none"
        >
          {days.map(({ key, dayNum, dayName, month, isToday }) => {
            const isSelected = key === selected;
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`flex flex-col items-center min-w-[72px] py-5 rounded-lg border transition-all duration-300 ${
                  isSelected 
                    ? 'bg-[#BFF102] border-[#BFF102] text-[#00312D] scale-105 shadow-2xl' 
                    : isToday 
                      ? 'bg-accent-green/5 border-accent-green/20 text-accent-green hover:bg-accent-green/10'
                      : 'bg-[#3A7817] border-transparent text-[#EAFDE7]/50 hover:border-[#EAFDE7]/20 hover:text-[#EAFDE7]'
                }`}
              >
                <span className={`text-[10px] font-bold mb-2 ${isSelected ? 'opacity-60' : ''}`}>{dayName.charAt(0) + dayName.slice(1).toLowerCase()}</span>
                <span className="text-xl font-black leading-none">{dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Gráficos Secundarios ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Ligas Rentables */}
        <div className="glass-card p-8 rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Ligas con mayor efectividad</h2>
            <BarChart3 size={16} className="text-slate-500" />
          </div>
          <div className="space-y-6">
            {loadingLeagues ? (
              <div className="animate-pulse space-y-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-6 bg-white/5 rounded-md w-full" />
                ))}
              </div>
            ) : statsData.leagues.length > 0 ? (
              statsData.leagues.map((l, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                    <span className="text-slate-400">{l.name || 'Liga Desconocida'} <span className="opacity-40 ml-1">({l.wins}/{l.total})</span></span>
                    <span className="text-white">{l.winRate}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent-blue/80 transition-all duration-1000" 
                      style={{ width: `${l.winRate}%` }} 
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Sin datos suficientes</p>
              </div>
            )}
          </div>
        </div>

        {/* Mercados Estrella */}
        <div className="glass-card p-8 rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Efectividad por Mercado</h2>
            <PieChart size={16} className="text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {loadingLeagues ? (
              <div className="col-span-2 flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
              </div>
            ) : statsData.markets.length > 0 ? (
              statsData.markets.map((m, i) => (
                <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 truncate">{m.name}</p>
                  <p className="text-xl font-black text-white">{m.winRate}%</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mt-2">{m.wins} de {m.total} aciertos</p>
                </div>
              ))
            ) : (
              <div className="col-span-2 text-center py-4">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Sin datos de mercados para este día</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Footer Stats ── */}
      <div className="py-20 text-center">
        <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-accent-green/10 border border-accent-green/20 text-accent-green text-[10px] font-black uppercase tracking-widest mb-6">
          <ShieldCheck size={14} /> Sistema Auditado por IA
        </div>
        <p className="text-slate-600 text-xs font-medium max-w-lg mx-auto leading-relaxed uppercase tracking-widest">
          Los datos se actualizan automáticamente tras la finalización de cada jornada deportiva procesada.
        </p>
      </div>

    </div>
  );
}
