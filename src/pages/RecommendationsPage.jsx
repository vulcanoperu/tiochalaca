import React, { useState, useEffect, useMemo } from 'react';
import { Star, TrendingUp, Shield, AlertCircle, RefreshCw, ChevronRight, Target, Zap, LayoutDashboard, Calendar, Crown, Clock } from 'lucide-react';
import { getTodayFixturesFromBackend, getMatchAnalysisFromBackend, getMatchAnalysisBatchFromBackend, saveValueBet, getTodayValueBets } from '../services/backendApi';
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

// Orden de prioridad de ligas para analizar las más importantes primero.
// Menor número = mayor prioridad (se analizan antes).
const LEAGUE_PRIORITY = {
  'uefa.champions': 1, 'uefa.europa': 2, 'uefa.europa.conf': 3,
  'eng.1': 4, 'esp.1': 5, 'ger.1': 6, 'ita.1': 7, 'fra.1': 8,
  'conmebol.libertadores': 9, 'conmebol.sudamericana': 10,
  'arg.1': 11, 'bra.1': 12, 'por.1': 13, 'ned.1': 14,
  'col.1': 15, 'chi.1': 16, 'mex.1': 17, 'usa.1': 18, 'ksa.1': 19,
  'per.1': 20, 'ecu.1': 21, 'ven.1': 22, 'par.1': 23, 'uru.1': 24,
};

