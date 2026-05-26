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
 * Goal timeline heatmap (by time slots)
 */
function GoalTimeline({ slots, teamName }) {
  const totalScored = slots.reduce((a, s) => a + s.goals, 0);
  const totalConceded = slots.reduce((a, s) => a + s.conceded, 0);

  if (totalScored === 0 && totalConceded === 0) {
    return (
      <div className="text-center py-6 bg-transparent border border-white/5 border-dashed mt-2 rounded-lg">
        <p className="text-[11px] text-slate-500">Sin datos de minutos disponibles.</p>
      </div>
    );
  }

  const maxScored = Math.max(...slots.map(s => s.goals), 1);
  const maxConceded = Math.max(...slots.map(s => s.conceded), 1);

  const renderTrack = (type, title, total, maxVal, colorRGB) => (
    <div className="mb-6 relative">
      <div className="flex justify-between items-center mb-1.5 px-1">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgb(${colorRGB})` }}>
          {title} ({total})
        </span>
      </div>
      <div className="relative flex h-10 gap-1 bg-black/20 p-1 rounded-lg border border-white/5">
        {slots.map((slot) => {
          const val = type === 'scored' ? slot.goals : slot.conceded;
          const intensity = val / maxVal;
          const bgOpacity = val === 0 ? 0.03 : 0.15 + (intensity * 0.85);
          const textColor = val === 0 
            ? 'text-transparent' 
            : (type === 'scored' && intensity > 0.6 ? 'text-slate-900 font-black' : 'text-white font-bold');

          return (
            <div key={slot.key} className="flex-1 flex flex-col relative group">
              <div 
                className="w-full h-full rounded-[4px] transition-all duration-300 flex items-center justify-center cursor-default" 
                style={{ backgroundColor: `rgba(${colorRGB}, ${bgOpacity})` }}
              >
                <span className={`text-[12px] ${textColor}`}>
                  {val > 0 ? val : ''}
                </span>
              </div>
              
              {/* Tooltip */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-black/95 px-2.5 py-1 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10 z-10 shadow-xl">
                {slot.label}: <strong style={{ color: `rgb(${colorRGB})` }}>{val}</strong> goles
              </div>

              {/* Minute Label */}
              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 font-mono">
                {slot.key.split('-')[1]}'
              </span>
            </div>
          );
        })}
        {/* Half-time separator */}
        <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/10 -translate-x-1/2 pointer-events-none"></div>
      </div>
    </div>
  );

  return (
    <div className="mt-4 pb-2 px-1">
      {renderTrack('scored', 'Goles a Favor', totalScored, maxScored, '0, 255, 136')}
      {renderTrack('conceded', 'Goles en Contra', totalConceded, maxConceded, '255, 51, 102')}
      
      <div className="flex justify-between px-1 text-[9px] text-slate-500 uppercase tracking-widest mt-3">
        <span>1er Tiempo</span>
        <span>2do Tiempo</span>
      </div>
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


  /* ── Individual Pick Card (Square / Vertical) ── */
  const PickCard = ({ pick, isValueBet = false }) => {
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
      if (onSavePick) {
        onSavePick(pick);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    };

    // 💎 SNIPER con cuota baja (<1.50) es un BANKER, no una Value Bet
    const pickOdds = parseFloat(pick.odds) || 0;
    const isSniperBanker = pick.tier === '💎' && pickOdds > 0 && pickOdds < 1.50 && pick.probability >= 78;
    const isValue = !isSniperBanker && (isValueBet || pick.category === 'valor' || pick.tier === '💎');
    const isSegura = isSniperBanker || pick.category === 'segura' || pick.tier === '🟢';

    let accent;
    if (isValue) {
      accent = { color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.30)' };
    } else if (isSegura) {
      accent = { color: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.18)' };
    } else if (pick.probability >= 85) {
      accent = { color: '#00ff88', bg: 'rgba(0,255,136,0.06)', border: 'rgba(0,255,136,0.18)' };
    } else if (pick.probability >= 75) {
      accent = { color: '#3b9eff', bg: 'rgba(59,158,255,0.06)', border: 'rgba(59,158,255,0.18)' };
    } else {
      accent = { color: '#a78bfa', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.18)' };
    }

    let tierText;
    if (isValue)   tierText = '💎 VALUE BET';
    else if (isSegura) tierText = '🟢 BANKER';
    else if (pick.tier === '🔥') tierText = '🔥 EN VIVO';
    else if (pick.tier === '🔵') tierText = '🔵 SUGERIDA';
    else tierText = '⭐ OPCIÓN';

    return (
      <div
        className="rounded-3xl p-8 sm:p-10 flex flex-col gap-6 border transition-all cursor-default"
        style={{
          background: isValue ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.01)',
          borderColor: accent.border,
          boxShadow: isValue ? `0 4px 24px ${accent.color}15` : 'none',
        }}
      >
        {/* Top: Cuota y Probabilidad */}
        <div className="flex justify-between items-center bg-black/10 p-4 rounded-2xl border border-white/5">
          <div className="flex flex-col">
            <span className="text-sm text-slate-500 font-bold mb-1">Cuota</span>
            <span className="text-5xl font-black tracking-tight" style={{ color: accent.color }}>
              {pick.odds || '—'}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-sm text-slate-500 font-bold mb-1">Confianza</span>
            <span className="text-4xl font-black text-white tracking-tight">{pick.probability}%</span>
          </div>
        </div>

        {/* Middle: Selección, Mercado y Narrativa */}
        <div className="space-y-4 pt-2">
          <div className="inline-block px-4 py-1.5 rounded-lg text-sm font-bold bg-white/5 text-slate-300">
            {pick.market}
          </div>
          <p className="text-2xl font-bold text-white leading-tight">{pick.selection}</p>
          
          {(pick.narrative || pick.argument) && (
            <p className="text-base text-slate-400 leading-relaxed bg-black/20 p-4 rounded-xl border-l-2 border-slate-700">
              {pick.narrative || pick.argument}
            </p>
          )}
        </div>

        {/* Bottom: Riesgo y botón grande */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-2 pt-5 border-t border-white/5">
          <span className={`text-sm px-4 py-2 rounded-xl font-bold ${
            pick.risk === 'Bajo' ? 'bg-emerald-500/10 text-emerald-400'
            : pick.risk === 'Moderado' ? 'bg-amber-500/10 text-amber-400'
            : 'bg-red-500/10 text-red-400'
          }`}>Riesgo: {pick.risk}</span>
          
          {saved ? (
            <span className="flex-1 sm:flex-none px-6 py-3.5 rounded-xl font-bold uppercase text-black bg-accent-green shadow-[0_0_10px_rgba(0,255,136,0.4)] text-center">
              ✓ Guardada
            </span>
          ) : (
            <button
              onClick={handleSave}
              className="flex-1 sm:flex-none px-6 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all border cursor-pointer"
              style={{ color: accent.color, background: `${accent.color}15`, borderColor: `${accent.color}30` }}
              onMouseEnter={e => { e.currentTarget.style.background = accent.color; e.currentTarget.style.color = '#000'; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${accent.color}15`; e.currentTarget.style.color = accent.color; }}
            >
              <CheckCircle2 size={20} />
              Guardar Apuesta
            </button>
          )}
        </div>
      </div>
    );
  };

  /* ── Section Divider ── */
  const SectionHeader = ({ label, count, color = 'text-slate-500' }) => (
    <div className="flex items-center gap-3 mt-4 mb-2">
      <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${color}`}>{label}</span>
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 text-slate-500">{count}</span>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );

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

      {/* Cards grid — pre-partido con secciones por prioridad */}
      {activeTab === 'pre' && (() => {
        if (preMatchPicks.length === 0) return (
          <div className="text-center py-8 bg-surface-900/30 rounded-xl border border-white/5">
            <div className="text-3xl mb-3 opacity-50">⚽</div>
            <p className="text-sm font-semibold text-slate-300 mb-1">Sin apuestas pre-partido</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {reason || 'El motor predictivo no encontró una ventaja matemática clara para recomendar una apuesta antes del encuentro.'}
            </p>
          </div>
        );

        const sortByOddsAndProb = (a, b) => {
          const oddsA = parseFloat(a.odds) || 0;
          const oddsB = parseFloat(b.odds) || 0;
          if (oddsB !== oddsA) return oddsB - oddsA;
          return (b.probability || 0) - (a.probability || 0);
        };

        // Helper: un 💎 SNIPER con cuota baja es un Banker, no un Value Bet
        const isRealValueBet = (p) => {
          const odds = parseFloat(p.odds) || 0;
          // 💎 con cuota baja (<1.50) y alta prob (>=78%) → es BANKER/SNIPER, no valor
          if (p.tier === '💎' && odds > 0 && odds < 1.50 && p.probability >= 78) return false;
          return p.category === 'valor' || p.tier === '💎';
        };

        // Grupo 1: Alto Valor — value bets reales + cuotas atractivas (>= 1.50)
        const valueBets = preMatchPicks
          .filter(p => isRealValueBet(p))
          .sort(sortByOddsAndProb);
        const highOddsPicks = preMatchPicks
          .filter(p => !isRealValueBet(p) && (parseFloat(p.odds) || 0) >= 1.50)
          .sort(sortByOddsAndProb);
        const altoValor = [...valueBets, ...highOddsPicks];

        // Grupo 2: Más Seguras — cuota < 1.50 O bankers SNIPER con cuota baja
        const seguras = preMatchPicks
          .filter(p => !isRealValueBet(p) && (parseFloat(p.odds) || 0) < 1.50)
          .sort((a, b) => (b.probability || 0) - (a.probability || 0));

        return (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-1">
            {/* 1. ALTO VALOR — value bets + cuotas atractivas */}
            {altoValor.length > 0 && (
              <>
                <SectionHeader
                  label="🔥 Apuestas de Alto Valor"
                  count={altoValor.length}
                  color="text-amber-400"
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  {valueBets.map((pick, i) => <PickCard key={`val-${i}`} pick={pick} isValueBet />)}
                  {highOddsPicks.length > 0 && valueBets.length > 0 && (
                    <div className="col-span-full flex items-center gap-3 px-1 pt-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-400/70">⚡ Cuotas Atractivas</span>
                      <div className="flex-1 h-px bg-yellow-400/10" />
                    </div>
                  )}
                  {highOddsPicks.map((pick, i) => <PickCard key={`high-${i}`} pick={pick} />)}
                </div>
              </>
            )}

            {/* 2. MÁS SEGURAS — todas las de cuota baja */}
            {seguras.length > 0 && (
              <>
                <SectionHeader label="🛡️ Apuestas Más Seguras" count={seguras.length} color="text-emerald-600" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  {seguras.map((pick, i) => <PickCard key={`seg-${i}`} pick={pick} />)}
                </div>
              </>
            )}
          </div>
        );
      })()}
      
      {activeTab === 'live' && (
        livePicks.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
