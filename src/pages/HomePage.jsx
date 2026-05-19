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
      className="group relative block overflow-hidden rounded-2xl border border-transparent bg-black/60 hover:bg-black/40 hover:border-transparent transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      style={index === 0 ? { borderColor: 'rgba(114,191,1,0.25)', background: 'rgba(10,20,5,0.85)' } : {}}
    >
      {/* Index badge */}
      <div className="absolute top-4 left-4 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
        style={{ background: index === 0 ? 'rgba(114,191,1,0.2)' : 'rgba(255,255,255,0.05)', color: index === 0 ? '#BFF102' : '#475569' }}>
        {index + 1}
      </div>

      {/* Live indicator */}
      {isLive && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-red-400">En Vivo</span>
        </div>
      )}

      <div className="p-6 pt-8">
        {/* Match */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{fixture?.league?.name}</span>
            {!isLive && (
              <span className="text-[10px] font-bold text-slate-600 bg-white/5 px-2 py-0.5 rounded">
                <Clock size={9} className="inline mr-1" />{kickoff}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {fixture?.teams?.home?.logo && (
                <img src={fixture.teams.home.logo} alt="" className="w-7 h-7 object-contain" />
              )}
              <span className="text-base font-bold text-slate-100">{fixture?.teams?.home?.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {fixture?.teams?.away?.logo && (
                <img src={fixture.teams.away.logo} alt="" className="w-7 h-7 object-contain" />
              )}
              <span className="text-base font-bold text-slate-100">{fixture?.teams?.away?.name}</span>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="h-px bg-white/5 mb-5" />

        {/* Prediction */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: tierColor }}>{tierText}</p>
              <p className="text-sm font-bold text-white leading-snug">{pick.selection}</p>
              {pick.market && (
                <p className="text-[10px] text-slate-500 mt-1 font-medium">{pick.market}</p>
              )}
            </div>
            {pick.odds && !isNaN(Number(pick.odds)) && (
              <div className="text-right shrink-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">Cuota</p>
                <p className="text-xl font-black font-mono" style={{ color: '#BFF102' }}>{Number(pick.odds).toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* Confidence */}
          <div className="flex items-center justify-between">
            {confidenceDots(pick.probability)}
            <span className="text-[11px] font-black font-mono" style={{ color: pick.probability >= 85 ? '#72BF01' : pick.probability >= 72 ? '#f59e0b' : '#64748b' }}>
              {pick.probability}%
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-5 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-300 transition-colors">
          <span>Ver detalles</span>
          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
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

      // 3. Pick upcoming/live matches only (max 15 for analysis)
      const candidates = fixtures
        .filter(f => !['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short))
        .slice(0, 15);

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
          isLive: false, liveClock: "0'", liveHomeGoals: 0, liveAwayGoals: 0,
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

        const bestPick = picksRes?.picks?.find(p => p.tier === '🔥' || p.category === 'valor' || p.category === 'segura') || picksRes?.picks?.[0];
        if (bestPick && (bestPick.probability >= 70 || bestPick.category === 'valor' || bestPick.category === 'segura')) {
          allTopPicks.push({ pick: bestPick, fixture });
        }
      }

      // 5. Sort by probability and take top 5
      allTopPicks.sort((a, b) => b.pick.probability - a.pick.probability);
      setTopPicks(allTopPicks.slice(0, 5));

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
          <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none mb-3">
            <span className="text-white">Mejores</span>{' '}
            <span style={{ color: '#BFF102' }}>Picks</span>{' '}
            <span className="text-white">de {selectedDayOffset === 0 ? 'Hoy' : 'Mañana'}</span>
          </h1>

          <p className="text-slate-400 text-sm md:text-base font-medium max-w-xl mx-auto leading-relaxed mb-6">
            El motor de análisis de Tio Chalaca procesa miles de estadísticas para darte los pronósticos más seguros del día.
          </p>

          <div className="flex flex-col items-center gap-3">
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
                  {topPicks.length} Picks Seguros
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
            <Loader text="Calculando mejores picks del día…" />
          </div>
        ) : topPicks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {topPicks.map(({ pick, fixture }, i) => (
              <TopPickCard key={fixture.fixture.id} pick={pick} fixture={fixture} index={i} />
            ))}
          </div>
        ) : liveMatches.length > 0 ? (
          <div>
            <div className="-mt-16 py-6 text-center border border-white/10 bg-white/5 rounded-3xl shadow-lg">
              <Trophy size={32} strokeWidth={1.5} className="mx-auto mb-3 text-slate-400" />
              <p className="text-white font-bold uppercase tracking-widest text-sm mb-1">
                No hay picks disponibles aún
              </p>
              <p className="text-slate-300 text-xs max-w-md mx-auto leading-relaxed">
                No se encontraron picks de alta probabilidad. Los picks se generan a medida que hay partidos programados con datos suficientes.
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
                No hay picks disponibles en este momento
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
              Tus picks guardados
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Haz seguimiento de las apuestas que seleccionaste. Mide tu rendimiento y aprende de cada jugada.
            </p>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors" style={{ color: '#BFF102' }}>
              <span>Ver mis picks</span>
              <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