const getLeaguePriority = (fixture) => {
  const id = String(fixture.league?.id || '').toLowerCase();
  for (const [slug, prio] of Object.entries(LEAGUE_PRIORITY)) {
    if (id === slug || id.includes(slug)) return prio;
  }
  return 99;
};

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
  const [selectedMarket, setSelectedMarket] = useState('all');
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [activeTab, setActiveTab] = useState('vip');
  // Value Bets persistidas en BD (se cargan al montar y se actualizan al descubrir nuevas)
  const [savedValueBets, setSavedValueBets] = useState([]);
  const navigate = useNavigate();

  // Cargar Value Bets guardadas para la fecha seleccionada
  useEffect(() => {
    getTodayValueBets(selectedDate).then(res => {
      if (res.success) setSavedValueBets(res.data);
    });
  }, [selectedDate]);

  useEffect(() => {
    let isActive = true;
    async function loadData() {
      setLoading(true);
      setRecommendations([]); 
      setScannedCount(0);
      const res = await getTodayFixturesFromBackend(selectedDate);
      if (!isActive) return;

      if (res.ok && res.data) {
        const matchesData = Array.isArray(res.data) ? res.data : [];
        const isToday = selectedDate === getLocalDate();
        
        const filtered = matchesData.filter(m => {
          const leagueId = m.league?.id ? String(m.league.id).toLowerCase() : '';
          const isAllowed = ALLOWED_LEAGUES.some(slug => leagueId === slug || leagueId.includes(slug));
          if (isToday) {
            return isAllowed && !['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO'].includes(m.fixture?.status?.short);
          }
          return isAllowed;
        });

        setFixtures(filtered);
        if (filtered.length > 0) {
          // Ordenar por prioridad de liga antes de analizar
          const sorted = [...filtered].sort(
            (a, b) => getLeaguePriority(a) - getLeaguePriority(b)
          );
          analyzeMatches(sorted, () => isActive);
        } else {
           setLoading(false);
        }
      } else {
        setLoading(false);
      }
    }
    loadData();
    return () => { isActive = false; };
  }, [selectedDate]);

  async function analyzeMatches(matches, isActiveCheck) {
    setAnalyzingCount(0);
    setScannedCount(0);
    setRecommendations([]);

    // Tomamos los 40 mejores (ya vienen ordenados por prioridad)
    const limited = matches.slice(0, 40);
    const totalToAnalyze = limited.length;

    // Helper para procesar los datos de un partido
    const processMatchData = (match, ad) => {
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
          (p.probability && p.probability >= 70)
        );
        if (topPicks.length > 0) return { match, picks: topPicks, projectedGoals: result.projectedGoals };
      }
      return null;
    };

    let index = 0;
    let finishedCount = 0;
    let validCount = 0;

    const worker = async () => {
      while (index < totalToAnalyze) {
        if (!isActiveCheck()) return;
        const currentIdx = index++;
        const match = limited[currentIdx];
        
        try {
          const res = await getMatchAnalysisFromBackend(match.fixture?.id);
          if (!isActiveCheck()) return;
          
          if (res.ok && res.data) {
            validCount++;
            const rec = processMatchData(match, res.data);
            if (rec && isActiveCheck()) {
              setRecommendations(prev => [...prev, rec]);
              // Guardar en BD cada Value Bet en el momento exacto de su descubrimiento
              rec.picks.forEach(pick => {
                if (pick.argument && pick.argument.toLowerCase().includes('value bet')) {
                  saveValueBet({
                    fixture_id:        match.fixture?.id,
                    home_team:         match.teams?.home?.name,
                    away_team:         match.teams?.away?.name,
                    league:            match.league?.name,
                    market:            pick.market,
                    selection:         pick.selection,
                    probability:       pick.probability,
                    odds_at_detection: parseFloat(pick.odds) || null,
                    argument:          pick.argument,
                    match_date:        selectedDate,
                  }).then(saved => {
                    // Si es nueva, recargar la lista de descubrimientos del día
                    if (saved.isNew) {
                      getTodayValueBets(selectedDate).then(r => {
                        if (r.success) setSavedValueBets(r.data);
                      });
                    }
                  });
                }
              });
            }
          }
        } catch (err) {
          console.error("Error analizando match:", match.fixture?.id, err);
        } finally {
          if (isActiveCheck()) {
            finishedCount++;
            setAnalyzingCount(finishedCount);
            setScannedCount(validCount);
          }
        }
      }
    };

    // Ejecución paralela con 8 workers (para balancear carga y actualizaciones rápidas)
    const workers = Array(8).fill(null).map(() => worker());
    await Promise.all(workers);
    
    if (isActiveCheck()) {
      setScannedCount(validCount);
      setLoading(false);
    }
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

  // Extract unique markets and leagues for filters
  const availableMarkets = useMemo(() => {
    const m = new Set();
    vipPicks.forEach(p => p.market && m.add(p.market));
    return Array.from(m).sort();
  }, [vipPicks]);

  const availableLeagues = useMemo(() => {
    const l = new Set();
    vipPicks.forEach(p => p.match?.league?.name && l.add(p.match.league.name));
    return Array.from(l).sort();
  }, [vipPicks]);

  const filteredVipPicks = useMemo(() => {
    return vipPicks.filter(p => {
      const matchMarket = selectedMarket === 'all' || p.market === selectedMarket;
      const matchLeague = selectedLeague === 'all' || (p.match?.league?.name === selectedLeague);
      return matchMarket && matchLeague;
    });
  }, [vipPicks, selectedMarket, selectedLeague]);

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
          {/* Selector de Fecha Mejorado */}
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
             {/* Input para fecha personalizada */}
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
          className={`pb-4 text-[13px] font-black uppercase tracking-widest border-b-2 transition-all duration-300 flex items-center gap-2 ${
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
        
        {/* PESTAÑA 1: APUESTAS VIP (Antiguas Value Bets) */}
        {activeTab === 'vip' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
                  <TrendingUp size={16} className="text-accent-green" />
                </div>
                <h2 className="text-base font-black text-white uppercase tracking-widest drop-shadow-md">Apuestas VIP (Cuotas Despistadas)</h2>
              </div>
            </div>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {valueBets.length > 0 ? valueBets.map((pick, i) => {
                // Buscar si esta pick fue guardada en BD para mostrar el timestamp
                const saved = savedValueBets.find(
                  s => String(s.fixture_id) === String(pick.match?.fixture?.id) && s.selection === pick.selection
                );
                const detectedAt = saved?.detected_at
                  ? new Date(saved.detected_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })
                  : null;
                return (
                <div key={i} className="group relative bg-surface-800 rounded-xl border border-white/5 border-l-4 border-l-accent-green p-5 hover:bg-surface-800/80 transition-all duration-300 overflow-hidden hover:shadow-[0_0_20px_rgba(191,241,2,0.05)] flex flex-col justify-between">
                  {/* Decoración */}
                  <div className="absolute -right-6 -top-6 text-accent-green/5 group-hover:text-accent-green/10 transition-colors transform rotate-12 pointer-events-none">
                    <TrendingUp size={100} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 relative z-10">
                       <div className="flex items-center gap-1.5">
                         <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                         <span className="text-[9px] font-black text-accent-green uppercase tracking-widest">Cuota Despistada</span>
                       </div>
                       <span className="text-[11px] font-black text-surface-900 bg-accent-green px-2 py-0.5 rounded-md shadow-sm">Cuota {pick.odds || '1.80+'}</span>
                    </div>

                    {/* Timestamp de detección */}
                    {detectedAt && (
                      <div className="flex items-center gap-1.5 mb-3 relative z-10">
                        <Clock size={10} className="text-slate-500" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                          Detectada hoy a las {detectedAt}
                        </span>
                      </div>
                    )}
                    
                    <div className="relative z-10 mb-4">
                      <h4 className="text-[11px] font-bold text-slate-400 mb-1 leading-tight">{pick.match?.teams?.home?.name} vs {pick.match?.teams?.away?.name}</h4>
                      <p className="text-lg font-black text-white mb-3">{pick.selection}</p>
                      
                      <div className="p-3 bg-surface-900/50 rounded-lg text-[10px] text-slate-400 italic leading-relaxed border border-white/5 border-l-2 border-l-slate-600">
                         "{pick.argument ? pick.argument.substring(0, 100) : ''}..."
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative z-10 mt-auto">
                    <button 
                      onClick={() => navigate(`/analysis/${pick.match?.fixture?.id || ''}`)}
                      className="w-full text-[10px] font-black text-white hover:text-surface-900 bg-surface-700 hover:bg-accent-green py-2.5 rounded-lg uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300"
                    >
                       VER ANÁLISIS DETALLADO <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
                );
              }) : (
                <div className="col-span-1 md:col-span-2 lg:col-span-3 py-16 text-center bg-surface-800/50 rounded-2xl border border-dashed border-white/10">
                  <AlertCircle size={32} className="text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Sin apuestas VIP disponibles</p>
                  <p className="text-slate-500 text-xs mt-2">No se han detectado cuotas con valor extraordinario en el mercado actual.</p>
                  
                  {/* Historial del día si el algoritmo encontró antes pero la cuota ya bajó */}
                  {savedValueBets.length > 0 && (
                    <div className="mt-8 text-left space-y-3 px-4 max-w-lg mx-auto">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest text-center mb-4">— Detectadas antes (cuota ya ajustada por el mercado) —</p>
                      {savedValueBets.map((s, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-2 p-3 bg-surface-900/30 rounded-lg border border-white/5 hover:bg-surface-800 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-400 truncate">{s.home_team} vs {s.away_team}</p>
                            <p className="text-sm font-black text-white mt-0.5">{s.selection}</p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-[11px] font-black text-accent-green bg-accent-green/10 px-2 py-0.5 rounded">{s.odds_at_detection ? `@${parseFloat(s.odds_at_detection).toFixed(2)}` : ''}</p>
                            <div className="flex items-center justify-end gap-1 mt-1.5">
                              <Clock size={10} className="text-slate-500" />
                              <p className="text-[9px] font-bold text-slate-500">{new Date(s.detected_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Tips Adicionales Premium */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-green/10 to-transparent border border-accent-green/20 p-6 mt-8">
               <div className="absolute -right-4 -bottom-4 text-accent-green/10 pointer-events-none">
                 <Shield size={80} />
               </div>
               <div className="relative z-10 flex items-start gap-4">
                 <div className="mt-1">
                   <Target size={24} className="text-accent-green" />
                 </div>
                 <div>
                   <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1">¿Qué son las Apuestas VIP?</h3>
                   <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                     Son oportunidades donde nuestro algoritmo detecta que la casa de apuestas ha cometido un error y la cuota pagada es significativamente mayor a la probabilidad real del evento. Son volátiles y pueden desaparecer rápido.
                   </p>
                 </div>
               </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: APUESTAS DE ALTO VALOR (Antiguas VIP Picks) */}
        {activeTab === 'alto-valor' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-yellow-400/10 flex items-center justify-center border border-yellow-400/20">
                  <Crown size={16} className="text-yellow-400" />
                </div>
                <h2 className="text-base font-black text-white uppercase tracking-widest drop-shadow-md">Apuestas de Alto Valor</h2>
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
                  {/* Glow effect */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full blur-[50px] pointer-events-none group-hover:bg-yellow-400/20 transition-colors" />
                  
                  {/* Card Header */}
                  <div className="p-4 bg-gradient-to-b from-white/[0.03] to-transparent border-b border-white/5 flex items-start justify-between relative z-10">
                     <div className="flex flex-col gap-1 w-full pr-4">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{pick.match?.league?.name || 'Liga Desconocida'}</span>
                        </div>
                        <span className="text-sm font-bold text-white leading-tight">{pick.match?.teams?.home?.name} <span className="text-slate-500 font-normal mx-1">vs</span> {pick.match?.teams?.away?.name}</span>
                     </div>
                     <div className="flex-shrink-0 bg-gradient-to-br from-yellow-400 to-amber-600 text-surface-900 text-[9px] font-black px-2.5 py-1 rounded-md shadow-md uppercase tracking-wider">
                        ALTO VALOR
                     </div>
                  </div>

                  {/* Card Body */}
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
              )) : fixtures.length === 0 ? (
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
        )}

      </div>
    </div>
  );
}

// Fin de RecommendationsPage

