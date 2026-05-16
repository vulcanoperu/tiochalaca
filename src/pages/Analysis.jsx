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

import { saveDbPick } from '../services/backendApi';
import {
  calculateFormScore, calculateOverUnder, analyzeGoalsByTimeSlot,
  analyzeH2H, generatePicks, calcMatchProbabilities,
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
  const [loading, setLoading]         = useState(true);   // carga inicial del fixture
  const [loadingAnalysis, setLoadingAnalysis] = useState(false); // carga del análisis (progresiva)
  const [error, setError]             = useState(null);
  const [analysis, setAnalysis]       = useState(null);
  const [picksResult, setPicksResult] = useState(null);
  const [pickSaved, setPickSaved]     = useState(false);
  const [matchStats, setMatchStats]   = useState(null); // estadísticas reales del partido finalizado

  // Ref para rastrear alertas en vivo ya enviadas en esta sesión y no repetir
  const sentAlertsRef = useRef(new Set());
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

  // ── Helper: extract full match stats from ESPN boxscore ───────────────
  const extractMatchStats = useCallback((summaryData) => {
    if (!summaryData?.boxscore?.teams?.length) return null;
    const getTeamStat = (homeAway, statName) => {
      const team = summaryData.boxscore.teams.find(t => t.homeAway === homeAway);
      if (!team) return null;
      const stat = team.statistics?.find(s => s.name === statName);
      return stat ? stat.displayValue : null;
    };
    const stats = {
      possession:    { home: getTeamStat('home', 'possessionPct'),   away: getTeamStat('away', 'possessionPct') },
      shots:         { home: getTeamStat('home', 'totalShots'),       away: getTeamStat('away', 'totalShots') },
      shotsOnTarget: { home: getTeamStat('home', 'shotsOnTarget'),    away: getTeamStat('away', 'shotsOnTarget') },
      corners:       { home: getTeamStat('home', 'wonCorners'),       away: getTeamStat('away', 'wonCorners') },
      fouls:         { home: getTeamStat('home', 'foulsCommitted'),   away: getTeamStat('away', 'foulsCommitted') },
      yellowCards:   { home: getTeamStat('home', 'yellowCards'),      away: getTeamStat('away', 'yellowCards') },
      redCards:      { home: getTeamStat('home', 'redCards'),         away: getTeamStat('away', 'redCards') },
      offsides:      { home: getTeamStat('home', 'offsides'),         away: getTeamStat('away', 'offsides') },
    };
    const hasData = Object.values(stats).some(s => s.home !== null || s.away !== null);
    return hasData ? stats : null;
  }, []);

  // TTL del caché de sesión: 5 min para partidos en curso, 4h para terminados/futuros
  const SESSION_KEY = `chalaca_analysis_v2_${fixtureId}`; // v2: invalida caché viejo
  const SESSION_TTL_LIVE = 5 * 60 * 1000;
  const SESSION_TTL_DONE = 4 * 60 * 60 * 1000;
  // En modo desarrollo, desactivamos el caché para que los cambios del motor se vean inmediatamente
  const IS_DEV = import.meta.env.DEV === true;

  const fetchAll = useCallback(async () => {
    if (!fixtureId) return;
    setError(null);

    // ── Capa 2: sessionStorage cache ─────────────────────────────────────────
    // Si el usuario ya analizó este partido en esta sesión, carga INSTANTÁNEO.
    // En modo DEV se salta el caché para que los cambios del motor se apliquen al instante.
    if (!IS_DEV) {
    try {
      const cached = sessionStorage.getItem(SESSION_KEY);
      if (cached) {
        const { ts, fixture: f, homeMatches: hm, awayMatches: am, h2hMatches: h2h,
                injuries: inj, events: evs, analysis: an, picksResult: pr,
                isLiveMatch: ilm, elapsedSec } = JSON.parse(cached);
        
        // Determinar TTL correcto según el estado
        const statusShort = f?.fixture?.status?.short;
        let ttl = SESSION_TTL_DONE; // por defecto 4h (para FT)
        
        if (ilm || statusShort === 'LIVE' || statusShort === 'HT') {
          ttl = SESSION_TTL_LIVE; // 5 min para partidos en vivo
        } else if (statusShort === 'NS') {
          ttl = 30 * 1000; // 30s para NS: puede estar por empezar
        }

        if (Date.now() - ts < ttl) {
          setFixture(f); setHomeMatches(hm); setAwayMatches(am); setH2HMatches(h2h);
          setInjuries(inj); setEvents(evs); setAnalysis(an); setPicksResult(pr);
          if (elapsedSec !== undefined && elapsedSec !== null) {
            baseRef.current = { serverSec: elapsedSec, startedAt: Date.now() };
            setIsLiveMatch(true);
          } else {
            baseRef.current = null;
            setIsLiveMatch(false);
          }
          setLoading(false);
          setLoadingAnalysis(false);
          return; // ¡listo! sin ninguna llamada de red
        }
      }
    } catch (_) { /* sessionStorage no disponible o datos corruptos */ }
    } // fin !IS_DEV

    // ── Carga progresiva: fixture primero, análisis después ───────────────────
    setLoading(true);
    try {
      // ── 1. Resumen del partido (status, logos, reloj en vivo) ─────────────
      // Llamada rápida: solo datos del partido actual (~150ms).
      const summaryRes = await fetch(`${BACKEND_URL}/api/espn/summary/${fixtureId}?_t=${Date.now()}`, { cache: 'no-store' });
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
        city: summary.gameInfo?.venue?.address?.city || null,
        venue: summary.gameInfo?.venue?.fullName || summary.gameInfo?.venue?.address?.city || null,
        referee: summary.gameInfo?.officials?.[0]?.fullName || 
                 summary.header?.competitions?.[0]?.officials?.[0]?.fullName || 
                 summary.officials?.[0]?.fullName || 
                 summary.boxscore?.officials?.[0]?.fullName || 
                 null,
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

      // ── Estadísticas del partido (En vivo o Finalizado) ──────
      const stats = extractMatchStats(summary);
      if (stats) setMatchStats(stats);
      else setMatchStats(null);

      // Seed live clock baseline
      if (parsed.elapsedSec !== null) {
        baseRef.current = { serverSec: parsed.elapsedSec, startedAt: Date.now() };
        setIsLiveMatch(true);
      } else {
        baseRef.current = null;
        setIsLiveMatch(false);
      }

      // ── Capa 3: Carga Progresiva ──────────────────────────────────────────
      // El fixture ya está en pantalla. Quitamos el spinner principal AHORA
      // y mostramos un indicador secundario solo para la sección de análisis.
      setLoading(false);
      setLoadingAnalysis(true);

      // ── 2. Análisis completo pre-procesado en el backend (1 sola llamada) ──
      // Si el prefetch de Home.jsx ya corrió, esta respuesta viene del caché
      // del servidor y llega en ~20ms. Si no, el backend la procesa (~1-3s).
      const analysisRes = await fetch(`${BACKEND_URL}/api/espn/match/${fixtureId}/analysis`);
      if (!analysisRes.ok) throw new Error('Error al procesar el análisis del partido');
      const { data: ad } = await analysisRes.json();

      const hm  = ad.homeMatches;
      const am  = ad.awayMatches;
      const h2h = ad.h2h;

      setHomeMatches(hm);
      setAwayMatches(am);
      setH2HMatches(h2h);
      setInjuries(ad.injuries);
      setEvents(ad.currentEvents);
      setHomeStats(null);
      setAwayStats(null);
      setPrediction(null);

      // ── 3. Motor de análisis (pura matemática, sin llamadas de red) ────────
      const homeForm       = calculateFormScore(hm, homeId);
      const awayForm       = calculateFormScore(am, awayId);
      const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
      const awayFormAway   = calculateFormScore(am, awayId, 'away');
      const homeSplit      = calculateOverUnder(hm, homeId);
      const awaySplit      = calculateOverUnder(am, awayId);
      const h2hData        = analyzeH2H(h2h, homeId, awayId);
      const homeSlots      = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
      const awaySlots      = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);

      // Poisson mejorado: usa avg en CASA del local vs avg FUERA del visitante.
      // Si hay pocos partidos split (< 3), usa la forma general como fallback.
      const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor   / homeFormAtHome.total : homeForm.goalsFor   / Math.max(homeForm.total, 1);
      const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
      const aGF = awayFormAway.total   >= 3 ? awayFormAway.goalsFor     / awayFormAway.total   : awayForm.goalsFor   / Math.max(awayForm.total, 1);
      const aGA = awayFormAway.total   >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total   : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
      const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA);

      const isLive       = summary.header?.competitions?.[0]?.status?.type?.state === 'in';
      const liveClock    = summary.header?.competitions?.[0]?.status?.displayClock || "0'";
      const liveHomeGoals = parseInt(homeComp?.score ?? 0);
      const liveAwayGoals = parseInt(awayComp?.score ?? 0);

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
        isLive, liveClock, liveHomeGoals, liveAwayGoals,
        marketInsight:   ad.marketInsight,
        homeCornersData: ad.homeCornersData,
        awayCornersData: ad.awayCornersData,
        homeCardsData:   ad.homeCardsData,
        awayCardsData:   ad.awayCardsData,
        homeSlots, awaySlots,
        homeFormAtHome, awayFormAway,
        poissonProbs: poisson,
        injuries:       ad.injuries,
        homeTeamName:   fix.teams.home.name,
        awayTeamName:   fix.teams.away.name,
        leagueName:     fix.league.name,
        homeRestDays:   calcRest(hm),
        awayRestDays:   calcRest(am),
        homeHistory:    hm,
        awayHistory:    am,
        city:           fix.city,
        marketOdds:     ad.marketOdds,
        matchStandings: ad.matchStandings,
        advancedStats:  ad.advancedStats,
        refereeStats:   ad.refereeStats,
      });

      const analysisObj = {
        homeForm, awayForm, homeFormAtHome, awayFormAway,
        homeSplit, awaySplit, h2hData, poisson,
        homeSlots, awaySlots,
        homeCardsAnalysis:   ad.homeCardsData,
        awayCardsAnalysis:   ad.awayCardsData,
        homeCornersAnalysis: ad.homeCornersData,
        awayCornersAnalysis: ad.awayCornersData,
        marketInsight: ad.marketInsight,
      };
      setAnalysis(analysisObj);
      setPicksResult(picksRes);

      // Auditar y enviar picks en vivo al servidor (si existen)
      if (isLive && picksRes && picksRes.picks?.length > 0) {
        const livePicks = picksRes.picks.filter(p => p.market?.toLowerCase()?.includes('vivo') || p.tier === '🔥');
        const newAlerts = [];
        livePicks.forEach(pick => {
           const alertId = `${fixtureId}_${pick.selection}`;
           if (!sentAlertsRef.current.has(alertId)) {
             sentAlertsRef.current.add(alertId);
             newAlerts.push({
               fixture_id: fixtureId,
               home_team: fix.teams.home.name,
               away_team: fix.teams.away.name,
               league: fix.league.name,
               minute: parseInt(liveClock) || 0,
               score: `${liveHomeGoals}-${liveAwayGoals}`,
               market: pick.market,
               selection: pick.selection,
               probability: pick.probability,
               created_at: new Date().toISOString()
             });
           }
        });
        
        if (newAlerts.length > 0) {
          fetch(`${BACKEND_URL}/api/live-alerts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alerts: newAlerts })
          }).catch(err => console.error('Error sending live alerts:', err));
        }
      }

      // ── Capa 2: Guardar en sessionStorage para visitas siguientes ──────────
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          ts: Date.now(),
          fixture: fix,
          homeMatches: hm, awayMatches: am, h2hMatches: h2h,
          injuries: ad.injuries,
          events: ad.currentEvents,
          analysis: analysisObj,
          picksResult: picksRes,
          isLiveMatch: isLive,
          elapsedSec: parsed.elapsedSec,
        }));
      } catch (_) { /* quota exceeded → ignorar */ }

    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar el análisis.');
    } finally {
      setLoading(false);
      setLoadingAnalysis(false);
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

      // Actualizar también estadísticas detalladas si están disponibles en vivo
      const liveStats = extractMatchStats(data);
      if (liveStats) setMatchStats(liveStats);

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
  }, [fixtureId, parseLiveStatus, extractMatchStats]);

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
    <div className="w-full py-12">
      <Loader text="Obteniendo datos del partido…" />
    </div>
  );

  if (error) return (
    <div className="w-full py-12 text-center">
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

  const { homeForm, awayForm, homeSplit, awaySplit, h2hData, poisson, homeSlots, awaySlots, homeCards, awayCards, marketInsight } = analysis || {};
  const homeId = fixture?.teams?.home?.id;
  const awayId = fixture?.teams?.away?.id;
  const kickoff = fixture?.fixture?.date
    ? new Date(fixture.fixture.date).toLocaleString('es-PE', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
    : '';

  return (
    <div className="w-full space-y-4 animate-fade-in">

      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2 border border-surface-600">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="section-title">Análisis Tipster</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500 mt-0.5">{fixture?.league?.name} · {kickoff}</p>
            {loadingAnalysis && (
              <span className="flex items-center gap-1 text-[10px] text-accent-green/70 font-semibold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-ping" />
                Calculando…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Match hero */}
      <div className="glass-card p-6"
        style={{ background: 'linear-gradient(135deg, rgba(15,26,20,0.98), rgba(22,42,30,0.95))' }}>
        <div className="flex items-center justify-around gap-4">
          {/* Home */}
          <div className="flex flex-col items-center gap-3 flex-1">
            {fixture?.teams?.home?.logo && (
              <img src={fixture.teams.home.logo} alt="" className="w-28 h-28 object-contain drop-shadow-lg" />
            )}
            <p className="font-black text-white text-center text-xl md:text-2xl">{fixture?.teams?.home?.name}</p>
            <div className="flex flex-col gap-1.5 items-center mt-1">
              <span className={`text-base px-3 py-1 rounded font-bold ${
                homeForm?.score >= 65 ? 'badge-green' : homeForm?.score >= 40 ? 'badge-yellow' : 'badge-red'
              }`}>
                Forma: {homeForm?.score ?? '?'}%
              </span>
              
              {/* Diagnósticos del Motor Institucional */}
              {picksResult?.pythag?.home?.overPerforming && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold cursor-help" title={picksResult.pythag.home.label}>
                  ⚠️ Suerte Alta
                </span>
              )}
              {picksResult?.pythag?.home?.underPerforming && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold cursor-help" title={picksResult.pythag.home.label}>
                  💡 Infravalorado
                </span>
              )}
              {picksResult?.volatility?.home?.isHighVolatility && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold cursor-help" title={picksResult.volatility.home.label}>
                  🔴 Inestable
                </span>
              )}
            </div>
          </div>

          {/* VS / Scoreboard center */}
          <div className="flex flex-col items-center gap-3">
            {(fixture?.fixture?.status?.short !== 'NS' || fixture?.goals?.home > 0 || fixture?.goals?.away > 0) ? (
              <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
                <div className="flex items-center gap-4">
                  <div className="text-5xl font-numbers text-white bg-surface-900/80 px-6 py-4 rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.4)] flex items-center justify-center min-w-[140px] tracking-tighter gap-3">
                    {fixture.redCards?.home > 0 && (
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-[11px] h-[16px] bg-red-600 rounded-[2px] shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                          style={isLiveMatch ? { animation: 'pulse 1.5s infinite' } : {}} />
                        {fixture.redCards.home > 1 && (
                          <span className="text-[10px] font-bold text-red-400 leading-none">{fixture.redCards.home}</span>
                        )}
                      </div>
                    )}
                    <span className="text-accent-green">{fixture.goals?.home ?? 0}</span>
                    <span className="text-slate-800 opacity-50 font-light">-</span>
                    <span className="text-accent-green">{fixture.goals?.away ?? 0}</span>
                    {fixture.redCards?.away > 0 && (
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-[11px] h-[16px] bg-red-600 rounded-[2px] shadow-[0_0_10px_rgba(220,38,38,0.7)]"
                          style={isLiveMatch ? { animation: 'pulse 1.5s infinite' } : {}} />
                        {fixture.redCards.away > 1 && (
                          <span className="text-[10px] font-black text-red-400 leading-none">{fixture.redCards.away}</span>
                        )}
                      </div>
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
                        <div className="px-4 py-1.5 rounded-full bg-accent-red/10 border border-accent-red/20 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse"></span>
                          <span className="font-numbers text-accent-red font-bold text-base tracking-widest">
                            {String(dispMin).padStart(2,'0')}:{String(dispSec).padStart(2,'0')}
                          </span>
                          <span className="text-[9px] font-bold text-accent-red/50 uppercase tracking-[0.2em]">{halfLabel}</span>
                        </div>
                        <span className="text-[9px] text-accent-red/40 font-bold uppercase tracking-[0.2em]">En Vivo</span>
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
                  <div className="flex flex-col items-center">
                    <div className="flex gap-4 bg-white/5 p-4 rounded-xl border border-white/5 shadow-inner">
                      <ProbCircle prob={poisson.home} label="Local" color="#00ff88" />
                      <ProbCircle prob={poisson.draw} label="Empate" color="#ffd700" />
                      <ProbCircle prob={poisson.away} label="Visit." color="#ff4757" />
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">Modelo Poisson</p>
                  </div>
                )}
                {marketInsight?.predictions?.percent?.home && (
                  <div className="mt-4 w-full bg-surface-900/50 p-3 rounded-xl border border-[#BFF102]/20">
                    <div className="flex items-center gap-1.5 mb-2 justify-center">
                      <Zap size={12} className="text-[#BFF102]" />
                      <p className="text-[10px] text-[#BFF102] font-bold uppercase tracking-widest">Predicción Oficial ESPN</p>
                    </div>
                    <div className="flex w-full h-2 rounded-full overflow-hidden bg-black/50 mb-2">
                      <div className="h-full bg-accent-green" style={{ width: `${marketInsight.predictions.percent.home}%` }}></div>
                      <div className="h-full bg-yellow-500" style={{ width: `${marketInsight.predictions.percent.draw}%` }}></div>
                      <div className="h-full bg-accent-red" style={{ width: `${marketInsight.predictions.percent.away}%` }}></div>
                    </div>
                    <div className="flex justify-between w-full px-1">
                      <div className="flex flex-col items-start">
                        <span className="text-[11px] font-numbers font-bold text-accent-green">{marketInsight.predictions.percent.home}%</span>
                        <span className="text-[9px] text-slate-500 font-numbers">{(100 / marketInsight.predictions.percent.home).toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[11px] font-numbers font-bold text-yellow-500">{marketInsight.predictions.percent.draw}%</span>
                        <span className="text-[9px] text-slate-500 font-numbers">{(100 / marketInsight.predictions.percent.draw).toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[11px] font-numbers font-bold text-accent-red">{marketInsight.predictions.percent.away}%</span>
                        <span className="text-[9px] text-slate-500 font-numbers">{(100 / marketInsight.predictions.percent.away).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-3 flex-1">
            {fixture?.teams?.away?.logo && (
              <img src={fixture.teams.away.logo} alt="" className="w-28 h-28 object-contain drop-shadow-lg" />
            )}
            <p className="font-black text-white text-center text-xl md:text-2xl">{fixture?.teams?.away?.name}</p>
            <div className="flex flex-col gap-1.5 items-center mt-1">
              <span className={`text-base px-3 py-1 rounded font-bold ${
                awayForm?.score >= 65 ? 'badge-green' : awayForm?.score >= 40 ? 'badge-yellow' : 'badge-red'
              }`}>
                Forma: {awayForm?.score ?? '?'}%
              </span>

              {/* Diagnósticos del Motor Institucional */}
              {picksResult?.pythag?.away?.overPerforming && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold cursor-help" title={picksResult.pythag.away.label}>
                  ⚠️ Suerte Alta
                </span>
              )}
              {picksResult?.pythag?.away?.underPerforming && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold cursor-help" title={picksResult.pythag.away.label}>
                  💡 Infravalorado
                </span>
              )}
              {picksResult?.volatility?.away?.isHighVolatility && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold cursor-help" title={picksResult.volatility.away.label}>
                  🔴 Inestable
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── INFO DEL PARTIDO (Estadio y Árbitro) ── */}
      <div className="flex flex-col sm:flex-row gap-2 justify-center mb-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="bg-surface-900/50 border border-white/5 rounded-lg px-4 py-2 flex items-center justify-center gap-2">
           <span className="text-xl">🏟️</span>
           <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest truncate max-w-[200px]">
             {fixture?.venue || fixture?.city || 'Estadio por confirmar'}
           </span>
        </div>
        <div className="bg-surface-900/50 border border-white/5 rounded-lg px-4 py-2 flex items-center justify-center gap-2">
           <span className="text-xl">⚖️</span>
           <div className="flex flex-col items-center sm:items-start">
             <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest truncate max-w-[200px]">
               {fixture?.referee || analysis?.refereeStats?.name || 'Árbitro por confirmar'}
             </span>
             {analysis?.refereeStats?.matches > 0 && (
               <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                 {analysis.refereeStats.avgYellow + analysis.refereeStats.avgRed} Tarjetas/p.
               </span>
             )}
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

      {/* ── ESTADÍSTICAS DEL PARTIDO (Oculto temporalmente a pedido del usuario) ── */}
      {false && matchStats && fixture?.fixture?.status?.short !== 'NS' && (
        <section className="glass-card p-5 animate-slide-up" style={{ background: 'linear-gradient(135deg, rgba(15,26,20,0.98), rgba(22,42,30,0.95))' }}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <TrendingUp size={14} className="text-accent-green" />
            </div>
            <h2 className="text-sm font-bold text-white">📊 Estadísticas del Partido</h2>
            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              fixture?.fixture?.status?.short === 'FT' 
                ? 'bg-accent-green/10 text-accent-green border-accent-green/20'
                : 'bg-amber-400/10 text-amber-400 border-amber-400/20 animate-pulse'
            }`}>
              {fixture?.fixture?.status?.short === 'FT' ? 'RESULTADO FINAL' : 'ESTADÍSTICAS EN VIVO'}
            </span>
          </div>

          {/* Scoreline context */}
          <div className="flex items-center justify-center gap-6 mb-5">
            <span className="text-sm font-bold text-slate-300">{fixture.teams.home.name}</span>
            <span className="text-2xl font-black font-mono text-white bg-surface-900/80 px-5 py-2 rounded-xl border border-white/10">
              {fixture.goals.home} – {fixture.goals.away}
            </span>
            <span className="text-sm font-bold text-slate-300">{fixture.teams.away.name}</span>
          </div>

          {/* Stats grid */}
          <div className="space-y-3">
            {[
              {
                label: 'Posesión', icon: '⚽',
                home: matchStats.possession.home ? `${matchStats.possession.home}%` : null,
                away: matchStats.possession.away ? `${matchStats.possession.away}%` : null,
                homePct: matchStats.possession.home ? parseFloat(matchStats.possession.home) : 50,
                awayPct: matchStats.possession.away ? parseFloat(matchStats.possession.away) : 50,
                isPercentage: true,
              },
              {
                label: 'Tiros Totales', icon: '🎯',
                home: matchStats.shots.home,
                away: matchStats.shots.away,
                homePct: matchStats.shots.home && matchStats.shots.away ? (parseFloat(matchStats.shots.home) / (parseFloat(matchStats.shots.home) + parseFloat(matchStats.shots.away))) * 100 : 50,
                awayPct: matchStats.shots.home && matchStats.shots.away ? (parseFloat(matchStats.shots.away) / (parseFloat(matchStats.shots.home) + parseFloat(matchStats.shots.away))) * 100 : 50,
              },
              {
                label: 'A Puerta', icon: '🥅',
                home: matchStats.shotsOnTarget.home,
                away: matchStats.shotsOnTarget.away,
                homePct: matchStats.shotsOnTarget.home && matchStats.shotsOnTarget.away ? (parseFloat(matchStats.shotsOnTarget.home) / (parseFloat(matchStats.shotsOnTarget.home) + parseFloat(matchStats.shotsOnTarget.away))) * 100 : 50,
                awayPct: matchStats.shotsOnTarget.home && matchStats.shotsOnTarget.away ? (parseFloat(matchStats.shotsOnTarget.away) / (parseFloat(matchStats.shotsOnTarget.home) + parseFloat(matchStats.shotsOnTarget.away))) * 100 : 50,
              },
              {
                label: 'Córners', icon: '🚩',
                home: matchStats.corners.home,
                away: matchStats.corners.away,
                homePct: matchStats.corners.home && matchStats.corners.away ? (parseFloat(matchStats.corners.home) / (parseFloat(matchStats.corners.home) + parseFloat(matchStats.corners.away))) * 100 : 50,
                awayPct: matchStats.corners.home && matchStats.corners.away ? (parseFloat(matchStats.corners.away) / (parseFloat(matchStats.corners.home) + parseFloat(matchStats.corners.away))) * 100 : 50,
              },
              {
                label: 'Faltas', icon: '🟡',
                home: matchStats.fouls.home,
                away: matchStats.fouls.away,
                homePct: matchStats.fouls.home && matchStats.fouls.away ? (parseFloat(matchStats.fouls.home) / (parseFloat(matchStats.fouls.home) + parseFloat(matchStats.fouls.away))) * 100 : 50,
                awayPct: matchStats.fouls.home && matchStats.fouls.away ? (parseFloat(matchStats.fouls.away) / (parseFloat(matchStats.fouls.home) + parseFloat(matchStats.fouls.away))) * 100 : 50,
              },
            ].filter(row => row.home !== null && row.away !== null).map(({ label, icon, home, away, homePct, awayPct }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-bold text-white font-numbers min-w-[3rem] text-right"
                    style={{ color: homePct >= awayPct ? '#00ff88' : 'rgba(255,255,255,0.7)' }}>
                    {home}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-bold mx-3 w-32 text-center flex items-center justify-center gap-1.5 opacity-60">
                    {icon} {label}
                  </span>
                  <span className="text-[13px] font-bold font-numbers min-w-[3rem] text-left"
                    style={{ color: awayPct > homePct ? '#ff4757' : 'rgba(255,255,255,0.7)' }}>
                    {away}
                  </span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                  <div
                    className="h-full transition-all duration-700 rounded-l-full"
                    style={{ width: `${homePct}%`, background: 'linear-gradient(90deg, #00ff88, #00d97e)' }}
                  />
                  <div
                    className="h-full transition-all duration-700 rounded-r-full"
                    style={{ width: `${awayPct}%`, background: 'linear-gradient(90deg, #ff6b7a, #ff4757)' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Cards & Offsides row */}
          {(matchStats.yellowCards.home !== null || matchStats.redCards.home !== null || matchStats.offsides.home !== null) && (
            <div className="flex gap-3 mt-5 pt-4 border-t border-white/5">
              {matchStats.yellowCards.home !== null && (
                <div className="flex-1 bg-surface-900/60 rounded-lg p-3 text-center border border-yellow-500/10">
                  <div className="flex justify-center items-center gap-2 mb-1">
                    <div className="w-3 h-4 bg-yellow-400 rounded-[2px]" />
                    <span className="text-xs font-black text-white">{matchStats.yellowCards.home}</span>
                    <span className="text-xs text-slate-600">–</span>
                    <span className="text-xs font-black text-white">{matchStats.yellowCards.away}</span>
                  </div>
                  <p className="text-[9px] text-yellow-500/60 uppercase tracking-widest">Amarillas</p>
                </div>
              )}
              {matchStats.redCards.home !== null && (
                <div className="flex-1 bg-surface-900/60 rounded-lg p-3 text-center border border-red-500/10">
                  <div className="flex justify-center items-center gap-2 mb-1">
                    <div className="w-3 h-4 bg-red-600 rounded-[2px]" />
                    <span className="text-xs font-black text-white">{matchStats.redCards.home}</span>
                    <span className="text-xs text-slate-600">–</span>
                    <span className="text-xs font-black text-white">{matchStats.redCards.away}</span>
                  </div>
                  <p className="text-[9px] text-red-500/60 uppercase tracking-widest">Rojas</p>
                </div>
              )}
              {matchStats.offsides.home !== null && (
                <div className="flex-1 bg-surface-900/60 rounded-lg p-3 text-center border border-white/5">
                  <div className="flex justify-center items-center gap-2 mb-1">
                    <span className="text-xs">🚩</span>
                    <span className="text-xs font-black text-white">{matchStats.offsides.home}</span>
                    <span className="text-xs text-slate-600">–</span>
                    <span className="text-xs font-black text-white">{matchStats.offsides.away}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Fueras de Juego</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}



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
            { label: fixture?.teams?.home?.name, logo: fixture?.teams?.home?.logo, cards: analysis.homeCardsAnalysis },
            { label: fixture?.teams?.away?.name, logo: fixture?.teams?.away?.logo, cards: analysis.awayCardsAnalysis },
          ].map(({ label, logo, cards }) => (
            <SECTION key={`cards-${label}`} icon={Shield} title={`Disciplina · ${label}`} id={`cards-${label}`}>
              {cards ? (
                <div className="space-y-4">

                  {/* Team header */}
                  <div className="flex items-center gap-2 mb-1">
                    {logo && <img src={logo} alt={label} className="w-5 h-5 object-contain opacity-80" />}
                    <span className="text-xs text-slate-400 font-semibold">Basado en {cards.matches} partidos</span>
                  </div>

                  {/* Card averages — visual */}
                  <div className="flex items-stretch gap-3">
                    {/* Yellow */}
                    <div className="flex-1 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex flex-col items-center gap-2">
                      <div className="w-7 h-10 bg-yellow-400 rounded-[3px] shadow-[0_0_14px_rgba(250,204,21,0.5)]" />
                      <p className="text-3xl font-black font-mono text-yellow-400 leading-none mt-1">
                        {cards.avgYellow}
                      </p>
                      <p className="text-[10px] text-yellow-500/70 uppercase tracking-widest font-bold text-center">
                        Amarillas<br />por partido
                      </p>
                    </div>

                    {/* Red */}
                    <div className="flex-1 rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex flex-col items-center gap-2">
                      <div className="w-7 h-10 bg-red-600 rounded-[3px] shadow-[0_0_14px_rgba(220,38,38,0.5)]" />
                      <p className="text-3xl font-black font-mono text-red-400 leading-none mt-1">
                        {cards.avgRed}
                      </p>
                      <p className="text-[10px] text-red-500/70 uppercase tracking-widest font-bold text-center">
                        Rojas<br />por partido
                      </p>
                    </div>

                    {/* Total + rating */}
                    <div className="flex-1 rounded-xl border border-white/8 bg-white/3 p-4 flex flex-col items-center justify-center gap-2">
                      <p className="text-3xl font-black font-mono text-white leading-none">{cards.avg}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold text-center">
                        Total<br />tarjetas/p
                      </p>
                      <div className={`mt-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        parseFloat(cards.avg) >= 3 ? 'bg-red-500/20 text-red-400' :
                        parseFloat(cards.avg) >= 2 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-green-500/20 text-green-400'
                      }`}>
                        {parseFloat(cards.avg) >= 3 ? '🔴 Indisciplinado' :
                         parseFloat(cards.avg) >= 2 ? '🟠 Moderado' : '🟢 Limpio'}
                      </div>
                    </div>
                  </div>

                  {/* Probability lines — Yellow */}
                  <div className="bg-surface-800 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest text-center mb-2">
                      🟨 Líneas de Amarillas ({cards.matches} partidos)
                    </p>
                    {[
                      { label: 'Más de 1 amarilla',  pct: Math.round((cards.over1Y / cards.matches) * 100) },
                      { label: 'Más de 2 amarillas', pct: Math.round((cards.over2Y / cards.matches) * 100) },
                      { label: 'Más de 3 amarillas', pct: Math.round((cards.over3Y / cards.matches) * 100) },
                    ].map(({ label, pct }) => (
                      <div key={label} className="flex items-center gap-2">
                        <div className="w-[7px] h-[10px] bg-yellow-400 rounded-[1px] shrink-0" />
                        <span className="text-[11px] text-slate-400 w-32 shrink-0">{label}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              pct >= 70 ? 'bg-yellow-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-yellow-300'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-black text-yellow-500 w-8 text-right">{pct}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Probability lines — Red */}
                  <div className="bg-surface-800 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest text-center mb-2">
                      🟥 Líneas de Rojas ({cards.matches} partidos)
                    </p>
                    {[
                      { label: 'Al menos 1 roja', pct: Math.round((cards.over0R / cards.matches) * 100) },
                    ].map(({ label, pct }) => (
                      <div key={label} className="flex items-center gap-2">
                        <div className="w-[7px] h-[10px] bg-red-600 rounded-[1px] shrink-0" />
                        <span className="text-[11px] text-slate-400 w-32 shrink-0">{label}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              pct >= 30 ? 'bg-red-600' : pct >= 15 ? 'bg-red-500' : 'bg-red-400/60'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-black text-red-500 w-8 text-right">{pct}%</span>
                      </div>
                    ))}
                    <p className="text-[9px] text-slate-600 text-center mt-1">
                      En {cards.over0R} de {cards.matches} partidos recibió al menos 1 tarjeta roja · Máx: {cards.maxRed}
                    </p>
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
                  
                  <div className="bg-surface-800 rounded-lg p-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest text-center mb-3">Líneas de Córners (Basado en {corners.matches} partidos)</p>
                    <div className="grid grid-cols-3 gap-2">
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-green-500">{Math.round((corners.over3/corners.matches)*100)}%</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">Más de 3</p>
                       </div>
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-amber-500">{Math.round((corners.over4/corners.matches)*100)}%</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">Más de 4</p>
                       </div>
                       <div className="bg-white/5 rounded px-2 py-2 text-center">
                          <p className="text-sm font-black text-red-500">{Math.round((corners.over5/corners.matches)*100)}%</p>
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

      {/* ── PREDICCIÓN EXTERNA ── */}
      {prediction && (
        <SECTION icon={Target} title="Predicción Externa" id="prediction">
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
