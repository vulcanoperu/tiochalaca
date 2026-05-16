import { useState, useEffect } from 'react';

/**
 * Displays W/D/L form string as colored pills
 */
function FormPills({ matches, teamId }) {
  const [activeIndex, setActiveIndex] = useState(null);

  if (!matches || matches.length === 0)
    return <span className="text-slate-600 text-xs">Sin datos</span>;

  const validMatches = matches.slice(0, 12).reverse();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
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
              className={`w-9 h-9 rounded-md flex items-center justify-center text-[15px] font-black transition-all ${colorMap[result]} ${activeIndex === i ? 'ring-2 ring-white scale-110' : 'opacity-90 hover:opacity-100 hover:scale-105 shadow-sm'}`}>
              {labelMap[result]}
            </button>
          );
        })}
      </div>

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
                <div className="flex items-center gap-3">
                  <span className={`font-bold uppercase tracking-widest text-[10px] ${color}`}>{resultLabel}</span>
                  <span className="font-numbers text-lg font-bold text-white">{hg}-{ag}</span>
                  <span className="text-slate-400 text-[13px]">vs {oppName} <span className="text-[10px] text-slate-500 opacity-60">{isHome ? '(L)' : '(V)'}</span></span>
                </div>
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
    <div className="flex items-baseline justify-between py-1.5 border-b border-white/5 last:border-0 overflow-hidden">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="text-right">
        <span className={`text-[13px] font-bold font-numbers ${color}`}>{value}</span>
        {sub && <span className="text-[10px] text-slate-500 ml-1.5 opacity-70">{sub}</span>}
      </div>
    </div>
  );
}

/**
 * Circular probability gauge
 */
function ProbCircle({ prob, label, color = '#00ff88' }) {
  const r    = 42; 
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - prob / 100);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={dash}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="50" y="58" textAnchor="middle" fontSize="24" fontWeight="700" fill="white" className="font-numbers">
          {prob}%
        </text>
      </svg>
      <span className="text-sm font-bold text-slate-400 text-center leading-tight">{label}</span>
    </div>
  );
}

/**
 * Goal timeline bar chart (by time slots)
 */
