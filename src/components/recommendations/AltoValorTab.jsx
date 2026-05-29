import { Crown, ChevronRight, AlertCircle, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AltoValorTab({ filteredVipPicks, availableMarkets, availableLeagues, selectedMarket, setSelectedMarket, selectedLeague, setSelectedLeague, fixturesCount }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-yellow-400/10 flex items-center justify-center border border-yellow-400/20">
            <Crown size={16} className="text-yellow-400" />
          </div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest drop-shadow-md">Apuestas de Alto Valor</h2>
        </div>

        {/* Filtros Estilizados */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative group">
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="appearance-none bg-surface-800/80 border border-white/10 hover:border-accent-green/50 text-white text-[10px] font-black uppercase tracking-wider rounded-xl pl-4 pr-8 py-2.5 outline-none focus:border-accent-green transition-all cursor-pointer shadow-lg"
            >
              <option value="all">MERCADOS: TODOS</option>
              {availableMarkets.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90 group-hover:text-accent-green transition-colors" />
          </div>

          <div className="relative group">
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="appearance-none bg-surface-800/80 border border-white/10 hover:border-accent-green/50 text-white text-[10px] font-black uppercase tracking-wider rounded-xl pl-4 pr-8 py-2.5 outline-none focus:border-accent-green max-w-[180px] truncate transition-all cursor-pointer shadow-lg"
            >
              <option value="all">LIGAS: TODAS</option>
              {availableLeagues.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90 group-hover:text-accent-green transition-colors" />
          </div>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredVipPicks.length > 0 ? filteredVipPicks.map((pick, i) => (
          <div key={i} className="group relative bg-surface-800 rounded-2xl border border-white/5 hover:border-yellow-400/50 transition-all duration-300 overflow-hidden shadow-lg hover:shadow-[0_0_30px_rgba(250,204,21,0.15)] flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full blur-[50px] pointer-events-none group-hover:bg-yellow-400/20 transition-colors" />

            <div className="p-4 bg-gradient-to-b from-white/[0.03] to-transparent border-b border-white/5 flex items-start justify-between relative z-10">
              <div className="flex flex-col gap-1 w-full pr-4">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{pick.match?.league?.name || 'Liga Desconocida'}</span>
                </div>
                <span className="text-sm font-bold text-white leading-tight">{pick.match?.teams?.home?.name} <span className="text-slate-500 font-normal mx-1">vs</span> {pick.match?.teams?.away?.name}</span>
              </div>
              <div className="flex-shrink-0 bg-gradient-to-br from-yellow-400 to-amber-600 text-surface-900 text-xs font-black px-3 py-1.5 rounded-md shadow-md uppercase tracking-wider">
                ALTO VALOR
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between relative z-10">
              <div className="flex items-end justify-between mb-6">
                <div className="flex-1">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">{pick.market}</p>
                  <h3 className="text-lg font-black text-white leading-none">{pick.selection}</h3>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="flex items-center justify-center w-14 h-14 rounded-full border-4 border-yellow-400/20 border-t-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.1)] relative">
                    <span className="text-sm font-black text-yellow-400">{pick.probability}%</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate(`/analysis/${pick.match?.fixture?.id || ''}`)}
                className="w-full py-3 bg-surface-900 group-hover:bg-yellow-400 rounded-xl text-[10px] font-black text-slate-300 group-hover:text-surface-900 uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 border border-white/5 group-hover:border-transparent"
              >
                VER ANÁLISIS DETALLADO <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )) : fixturesCount === 0 ? (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 py-12 text-center glass-card border-dashed">
            <AlertCircle size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No hay partidos programados para esta fecha.</p>
            <p className="text-slate-600 text-xs mt-1">Intenta seleccionando otra fecha en el calendario.</p>
          </div>
        ) : (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 py-12 text-center glass-card border-dashed">
            <Shield size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No se encontraron apuestas de alto valor para esta fecha.</p>
            <p className="text-slate-600 text-xs mt-1">El algoritmo no detectó jugadas que superen el umbral de confianza de la casa.</p>
          </div>
        )}
      </div>
    </div>
  );
}
