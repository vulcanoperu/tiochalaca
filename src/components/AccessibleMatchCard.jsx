import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clock } from 'lucide-react';

export default function AccessibleMatchCard({ fixture, pick, onClick }) {
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
      className="group relative w-full text-left overflow-hidden rounded-3xl bg-surface-900/40 hover:bg-surface-900/60 border border-white/5 hover:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl flex flex-col"
    >
      {/* Live indicator — top right */}
      {isLive && (
        <div className="absolute top-6 right-6 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-red-400">
            {f?.status?.elapsed ? `En Vivo • ${f.status.elapsed}'` : 'En Vivo'}
          </span>
        </div>
      )}

      <div className="p-8 pt-10 flex-1 flex flex-col">
        {/* Match Header: League + Time */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {league?.name || 'Liga'}
            </span>
            {!isLive && (
              <span className="text-[11px] font-black text-slate-200 bg-white/10 px-2.5 py-1 rounded-md border border-white/10 flex items-center shadow-sm">
                <Clock size={11} className="mr-1.5 text-slate-400" />{time}
              </span>
            )}
          </div>

          {/* Teams — stacked */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {teams?.home?.logo && (
                  <img src={teams.home.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                )}
                <span className="text-sm font-semibold text-slate-200 truncate">{teams?.home?.name}</span>
              </div>
              {showScore && (
                <span className={`text-lg font-black font-mono tabular-nums ml-3 ${isLive ? 'text-white' : 'text-slate-400'}`}>
                  {goals?.home ?? 0}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {teams?.away?.logo && (
                  <img src={teams.away.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                )}
                <span className="text-sm font-semibold text-slate-200 truncate">{teams?.away?.name}</span>
              </div>
              {showScore && (
                <span className={`text-lg font-black font-mono tabular-nums ml-3 ${isLive ? 'text-white' : 'text-slate-400'}`}>
                  {goals?.away ?? 0}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="h-px bg-white/5 mb-5 mt-auto" />

        {/* Status Bar */}
        <div className="flex items-center justify-between bg-black/40 rounded-2xl p-4 border border-white/5">
          <div className="flex flex-col">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Estado</p>
            <p className="text-sm font-bold truncate pr-2" style={{ color: isLive ? '#ef4444' : isFinished ? '#64748b' : '#BFF102' }}>
              {isLive ? `En Juego — ${f?.status?.elapsed || '0'}'` : isFinished ? 'Finalizado' : 'Próximo'}
            </p>
          </div>
          
          {pick ? (
             <div className="flex items-center gap-4 text-right shrink-0">
               <div className="flex flex-col">
                 <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Cuota</p>
                 <p className="text-sm font-bold text-[#BFF102]">{pick.odds ? Number(pick.odds).toFixed(2) : '—'}</p>
               </div>
               <div className="flex flex-col">
                 <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Confianza</p>
                 <p className="text-sm font-bold" style={{ color: pick.probability >= 85 ? '#72BF01' : pick.probability >= 72 ? '#f59e0b' : '#64748b' }}>
                   {pick.probability}%
                 </p>
               </div>
             </div>
          ) : (
             <div className="flex flex-col items-end shrink-0">
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Hora</p>
               <p className="text-sm font-bold text-slate-200">{time}</p>
             </div>
          )}
        </div>

        {/* Subtle CTA */}
        <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-[#BFF102] transition-colors">
          <span>Ver análisis</span>
          <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </button>
  );
}