function GoalTimeline({ slots, color = '#00ff88', actualGoals = 0 }) {
  const half1 = slots.slice(0, 3);
  const half2 = slots.slice(3, 6);
  const totalMatchGoals    = slots.reduce((a, s) => a + s.goals, 0);
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
          <div className="flex-1 flex items-center justify-end gap-2">
            <span className="text-[11px] font-bold text-slate-300">{slot.goals > 0 ? slot.goals : '-'}</span>
            <div className="w-10 sm:w-16 h-[3px] bg-transparent flex justify-end items-center">
              {slot.goals > 0 && <div className="h-full bg-accent-green rounded-full opacity-80" style={{ width: `${gWidth}%` }}></div>}
            </div>
          </div>
          <div className="w-[1px] h-3 bg-white/10"></div>
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
    const totalGoals    = halfSlots.reduce((a, s) => a + s.goals, 0);
    const totalConceded = halfSlots.reduce((a, s) => a + s.conceded, 0);
    const goalsPct    = totalMatchGoals    > 0 ? Math.round((totalGoals    / totalMatchGoals)    * 100) : 0;
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
    <div className="space-y-1.5">
      {/* Header */}
      <div className="grid items-center text-[9px] font-black uppercase tracking-widest text-slate-600 px-2 mb-2"
        style={{ gridTemplateColumns: '52px 1fr auto 1fr' }}>
        <span>Fecha</span>
        <span className="text-right pr-3">Local</span>
        <span className="text-center w-16">Marcador</span>
        <span className="text-left pl-3">Visitante</span>
      </div>

      {matches.slice(0, 8).map((m, i) => {
        const hg  = m.goals?.home ?? 0;
        const ag  = m.goals?.away ?? 0;
        const homeWon = hg > ag;
        const awayWon = ag > hg;
        const date = m.fixture?.date
          ? new Date(m.fixture.date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
          : '–';

        return (
          <div key={i}
            className="grid items-center py-2 px-2 rounded-lg border border-white/5 bg-white/[0.015] hover:bg-white/[0.03] transition-colors"
            style={{ gridTemplateColumns: '52px 1fr auto 1fr' }}>

            {/* Fecha */}
            <span className="text-[10px] text-slate-600 font-mono shrink-0">{date}</span>

            {/* Local */}
            <span className={`text-[11px] font-semibold text-right pr-3 truncate ${homeWon ? 'text-accent-green' : 'text-slate-400'}`}>
              {m.teams?.home?.name}
            </span>

            {/* Marcador */}
            <div className="flex items-center justify-center gap-1 w-16">
              <span className={`text-[13px] font-bold font-numbers ${homeWon ? 'text-accent-green' : 'text-slate-300'}`}>{hg}</span>
              <span className="text-slate-700 font-bold opacity-50">–</span>
              <span className={`text-[13px] font-bold font-numbers ${awayWon ? 'text-accent-green' : 'text-slate-300'}`}>{ag}</span>
            </div>

            {/* Visitante */}
            <span className={`text-[11px] font-semibold text-left pl-3 truncate ${awayWon ? 'text-accent-green' : 'text-slate-400'}`}>
              {m.teams?.away?.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * PicksTable — tabs (Pre-Partido / En Vivo) + compact aesthetic cards
 */
function PicksTable({ picks, reason, onSavePick, isLive }) {
  const picksArray = picks || [];
  const isLivePick = (market) =>
    market?.toLowerCase()?.includes('vivo') || market?.toLowerCase()?.includes('live');

  const preMatchPicks = picksArray.filter(p => !isLivePick(p.market));
  const livePicks     = picksArray.filter(p =>  isLivePick(p.market));

  // Si el partido está en vivo y hay picks en vivo → activar tab live.
  // Si el partido no ha comenzado → siempre mostrar pre-partido primero.
  const [activeTab, setActiveTab] = useState(() => {
    if (isLive && livePicks.length > 0) return 'live';
    return 'pre';
  });

  // Auto-switch a live tab solo cuando el partido pasa a estado en vivo
  useEffect(() => {
    if (isLive && livePicks.length > 0) {
      setActiveTab('live');
    } else if (!isLive) {
      setActiveTab('pre');
    }
  }, [isLive, livePicks.length]);


  /* ── Individual Pick Card ── */
  const PickCard = ({ pick }) => {
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
      if (onSavePick) {
        onSavePick(pick);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    };

    const accent =
      pick.probability >= 85
        ? { color: '#00ff88', bg: 'rgba(0,255,136,0.06)', border: 'rgba(0,255,136,0.18)' }
        : pick.probability >= 75
        ? { color: '#3b9eff', bg: 'rgba(59,158,255,0.06)', border: 'rgba(59,158,255,0.18)' }
        : { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.18)' };

    return (
      <div
        className="relative rounded-lg border overflow-hidden flex items-stretch group transition-all duration-200 hover:brightness-110 min-h-[110px]"
        style={{ background: accent.bg, borderColor: accent.border }}
      >
        {/* Saved flash */}
        {saved && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg z-20 animate-in fade-in zoom-in duration-150">
            <span className="text-xl">✅</span>
          </div>
        )}

        {/* Left: big % block */}
        <div
          className="flex flex-col items-center justify-center px-4 py-5 shrink-0 min-w-[90px]"
          style={{ background: `${accent.color}08`, borderRight: `1px solid ${accent.border}` }}
        >
          <span
            className="text-[40px] font-numbers leading-none tracking-tighter"
            style={{
              color: accent.color,
              textShadow: `0 0 30px ${accent.color}40`,
            }}
          >
            {pick.probability}%
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] mt-2 opacity-60"
            style={{ color: accent.color }}>
            {pick.tier}
          </span>
        </div>

        {/* Right: content */}
        <div className="flex flex-col justify-between flex-1 px-5 py-5 gap-2">
          {/* Header row: Market pill and Odds */}
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full leading-none"
              style={{ color: accent.color, background: `${accent.color}12` }}
            >
              {pick.market}
            </span>
            {pick.odds && (
              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-lg border border-white/5"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 text-white">Cuota</span>
                <span className="text-[16px] font-numbers text-white leading-none">{pick.odds}</span>
              </div>
            )}
          </div>

          {/* Selection — the main text, big and bold */}
          <div>
            <p className="text-[18px] font-bold text-white leading-tight tracking-tight">{pick.selection}</p>
            {/* Narrative: explicación en lenguaje sencillo (prioridad) */}
            {(pick.narrative || pick.argument) && (
              <>
                <div className="mt-3 mb-2 border-t border-white/5" />
                <p className="text-[13px] text-slate-300 leading-relaxed">
                  {pick.narrative || pick.argument}
                </p>
              </>
            )}
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-between gap-1 mt-3">
            <div className="flex gap-2">
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${
                pick.risk === 'Bajo' ? 'bg-accent-green/15 text-accent-green'
                : pick.risk === 'Moderado' ? 'bg-amber-400/15 text-amber-400'
                : 'bg-red-500/15 text-red-400'
              }`}>{pick.risk}</span>
              
              {pick.suggestedStake > 0 && (
                <span className="text-[10px] px-2.5 py-1 rounded-full font-bold uppercase flex items-center gap-1 bg-blue-500/15 text-blue-400 border border-blue-500/20" title="Stake sugerido según Criterio de Kelly">
                  💰 Stake {pick.suggestedStake}%
                </span>
              )}
            </div>
            
            {saved ? (
              <span className="text-[11px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest text-surface-900 bg-accent-green flex items-center gap-1 shadow-[0_0_10px_rgba(0,255,136,0.5)]">
                ✓ Guardada
              </span>
            ) : (
              <button 
                onClick={handleSave}
                className="text-[11px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest transition-colors duration-200 border cursor-pointer"
                style={{ 
                  color: accent.color, 
                  background: `${accent.color}15`,
                  borderColor: `${accent.color}40`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = accent.color;
                  e.currentTarget.style.color = '#000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${accent.color}15`;
                  e.currentTarget.style.color = accent.color;
                }}
              >
                Guardar Apuesta
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ── Tab switcher ── */
  return (
    <div className="space-y-3">
      {/* Pill-style tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/5">
        <button
          onClick={() => setActiveTab('pre')}
          className={`flex-1 text-[13px] font-bold py-2.5 px-3 rounded-[10px] uppercase tracking-widest transition-all duration-200 ${
            activeTab === 'pre'
              ? 'bg-accent-green text-surface-900 shadow'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          ⚽ Pre-Partido
        </button>
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 text-[13px] font-bold py-2.5 px-3 rounded-[10px] uppercase tracking-widest transition-all duration-200 ${
            activeTab === 'live'
              ? 'bg-amber-500 text-surface-900 shadow'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          🔴 En Vivo
        </button>
      </div>

      {/* Cards grid */}
      {activeTab === 'pre' && (
        preMatchPicks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {preMatchPicks.map((pick, i) => <PickCard key={`pre-${i}`} pick={pick} />)}
          </div>
        ) : (
          <div className="text-center py-8 bg-surface-900/30 rounded-xl border border-white/5">
            <div className="text-3xl mb-3 opacity-50">⚽</div>
            <p className="text-sm font-semibold text-slate-300 mb-1">Sin apuestas pre-partido</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {reason || 'El motor predictivo no encontró una ventaja matemática clara para recomendar una apuesta antes del encuentro.'}
            </p>
          </div>
        )
      )}
      
      {activeTab === 'live' && (
        livePicks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {livePicks.map((pick, i) => <PickCard key={`live-${i}`} pick={pick} />)}
          </div>
        ) : (
          <div className="text-center py-8 bg-surface-900/30 rounded-xl border border-white/5">
            <div className="text-3xl mb-3 opacity-50">🔴</div>
            <p className="text-sm font-semibold text-slate-300 mb-1">Esperando oportunidades en vivo</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {!isLive 
                ? 'El partido aún no ha comenzado. Las recomendaciones en vivo aparecerán aquí mientras el balón esté rodando.' 
                : 'El partido está en curso, pero el sistema aún no detecta oportunidades tácticas de alta probabilidad. Se actualizará automáticamente.'}
            </p>
          </div>
        )
      )}

      <p className="text-[9px] text-slate-600 text-center">Toca una tarjeta para guardarla</p>
    </div>
  );
}

function RecentMatchesList({ matches, teamId }) {
  if (!matches || matches.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
      {matches.slice(0, 10).map((m, i) => {
        const isHome  = String(m.teams?.home?.id) === String(teamId);
        const hg      = m.goals?.home ?? 0;
        const ag      = m.goals?.away ?? 0;
        const oppName = isHome ? m.teams?.away?.name : m.teams?.home?.name;
        const winner  = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
        let result = 'D';
        if ((isHome && winner === 'home') || (!isHome && winner === 'away')) result = 'W';
        if ((isHome && winner === 'away') || (!isHome && winner === 'home')) result = 'L';
        const icon  = result === 'W' ? '✅' : result === 'D' ? '➖' : '❌';
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
