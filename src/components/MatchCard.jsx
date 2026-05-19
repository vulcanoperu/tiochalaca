import { useNavigate } from 'react-router-dom';

export default function MatchCard({ fixture, onClick, hideLeague = false }) {
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

  const homeGoals = goals?.home ?? (isFinished || isLive ? 0 : '');
  const awayGoals = goals?.away ?? (isFinished || isLive ? 0 : '');
  
  return (
    <button
      onClick={handleClick}
      id={`match-${f?.id}`}
      className="w-full text-left group flex flex-col py-4 px-2 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors duration-300 first:border-t"
    >
      {/* Top Meta info */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-[11px] font-medium text-white/30 tracking-wider">
          {hideLeague ? 'MATCH' : league?.name}
        </span>
        <div className="flex items-center gap-2">
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
          <span className={`text-[11px] font-medium ${isLive ? 'text-green-500' : 'text-white/30'}`}>
            {isLive ? `${elapsed}'` : isFinished ? 'FT' : kickoff}
          </span>
        </div>
      </div>

      {/* Teams Container */}
      <div className="flex flex-col gap-2">
        {/* Home Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {teams?.home?.logo ? (
              <img src={teams.home.logo} alt="" className="w-5 h-5 object-contain opacity-60 group-hover:opacity-100 transition-opacity" />
            ) : (
              <div className="w-5 h-5 opacity-30 text-[10px]">{teams?.home?.name?.[0]}</div>
            )}
            <span className="text-[15px] font-normal text-white/80 group-hover:text-white transition-colors">
              {teams?.home?.name}
            </span>
          </div>
          <span className={`text-[15px] font-medium ${isLive ? 'text-green-500' : 'text-white/90'}`}>
            {homeGoals}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {teams?.away?.logo ? (
              <img src={teams.away.logo} alt="" className="w-5 h-5 object-contain opacity-60 group-hover:opacity-100 transition-opacity" />
            ) : (
              <div className="w-5 h-5 opacity-30 text-[10px]">{teams?.away?.name?.[0]}</div>
            )}
            <span className="text-[15px] font-normal text-white/80 group-hover:text-white transition-colors">
              {teams?.away?.name}
            </span>
          </div>
          <span className={`text-[15px] font-medium ${isLive ? 'text-green-500' : 'text-white/90'}`}>
            {awayGoals}
          </span>
        </div>
      </div>
    </button>
  );
}
