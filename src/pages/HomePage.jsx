import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Shield, Trophy,
  Activity, Clock
} from 'lucide-react';
import Loader from '../components/Loader';
import {
  calculateFormScore, calculateOverUnder, analyzeH2H, analyzeGoalsByTimeSlot,
  calcMatchProbabilities, generatePicks,
} from '../services/analysisEngine';
import AccessibleMatchCard from '../components/AccessibleMatchCard';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function confidenceDots(prob) {
  const dots = prob >= 85 ? 3 : prob >= 72 ? 2 : 1;
  const color = prob >= 85 ? '#72BF01' : prob >= 72 ? '#f59e0b' : '#64748b';
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <span
          key={i}
          className="w-2.5 h-2.5 rounded-full transition-all"
          style={{ background: i < dots ? color : 'rgba(255,255,255,0.1)' }}
        />
      ))}
    </span>
  );
}

function tierLabel(tier, category) {
  if (tier === '🔥') return { text: 'Alta confianza', color: '#72BF01' };
  if (category === 'valor' || tier === '💎') return { text: 'Value Bet (Alto Valor)', color: '#3b9eff' };
  if (category === 'segura' || tier === '🟢') return { text: 'Banker (Segura)', color: '#10b981' };
  if (tier === '⭐') return { text: 'Buena opción', color: '#f59e0b' };
  if (tier === '🔵') return { text: 'Sugerida', color: '#3b9eff' };
  return { text: 'Sugerida', color: '#64748b' };
}

