import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export function PicksSection({ picksResult, livePicksResult, saveIndividualPick }) {
  const [activeRiskTab, setActiveRiskTab] = useState('altoValor');

  useEffect(() => {
    if (picksResult?.picks?.length > 0) {
      const isRealValueBet = (p) => {
        const odds = parseFloat(p.odds) || 0;
        if (p.tier === '💎' && odds > 0 && odds < 1.50 && p.probability >= 78) return false;
        return p.category === 'valor' || p.tier === '💎';
      };
      const altoValorCount = picksResult.picks.filter(p => isRealValueBet(p) || (!isRealValueBet(p) && (parseFloat(p.odds) || 0) >= 1.50)).length;
      const segurasCount = picksResult.picks.filter(p => !isRealValueBet(p) && (parseFloat(p.odds) || 0) < 1.50).length;
      if (altoValorCount === 0 && segurasCount > 0) {
        setActiveRiskTab('seguras');
      }
    }
  }, [picksResult]);

  const allPicks = [...(picksResult?.picks || [])];
  const livePicks = [...(livePicksResult?.picks || [])];
  
  const sortByOddsAndProb = (a, b) => {
    const oddsA = parseFloat(a.odds) || 0;
    const oddsB = parseFloat(b.odds) || 0;
    if (oddsB !== oddsA) return oddsB - oddsA;
    return (b.probability || 0) - (a.probability || 0);
  };

  const isRealValueBet = (p) => {
    const odds = parseFloat(p.odds) || 0;
    if (p.tier === '💎' && odds > 0 && odds < 1.50 && p.probability >= 78) return false;
    return p.category === 'valor' || p.tier === '💎';
  };

  const valueBets = allPicks.filter(p => isRealValueBet(p)).sort(sortByOddsAndProb);
  const highOddsPicks = allPicks.filter(p => !isRealValueBet(p) && (parseFloat(p.odds) || 0) >= 1.50).sort(sortByOddsAndProb);
  const altoValor = [...valueBets, ...highOddsPicks];

  const seguras = allPicks.filter(p => !isRealValueBet(p) && (parseFloat(p.odds) || 0) < 1.50).sort((a, b) => (b.probability || 0) - (a.probability || 0));
  const livePicksSorted = livePicks.sort(sortByOddsAndProb);

  const tabs = [
    { key: 'altoValor', label: '🔥 Alto Valor', count: altoValor.length },
    { key: 'seguras', label: '🛡️ Más Seguras', count: seguras.length },
  ];
  if (livePicksSorted.length > 0) {
    tabs.push({ key: 'enVivo', label: '🔴 En Vivo', count: livePicksSorted.length });
  }

  const activePicks = activeRiskTab === 'enVivo' ? livePicksSorted : activeRiskTab === 'seguras' ? seguras : altoValor;
  const isAltoValor = activeRiskTab === 'altoValor';
  const isEnVivo = activeRiskTab === 'enVivo';

  if (!picksResult?.picks?.length && !livePicksResult?.picks?.length) {
    return (
      <div className="text-center py-12 px-6 rounded-3xl bg-surface-900/60 border border-white/5 shadow-2xl flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center border border-white/10 text-slate-400">
          <AlertCircle size={28} />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">Sin Recomendaciones Activas</h3>
          <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
            {picksResult?.reason || "El motor de análisis se ha reservado de emitir recomendaciones para este encuentro debido a alta paridad deportiva o fluctuación inestable de cuotas."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex gap-3">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveRiskTab(tab.key)}
            className={`flex-1 py-4 rounded-2xl text-base md:text-lg font-bold transition-all duration-300 ${
              activeRiskTab === tab.key
                ? tab.key === 'altoValor'
                  ? 'bg-amber-500 text-black shadow-lg shadow-yellow-500/20'
                  : tab.key === 'enVivo'
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                    : 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-surface-800 border border-white/10 text-slate-400 hover:text-white'
            }`}>
            {tab.key === 'enVivo' && activeRiskTab !== 'enVivo' && (
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2 align-middle" />
            )}
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {isEnVivo && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <p className="text-sm text-red-300 font-semibold">
            Estas apuestas fueron generadas según el marcador y minuto actual del partido. Las cuotas cambian rápidamente en vivo.
          </p>
        </div>
      )}

      {activePicks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {activePicks.map((pick, i) => {
            const pickOdds = parseFloat(pick.odds) || 0;
            const isSniperBanker = pick.tier === '💎' && pickOdds > 0 && pickOdds < 1.50 && pick.probability >= 78;
            const isValue = !isSniperBanker && (isRealValueBet(pick) || pick.category === 'valor' || pick.tier === '💎');

            const cardBorderColor = isEnVivo ? 'border-red-500/20' : isAltoValor ? 'border-yellow-500/20' : 'border-emerald-500/20';
            const cardAccent = isEnVivo ? 'text-red-400' : isAltoValor ? 'text-yellow-400' : 'text-emerald-400';
            const cardBgAccent = isEnVivo ? 'bg-red-500/10 border-red-500/20' : isAltoValor
              ? isValue ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-amber-500/10 border-amber-500/20'
              : 'bg-emerald-500/10 border-emerald-500/20';
            const cardTextAccent = isEnVivo ? 'text-red-400' : isAltoValor
              ? isValue ? 'text-yellow-400' : 'text-amber-400'
              : 'text-emerald-400';
            const cardBtnClass = isEnVivo
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30'
              : isAltoValor
                ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-black border border-yellow-500/30'
                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black border border-emerald-500/30';

            return (
              <div key={`pick-${activeRiskTab}-${i}`}>
                <div className={`rounded-3xl p-8 sm:p-10 flex flex-col gap-6 border transition-all cursor-default bg-surface-900/60 ${cardBorderColor}`}>
                  <div className="flex items-center">
                    <span className={`text-[11px] px-3.5 py-1.5 rounded-full font-black tracking-wider border uppercase ${cardBgAccent} ${cardTextAccent}`}>
                      {isEnVivo
                        ? '🔴 Apuesta en Vivo'
                        : isAltoValor
                          ? isValue ? '💎 Selección de Valor' : '⚡ Cuota Atractiva'
                          : '🛡️ Apuesta Segura'
                      }
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-black/10 p-4 rounded-2xl border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-500 font-bold mb-1">Cuota</span>
                      <span className={`text-5xl font-black tracking-tight ${cardAccent}`}>
                        {pick.odds || '—'}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-sm text-slate-500 font-bold mb-1">Confianza</span>
                      <span className="text-4xl font-black text-white tracking-tight">{pick.probability}%</span>
                    </div>
                  </div>

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

                  <div className="flex flex-wrap items-center justify-between gap-4 mt-2 pt-5 border-t border-white/5">
                    <span className={`text-sm px-4 py-2 rounded-xl font-bold ${
                      pick.risk === 'Bajo' ? 'bg-emerald-500/10 text-emerald-400'
                      : pick.risk === 'Moderado' ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-red-500/10 text-red-400'
                    }`}>Riesgo: {pick.risk}</span>
                    
                    <button onClick={() => saveIndividualPick(pick)}
                      className={`flex-1 sm:flex-none px-6 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${cardBtnClass}`}>
                      <CheckCircle2 size={20} />
                      Guardar Apuesta
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-10 rounded-2xl bg-surface-900 border border-white/10">
          <p className="text-lg text-slate-400">
            {isEnVivo
              ? "No hay apuestas en vivo disponibles en este momento. Las picks se generan según el minuto y marcador actual."
              : isAltoValor 
                ? "No hay picks de Alto Valor para este partido. Por favor revisa la pestaña de 'Más Seguras'."
                : "No hay apuestas en esta categoría para este partido."
            }
          </p>
        </div>
      )}
    </div>
  );
}
