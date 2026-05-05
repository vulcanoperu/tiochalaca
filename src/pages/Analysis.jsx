import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, AlertCircle, CheckCircle2,
  Shield, Target, Clock, BarChart2, Users, Zap, Activity,
  TrendingUp, AlertTriangle
} from 'lucide-react';
import Loader from '../components/Loader';
import {
  FormPills, StatRow, ProbCircle, GoalTimeline, H2HTable, PicksTable, RecentMatchesList
} from '../components/AnalysisComponents';
import { useApp } from '../context/AppContext';
import {
  getTeamLastMatches, getH2H, getTeamStatistics,
  getFixtureStatistics, getFixtureEvents, getFixtures,
  getOfficialPrediction, getInjuries,
  TOP_LEAGUES,
} from '../services/footballApi';
import { getTeamFormFromBackend, getTeamXGFromBackend, getTeamInjuriesFromBackend, getH2HFromBackend, saveDbPick, getAuthHeaders } from '../services/backendApi';
import {
  calculateFormScore, calculateOverUnder, analyzeGoalsByTimeSlot,
  analyzeH2H, generatePicks, calcMatchProbabilities, analyzeCards
} from '../services/analysisEngine';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const SECTION = ({ icon: Icon, title, children, id }) => (
  <section id={id} className="glass-card p-5 animate-slide-up">
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.2)' }}>
        <Icon size={14} className="text-accent-green" />
      </div>
      <h2 className="text-sm font-bold text-white">{title}</h2>
    </div>
    {children}
  </section>
);

