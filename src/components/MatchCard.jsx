import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Tv } from 'lucide-react';

function StatusBadge({ status, elapsed }) {
  if (status === '1H' || status === '2H' || status === 'ET') {
    return (
      <span className="badge-red flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" />
        {elapsed}' EN VIVO
      </span>
    );
  }
  if (status === 'HT') return <span className="badge-yellow">Descanso</span>;
  if (status === 'FT') return <span className="badge-gray">FT</span>;
  if (status === 'NS') return <span className="badge-blue"><Clock size={10} /> Pronto</span>;
  return <span className="badge-gray">{status}</span>;
}

function GoalBar({ home, away }) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  return (
    <div className="flex items-center gap-2 w-full mt-1">
      <span className="text-xs text-slate-400 w-4 text-right font-mono">{home}</span>
      <div className="flex-1 h-1 rounded-full overflow-hidden bg-surface-600 flex">
        <div className="h-full rounded-l-full transition-all duration-700"
          style={{ width: `${homePct}%`, background: 'linear-gradient(90deg,#00ff88,#00cc6a)' }} />
        <div className="h-full rounded-r-full transition-all duration-700"
          style={{ width: `${100 - homePct}%`, background: '#ff4757' }} />
      </div>
      <span className="text-xs text-slate-400 w-4 font-mono">{away}</span>
    </div>
  );
}

export default function MatchCard({ fixture, onClick }) {
  const navigate = useNavigate();
  const { fixture: f, teams, goals, league } = fixture;
  const status  = f?.status?.short;
  const elapsed = f?.status?.elapsed;
  const isLive  = ['1H','2H','ET','HT'].includes(status);
  const kickoff = f?.date ? new Date(f.date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '--:--';

  const handleClick = () => {
    if (onClick) onClick(fixture);
    else navigate(`/analysis/${f.id}`);
  };

  return (
    <button onClick={handleClick}
      className="glass-card-hover w-full text-left p-4 group"
      id={`match-${f?.id}`}
    >
      {/* League row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {league?.logo && (
            <img src={league.logo} alt={league.name} className="w-4 h-4 object-contain opacity-80" />
          )}
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate max-w-[140px]">
            {league?.name} · {league?.round || ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isLive && <StatusBadge status={status} elapsed={elapsed} />}
          {!isLive && status === 'NS' && (
            <span className="text-xs text-slate-400 font-mono">{kickoff}</span>
          )}
          {!isLive && status !== 'NS' && <StatusBadge status={status} />}
        </div>
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-3">
        {/* Home */}
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          {teams?.home?.logo && (
            <img src={teams.home.logo} alt={teams.home.name} className="w-9 h-9 object-contain drop-shadow-sm" />
          )}
          <span className="text-xs font-semibold text-center leading-tight line-clamp-2 text-slate-200">
            {teams?.home?.name}
          </span>
        </div>

        {/* Score */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          {(status === 'FT' || isLive) ? (
            <div className="flex items-center gap-2">
              {fixture.redCards?.home > 0 && (
                <div className="w-2 h-3 bg-red-600 rounded-sm shadow-[0_0_8px_rgba(255,0,0,0.5)] animate-pulse" title="Tarjeta Roja" />
              )}
              <span className={`text-2xl font-bold font-mono tabular-nums ${isLive ? 'text-white' : 'text-slate-300'}`}>
                {goals?.home ?? 0}
              </span>
              <span className="text-slate-600 text-xl">–</span>
              <span className={`text-2xl font-bold font-mono tabular-nums ${isLive ? 'text-white' : 'text-slate-300'}`}>
                {goals?.away ?? 0}
              </span>
              {fixture.redCards?.away > 0 && (
                <div className="w-2 h-3 bg-red-600 rounded-sm shadow-[0_0_8px_rgba(255,0,0,0.5)] animate-pulse" title="Tarjeta Roja" />
              )}
            </div>
          ) : (
            <div className="text-slate-600 text-xl font-mono">vs</div>
          )}

          {isLive && <GoalBar home={goals?.home ?? 0} away={goals?.away ?? 0} />}
        </div>

        {/* Away */}
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          {teams?.away?.logo && (
            <img src={teams.away.logo} alt={teams.away.name} className="w-9 h-9 object-contain drop-shadow-sm" />
          )}
          <span className="text-xs font-semibold text-center leading-tight line-clamp-2 text-slate-200">
            {teams?.away?.name}
          </span>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Tv size={10} /> Analizar partido
        </span>
        <ChevronRight size={14} className="text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-green" />
      </div>
    </button>
  );
}
