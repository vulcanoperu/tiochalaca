export function MatchHero({ fixture }) {
  return (
    <div className="glass-card p-6"
      style={{ background: 'linear-gradient(135deg, rgba(15,26,20,0.98), rgba(22,42,30,0.95))' }}>
      <div className="flex items-center justify-around gap-4">
        <div className="flex flex-col items-center gap-3 flex-1">
          {fixture?.teams?.home?.logo && (
            <img src={fixture.teams.home.logo} alt="" className="w-20 h-20 md:w-28 md:h-28 object-contain" />
          )}
          <p className="font-bold text-white text-center text-base md:text-xl">{fixture?.teams?.home?.name}</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="text-4xl md:text-5xl font-numbers text-white bg-surface-900/80 px-5 py-3 md:px-6 md:py-4 rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.4)] flex items-center justify-center min-w-[120px] md:min-w-[140px] tracking-tighter gap-3">
            <span className="text-accent-green">{fixture?.goals?.home ?? 0}</span>
            <span className="text-slate-800 opacity-50 font-light">-</span>
            <span className="text-accent-green">{fixture?.goals?.away ?? 0}</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 flex-1">
          {fixture?.teams?.away?.logo && (
            <img src={fixture.teams.away.logo} alt="" className="w-20 h-20 md:w-28 md:h-28 object-contain" />
          )}
          <p className="font-bold text-white text-center text-base md:text-xl">{fixture?.teams?.away?.name}</p>
        </div>
      </div>
    </div>
  );
}