export default function Analysis() {
  const { id: fixtureId } = useParams();
  const navigate = useNavigate();
  const { apiKey, picks: savedPicks, setPicks: setSavedPicks } = useApp();

  const [fixture, setFixture]       = useState(null);
  const [homeMatches, setHomeMatches] = useState([]);
  const [awayMatches, setAwayMatches] = useState([]);
  const [h2hMatches, setH2HMatches]   = useState([]);
  const [homeStats, setHomeStats]     = useState(null);
  const [awayStats, setAwayStats]     = useState(null);
  const [prediction, setPrediction]   = useState(null);
  const [injuries, setInjuries]       = useState([]);
  const [events, setEvents]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [analysis, setAnalysis]       = useState(null);
  const [picksResult, setPicksResult] = useState(null);
  const [pickSaved, setPickSaved]     = useState(false);



  // ── Live clock (simple & bulletproof) ──────────────────────────────────
  // baseRef holds the ESPN-seeded baseline; timerRef holds the interval
  // tick is just a counter to force re-renders every second
  const baseRef   = useRef(null);  // { serverSec: N, startedAt: Date.now() }
  const timerRef  = useRef(null);
  const [isLiveMatch, setIsLiveMatch] = useState(false);
  const [tick, setTick]               = useState(0);
  const pollRef   = useRef(null);

  // ── Helper: parse ESPN status object → fixture status fields ─────────
  const parseLiveStatus = useCallback((statusObj, state) => {
    const rawDisplay  = statusObj?.displayClock || '0:00';
    const period      = statusObj?.period ?? 1;
    const description = statusObj?.type?.description || '';
    const descLower   = description.toLowerCase();
    // Only exact halftime — NOT '2nd half', '2nd period', etc.
    const isHalftime  = state === 'in' && (
      descLower === 'halftime' ||
      descLower === 'half time' ||
      descLower === 'half-time' ||
      descLower.includes('entretiempo') ||
      (descLower.includes('half') && !descLower.includes('1st') && !descLower.includes('2nd') && !descLower.includes('first') && !descLower.includes('second'))
    );
    const parts = rawDisplay.split(':');
    const clockMins   = parseInt(parts[0]) || 0;
    // If there's no seconds part, ESPN just sent minutes (e.g. "64'"). 
    const clockSecs   = parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
    const hasSeconds  = parts.length > 1;

    // ESPN displayClock already shows TOTAL elapsed match time (e.g. "64:01" in 2nd half = 64' total)
    // No period offset needed
    const elapsedSec  = state === 'in' && !isHalftime ? clockMins * 60 + clockSecs : null;
    const short = state === 'post' ? 'FT' : state === 'in' ? (isHalftime ? 'HT' : 'LIVE') : 'NS';
    return { short, long: description, rawDisplay, period, isHalftime, elapsedSec, hasSeconds };
  }, []);

  // ── Helper: extract corners from ESPN boxscore ───────────────────────
  const extractCorners = useCallback((summaryData) => {
    const teams = summaryData?.boxscore?.teams || [];
    if (!teams[0]?.statistics) return null; // No stats available for this match
    const homeStat = teams.find(t => t.homeAway === 'home')?.statistics?.find(s => s.name === 'wonCorners')?.displayValue || '0';
    const awayStat = teams.find(t => t.homeAway === 'away')?.statistics?.find(s => s.name === 'wonCorners')?.displayValue || '0';
    return { home: parseInt(homeStat), away: parseInt(awayStat) };
  }, []);

  const extractTeamCorners = (summaryData, teamIdStr) => {
    const teams = summaryData?.boxscore?.teams || [];
    if (!teams[0]?.statistics) return null;
    const targetTeam = teams.find(t => String(t.team.id) === String(teamIdStr));
    if (!targetTeam) return null;
    const stat = targetTeam.statistics?.find(s => s.name === 'wonCorners')?.displayValue || '0';
    return parseInt(stat);
  };

  const fetchAll = useCallback(async () => {
    if (!fixtureId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch ESPN Summary with cache-busting to avoid browser caching
      const summaryRes = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/espn/summary/${fixtureId}?_t=${Date.now()}`, { cache: 'no-store' });
      if (!summaryRes.ok) throw new Error('Error al obtener el partido del proveedor de datos');
      const summary = await summaryRes.json();

      if (!summary.header) throw new Error('Partido no encontrado');

      const homeComp = summary.header.competitions[0].competitors.find(c => c.homeAway === 'home');
      const awayComp = summary.header.competitions[0].competitors.find(c => c.homeAway === 'away');
      
      const homeId = homeComp.id;
      const awayId = awayComp.id;

      const statusObj = summary.header.competitions[0].status;
      const state = statusObj?.type?.state;
      const getScore = (c) => parseInt(c?.score ?? 0);

      // Use shared parser (same logic as live polling)
      const parsed = parseLiveStatus(statusObj, state);

      const fix = {
        fixture: {
          id: fixtureId,
          date: summary.header.competitions[0].date,
          status: { short: parsed.short, long: parsed.long },
          liveClockDisplay: parsed.rawDisplay,
          liveClockSeconds: parsed.elapsedSec,
          livePeriod: parsed.period,
          isHalftime: parsed.isHalftime,
        },
        league: {
          name: summary.header.league?.name || "Liga",
          id: summary.header.league?.id || "0"
        },
        teams: {
          home: { id: homeId, name: homeComp.team.name, logo: homeComp.team.logos?.[0]?.href },
          away: { id: awayId, name: awayComp.team.name, logo: awayComp.team.logos?.[0]?.href }
        },
        goals: {
          home: getScore(homeComp),
          away: getScore(awayComp)
        },
        corners: extractCorners(summary)
      };
      setFixture(fix);

      // Seed live clock baseline
      if (parsed.elapsedSec !== null) {
        baseRef.current = { serverSec: parsed.elapsedSec, startedAt: Date.now() };
        setIsLiveMatch(true);
      } else {
        baseRef.current = null;
        setIsLiveMatch(false);
      }

      // Fetch team schedules (el backend ya filtra por 'post' y combina temporadas)
      const leagueSlug = summary.header.league?.slug || 'all';
      const [homeSchRes, awaySchRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/espn/team/${homeId}/schedule?league=${leagueSlug}`),
        fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/espn/team/${awayId}/schedule?league=${leagueSlug}`)
      ]);
      const homeSch = await homeSchRes.json();
      const awaySch = await awaySchRes.json();

      // Función para mapear un evento ESPN al formato del motor de análisis
      const mapEventToMatch = (ev) => {
        const comp = ev.competitions?.[0];
        const homeC = comp?.competitors?.find(c => c.homeAway === 'home');
        const awayC = comp?.competitors?.find(c => c.homeAway === 'away');
        // ESPN score puede ser un objeto {value: N} o un número directo
        const getScore = (c) => { const v = c?.score?.value ?? c?.score ?? 0; return parseInt(v); };
        // Usa nombre completo (displayName) con fallback a nombre corto
        const getName = (c) => c?.team?.displayName || c?.team?.name || c?.team?.shortDisplayName || '?';
        return {
          fixture: { id: ev.id, date: ev.date, status: { short: 'FT' } },
          league: { name: ev.league?.name || ev.season?.displayName || 'Desconocido' },
          teams: { 
            home: { id: homeC?.id, name: getName(homeC), winner: homeC?.winner }, 
            away: { id: awayC?.id, name: getName(awayC), winner: awayC?.winner } 
          },
          goals: { home: getScore(homeC), away: getScore(awayC) }
        };
      };

      // El backend devuelve los completados, ordenados desc, máx 20.
      // Excluimos el partido actual (fixtureId) para que no aparezca en la forma.
      const enrichMatch = (m, teamId) => {
        const isHome = String(m.teams?.home?.id) === String(teamId);
        const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
        const result = isHome
          ? winner === 'home' ? 'W' : winner === 'draw' ? 'D' : 'L'
          : winner === 'away' ? 'W' : winner === 'draw' ? 'D' : 'L';
        const dateStr = m.fixture?.date
          ? new Date(m.fixture.date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })
          : '';
        return {
          ...m,
          _isHome: isHome,
          _opponent: isHome ? m.teams?.away?.name : m.teams?.home?.name,
          _result: result,
          _date: dateStr,
          _league: m.league?.name || '',
        };
      };

      const hm = (homeSch.events || [])
        .filter(e => String(e.id) !== String(fixtureId))
        .map(e => enrichMatch(mapEventToMatch(e), homeId));
      const am = (awaySch.events || [])
        .filter(e => String(e.id) !== String(fixtureId))
        .map(e => enrichMatch(mapEventToMatch(e), awayId));
      
      setHomeMatches(hm);
      setAwayMatches(am);

      // Mapear H2H desde summary — usar displayName con fallbacks para nombre completo
      const h2hEvents = summary.headToHeadGames?.[0]?.events || [];
      const h2hTeamA = summary.headToHeadGames?.[0]?.team;
      const resolveName = (obj) =>
        obj?.displayName || obj?.name || obj?.shortName || obj?.abbreviation || '?';
      const h2h = h2hEvents.map(e => {
        const hg = parseInt(e.homeTeamScore ?? 0);
        const ag = parseInt(e.awayTeamScore ?? 0);
        
        const teamA_id = String(h2hTeamA?.id);
        const teamB_id = String(e.opponent?.id);
        
        let homeName = '', awayName = '', homeIdStr = '', awayIdStr = '';
        if (String(e.homeTeamId) === teamA_id) {
          homeName  = resolveName(h2hTeamA);
          homeIdStr = teamA_id;
          awayName  = resolveName(e.opponent);
          awayIdStr = teamB_id;
        } else {
          homeName  = resolveName(e.opponent);
          homeIdStr = teamB_id;
          awayName  = resolveName(h2hTeamA);
          awayIdStr = teamA_id;
        }

        return {
          fixture: { date: e.gameDate, status: { short: 'FT' } },
          teams: { 
            home: { id: homeIdStr, name: homeName, winner: hg > ag }, 
            away: { id: awayIdStr, name: awayName, winner: ag > hg } 
          },
          goals: { home: hg, away: ag }
        };
      });
      setH2HMatches(h2h);

      // Helper para extraer eventos clave
      const extractEvents = (summaryData) => {
        return (summaryData.keyEvents || []).map(e => {
          const t = e.type?.text || '';
          const isGoal = t.includes('Goal') || t.includes('Penalty - Scored');
          const isCard = t.includes('Card');
          
          return {
            type: isGoal ? 'Goal' : (isCard ? 'Card' : 'subst'),
            detail: t,
            time: { elapsed: e.clock?.value ? Math.floor(e.clock.value / 60) : parseInt(e.clock?.displayValue) || 0 },
            team: { id: String(e.team?.id) },
            player: { name: e.participants?.[0]?.athlete?.displayName }
          };
        });
      };

      // Map events (goles/tarjetas) para los timelines del partido actual (por si está en vivo)
      const evs = extractEvents(summary);
      setEvents(evs);

      // Fetch historical summaries para tramos y corners (max 12 partidos por equipo)
      const fetchHistSummaries = async (matches) => {
        const ids = matches.slice(0, 12).map(m => m.fixture.id);
        const results = await Promise.allSettled(ids.map(id => fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/espn/summary/${id}`).then(r => r.json())));
        return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
      };

      const [homeHistSummaries, awayHistSummaries] = await Promise.all([
         fetchHistSummaries(hm),
         fetchHistSummaries(am)
      ]);

      const homeHistEvs = homeHistSummaries.flatMap(s => extractEvents(s));
      const awayHistEvs = awayHistSummaries.flatMap(s => extractEvents(s));

      const analyzeCorners = (summaries, teamIdStr) => {
        const cornersArr = summaries.map(s => extractTeamCorners(s, teamIdStr)).filter(c => c !== null);
        if (!cornersArr.length) return null;
        const total = cornersArr.reduce((a, b) => a + b, 0);
        const avg = (total / cornersArr.length).toFixed(1);
        const over3 = cornersArr.filter(c => c > 3).length;
        const over4 = cornersArr.filter(c => c > 4).length;
        const over5 = cornersArr.filter(c => c > 5).length;
        const max = Math.max(...cornersArr);
        return { avg, total, max, matches: cornersArr.length, over3, over4, over5 };
      };

      const analyzeCardsFromSummaries = (summaries, teamIdStr) => {
        let yellow = 0, red = 0;
        const cardsArr = summaries.map(s => {
           let count = 0;
           (s.keyEvents || []).forEach(e => {
             if (e.type?.text?.includes('Card') && String(e.team?.id) === String(teamIdStr)) {
               count++;
               if (e.type?.text?.toLowerCase().includes('red')) red++;
               else yellow++;
             }
           });
           return count;
         });
        if (!cardsArr.length) return null;
        const total = cardsArr.reduce((a, b) => a + b, 0);
        const avg = (total / cardsArr.length).toFixed(1);
        const avgRed = (red / cardsArr.length).toFixed(2);
        const over1 = cardsArr.filter(c => c > 1).length;
        const over2 = cardsArr.filter(c => c > 2).length;
        const over3 = cardsArr.filter(c => c > 3).length;
        const max = Math.max(...cardsArr);
        return { avg, total, max, matches: cardsArr.length, over1, over2, over3, red, avgRed };
      };

      const homeCornersAnalysis = analyzeCorners(homeHistSummaries, homeId);
      const awayCornersAnalysis = analyzeCorners(awayHistSummaries, awayId);
      const homeCardsAnalysis = analyzeCardsFromSummaries(homeHistSummaries, homeId);
      const awayCardsAnalysis = analyzeCardsFromSummaries(awayHistSummaries, awayId);

      // Map injuries (rosters / out)
      const inj = [];
      if (summary.rosters) {
          summary.rosters.forEach(r => {
              if (r.roster) {
                  r.roster.forEach(p => {
                      if (p.injured || p.status === 'out') {
                          inj.push({
                              player: { name: p.athlete.displayName, reason: p.status || 'Lesión', photo: p.athlete.headshot?.href },
                              team: { name: r.team.displayName }
                          });
                      }
                  });
              }
          });
      }
      setInjuries(inj);

      // Mock stats y pred
      setHomeStats(null);
      setAwayStats(null);
      setPrediction(null); // Podríamos mapear pickcenter aquí luego

      // 3. Local analysis
      const homeForm       = calculateFormScore(hm, homeId);        // Forma general
      const awayForm       = calculateFormScore(am, awayId);
      const homeFormAtHome = calculateFormScore(hm, homeId, 'home'); // Solo partidos en casa
      const awayFormAway   = calculateFormScore(am, awayId, 'away'); // Solo partidos fuera
      const homeSplit = calculateOverUnder(hm, homeId);
      const awaySplit = calculateOverUnder(am, awayId);
      const h2hData   = analyzeH2H(h2h, homeId, awayId);

      // Build goal timelines using historical events
      const homeSlots = analyzeGoalsByTimeSlot(homeHistEvs, homeId);
      const awaySlots = analyzeGoalsByTimeSlot(awayHistEvs, awayId);

      // Poisson mejorado: usa avg en CASA del local vs avg FUERA del visitante
      // si hay suficientes datos split (≥3 partidos); si no, cae back al general
      const hGF = homeFormAtHome.total >= 3
        ? homeFormAtHome.goalsFor   / homeFormAtHome.total
        : homeForm.goalsFor   / Math.max(homeForm.total, 1);
      const hGA = homeFormAtHome.total >= 3
        ? homeFormAtHome.goalsAgainst / homeFormAtHome.total
        : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
      const aGF = awayFormAway.total >= 3
        ? awayFormAway.goalsFor   / awayFormAway.total
        : awayForm.goalsFor   / Math.max(awayForm.total, 1);
      const aGA = awayFormAway.total >= 3
        ? awayFormAway.goalsAgainst / awayFormAway.total
        : awayForm.goalsAgainst / Math.max(awayForm.total, 1);

      const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA);

      const isLive = summary.header?.competitions?.[0]?.status?.type?.state === 'in';
      const liveClock = summary.header?.competitions?.[0]?.status?.displayClock || "0'";
      const liveHomeGoals = parseInt(homeComp?.score ?? 0);
      const liveAwayGoals = parseInt(awayComp?.score ?? 0);

      // Fetch official prediction y Cuotas de Mercado (Value Bets)
      let officialPred = null;
      let marketOdds = null;
      try {
        const pcData = summary.pickcenter;
        if (pcData && Array.isArray(pcData) && pcData.length > 0) {
          const item = pcData[0];
          officialPred = {
            predictions: {
              percent: {
                home: item.homeTeamOdds?.winPercentage ? `${Math.round(item.homeTeamOdds.winPercentage)}%` : null,
                draw: item.drawOdds?.winPercentage ? `${Math.round(item.drawOdds.winPercentage)}%` : null,
                away: item.awayTeamOdds?.winPercentage ? `${Math.round(item.awayTeamOdds.winPercentage)}%` : null,
              },
              winner: { comment: item.provider?.name || '' },
            }
          };

          const getDec = (o) => {
            if (!o) return null;
            const val = parseFloat(o.value || o.moneyLine || 0);
            if (val > 0) return (val / 100) + 1;
            if (val < 0) return (100 / Math.abs(val)) + 1;
            return null;
          };
          marketOdds = { home: getDec(item.homeTeamOdds), away: getDec(item.awayTeamOdds), draw: getDec(item.drawOdds) };
        }
      } catch (_) { /* sin predicción oficial */ }

      // Extraer Posiciones en la tabla (Motivación)
      let matchStandings = null;
      try {
        const st = summary.standings?.groups?.[0]?.standings?.entries;
        if (st && st.length > 0) {
          const homeSt = st.find(s => String(s.team?.id) === String(homeId));
          const awaySt = st.find(s => String(s.team?.id) === String(awayId));
          if (homeSt && awaySt) {
            matchStandings = { 
              homeRank: homeSt.stats?.find(s=>s.name==='rank')?.value || homeSt.stats?.find(s=>s.name==='rankChange')?.value, 
              awayRank: awaySt.stats?.find(s=>s.name==='rank')?.value || awaySt.stats?.find(s=>s.name==='rankChange')?.value, 
              total: st.length 
            };
          }
        }
      } catch(_) {}

      // Extraer Estadísticas Avanzadas (xG, Posesión)
      let advancedStats = null;
      try {
        const box = summary.boxscore?.teams;
        if (box && box.length === 2) {
          const getStat = (t, name) => parseFloat(t.statistics?.find(s=>s.name === name)?.displayValue || 0);
          const homeBox = box.find(t => String(t.team?.id) === String(homeId));
          const awayBox = box.find(t => String(t.team?.id) === String(awayId));
          if (homeBox && awayBox) {
            advancedStats = {
              home: { xG: getStat(homeBox, 'expectedGoals'), possession: getStat(homeBox, 'possessionPct') },
              away: { xG: getStat(awayBox, 'expectedGoals'), possession: getStat(awayBox, 'possessionPct') }
            };
          }
        }
      } catch(_) {}

      // Calcular días de descanso desde el último partido
      const calcRest = (matches) => {
        if (!matches || matches.length === 0) return null;
        const lastDate = matches[0]?.fixture?.date;
        if (!lastDate) return null;
        const diff = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
        return diff;
      };
      const homeRestDays = calcRest(hm);
      const awayRestDays = calcRest(am);

      const picksRes = generatePicks({ 
        homeStats: null, awayStats: null, 
        h2hData, homeForm, awayForm, 
        homeSplitStats: homeSplit, awaySplitStats: awaySplit,
        isLive, liveClock, liveHomeGoals, liveAwayGoals,
        officialPrediction: officialPred,
        homeCornersData: homeCornersAnalysis,
        awayCornersData: awayCornersAnalysis,
        homeCardsData: homeCardsAnalysis,
        awayCardsData: awayCardsAnalysis,
        homeSlots,
        awaySlots,
        homeFormAtHome,
        awayFormAway,
        poissonProbs: poisson,
        injuries: inj,
        homeTeamName: fix.teams.home.name,
        homeRestDays,
        awayRestDays,
        marketOdds,
        matchStandings,
        advancedStats,
      });

      setAnalysis({ homeForm, awayForm, homeFormAtHome, awayFormAway, homeSplit, awaySplit, h2hData, poisson, homeSlots, awaySlots, homeCardsAnalysis, awayCardsAnalysis, homeCornersAnalysis, awayCornersAnalysis });
      setPicksResult(picksRes);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar el análisis.');
    } finally {
      setLoading(false);
    }
  }, [fixtureId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Reseed clock on each poll ───────────────────────────────────────────
  const pollLiveStatus = useCallback(async () => {
    if (!fixtureId) return;
    try {
      const res  = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/espn/summary/${fixtureId}?_t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const comp      = data.header?.competitions?.[0];
      if (!comp) return;
      const statusObj = comp.status;
      const state     = statusObj?.type?.state;
      const parsed    = parseLiveStatus(statusObj, state);
      const homeComp  = comp.competitors?.find(c => c.homeAway === 'home');
      const awayComp  = comp.competitors?.find(c => c.homeAway === 'away');
      const getScore  = c => parseInt(c?.score ?? 0);

      setFixture(prev => prev ? ({
        ...prev,
        fixture: {
          ...prev.fixture,
          status:    { short: parsed.short, long: parsed.long },
          isHalftime: parsed.isHalftime,
          livePeriod: parsed.period,
        },
        goals: { home: getScore(homeComp), away: getScore(awayComp) },
        corners: extractCorners(data) || prev.corners,
      }) : prev);

      if (parsed.elapsedSec !== null) {
        if (!parsed.hasSeconds && baseRef.current) {
           const currentExpectedMins = Math.floor(baseRef.current.serverSec / 60);
           const newMins = Math.floor(parsed.elapsedSec / 60);
           if (currentExpectedMins !== newMins) {
              baseRef.current = { serverSec: parsed.elapsedSec, startedAt: Date.now() };
           }
        } else {
           baseRef.current = { serverSec: parsed.elapsedSec, startedAt: Date.now() };
        }
        setIsLiveMatch(true);
      } else {
        baseRef.current = null;
        setIsLiveMatch(false);
        if (parsed.short === 'FT') {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          pollRef.current = null;
          timerRef.current = null;
        }
      }
    } catch (_) { /* silent */ }
  }, [fixtureId, parseLiveStatus]);

  // ── Polling every 15s when live or HT — fires immediately on start ────
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const status = fixture?.fixture?.status?.short;
    if (status === 'LIVE' || status === 'HT') {
      pollLiveStatus();                                        // immediate first call
      pollRef.current = setInterval(pollLiveStatus, 15_000);  // then every 15s
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fixture?.fixture?.status?.short, pollLiveStatus]);

  // ── 1-second ticker: starts when isLiveMatch=true, reads baseRef directly ──
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (isLiveMatch && baseRef.current) {
      // Kick immediately so display updates right away
      setTick(t => t + 1);
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [isLiveMatch]); // only restarts when isLiveMatch changes



  const saveIndividualPick = async (pick) => {
    if (!pick || !fixture) return;
    const entry = {
      fixtureId,
      home: fixture.teams?.home?.name,
      away: fixture.teams?.away?.name,
      date: fixture.fixture?.date,
      league: fixture.league?.name,
      score: fixture.fixture?.status?.short === 'FT' || fixture.fixture?.status?.short === 'LIVE' ? {
        home: fixture.goals?.home,
        away: fixture.goals?.away
      } : null,
      picks: [pick],
      savedAt: new Date().toISOString(),
    };
    
    // Guardar en la Base de Datos
    const res = await saveDbPick(entry);
    if (res.success) {
      entry.id = res.id;
      setSavedPicks(prev => [entry, ...prev]);
      
      // Feedback visual temporal
      setPickSaved(true);
      setTimeout(() => setPickSaved(false), 2000);
    } else {
      console.error('Error saving pick:', res.error);
    }
  };



  if (loading) return (
    <div className="max-w-screen-2xl mx-auto px-6 py-12">
      <Loader text="Recolectando datos del partido…" />
      <div className="mt-6 glass-card p-4 space-y-2">
        {['Forma reciente (12 partidos)', 'H2H histórico', 'Estadísticas de liga', 'Lesiones y convocatorias', 'Probabilidades Poisson'].map(s => (
          <div key={s} className="flex items-center gap-2 text-xs text-slate-500 animate-pulse">
            <div className="w-3 h-3 rounded-full border border-slate-700 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-ping" />
            </div>
            {s}
          </div>
        ))}
      </div>
    </div>
  );

  if (error) return (
    <div className="max-w-screen-2xl mx-auto px-6 py-12 text-center">
      <AlertCircle size={40} className="text-accent-red mx-auto mb-3" />
      <p className="text-accent-red font-semibold mb-4">{error}</p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => navigate(-1)} className="btn-ghost border border-surface-600">
          <ArrowLeft size={14} /> Volver
        </button>
        <button onClick={fetchAll} className="btn-primary"><RefreshCw size={14} /> Reintentar</button>
      </div>
    </div>
  );

  const { homeForm, awayForm, homeSplit, awaySplit, h2hData, poisson, homeSlots, awaySlots, homeCards, awayCards } = analysis || {};
  const homeId = fixture?.teams?.home?.id;
  const awayId = fixture?.teams?.away?.id;
  const kickoff = fixture?.fixture?.date
    ? new Date(fixture.fixture.date).toLocaleString('es-PE', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
    : '';

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-4 animate-fade-in">

      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2 border border-surface-600">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="section-title">Análisis Tipster</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500 mt-0.5">{fixture?.league?.name} · {kickoff}</p>
          </div>
        </div>
      </div>

      {/* Match hero */}
      <div className="glass-card p-6"
        style={{ background: 'linear-gradient(135deg,rgba(13,21,32,0.98),rgba(22,35,54,0.95))' }}>
        <div className="flex items-center justify-around gap-4">
          {/* Home */}
          <div className="flex flex-col items-center gap-3 flex-1">
            {fixture?.teams?.home?.logo && (
              <img src={fixture.teams.home.logo} alt="" className="w-28 h-28 object-contain drop-shadow-lg" />
            )}
            <p className="font-black text-white text-center text-xl md:text-2xl">{fixture?.teams?.home?.name}</p>
            <span className={`text-base px-3 py-1 mt-1 rounded font-bold ${
              homeForm?.score >= 65 ? 'badge-green' : homeForm?.score >= 40 ? 'badge-yellow' : 'badge-red'
            }`}>
              Forma: {homeForm?.score ?? '?'}%
            </span>
          </div>

          {/* VS / Scoreboard center */}
          <div className="flex flex-col items-center gap-3">
            {(fixture?.fixture?.status?.short !== 'NS' || fixture?.goals?.home > 0 || fixture?.goals?.away > 0) ? (
              <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
                <div className="flex items-center gap-4">
                  <div className="text-5xl font-black text-white font-mono bg-surface-900/80 px-6 py-4 rounded-2xl border-2 border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex items-center justify-center min-w-[140px] tracking-tighter relative">
                    {fixture.redCards?.home > 0 && (
                      <div className="absolute -left-6 w-3 h-5 bg-red-600 rounded-sm shadow-[0_0_15px_rgba(255,0,0,0.6)] animate-pulse" title={`${fixture.redCards.home} Tarjeta(s) Roja(s)`} />
                    )}
                    <span className="text-accent-green">{fixture.goals?.home ?? 0}</span>
                    <span className="mx-2 text-slate-700 opacity-50">-</span>
                    <span className="text-accent-green">{fixture.goals?.away ?? 0}</span>
                    {fixture.redCards?.away > 0 && (
                      <div className="absolute -right-6 w-3 h-5 bg-red-600 rounded-sm shadow-[0_0_15px_rgba(255,0,0,0.6)] animate-pulse" title={`${fixture.redCards.away} Tarjeta(s) Roja(s)`} />
                    )}
                  </div>
                </div>

                {/* Live clock / Halftime / Finished badge */}
                {(() => {
                  const status = fixture?.fixture?.status?.short;
                  // Compute elapsed time fresh from wall-clock on every render (tick drives re-renders)
                  const currentSec = (isLiveMatch && baseRef.current)
                    ? baseRef.current.serverSec + Math.floor((Date.now() - baseRef.current.startedAt) / 1000)
                    : null;

                  if (status === 'HT') return (
                    // ── ENTRETIEMPO ──
                    <div className="mt-3 flex flex-col items-center gap-1.5">
                      <div className="px-5 py-2 rounded-full flex items-center gap-2.5"
                        style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.4)' }}>
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">☕ Descanso</span>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-orange-400/50">45:00 · Entretiempo</span>
                    </div>
                  );

                  if (status === 'LIVE' && currentSec !== null) {
                    const dispMin   = Math.floor(currentSec / 60);
                    const dispSec   = currentSec % 60;
                    const period    = fixture.fixture.livePeriod ?? 1;
                    const halfLabel = period === 1 ? '1T' : period === 2 ? '2T' : `P${period}`;
                    return (
                      // ── EN VIVO con reloj en tiempo real ──
                      <div className="mt-3 flex flex-col items-center gap-1.5">
                        <div className="px-4 py-1.5 rounded-full bg-accent-red/10 border border-accent-red/40 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse"></span>
                          <span className="font-mono text-accent-red font-black text-base tracking-widest">
                            {String(dispMin).padStart(2,'0')}:{String(dispSec).padStart(2,'0')}
                          </span>
                          <span className="text-[9px] font-bold text-accent-red/60 uppercase tracking-widest">{halfLabel}</span>
                        </div>
                        <span className="text-[9px] text-accent-red/50 font-bold uppercase tracking-[0.2em]">En Vivo</span>
                      </div>
                    );
                  }

                  return (
                    // ── FINALIZADO u otro estado ──
                    <div className={`mt-3 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 border ${
                      status === 'LIVE'
                        ? 'bg-accent-red/10 border-accent-red/30 text-accent-red animate-pulse'
                        : 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status === 'LIVE' ? 'bg-accent-red' : 'bg-accent-green'}`}></span>
                      {status === 'LIVE' ? 'En Vivo' : 'Finalizado'}
                    </div>
                  );
                })()}

              </div>
            ) : (
              <>
                <div className="text-3xl font-black text-slate-700 font-mono tracking-widest opacity-40">VS</div>
                {poisson && (
                  <div className="flex gap-4 bg-white/5 p-4 rounded-xl border border-white/5 shadow-inner">
                    <ProbCircle prob={poisson.home} label="Local" color="#00ff88" />
                    <ProbCircle prob={poisson.draw} label="Empate" color="#ffd700" />
                    <ProbCircle prob={poisson.away} label="Visit." color="#ff4757" />
                  </div>
                )}
                <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Modelo Poisson</p>
              </>
            )}
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-3 flex-1">
            {fixture?.teams?.away?.logo && (
              <img src={fixture.teams.away.logo} alt="" className="w-28 h-28 object-contain drop-shadow-lg" />
            )}
            <p className="font-black text-white text-center text-xl md:text-2xl">{fixture?.teams?.away?.name}</p>
            <span className={`text-base px-3 py-1 mt-1 rounded font-bold ${
              awayForm?.score >= 65 ? 'badge-green' : awayForm?.score >= 40 ? 'badge-yellow' : 'badge-red'
            }`}>
              Forma: {awayForm?.score ?? '?'}%
            </span>
          </div>
        </div>
      </div>



      {/* ── PICKS (the star) ── */}
      <SECTION icon={Zap} title="📊 Apuestas Recomendadas" id="picks">
        {picksResult && (
          <div className="space-y-4">
            <PicksTable 
              picks={picksResult.picks} 
              reason={picksResult.reason} 
              onSavePick={saveIndividualPick}
              isLive={isLiveMatch}
            />
          </div>
        )}
      </SECTION>



      {/* ── FORMA RECIENTE ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { team: fixture?.teams?.home, form: homeForm, matches: homeMatches, split: homeSplit, teamId: homeId, color: '#00ff88' },
          { team: fixture?.teams?.away, form: awayForm, matches: awayMatches, split: awaySplit, teamId: awayId, color: '#ff4757' },
        ].map(({ team, form, matches, split, teamId, color }) => (
          <SECTION key={teamId} icon={BarChart2} title={`Forma · ${team?.name}`} id={`form-${teamId}`}>
            <div className="space-y-3">
              <div className="mb-4">
                <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">
                  Análisis sobre los últimos {Math.min(matches?.length ?? 0, 12)} partidos
                </p>
                <FormPills matches={matches} teamId={teamId} />
              </div>
              <div className="space-y-0.5">
                <StatRow label="Partidos Jugados" value={form?.total ?? '–'} />
                <StatRow label="Ganó / Empató / Perdió"
                  value={`${form?.wins ?? 0}–${form?.draws ?? 0}–${form?.losses ?? 0}`} />
                <StatRow label="Goles a favor"
                  value={(form?.total > 0 ? (form.goalsFor / form.total).toFixed(1) : '–')}
                  sub="por partido" color="text-accent-green" />
                <StatRow label="Goles recibidos"
                  value={(form?.total > 0 ? (form.goalsAgainst / form.total).toFixed(1) : '–')}
                  sub="por partido" color="text-accent-red" />
                <StatRow label="Más de 2.5 goles" value={`${split?.over25Pct ?? 0}%`}
                  pct={split?.over25Pct ?? 0} color={split?.over25Pct >= 60 ? 'text-accent-green' : 'text-slate-300'} />
                <StatRow label="Ambos equipos marcan" value={`${split?.bttsPct ?? 0}%`}
                  pct={split?.bttsPct ?? 0} color={split?.bttsPct >= 60 ? 'text-accent-green' : 'text-slate-300'} />
              </div>
            </div>
          </SECTION>
        ))}
      </div>


      {/* ── GOLES POR TRAMO ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {[
          { label: fixture?.teams?.home?.name, slots: homeSlots, color: '#00ff88', actualGoals: homeForm?.goalsFor || 0 },
          { label: fixture?.teams?.away?.name, slots: awaySlots, color: '#ff4757', actualGoals: awayForm?.goalsFor || 0 },
        ].map(({ label, slots, color, actualGoals }) => (
          <SECTION key={label} icon={Clock} title={`⏱ Goles por tramo · ${label}`} id={`slots-${label}`}>
            {slots && <GoalTimeline slots={slots} color={color} actualGoals={actualGoals} />}
            {!slots && <p className="text-xs text-slate-600">Sin datos de tramos disponibles</p>}
          </SECTION>
        ))}
      </div>


      {/* ── H2H ── */}
      <SECTION icon={Users} title="H2H · Historial de enfrentamientos" id="h2h">
        {h2hData && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold font-mono text-accent-green">{h2hData.homeWinPct}%</p>
              <p className="text-[10px] text-slate-500">{fixture?.teams?.home?.name?.split(' ')[0]}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-mono text-amber-400">{h2hData.drawPct}%</p>
              <p className="text-[10px] text-slate-500">Empate</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-mono text-accent-red">{h2hData.awayWinPct}%</p>
              <p className="text-[10px] text-slate-500">{fixture?.teams?.away?.name?.split(' ')[0]}</p>
            </div>
          </div>
        )}
        <H2HTable matches={h2hMatches} homeId={homeId} awayId={awayId}
          homeName={fixture?.teams?.home?.name} awayName={fixture?.teams?.away?.name} />
        {h2hData && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <StatRow label="Más de 2.5 goles (Historial)" value={`${h2hData.over25Pct}%`}
              pct={h2hData.over25Pct} color={h2hData.over25Pct >= 60 ? 'text-accent-green' : 'text-slate-300'} />
            <StatRow label="Ambos marcan (Historial)" value={`${h2hData.bttsPct}%`}
              pct={h2hData.bttsPct} color={h2hData.bttsPct >= 60 ? 'text-accent-green' : 'text-slate-300'} />
            <StatRow label="Media de goles" value={h2hData.avgGoals} sub="por partido" />
            <StatRow label="Partidos analizados" value={h2hData.total} />
          </div>
        )}

      </SECTION>

      {/* ── TARJETAS ── */}
      {(analysis?.homeCardsAnalysis || analysis?.awayCardsAnalysis) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 mb-4">
          {[
            { label: fixture?.teams?.home?.name, cards: analysis.homeCardsAnalysis },
            { label: fixture?.teams?.away?.name, cards: analysis.awayCardsAnalysis },
          ].map(({ label, cards }) => (
            <SECTION key={`cards-${label}`} icon={Shield} title={`🟨 Tarjetas · ${label}`} id={`cards-${label}`}>
              {cards ? (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-center flex-1 border-r border-white/10">
                      <p className="text-2xl font-bold font-mono text-white leading-none">{cards.avg}</p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Media Tarjetas</p>
                    </div>
                    <div className="text-center flex-1 border-r border-white/10">
                      <p className="text-2xl font-bold font-mono text-accent-red leading-none">{cards.avgRed}</p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Media Rojas</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-2xl font-bold font-mono text-slate-300 leading-none">{cards.max}</p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Máximo</p>
                    </div>
                  </div>
                  
                  <div className="bg-surface-900 rounded-lg p-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest text-center mb-3">Líneas de Tarjetas (Basado en {cards.matches} partidos)</p>
                    <div className="grid grid-cols-3 gap-2">
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-amber-400">{Math.round((cards.over1/cards.matches)*100)}%</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">Más de 1</p>
                       </div>
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-orange-400">{Math.round((cards.over2/cards.matches)*100)}%</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">Más de 2</p>
                       </div>
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-accent-red">{Math.round((cards.over3/cards.matches)*100)}%</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">Más de 3</p>
                       </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600 p-4 text-center">Sin datos de tarjetas</p>
              )}
            </SECTION>
          ))}
        </div>
      )}

      {/* ── CORNERS ── */}
      {(analysis?.homeCornersAnalysis || analysis?.awayCornersAnalysis) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 mb-4">
          {[
            { label: fixture?.teams?.home?.name, corners: analysis.homeCornersAnalysis },
            { label: fixture?.teams?.away?.name, corners: analysis.awayCornersAnalysis },
          ].map(({ label, corners }) => (
            <SECTION key={`corners-${label}`} icon={Activity} title={`🚩 Tiros de Esquina · ${label}`} id={`corners-${label}`}>
              {corners ? (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-center flex-1 border-r border-white/10">
                      <p className="text-2xl font-bold font-mono text-white leading-none">{corners.avg}</p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Media p/p</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-2xl font-bold font-mono text-slate-300 leading-none">{corners.max}</p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Máximo</p>
                    </div>
                  </div>
                  
                  <div className="bg-surface-900 rounded-lg p-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest text-center mb-3">Líneas de Córners (Basado en {corners.matches} partidos)</p>
                    <div className="grid grid-cols-3 gap-2">
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-accent-green">{Math.round((corners.over3/corners.matches)*100)}%</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">Más de 3</p>
                       </div>
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-amber-400">{Math.round((corners.over4/corners.matches)*100)}%</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">Más de 4</p>
                       </div>
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-accent-red">{Math.round((corners.over5/corners.matches)*100)}%</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">Más de 5</p>
                       </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600 p-4 text-center">Sin datos de tiros de esquina</p>
              )}
            </SECTION>
          ))}
        </div>
      )}

      {/* ── LESIONES ── */}
      {injuries.length > 0 && (
        <SECTION icon={Shield} title="🚑 Lesiones y bajas" id="injuries">
          <div className="grid grid-cols-1 gap-2">
            {injuries.slice(0, 10).map((inj, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2">
                  {inj.player?.photo && (
                    <img src={inj.player.photo} alt="" className="w-6 h-6 rounded-full object-cover" />
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{inj.player?.name}</p>
                    <p className="text-[10px] text-slate-600">{inj.team?.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="badge-red text-[9px]">{inj.player?.reason || '–'}</span>
                </div>
              </div>
            ))}
          </div>

        </SECTION>
      )}

      {/* ── PREDICCIÓN OFICIAL API ── */}
      {prediction && (
        <SECTION icon={Target} title="Predicción Oficial API-Football" id="prediction">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center rounded-lg p-3" style={{ background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.15)' }}>
              <p className="text-xl font-bold text-accent-green font-mono">
                {prediction.predictions?.percent?.home ?? '–'}
              </p>
              <p className="text-[10px] text-slate-500">Local gana</p>
            </div>
            <div className="text-center rounded-lg p-3" style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.15)' }}>
              <p className="text-xl font-bold text-amber-400 font-mono">
                {prediction.predictions?.percent?.draw ?? '–'}
              </p>
              <p className="text-[10px] text-slate-500">Empate</p>
            </div>
            <div className="text-center rounded-lg p-3" style={{ background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.15)' }}>
              <p className="text-xl font-bold text-accent-red font-mono">
                {prediction.predictions?.percent?.away ?? '–'}
              </p>
              <p className="text-[10px] text-slate-500">Visitante</p>
            </div>
          </div>
          {prediction.predictions?.advice && (
            <p className="text-xs text-slate-400 italic border-l-2 border-accent-green/40 pl-3">
              "{prediction.predictions.advice}"
            </p>
          )}
          {prediction.predictions?.winner?.name && (
            <p className="text-xs text-slate-300 mt-2">
              Ganador predicho: <strong className="text-white">{prediction.predictions.winner.name}</strong>
            </p>
          )}
        </SECTION>
      )}

    </div>
  );
}