// ─── Top Pick Card ─────────────────────────────────────────────────────────
function TopPickCard({ pick, fixture, index }) {
  const { text: tierText, color: tierColor } = tierLabel(pick.tier, pick.category);
  const kickoff = fixture?.fixture?.date
    ? new Date(fixture.fixture.date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const isLive = ['1H', '2H', 'HT', 'ET'].includes(fixture?.fixture?.status?.short);

  return (
    <Link
      to={`/partido/${fixture?.fixture?.id}`}
      className="group relative block overflow-hidden rounded-3xl bg-surface-900/40 hover:bg-surface-900/60 border border-white/5 hover:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
    >

      {/* Live indicator */}
      {isLive && (
        <div className="absolute top-6 right-6 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-red-400">
            {fixture?.fixture?.status?.elapsed ? `En Vivo • ${fixture.fixture.status.elapsed}'` : 'En Vivo'}
          </span>
        </div>
      )}

      <div className="p-8 pt-10">
        {/* Match */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{fixture?.league?.name}</span>
            {!isLive && (
              <span className="text-[11px] font-black text-slate-200 bg-white/10 px-2.5 py-1 rounded-md border border-white/10 flex items-center shadow-sm">
                <Clock size={11} className="mr-1.5 text-slate-400" />{kickoff}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {fixture?.teams?.home?.logo && (
                <img src={fixture.teams.home.logo} alt="" className="w-6 h-6 object-contain" />
              )}
              <span className="text-sm font-semibold text-slate-200">{fixture?.teams?.home?.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {fixture?.teams?.away?.logo && (
                <img src={fixture.teams.away.logo} alt="" className="w-6 h-6 object-contain" />
              )}
              <span className="text-sm font-semibold text-slate-200">{fixture?.teams?.away?.name}</span>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="h-px bg-white/5 mb-5" />

        {/* Prediction - SENIOR FRIENDLY */}
        <div className="space-y-4">
          <div className="flex-1">
             <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: tierColor }}>{tierText}</p>
             <p className="text-lg md:text-xl font-bold text-white leading-tight">{pick.selection}</p>
             {pick.market && (
               <p className="text-xs font-semibold text-slate-400 mt-1.5 bg-white/5 inline-block px-2.5 py-1 rounded-lg">{pick.market}</p>
             )}
          </div>
          
          <div className="flex items-center justify-between bg-black/40 rounded-2xl p-4 border border-white/5 mt-4">
             <div className="flex flex-col">
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Cuota</p>
               <p className="text-4xl font-bold tracking-tight" style={{ color: '#BFF102' }}>
                 {pick.odds ? Number(pick.odds).toFixed(2) : '—'}
               </p>
             </div>
             
             <div className="flex flex-col items-end">
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Confianza</p>
               <p className="text-2xl font-bold tracking-tight" style={{ color: pick.probability >= 85 ? '#72BF01' : pick.probability >= 72 ? '#f59e0b' : '#64748b' }}>
                 {pick.probability}%
               </p>
             </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Stats Bar ──────────────────────────────────────────────────────────────
function StatBadge({ label, value, color }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-4 rounded-xl border border-white/5 bg-white/[0.02]">
      <span className="text-2xl font-black font-mono" style={{ color }}>{value}</span>
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function HomePage() {
  const [topPicks, setTopPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState({
    leagues: [
      { name: "LaLiga (España)", total: 10, wins: 8, losses: 2 },
      { name: "Liga 1 (Perú)", total: 15, wins: 12, losses: 3 },
      { name: "Premier League", total: 12, wins: 10, losses: 2 },
    ]
  });
  const [totalToday, setTotalToday] = useState(14);
  const [liveMatches, setLiveMatches] = useState([]);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0); // 0 = hoy, 1 = mañana

  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + selectedDayOffset);
    return localDay(d);
  }, [selectedDayOffset]);

  // Load top picks of the day
  const loadTopPicks = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get today's fixtures
      const fixturesRes = await fetch(`${BACKEND}/api/fixtures/date/${targetDate}`);
      if (!fixturesRes.ok) throw new Error();
      const { data: fixtures } = await fixturesRes.json();
      if (!fixtures?.length) { setLoading(false); return; }

      setTotalToday(fixtures.length);

      // 2. Extract live matches for fallback
      const live = fixtures.filter(f => ['1H', '2H', 'HT', 'ET'].includes(f.fixture?.status?.short));
      setLiveMatches(live);

      // 3. Pick upcoming/live matches only (max 40 for analysis)
      const candidates = fixtures
        .filter(f => !['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short))
        .slice(0, 40);

      if (!candidates.length) { setLoading(false); return; }

      // 3. Batch analysis
      const batchRes = await fetch(`${BACKEND}/api/analysis/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: candidates.map(f => f.fixture.id) }),
      });

      let batchData = {};
      if (batchRes.ok) {
        const { data } = await batchRes.json();
        batchData = data || {};
      }

      // 4. Run engine on each and collect best picks
      const allTopPicks = [];

      for (const fixture of candidates) {
        const fid = fixture.fixture.id;
        const ad = batchData[fid];
        if (!ad) continue;

        const homeId = fixture.teams?.home?.id;
        const awayId = fixture.teams?.away?.id;
        if (!homeId || !awayId) continue;

        const hm = ad.homeMatches || [];
        const am = ad.awayMatches || [];

        const homeForm = calculateFormScore(hm, homeId);
        const awayForm = calculateFormScore(am, awayId);
        const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
        const awayFormAway = calculateFormScore(am, awayId, 'away');
        const homeSplit = calculateOverUnder(hm, homeId);
        const awaySplit = calculateOverUnder(am, awayId);
        const h2hData = analyzeH2H(ad.h2h || [], homeId, awayId);

        const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
        const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
        const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
        const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
        const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA, fixture.league?.name || '');

        const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
        const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);

        const calcRest = (matches) => {
          if (!matches?.length) return null;
          const lastDate = matches[0]?.fixture?.date;
          if (!lastDate) return null;
          return Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000);
        };

        const picksRes = generatePicks({
          homeStats: null, awayStats: null,
          h2hData, homeForm, awayForm,
          homeSplitStats: homeSplit, awaySplitStats: awaySplit,
          isLive: ['1H', '2H', 'HT', 'ET', 'P'].includes(fixture.fixture?.status?.short),
          liveClock: fixture.fixture?.status?.elapsed ? String(fixture.fixture.status.elapsed) + "'" : "0'",
          liveHomeGoals: parseInt(fixture.goals?.home ?? 0),
          liveAwayGoals: parseInt(fixture.goals?.away ?? 0),
          marketInsight: ad.marketInsight,
          homeCornersData: ad.homeCornersData,
          awayCornersData: ad.awayCornersData,
          homeCardsData: ad.homeCardsData,
          awayCardsData: ad.awayCardsData,
          homeSlots, awaySlots,
          homeFormAtHome, awayFormAway,
          poissonProbs: poisson,
          injuries: ad.injuries,
          homeTeamName: fixture.teams.home.name,
          awayTeamName: fixture.teams.away.name,
          leagueName: fixture.league?.name || '',
          homeRestDays: calcRest(hm),
          awayRestDays: calcRest(am),
          homeHistory: hm,
          awayHistory: am,
          city: fixture.city,
          marketOdds: ad.marketOdds,
          matchStandings: ad.matchStandings,
          advancedStats: ad.advancedStats,
          refereeStats: ad.refereeStats,
        });

        // Seleccionar la mejor apuesta del partido
        const sortedMatchPicks = [...(picksRes?.picks || [])].sort((a, b) => {
          const aIsValue = a.category === 'valor' || a.tier === '💎';
          const bIsValue = b.category === 'valor' || b.tier === '💎';
          if (aIsValue && !bIsValue) return -1;
          if (!aIsValue && bIsValue) return 1;
          
          // Ordenar por valor combinado de cuota * probabilidad
          const scoreA = (parseFloat(a.odds) || 0) * (a.probability || 0);
          const scoreB = (parseFloat(b.odds) || 0) * (b.probability || 0);
          return scoreB - scoreA;
        });

        const bestPick = sortedMatchPicks[0];
        if (bestPick) {
          allTopPicks.push({ pick: bestPick, fixture });
        }
      }

      // 5. Ordenar todas las tarjetas: Value bets primero, luego por combinación de cuota y probabilidad
      allTopPicks.sort((a, b) => {
        const aIsValue = a.pick.category === 'valor' || a.pick.tier === '💎';
        const bIsValue = b.pick.category === 'valor' || b.pick.tier === '💎';
        
        if (aIsValue && !bIsValue) return -1;
        if (!aIsValue && bIsValue) return 1;
        
        // Ordenamos por valor combinado (cuota * probabilidad)
        const scoreA = (parseFloat(a.pick.odds) || 0) * (a.pick.probability || 0);
        const scoreB = (parseFloat(b.pick.odds) || 0) * (b.pick.probability || 0);
        return scoreB - scoreA;
      });
      
      setTopPicks(allTopPicks);

    } catch (e) {
      console.error('[HomePage] Error loading top picks:', e);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  // Load stats summary
  useEffect(() => {
    loadTopPicks();

    fetch(`${BACKEND}/api/stats/leagues?date=${targetDate}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.success && json.data) setStatsData(json.data);
      })
      .catch(() => {});
  }, [loadTopPicks, targetDate]);

  const overallWinRate = statsData?.leagues
    ? (() => {
        const totalWins = statsData.leagues.reduce((a, l) => a + (l.wins || 0), 0);
        const totalResolved = statsData.leagues.reduce((a, l) => a + (l.wins || 0) + (l.losses || 0), 0);
        return totalResolved > 0 ? Math.round((totalWins / totalResolved) * 100) : null;
      })()
    : null;

  return (
    <div className="animate-in pb-20">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="relative pt-6 pb-6 mb-4">
        {/* Ambient glow under hero */}
        <div className="absolute inset-x-0 top-0 h-48 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(114,191,1,0.06) 0%, transparent 70%)' }} />

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none mb-6">
            <span className="text-white">Mejores</span>{' '}
            <span style={{ color: '#BFF102' }}>Apuestas</span>{' '}
            <span className="text-white">de {selectedDayOffset === 0 ? 'Hoy' : 'Mañana'}</span>
          </h1>

          <p className="text-base md:text-lg text-slate-200 font-bold max-w-3xl mx-auto leading-relaxed mb-10 drop-shadow-sm">
            ¡No adivines más! Descubre las apuestas más seguras y rentables del día,<br className="hidden md:block" /> calculadas automáticamente para que ganes más dinero con menos esfuerzo.
          </p>

          <div className="flex flex-col items-center gap-5">
            {/* Day Toggle */}
            <div className="inline-flex bg-white/5 rounded-full p-1.5 border border-white/10 shadow-sm">
              <button 
                onClick={() => setSelectedDayOffset(0)}
                className={`px-8 py-2.5 rounded-full text-[13px] font-black uppercase tracking-widest transition-all ${selectedDayOffset === 0 ? 'bg-white text-black shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                Hoy
              </button>
              <button 
                onClick={() => setSelectedDayOffset(1)}
                className={`px-8 py-2.5 rounded-full text-[13px] font-black uppercase tracking-widest transition-all ${selectedDayOffset === 1 ? 'bg-white text-black shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                Mañana
              </button>
            </div>

            {/* Unified Info Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5">
                <span className={`w-1.5 h-1.5 rounded-full ${selectedDayOffset === 0 ? 'bg-accent-green animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                  {(() => {
                    const d = new Date();
                    d.setDate(d.getDate() + selectedDayOffset);
                    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
                  })()}
                </span>
              </div>
              
              {totalToday > 0 && (
                <span className="text-[13px] font-bold text-slate-300 bg-white/10 px-4 py-1.5 rounded-full border border-white/10 shadow-sm">
                  {totalToday} Partidos
                </span>
              )}

              {topPicks.length > 0 && (
                <span className="text-[10px] font-black uppercase tracking-widest text-[#BFF102] bg-[#BFF102]/10 px-4 py-1.5 rounded-full border border-[#BFF102]/20">
                  {topPicks.length} Apuestas Seguras
                </span>
              )}

              {overallWinRate !== null && (
                <span className="text-[10px] font-black uppercase tracking-widest text-[#72BF01] bg-[#72BF01]/10 px-4 py-1.5 rounded-full border border-[#72BF01]/20">
                  {overallWinRate}% Efectividad
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TOP PICKS GRID OR LIVE FALLBACK ── */}
      <div className="mb-16">
        {loading ? (
          <div className="py-20">
            <Loader text="Calculando mejores apuestas del día…" />
          </div>
        ) : topPicks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {topPicks.map(({ pick, fixture }, i) => (
              <TopPickCard key={fixture.fixture.id} pick={pick} fixture={fixture} index={i} />
            ))}
          </div>
        ) : liveMatches.length > 0 ? (
          <div>
            <div className="-mt-16 py-6 text-center border border-white/10 bg-white/5 rounded-3xl shadow-lg">
              <Trophy size={32} strokeWidth={1.5} className="mx-auto mb-3 text-slate-400" />
              <p className="text-white font-bold uppercase tracking-widest text-sm mb-1">
                No hay apuestas disponibles aún
              </p>
              <p className="text-slate-300 text-xs max-w-md mx-auto leading-relaxed">
                No se encontraron apuestas de alta probabilidad. Las apuestas se generan a medida que hay partidos programados con datos suficientes.
              </p>
            </div>

            <div className="mt-48 space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-5xl md:text-6xl font-black tracking-tight leading-none mb-3 flex flex-wrap items-center justify-center gap-3">
                  {selectedDayOffset === 0 && <span className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-red-500 animate-pulse" />}
                  <span className="text-white">Partidos</span>
                  <span style={{ color: selectedDayOffset === 0 ? '#ef4444' : '#3b82f6' }}>{selectedDayOffset === 0 ? 'en Vivo' : 'Programados'}</span>
                </h2>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Del día de {selectedDayOffset === 0 ? 'hoy' : 'mañana'}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {liveMatches.map(f => (
                  <AccessibleMatchCard key={f.fixture?.id} fixture={f} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 -mt-16">
            {/* Message */}
            <div className="text-center mb-14">
              <Trophy size={32} strokeWidth={1.5} className="mx-auto mb-4 text-slate-500" />
              <p className="text-slate-300 font-semibold text-sm mb-1">
                No hay apuestas disponibles en este momento
              </p>
              <p className="text-slate-500 text-xs max-w-sm mx-auto leading-relaxed">
                Nuestro motor no detectó ventajas claras ahora mismo, pero hay mucho más por descubrir.
              </p>
            </div>

          </div>
        )}
      </div>

      {/* ── CTA → /partidos ──────────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden border border-white/8 p-10 text-center mb-12"
        style={{ background: 'linear-gradient(135deg, rgba(114,191,1,0.06) 0%, rgba(10,15,20,0.95) 60%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(114,191,1,0.05) 0%, transparent 60%)' }} />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
            <Activity size={12} className="text-accent-green" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Todos los partidos</span>
          </div>
          <h2 className="text-2xl font-black text-white mb-3">¿Quieres ver más partidos?</h2>
          <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto">
            Accede a todos los partidos del día con filtros por liga, estado y fecha.
          </p>
          <Link
            to="/partidos"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-black uppercase tracking-wider text-sm shadow-lg transition-all duration-300 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #72BF01, #3A7817)', color: '#000' }}
          >
            <Shield size={16} />
            Ver Todos los Partidos
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {/* ── Navigation Cards (Fallback only) ─────────────────────────────── */}
      {!loading && topPicks.length === 0 && liveMatches.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl mx-auto">
          {/* Results */}
          <Link
            to="/resultados"
            className="group rounded-2xl border-[3px] border-transparent bg-black/40 hover:bg-black/20 hover:border-white/30 transition-all duration-300 p-6"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(114,191,1,0.1)' }}>
              <Activity size={20} className="text-accent-green" />
            </div>
            <h3 className="text-base font-bold text-white mb-2 group-hover:text-accent-green transition-colors">
              ¿Cómo nos fue ayer?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Revisa nuestros aciertos recientes y comprueba la precisión del motor. Transparencia total, sin ocultar ningún resultado.
            </p>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors" style={{ color: '#BFF102' }}>
              <span>Ver resultados</span>
              <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* My Bets */}
          <Link
            to="/mis-apuestas"
            className="group rounded-2xl border-[3px] border-transparent bg-black/40 hover:bg-black/20 hover:border-white/30 transition-all duration-300 p-6"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(114,191,1,0.1)' }}>
              <Shield size={20} className="text-accent-green" />
            </div>
            <h3 className="text-base font-bold text-white mb-2 group-hover:text-accent-green transition-colors">
              Tus apuestas guardadas
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Haz seguimiento de las apuestas que seleccionaste. Mide tu rendimiento y aprende de cada jugada.
            </p>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors" style={{ color: '#BFF102' }}>
              <span>Ver mis apuestas</span>
              <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
