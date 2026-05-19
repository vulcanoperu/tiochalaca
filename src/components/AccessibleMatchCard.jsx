import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clock } from 'lucide-react';

export default function AccessibleMatchCard({ fixture, onClick }) {
  const navigate = useNavigate();
  const { fixture: f, teams, league, goals } = fixture;
  
  const handleClick = () => {
    if (onClick) onClick(fixture);
    else navigate(`/partido/${f.id}`);
  };

  const isLive = ['1H', '2H', 'ET', 'HT', 'P'].includes(f?.status?.short);
  const isFinished = f?.status?.short === 'FT';
  const time = f?.date ? new Date(f.date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const showScore = isLive || isFinished;

  return (
    <button
      onClick={handleClick}
      className="group w-full text-left rounded-2xl border-[3px] border-transparent bg-black/60 hover:bg-black/40 hover:border-transparent transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
    >
      <div className="p-5">
        {/* Header: League + Status */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 truncate pr-3">
            {league?.name || 'Liga'}
          </span>
          {isLive ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">En Vivo</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
              <Clock size={10} />
              {time}
            </span>
          )}
        </div>

        {/* Teams */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center shrink-0 overflow-hidden">
                {teams?.home?.logo ? (
                  <img src={teams.home.logo} alt="" className="w-5 h-5 object-contain" />
                ) : (
                  <span className="text-[10px] font-semibold text-slate-500">{teams?.home?.name?.[0]}</span>
                )}
              </div>
              <span className="text-sm font-semibold text-slate-200 truncate">
                {teams?.home?.name}
              </span>
            </div>
            {showScore && (
              <span className={`text-sm font-bold font-mono tabular-nums ${isLive ? 'text-white' : 'text-slate-400'}`}>
                {goals?.home ?? 0}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center shrink-0 overflow-hidden">
                {teams?.away?.logo ? (
                  <img src={teams.away.logo} alt="" className="w-5 h-5 object-contain" />
                ) : (
                  <span className="text-[10px] font-semibold text-slate-500">{teams?.away?.name?.[0]}</span>
                )}
              </div>
              <span className="text-sm font-semibold text-slate-200 truncate">
                {teams?.away?.name}
              </span>
            </div>
            {showScore && (
              <span className={`text-sm font-bold font-mono tabular-nums ${isLive ? 'text-white' : 'text-slate-400'}`}>
                {goals?.away ?? 0}
              </span>
            )}
          </div>
        </div>

        {/* Subtle CTA */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 group-hover:text-slate-300 transition-colors">
            Ver análisis
          </span>
          <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </button>
  );
}
