import React from 'react';
import { Zap, RefreshCw, LayoutDashboard, Calendar, TrendingUp, Crown } from 'lucide-react';
import { useRecommendations } from '../hooks/useRecommendations';
import { VipTab } from '../components/recommendations/VipTab';
import { AltoValorTab } from '../components/recommendations/AltoValorTab';

export default function RecommendationsPage() {
  const {
    fixtures, recommendations, loading, analyzingCount, scannedCount,
    selectedDate, setSelectedDate, selectedMarket, setSelectedMarket,
    selectedLeague, setSelectedLeague, activeTab, setActiveTab,
    savedValueBets, valueBets, availableMarkets, availableLeagues, filteredVipPicks,
    getLocalDate, parseLocalDate,
  } = useRecommendations();

  if (loading && recommendations.length === 0) {
    return (
      <div className="w-full py-20 text-center">
        <div className="relative inline-block mb-8">
          <Zap size={48} className="text-accent-green animate-pulse" />
          <RefreshCw size={24} className="text-accent-green absolute -bottom-2 -right-2 animate-spin" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2">Escaneando el Mercado...</h1>
        <p className="text-slate-400 max-w-xs mx-auto">
          Estamos analizando {fixtures.length} partidos de hoy buscando las mejores oportunidades VIP.
        </p>
        <div className="mt-8 max-w-xs mx-auto bg-surface-800 h-2 rounded-full overflow-hidden border border-white/5">
          <div
            className="h-full bg-accent-green transition-all duration-300"
            style={{ width: `${(analyzingCount / Math.min(fixtures.length, 40)) * 100}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-600 mt-2 uppercase font-bold tracking-widest">
          Analizando {analyzingCount} de {Math.min(fixtures.length, 40)} partidos principales
        </p>
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in space-y-10">

      {/* Header Dashboard */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8 relative">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-green/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="flex items-center gap-5 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-green/20 to-transparent flex items-center justify-center border border-accent-green/20 shadow-[0_0_30px_rgba(191,241,2,0.1)]">
            <LayoutDashboard className="text-accent-green" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-1">Centro de Recomendaciones</h1>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-white/5 px-2 py-1 rounded">Algoritmo v4.2</span>
              <div className="flex items-center gap-1.5 text-[11px] text-accent-green font-bold uppercase tracking-wider">
                <Calendar size={12} />
                <span>{parseLocalDate(selectedDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap relative z-10">
          <div className="flex bg-surface-800/80 p-1 rounded-xl border border-white/10 backdrop-blur-sm shadow-xl">
            {[
              { label: 'Hoy', date: getLocalDate() },
              { label: 'Mañana', date: new Date(Date.now() + 86400000).toLocaleDateString('sv-SE') },
              { label: 'Pasado', date: new Date(Date.now() + 172800000).toLocaleDateString('sv-SE') }
            ].map(opt => (
              <button
                key={opt.date}
                onClick={() => setSelectedDate(opt.date)}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                  selectedDate === opt.date
                    ? 'bg-accent-green text-surface-900 shadow-[0_0_15px_rgba(191,241,2,0.3)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <div className="relative ml-1 pl-1 border-l border-white/10 flex items-center">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-[10px] font-black text-slate-400 hover:text-accent-green focus:text-accent-green outline-none w-[110px] pl-3 cursor-pointer transition-colors"
              />
            </div>
          </div>

          <div className="glass-card px-4 py-2.5 flex items-center gap-3 border-accent-green/20 bg-surface-800/50">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse shadow-[0_0_8px_rgba(191,241,2,0.8)]" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">
              <span className="text-accent-green">{scannedCount}</span> Analizados <span className="text-slate-600 mx-1">•</span> <span className="text-yellow-400">{recommendations.length}</span> Picks
            </span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="p-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-slate-400 hover:text-white transition-all border border-white/10 shadow-lg hover:border-accent-green/50 group"
          >
            <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-6 border-b border-white/5 pb-0 px-2 mt-4">
        <button
          onClick={() => setActiveTab('vip')}
          className={`pb-4 text-[13px] font-black uppercase tracking-widest border-b-2 transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'vip'
              ? 'border-accent-green text-accent-green'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-white/10'
          }`}
        >
          <TrendingUp size={16} /> Apuestas VIP
        </button>
        <button
          onClick={() => setActiveTab('alto-valor')}
          className={`pb-4 text-base font-black uppercase tracking-widest border-b-2 transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'alto-valor'
              ? 'border-yellow-400 text-yellow-400'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-white/10'
          }`}
        >
          <Crown size={16} /> Apuestas de Alto Valor
        </button>
      </div>

      {/* Contenido de Pestañas */}
      <div className="w-full mt-6">
        {activeTab === 'vip' && (
          <VipTab valueBets={valueBets} savedValueBets={savedValueBets} />
        )}
        {activeTab === 'alto-valor' && (
          <AltoValorTab
            filteredVipPicks={filteredVipPicks}
            availableMarkets={availableMarkets}
            availableLeagues={availableLeagues}
            selectedMarket={selectedMarket}
            setSelectedMarket={setSelectedMarket}
            selectedLeague={selectedLeague}
            setSelectedLeague={setSelectedLeague}
            fixturesCount={fixtures.length}
          />
        )}
      </div>
    </div>
  );
}
