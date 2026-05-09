import React from 'react';
import { 
  Activity, Trophy, Target, TrendingUp, 
  BarChart3, PieChart, Calendar, ChevronRight,
  ShieldCheck, Zap
} from 'lucide-react';

export default function StatsPage() {
  return (
    <div className="animate-in space-y-12 pb-20">
      
      {/* ── Header / Hero ── */}
      <div className="pt-8">
        <h1 className="text-4xl font-black tracking-tighter text-gradient-white mb-3">
          Estadísticas & Auditoría
        </h1>
        <p className="text-slate-500 uppercase tracking-[0.3em] text-[10px] font-black">
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
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">{m.label}</p>
            <h3 className={`text-4xl font-black mb-2 ${m.color}`}>{m.value}</h3>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Auditoría Visual (El Semáforo) ── */}
      <div className="glass-card p-8 rounded-3xl border border-white/5">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-lg font-black uppercase tracking-widest text-white mb-2">Últimos Resultados</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Racha de aciertos en tiempo real</p>
          </div>
          <ShieldCheck size={24} className="text-accent-green opacity-20" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 40 }).map((_, i) => (
            <div 
              key={i} 
              className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-[10px] font-black text-slate-800"
            >
              ?
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-6">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-accent-green">
            <div className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_8px_#00ff88]" /> Gana
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-red-500">
            <div className="w-2 h-2 rounded-full bg-red-500" /> Pierde
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-600">
            <div className="w-2 h-2 rounded-full bg-slate-600" /> Anulado
          </div>
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
            {['Premier League', 'Liga 1 Perú', 'La Liga', 'Champions League'].map((l, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">{l}</span>
                  <span className="text-white">--%</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue/20 w-0 transition-all duration-1000" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mercados Estrella */}
        <div className="glass-card p-8 rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Efectividad por Mercado</h2>
            <PieChart size={16} className="text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Goles Over/Under', val: '--%' },
              { label: 'Córners Totales', val: '--%' },
              { label: 'Tarjetas', val: '--%' },
              { label: 'Ganador 1X2', val: '--%' },
            ].map((m, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">{m.label}</p>
                <p className="text-xl font-black text-white">{m.val}</p>
              </div>
            ))}
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
