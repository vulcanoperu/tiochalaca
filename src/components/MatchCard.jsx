import { useNavigate } from 'react-router-dom';
import { Activity, ChevronRight } from 'lucide-react';

// ── Tarjeta de árbitro (Minimalista) ──────────────────────────────────────────
function CardBadge({ color = 'red', count = 1 }) {
  const bg = color === 'red' ? '#ff4757' : '#fbbf24';
  return (
    <div
      className="w-[9px] h-[12px] rounded-[1px] flex items-center justify-center relative shrink-0 shadow-sm"
      style={{ background: bg }}
    >
      {count > 1 && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-black text-white opacity-90 leading-none">
          {count}
        </span>
      )}
    </div>
  );
}

// ── Estado del partido (Vibrante) ──────────────────────────────────────────
function StatusBadge({ status, elapsed }) {
  if (['1H', '2H', 'ET'].includes(status)) {
    return (
      <span className="badge-red gap-2 shadow-[0_0_15px_rgba(255,71,87,0.15)]">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="font-numbers tracking-tight">{elapsed}'</span>
      </span>
    );
  }
  if (status === 'HT') return <span className="badge-yellow">HT</span>;
  if (status === 'FT') return <span className="badge-gray px-3">FINALIZADO</span>;
  return null;
}

// ── MatchCard Principal (Con Respiro y Color) ──────────────────────────────────
export default function MatchCard({ fixture, onClick }) {
  const navigate = useNavigate();
  const { fixture: f, teams, goals, league } = fixture;
  const status = f?.status?.short;
  const elapsed = f?.status?.elapsed;
  const isLive = ['1H', '2H', 'ET', 'HT'].includes(status);
  const isFinished = ['FT', 'AET', 'PEN'].includes(status);
  const kickoff = f?.date
    ? new Date(f.date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const handleClick = () => {
    if (onClick) onClick(fixture);
    else navigate(`/analysis/${f.id}`);
  };

  const homeGoals = goals?.home ?? (isFinished || isLive ? 0 : null);
  const awayGoals = goals?.away ?? (isFinished || isLive ? 0 : null);
  const showScore = isLive || isFinished;

  // Acento lateral basado en estado
  const accentClass = isLive ? 'bg-accent-green' : isFinished ? 'bg-slate-700' : 'bg-accent-blue';

  const formatTeamName = (name) => {
    if (!name) return '';
    return name.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <button
      onClick={handleClick}
      id={`match-${f?.id}`}
      className="group relative w-full text-left bg-[#0a0f14] border border-white/[0.06] rounded-2xl transition-all duration-500 hover:border-white/20 hover:bg-[#0d131a] hover:scale-[1.02] hover:shadow-2xl overflow-hidden"
    >
      <div className="p-6 md:p-8">
        {/* Header: Liga + Hora/Estado */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3 opacity-40 group-hover:opacity-100 transition-opacity">
            {league?.logo && (
              <img src={league.logo} alt="" className="w-4 h-4 object-contain grayscale brightness-200" />
            )}
            <span className="text-[10px] font-black uppercase tracking-[0.2em] truncate max-w-[140px]">
              {league?.name}
            </span>
          </div>

          <div className="shrink-0">
            {isLive ? (
              <StatusBadge status={status} elapsed={elapsed} />
            ) : isFinished ? (
              <StatusBadge status="FT" />
            ) : (
              <div className="flex items-center gap-2 text-accent-blue font-numbers font-bold text-xs bg-accent-blue/5 px-3 py-1 rounded-full border border-accent-blue/10">
                {kickoff}
              </div>
            )}
          </div>
        </div>

        {/* Equipos + Marcador (List Layout) */}
        <div className="flex flex-col gap-4">
          
          {/* Local */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
              {teams?.home?.logo ? (
                <img src={teams.home.logo} alt="" className="w-6 h-6 object-contain drop-shadow-md" />
              ) : (
                <span className="text-sm font-black text-slate-700">{teams?.home?.name?.[0]}</span>
              )}
            </div>
            <span className="text-[15px] font-black tracking-tight text-slate-200 flex-1 break-words leading-tight">
              {formatTeamName(teams?.home?.name)}
            </span>
            {showScore && (
              <span className={`text-2xl font-numbers font-black w-8 text-right ${isLive ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-slate-400'}`}>
                {homeGoals}
              </span>
            )}
          </div>

          {/* Visitante */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
              {teams?.away?.logo ? (
                <img src={teams.away.logo} alt="" className="w-6 h-6 object-contain drop-shadow-md" />
              ) : (
                <span className="text-sm font-black text-slate-700">{teams?.away?.name?.[0]}</span>
              )}
            </div>
            <span className="text-[15px] font-black tracking-tight text-slate-200 flex-1 break-words leading-tight">
              {formatTeamName(teams?.away?.name)}
            </span>
            {showScore && (
              <span className={`text-2xl font-numbers font-black w-8 text-right ${isLive ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-slate-400'}`}>
                {awayGoals}
              </span>
            )}
          </div>
        </div>

        {/* Footer: Red Cards Indicator */}
        {(fixture.redCards?.home > 0 || fixture.redCards?.away > 0) && (
          <div className="mt-5 pt-4 border-t border-white/[0.03] flex items-center justify-center gap-12 animate-in">
            <div className="flex gap-1.5 min-w-[24px] justify-center">
              {fixture.redCards?.home > 0 && <CardBadge color="red" count={fixture.redCards.home} />}
            </div>
            <div className="w-px h-3 bg-white/5" />
            <div className="flex gap-1.5 min-w-[24px] justify-center">
              {fixture.redCards?.away > 0 && <CardBadge color="red" count={fixture.redCards.away} />}
            </div>
          </div>
        )}

        {/* CTA sutil que aparece en hover */}
        <div className="mt-5 pt-4 border-t border-white/[0.03] flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-500">
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
             Ver Detalles
           </span>
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-green flex items-center gap-1">
             <Activity size={12} />
             Analizar
             <ChevronRight size={12} />
           </span>
        </div>
      </div>
    </button>
  );
}
