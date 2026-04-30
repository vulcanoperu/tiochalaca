import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { useState } from 'react';

/**
 * Displays W/D/L form string as colored pills
 * form: array of matches newest-first
 */
function FormPills({ matches, teamId }) {
  const [activeIndex, setActiveIndex] = useState(null);

  if (!matches || matches.length === 0) return <span className="text-slate-600 text-xs">Sin datos</span>;

  const validMatches = matches.slice(0, 15).reverse();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 flex-wrap">
        {validMatches.map((m, i) => {
          const isHome  = String(m.teams?.home?.id) === String(teamId);
          const winner  = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
          let result = 'D';
          if ((isHome && winner === 'home') || (!isHome && winner === 'away')) result = 'W';
          if ((isHome && winner === 'away') || (!isHome && winner === 'home')) result = 'L';

          const colorMap = { W: 'bg-accent-green text-surface-900', D: 'bg-amber-400 text-surface-900', L: 'bg-accent-red text-white' };
          const labelMap = { W: 'G', D: 'E', L: 'P' };
          
          return (
            <button key={i}
              onClick={() => setActiveIndex(activeIndex === i ? null : i)}
              className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold transition-all ${colorMap[result]} ${activeIndex === i ? 'ring-2 ring-white scale-110' : 'opacity-90 hover:opacity-100 hover:scale-105'}`}>
              {labelMap[result]}
            </button>
          );
        })}
      </div>

      {/* Ventanita de detalles */}
      {activeIndex !== null && (
        <div className="bg-black/40 border border-white/10 rounded-lg p-3 text-sm animate-in fade-in slide-in-from-top-3 zoom-in-95 duration-300 ease-out origin-top shadow-xl">
          {(() => {
            const m = validMatches[activeIndex];
            const isHome  = String(m.teams?.home?.id) === String(teamId);
            const hg      = m.goals?.home ?? 0;
            const ag      = m.goals?.away ?? 0;
            const oppName = isHome ? m.teams?.away?.name : m.teams?.home?.name;
            
            const winner  = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
            let result = 'D';
            if ((isHome && winner === 'home') || (!isHome && winner === 'away')) result = 'W';
            if ((isHome && winner === 'away') || (!isHome && winner === 'home')) result = 'L';
            const resultLabel = result === 'W' ? 'Ganó' : result === 'D' ? 'Empató' : 'Perdió';
            const color = result === 'W' ? 'text-accent-green' : result === 'D' ? 'text-amber-400' : 'text-accent-red';

            const date = m.fixture?.date ? new Date(m.fixture.date).toLocaleDateString('es-PE', { day:'2-digit', month:'long' }) : '';

            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/10 pb-1.5 mb-0.5">
                  <span className="uppercase tracking-wider text-[10px]">{m.league?.name || 'Amistoso'}</span>
                  <span>{date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-black uppercase tracking-widest ${color}`}>{resultLabel}</span>
                  <span className="font-mono text-lg font-bold text-white">{hg}-{ag}</span>
                  <span className="text-slate-300">vs {oppName} <span className="text-[10px] text-slate-500">{isHome ? '(L)' : '(V)'}</span></span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/**
 * Compact stat row: label + value
 */
function StatRow({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold font-mono ${color}`}>{value}</span>
        {sub && <span className="text-xs text-slate-600 ml-1">{sub}</span>}
      </div>
    </div>
  );
}

/**
 * Circular probability gauge
 */
function ProbCircle({ prob, label, color = '#00ff88' }) {
  const r    = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - prob / 100);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={dash}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="36" y="41" textAnchor="middle" fontSize="14" fontWeight="700" fill="white" fontFamily="JetBrains Mono,monospace">
          {prob}%
        </text>
      </svg>
      <span className="text-[10px] text-slate-500 text-center leading-tight max-w-[64px]">{label}</span>
    </div>
  );
}

/**
 * Goal timeline bar chart (by time slots)
 */
function GoalTimeline({ slots, color = '#00ff88', actualGoals = 0 }) {
  const half1 = slots.slice(0, 3);
  const half2 = slots.slice(3, 6);
  const totalMatchGoals = slots.reduce((a, s) => a + s.goals, 0);
  const totalMatchConceded = slots.reduce((a, s) => a + s.conceded, 0);

  const isMissingData = (actualGoals > 0 && totalMatchGoals === 0) || (actualGoals > 0 && (totalMatchGoals / actualGoals) < 0.30);

  if (isMissingData) {
    return (
      <div className="text-center py-6 bg-transparent border border-white/5 border-dashed mt-2 rounded-lg">
        <p className="text-[11px] text-slate-500">Sin datos detallados de minutos para estos partidos.</p>
      </div>
    );
  }

  const renderSimpleSlot = (slot) => {
    const maxVal = Math.max(5, slot.goals, slot.conceded);
    const gWidth = maxVal > 0 ? (slot.goals / maxVal) * 100 : 0;
    const cWidth = maxVal > 0 ? (slot.conceded / maxVal) * 100 : 0;

    return (
      <div key={slot.key} className="flex items-center py-2 border-b border-white/5 last:border-0">
        <span className="w-12 text-[10px] text-slate-500 font-mono">{slot.label}</span>
        
        <div className="flex-1 flex items-center justify-center gap-3">
           {/* Anotados (Izquierda) */}
           <div className="flex-1 flex items-center justify-end gap-2">
             <span className="text-[11px] font-bold text-slate-300">{slot.goals > 0 ? slot.goals : '-'}</span>
             <div className="w-10 sm:w-16 h-[3px] bg-transparent flex justify-end items-center">
                {slot.goals > 0 && <div className="h-full bg-accent-green rounded-full opacity-80" style={{ width: `${gWidth}%` }}></div>}
             </div>
           </div>
           
           <div className="w-[1px] h-3 bg-white/10"></div>
           
           {/* Recibidos (Derecha) */}
           <div className="flex-1 flex items-center justify-start gap-2">
             <div className="w-10 sm:w-16 h-[3px] bg-transparent flex justify-start items-center">
                {slot.conceded > 0 && <div className="h-full bg-accent-red rounded-full opacity-80" style={{ width: `${cWidth}%` }}></div>}
             </div>
             <span className="text-[11px] font-bold text-slate-300">{slot.conceded > 0 ? slot.conceded : '-'}</span>
           </div>
        </div>
      </div>
    );
  };

  const renderHalf = (title, halfSlots) => {
    const totalGoals = halfSlots.reduce((a, s) => a + s.goals, 0);
    const totalConceded = halfSlots.reduce((a, s) => a + s.conceded, 0);
    
    const goalsPct = totalMatchGoals > 0 ? Math.round((totalGoals / totalMatchGoals) * 100) : 0;
    const concededPct = totalMatchConceded > 0 ? Math.round((totalConceded / totalMatchConceded) * 100) : 0;
    
    return (
      <div className="mb-5">
        <div className="flex flex-col mb-2 px-1">
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">{title}</span>
          <div className="flex items-center gap-4 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green opacity-80"></span>
              <span className="text-slate-400">Anotó: <strong className="text-slate-200">{totalGoals}</strong> ({goalsPct}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-red opacity-80"></span>
              <span className="text-slate-400">Recibió: <strong className="text-slate-200">{totalConceded}</strong> ({concededPct}%)</span>
            </div>
          </div>
        </div>
        <div className="bg-white/[0.015] rounded-lg border border-white/5 px-3 py-1">
          {halfSlots.map(renderSimpleSlot)}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-3">
      {renderHalf('1er Tiempo', half1)}
      {renderHalf('2do Tiempo', half2)}
    </div>
  );
}

/**
 * H2H history table
 */
function H2HTable({ matches, homeId, awayId, homeName, awayName }) {
  if (!matches || matches.length === 0)
    return <p className="text-xs text-slate-600 text-center py-4">Sin historial H2H disponible</p>;

  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-full">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Local</th>
            <th className="text-center">Resultado</th>
            <th>Visitante</th>
          </tr>
        </thead>
        <tbody>
          {matches.slice(0, 8).map((m, i) => {
            const hg = m.goals?.home ?? 0;
            const ag = m.goals?.away ?? 0;
            const date = m.fixture?.date ? new Date(m.fixture.date).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'2-digit' }) : '–';
            const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';

            return (
              <tr key={i}>
                <td className="text-xs text-slate-500">{date}</td>
                <td className="text-xs text-slate-300">{m.teams?.home?.name}</td>
                <td className="text-center font-mono text-sm font-semibold text-white">{hg} – {ag}</td>
                <td className="text-xs text-slate-300">{m.teams?.away?.name}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Picks table - the main output
 */
function PicksTable({ picks, reason }) {
  if (!picks || picks.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-3xl mb-3">🚫</div>
        <p className="text-sm font-semibold text-slate-300 mb-1">Sin picks recomendados</p>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">{reason || 'No se encontró ventaja estadística suficiente.'}</p>
      </div>
    );
  }

  const isLivePick = (market) => market.toLowerCase().includes('vivo') || market.toLowerCase().includes('live');
  
  const preMatchPicks = picks.filter(p => !isLivePick(p.market));
  const livePicks = picks.filter(p => isLivePick(p.market));

  const PickCard = ({ pick }) => (
    <div className="rounded-xl p-4 border transition-all duration-300 relative overflow-hidden glass-card"
      style={{
        background: pick.probability >= 85
          ? 'linear-gradient(135deg,rgba(0,255,136,0.08),rgba(0,204,106,0.02))'
          : pick.probability >= 75
          ? 'linear-gradient(135deg,rgba(30,144,255,0.08),rgba(30,144,255,0.02))'
          : 'linear-gradient(135deg,rgba(255,165,0,0.08),rgba(255,165,0,0.02))',
        borderColor: pick.probability >= 85
          ? 'rgba(0,255,136,0.25)'
          : pick.probability >= 75
          ? 'rgba(30,144,255,0.2)'
          : 'rgba(255,165,0,0.2)',
      }}>
      {/* Indicador de color lateral */}
      <div className="absolute top-0 left-0 w-1 h-full" style={{
        background: pick.probability >= 85 ? '#00ff88' : pick.probability >= 75 ? '#1e90ff' : '#ffa500'
      }} />

      <div className="flex items-start justify-between gap-3 mb-2 pl-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{pick.tier}</span>
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{pick.market}</span>
          </div>
          <p className="font-bold text-white text-[15px] leading-tight">{pick.selection}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end">
          <p className="text-2xl font-bold font-mono leading-none"
            style={{ color: pick.probability >= 85 ? '#00ff88' : pick.probability >= 75 ? '#1e90ff' : '#ffa500' }}>
            {pick.probability}%
          </p>
          {pick.odds && (
            <span className="text-[11px] font-mono bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700 mt-1.5 shadow-sm">
              Cuota @{pick.odds}
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed border-t border-white/10 pt-2.5 mt-2 pl-2">{pick.argument}</p>
      <div className="flex items-center gap-2 mt-2 pl-2">
        <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wide ${pick.risk === 'Bajo' ? 'badge-green' : pick.risk === 'Moderado' ? 'badge-yellow' : 'badge-red'}`}>
          Riesgo {pick.risk}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {preMatchPicks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green"></span>
            Apuestas Pre-Partido
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {preMatchPicks.map((pick, i) => <PickCard key={`pre-${i}`} pick={pick} />)}
          </div>
        </div>
      )}

      {livePicks.length > 0 && (
        <div className="space-y-3 relative">
          <h3 className="text-[11px] font-bold text-[#ffa500] uppercase tracking-widest flex items-center gap-2 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffa500] animate-pulse"></span>
            Estrategia en Vivo
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {livePicks.map((pick, i) => <PickCard key={`live-${i}`} pick={pick} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function RecentMatchesList({ matches, teamId }) {
  if (!matches || matches.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
      {matches.slice(0, 10).map((m, i) => {
        const isHome = String(m.teams?.home?.id) === String(teamId);
        const hg = m.goals?.home ?? 0;
        const ag = m.goals?.away ?? 0;
        const oppName = isHome ? m.teams?.away?.name : m.teams?.home?.name;
        
        const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
        let result = 'D';
        if ((isHome && winner === 'home') || (!isHome && winner === 'away')) result = 'W';
        if ((isHome && winner === 'away') || (!isHome && winner === 'home')) result = 'L';
        
        const icon = result === 'W' ? '✅' : result === 'D' ? '➖' : '❌';
        const color = result === 'W' ? 'text-accent-green' : result === 'D' ? 'text-slate-400' : 'text-accent-red';
        const label = result === 'W' ? 'Ganó' : result === 'D' ? 'Empató' : 'Perdió';

        return (
          <div key={i} className="flex items-center text-[11px] py-1 opacity-80 hover:opacity-100 transition-opacity">
            <span className="w-5 text-center shrink-0">{icon}</span>
            <span className={`font-bold w-12 shrink-0 ${color}`}>{label}</span>
            <span className="text-white font-mono font-bold w-6 shrink-0 text-center">{hg}-{ag}</span>
            <span className="text-slate-400 truncate flex-1 mx-2">vs {oppName}</span>
            <span className="text-slate-600 truncate max-w-[60px] shrink-0 text-right text-[9px] uppercase">{m.league?.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export { FormPills, StatRow, ProbCircle, GoalTimeline, H2HTable, PicksTable, RecentMatchesList };
