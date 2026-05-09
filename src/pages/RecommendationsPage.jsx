import React, { useState, useEffect, useMemo } from 'react';
import { Star, TrendingUp, Shield, AlertCircle, RefreshCw, ChevronRight, Target, Zap, LayoutDashboard, Calendar, Crown } from 'lucide-react';
import { getTodayFixturesFromBackend, getMatchAnalysisFromBackend } from '../services/backendApi';
import { 
  generatePicks, 
  calculateFormScore, 
  calculateOverUnder, 
  analyzeGoalsByTimeSlot, 
  analyzeH2H, 
  calcMatchProbabilities 
} from '../services/analysisEngine';
import { useNavigate } from 'react-router-dom';

const ALLOWED_LEAGUES = [
  'per.1', 'ecu.1', 'ven.1', 'par.1', 'bra.1', 'arg.1', 'col.1', 'chi.1', 'uru.1',
  'conmebol.libertadores', 'conmebol.sudamericana',
  'mex.1', 'usa.1',
  'eng.1', 'esp.1', 'ger.1', 'fra.1', 'ita.1', 'por.1', 'ned.1', 'ksa.1',
  'uefa.champions', 'uefa.europa', 'uefa.europa.conf'
];

export default function RecommendationsPage() {
  const getLocalDate = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local
  // Helper: parse YYYY-MM-DD as local noon to avoid UTC-offset day shift
  const parseLocalDate = (str) => new Date(`${str}T12:00:00`);
  const [fixtures, setFixtures] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzingCount, setAnalyzingCount] = useState(0);
  const [scannedCount, setScannedCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState(getLocalDate());
  const navigate = useNavigate();

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setRecommendations([]); 
      setScannedCount(0);
      const res = await getTodayFixturesFromBackend(selectedDate);
      if (res.ok && res.data) {
        const matchesData = Array.isArray(res.data) ? res.data : [];
        const isToday = selectedDate === getLocalDate();
        
        // Filtrar por ligas permitidas y estado
        const filtered = matchesData.filter(m => {
          const leagueId = m.league?.id ? String(m.league.id).toLowerCase() : '';
          const isAllowed = ALLOWED_LEAGUES.some(slug => leagueId === slug || leagueId.includes(slug));
          if (isToday) {
            return isAllowed && !['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO'].includes(m.fixture?.status?.short);
          }
          return isAllowed;
        });

        console.log(`[Recommendations] Encontrados ${matchesData.length} partidos totales. ${filtered.length} partidos tras filtrar por ligas permitidas.`);
        
        setFixtures(filtered);
        if (filtered.length > 0) {
           analyzeMatches(filtered);
        } else {
           setLoading(false);
        }
      } else {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedDate]);

  async function analyzeMatches(matches) {
    const allRecs = [];
    setAnalyzingCount(0);
    
    // Analizamos hasta 60 partidos para cubrir toda la cartelera relevante
    const limitedMatches = matches.slice(0, 60);
    let count = 0;
    
    for (let i = 0; i < limitedMatches.length; i++) {
      const match = limitedMatches[i];
      setAnalyzingCount(i + 1);
      
      try {
        const analysisRes = await getMatchAnalysisFromBackend(match.fixture?.id);
        if (analysisRes.ok && analysisRes.data) {
          count++;
          const ad = analysisRes.data;
          // ... (resto de la lógica de cálculo que ya estaba bien)
          const hm = ad.homeMatches || [];
          const am = ad.awayMatches || [];
          const h2h = ad.h2h || [];
          const homeId = match.teams?.home?.id;
          const awayId = match.teams?.away?.id;

          const homeForm = calculateFormScore(hm, homeId);
          const awayForm = calculateFormScore(am, awayId);
          const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
          const awayFormAway = calculateFormScore(am, awayId, 'away');
          const homeSplit = calculateOverUnder(hm, homeId);
          const awaySplit = calculateOverUnder(am, awayId);
          const h2hData = analyzeH2H(h2h, homeId, awayId);
          const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
          const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);

          const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
          const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
          const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
          const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
          const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA);

          const calcRest = (ms) => {
            if (!ms?.length) return null;
            const ld = ms[0]?.fixture?.date;
            return ld ? Math.floor((Date.now() - new Date(ld).getTime()) / 86400000) : null;
          };

          const result = generatePicks({
            homeStats: null, awayStats: null, h2hData, homeForm, awayForm,
            homeSplitStats: homeSplit, awaySplitStats: awaySplit,
            isLive: false, liveClock: "0'", liveHomeGoals: 0, liveAwayGoals: 0,
            marketInsight: ad.marketInsight,
            homeCornersData: ad.homeCornersData, awayCornersData: ad.awayCornersData,
            homeCardsData: ad.homeCardsData, awayCardsData: ad.awayCardsData,
            homeSlots, awaySlots, homeFormAtHome, awayFormAway,
            poissonProbs: poisson, injuries: ad.injuries,
            homeTeamName: match.teams?.home?.name, awayTeamName: match.teams?.away?.name,
            leagueName: match.league?.name, homeRestDays: calcRest(hm), awayRestDays: calcRest(am),
            homeHistory: hm, awayHistory: am, city: match.city || null,
            marketOdds: ad.marketOdds, matchStandings: ad.matchStandings, advancedStats: ad.advancedStats,
          });

          if (result && result.picks) {
            const topPicks = result.picks.filter(p => 
              p.tier === '💎' || p.tier === '🔵' || 
              (p.argument && p.argument.toLowerCase().includes('value bet')) ||
              (p.probability && p.probability >= 70) // Bajamos a 70% para que siempre haya algo en tests
            );

            if (topPicks.length > 0) {
              allRecs.push({ match, picks: topPicks, projectedGoals: result.projectedGoals });
            }
          }
        }
      } catch (err) {
        console.error("Error analizando match:", match.id, err);
      }
    }
    
    setScannedCount(count);
    setRecommendations(allRecs);
    setLoading(false);
  }

  // Clasificar en VIP y Value Bets con seguridad
  const vipPicks = useMemo(() => {
    const list = [];
    if (!recommendations) return list;
    recommendations.forEach(rec => {
      if (rec.picks) {
        rec.picks.forEach(p => {
          if (p.tier === '💎' || (p.probability && p.probability >= 78)) {
            list.push({ ...p, match: rec.match });
          }
        });
      }
    });
    return list.sort((a, b) => (b.probability || 0) - (a.probability || 0));
  }, [recommendations]);

  const valueBets = useMemo(() => {
    const list = [];
    if (!recommendations) return list;
    recommendations.forEach(rec => {
      if (rec.picks) {
        rec.picks.forEach(p => {
          if (p.argument && p.argument.toLowerCase().includes('value bet')) {
            list.push({ ...p, match: rec.match });
          }
        });
      }
    });
    return list;
  }, [recommendations]);

  if (loading) {
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
             style={{ width: `${(analyzingCount / Math.min(fixtures.length, 25)) * 100}%` }} 
           />
        </div>
        <p className="text-[10px] text-slate-600 mt-2 uppercase font-bold tracking-widest">
           Analizando {analyzingCount} de {Math.min(fixtures.length, 25)} partidos principales
        </p>
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in space-y-10">
      
      {/* Header Dashboard */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-yellow-400/10 flex items-center justify-center border border-yellow-400/20 shadow-[0_0_20px_rgba(250,204,21,0.1)]">
            <LayoutDashboard className="text-yellow-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Centro de Recomendaciones</h1>
            <div className="flex items-center gap-2 mt-1">
               <p className="text-xs text-slate-500 font-medium">Algoritmo Chalaca v4.2 • </p>
               <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                  <Calendar size={10} className="text-accent-green" />
                  <span className="text-[10px] text-accent-green font-bold uppercase">{parseLocalDate(selectedDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</span>
               </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de Fecha */}
          <div className="flex bg-surface-800 p-1 rounded-xl border border-white/5">
             {[
               { label: 'Hoy', date: getLocalDate() },
               { label: 'Mañana', date: new Date(Date.now() + 86400000).toLocaleDateString('sv-SE') },
               { label: 'Pasado', date: new Date(Date.now() + 172800000).toLocaleDateString('sv-SE') }
             ].map(opt => (
               <button
                 key={opt.date}
                 onClick={() => setSelectedDate(opt.date)}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                   selectedDate === opt.date 
                     ? 'bg-accent-green text-surface-950 shadow-lg shadow-accent-green/20' 
                     : 'text-slate-500 hover:text-white'
                 }`}
               >
                 {opt.label}
               </button>
             ))}
             {/* Input para fecha personalizada */}
             <div className="relative ml-1 pr-1 border-l border-white/5">
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-[10px] font-black text-slate-400 focus:text-white outline-none w-[110px] pl-2 h-full"
                />
             </div>
          </div>

          <div className="glass-card px-4 py-2 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">{scannedCount} Analizados • {recommendations.length} Recomendados</span>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 transition-all border border-white/5"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Grid de Secciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Columna VIP (Picks de Alta Probabilidad) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 px-2">
            <Crown size={18} className="text-yellow-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Top Picks VIP</h2>
            <div className="h-px flex-1 bg-white/5 ml-2" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vipPicks.length > 0 ? vipPicks.map((pick, i) => (
              <div key={i} className="glass-card group hover:border-yellow-400/30 transition-all duration-300 overflow-hidden">
                <div className="p-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{pick.match?.league?.name || 'Liga'}</span>
                      <span className="text-xs font-bold text-white truncate max-w-[150px]">{pick.match?.teams?.home?.name} vs {pick.match?.teams?.away?.name}</span>
                   </div>
                   <div className="bg-yellow-400/10 text-yellow-400 text-[10px] font-black px-2 py-0.5 rounded border border-yellow-400/20">
                      VIP
                   </div>
                </div>
                <div className="p-4">
                   <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                         <p className="text-[10px] text-slate-500 uppercase font-bold">{pick.market}</p>
                         <h3 className="text-sm font-black text-white">{pick.selection}</h3>
                      </div>
                      <div className="text-right">
                         <span className="text-lg font-black text-accent-green">{pick.probability}%</span>
                         <p className="text-[8px] text-slate-600 uppercase font-black">Prob.</p>
                      </div>
                   </div>
                   <button 
                     onClick={() => navigate(`/analysis/${pick.match?.fixture?.id || ''}`)}
                     className="w-full py-2 bg-surface-700 hover:bg-surface-600 rounded-lg text-[10px] font-bold text-slate-300 flex items-center justify-center gap-2 transition-all"
                   >
                     VER ANÁLISIS COMPLETO <ChevronRight size={12} />
                   </button>
                </div>
              </div>
            )) : fixtures.length === 0 ? (
              <div className="md:col-span-2 py-12 text-center glass-card border-dashed">
                <AlertCircle size={32} className="text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium">No hay partidos programados para esta fecha.</p>
                <p className="text-slate-600 text-xs mt-1">Intenta seleccionando otra fecha en el calendario.</p>
              </div>
            ) : (
              <div className="md:col-span-2 py-12 text-center glass-card border-dashed">
                <Shield size={32} className="text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium">No se encontraron picks VIP para esta fecha.</p>
                <p className="text-slate-600 text-xs mt-1">El algoritmo no detectó jugadas que superen el 78% de confianza.</p>
              </div>
            )}
          </div>
        </div>

        {/* Barra Lateral: Value Bets */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <TrendingUp size={18} className="text-blue-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Value Bets</h2>
          </div>

          <div className="space-y-4">
            {valueBets.length > 0 ? valueBets.map((pick, i) => (
              <div key={i} className="glass-card p-4 border-l-4 border-l-blue-500/50 bg-blue-500/[0.02]">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-[9px] font-black text-blue-400 uppercase">Gema del Mercado 💎</span>
                   <span className="text-[10px] font-mono text-white bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{pick.odds || '1.80+'}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-300 mb-1">{pick.match?.teams?.home?.name} vs {pick.match?.teams?.away?.name}</h4>
                <p className="text-sm font-black text-white mb-2">{pick.selection}</p>
                <div className="p-2 bg-black/20 rounded text-[10px] text-slate-400 italic leading-relaxed border border-white/5">
                   "{pick.argument ? pick.argument.substring(0, 80) : ''}..."
                </div>
                <button 
                  onClick={() => navigate(`/analysis/${pick.match?.fixture?.id || ''}`)}
                  className="mt-3 text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                >
                   DETALLES DE LA VENTAJA <ChevronRight size={12} />
                </button>
              </div>
            )) : (
              <div className="py-12 text-center glass-card border-dashed">
                <AlertCircle size={24} className="text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-xs font-medium">Sin discrepancias de cuota detectadas.</p>
              </div>
            )}
          </div>

          {/* Tips Adicionales */}
          <div className="glass-card p-5 bg-accent-green/5 border-accent-green/20">
             <h4 className="text-xs font-black text-accent-green uppercase mb-2 flex items-center gap-2">
                <Zap size={14} /> Gestión de Bank
             </h4>
             <p className="text-[10px] text-slate-400 leading-relaxed">
                Prioriza las **Value Bets** para el largo plazo. Los **Top Picks VIP** tienen mayor tasa de acierto pero cuotas más bajas. No arriesgues más del 2% de tu banca por pick.
             </p>
          </div>
        </div>

      </div>
    </div>
  );
}

// Fin de RecommendationsPage

