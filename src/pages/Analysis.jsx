import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, AlertCircle, CheckCircle2,
  Shield, Target, Clock, BarChart2, Users, Zap, Activity,
  TrendingUp, AlertTriangle, ChevronDown, ChevronUp
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
  const [activeTab, setActiveTab] = useState('summary');
  const [activeRiskTab, setActiveRiskTab] = useState('altoValor');
  const [showPro, setShowPro] = useState(false);

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
  const SESSION_KEY = `chalaca_analysis_v3_${fixtureId}`; // v3: fuerza recarga limpia
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
      const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA, fix?.league?.name || '');

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

  // ── Verdict logic ─────────────────────────────────────────────────────
  const topPick = picksResult?.picks?.[0] || null;
  const confidence = topPick ? (
    topPick.probability >= 80 ? 'high' :
    topPick.probability >= 65 ? 'medium' : 'low'
  ) : 'none';

  const confidenceConfig = {
    high:   { label: 'Confianza Alta',   color: '#00ff88', bg: 'rgba(0,255,136,0.06)', border: 'rgba(0,255,136,0.20)', emoji: '🟢' },
    medium: { label: 'Confianza Media',  color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.20)', emoji: '🟡' },
    low:    { label: 'Confianza Baja',   color: '#ef4444', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.20)',  emoji: '🔴' },
    none:   { label: 'Sin Ventaja',      color: '#64748b', bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.20)', emoji: '⚪' },
  };
  const cc = confidenceConfig[confidence];

  return (
    <div className="w-full space-y-4 animate-fade-in">

      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2 border border-surface-600">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="section-title">Análisis del Partido</p>
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

      {/* Match hero — compact */}
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

      {/* ════════════════════════════════════════════════════════════════════
           PICKS AGRUPADOS (Senior-friendly)
         ════════════════════════════════════════════════════════════════════ */}
      {!showPro && !loadingAnalysis && picksResult?.picks?.length > 0 && (() => {
        const allPicks = [...picksResult.picks];
        
        const sortByOddsAndProb = (a, b) => {
          const oddsA = parseFloat(a.odds) || 0;
          const oddsB = parseFloat(b.odds) || 0;
          if (oddsB !== oddsA) return oddsB - oddsA;
          return (b.probability || 0) - (a.probability || 0);
        };

        // Helper: un 💎 SNIPER con cuota baja es un Banker, no un Value Bet
        const isRealValueBet = (p) => {
          const odds = parseFloat(p.odds) || 0;
          // 💎 con cuota baja (<1.50) y alta prob (>=78%) → es BANKER/SNIPER, no valor
          if (p.tier === '💎' && odds > 0 && odds < 1.50 && p.probability >= 78) return false;
          return p.category === 'valor' || p.tier === '💎';
        };

        // Tab 1: "Apuestas de Alto Valor" — value bets reales + cuotas >= 1.50
        const valueBets = allPicks
          .filter(p => isRealValueBet(p))
          .sort(sortByOddsAndProb);
        const highOddsPicks = allPicks
          .filter(p => !isRealValueBet(p) && (parseFloat(p.odds) || 0) >= 1.50)
          .sort(sortByOddsAndProb);
        const altoValor = [...valueBets, ...highOddsPicks];

        // Tab 2: "Apuestas Más Seguras" — cuota < 1.50 O bankers SNIPER con cuota baja
        const seguras = allPicks
          .filter(p => !isRealValueBet(p) && (parseFloat(p.odds) || 0) < 1.50)
          .sort((a, b) => (b.probability || 0) - (a.probability || 0));

        const tabs = [
          { key: 'altoValor', label: '🔥 Alto Valor', count: altoValor.length },
          { key: 'seguras', label: '🛡️ Más Seguras', count: seguras.length },
        ];
        const activePicks = activeRiskTab === 'altoValor' ? altoValor : seguras;
        const isAltoValor = activeRiskTab === 'altoValor';

        return (
          <div className="mt-4 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Tab switcher (Senior-friendly: large, readable) */}
            <div className="flex gap-3">
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => setActiveRiskTab(tab.key)}
                  className={`flex-1 py-4 rounded-2xl text-base md:text-lg font-bold transition-all duration-300 ${
                    activeRiskTab === tab.key
                      ? tab.key === 'altoValor'
                        ? 'bg-amber-500 text-black shadow-lg shadow-yellow-500/20'
                        : 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                      : 'bg-surface-800 border border-white/10 text-slate-400 hover:text-white'
                  }`}>
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {/* Cards list — Senior-friendly (1 column on mobile, 2 on desktop, flexible height) */}
            {activePicks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {activePicks.map((pick, i) => (
                  <div key={`pick-${i}`}>
                    {/* Separador entre value bets y high-odds picks */}
                    {isAltoValor && i === valueBets.length && valueBets.length > 0 && (
                      <div className="flex items-center gap-4 px-2 py-3 mb-2">
                        <span className="text-sm font-bold text-yellow-400/80">⚡ Cuotas Atractivas</span>
                        <div className="flex-1 h-px bg-yellow-400/20" />
                      </div>
                    )}
                    
                    <div className={`rounded-3xl p-8 sm:p-10 flex flex-col gap-6 border transition-all cursor-default ${
                        isAltoValor
                          ? 'bg-surface-900/60 border-yellow-500/20'
                          : 'bg-surface-900/60 border-emerald-500/20'
                      }`}
                    >
                      {/* Top: Cuota y Probabilidad grandes */}
                      <div className="flex justify-between items-center bg-black/10 p-4 rounded-2xl border border-white/5">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-500 font-bold mb-1">Cuota</span>
                          <span className={`text-5xl font-black tracking-tight ${isAltoValor ? 'text-yellow-400' : 'text-emerald-400'}`}>
                            {pick.odds || '—'}
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-sm text-slate-500 font-bold mb-1">Confianza</span>
                          <span className="text-4xl font-black text-white tracking-tight">{pick.probability}%</span>
                        </div>
                      </div>

                      {/* Middle: Selección, Mercado y Narrativa */}
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

                      {/* Bottom: Riesgo y botón grande */}
                      <div className="flex flex-wrap items-center justify-between gap-4 mt-2 pt-5 border-t border-white/5">
                        <span className={`text-sm px-4 py-2 rounded-xl font-bold ${
                          pick.risk === 'Bajo' ? 'bg-emerald-500/10 text-emerald-400'
                          : pick.risk === 'Moderado' ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                        }`}>Riesgo: {pick.risk}</span>
                        
                        <button onClick={() => saveIndividualPick(pick)}
                          className={`flex-1 sm:flex-none px-6 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
                            isAltoValor
                              ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-black border border-yellow-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black border border-emerald-500/30'
                          }`}>
                          <CheckCircle2 size={20} />
                          Guardar Apuesta
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 rounded-2xl bg-surface-900 border border-white/10">
                <p className="text-lg text-slate-400">No hay apuestas en esta categoría para este partido.</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════════
           TIER 2 — MODO PROFESIONAL (colapsable)
         ════════════════════════════════════════════════════════════════════ */}
      <button
        onClick={() => setShowPro(!showPro)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300 group"
      >
        <BarChart2 size={16} className="text-slate-500 group-hover:text-accent-green transition-colors" />
        <span className="text-sm font-bold text-slate-400 group-hover:text-white transition-colors">
          {showPro ? 'Ocultar Datos Profesionales' : 'Ver Datos Profesionales'}
        </span>
        {showPro ? (
          <ChevronUp size={16} className="text-slate-500 group-hover:text-white transition-colors" />
        ) : (
          <ChevronDown size={16} className="text-slate-500 group-hover:text-white transition-colors" />
        )}
      </button>

      {showPro && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-3 duration-400">
          
          <div className="text-center py-2 px-4 rounded-lg bg-black/40 border border-white/5 mb-4">
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              Fuentes de datos activas: <span className="text-slate-300">ESPN Analytics</span> (Estadísticas, Eventos) y <span className="text-slate-300">BSD Consensus</span> (Cuotas).
            </p>
          </div>



          {/* ── Forma ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { team: fixture?.teams?.home, form: homeForm, matches: homeMatches, split: homeSplit, teamId: homeId },
              { team: fixture?.teams?.away, form: awayForm, matches: awayMatches, split: awaySplit, teamId: awayId },
            ].map(({ team, form, matches, split, teamId }) => (
              <SECTION key={teamId} icon={BarChart2} title={`Forma · ${team?.name}`} id={`form-${teamId}`}>
                <div className="space-y-3">
                  <div className="mb-4">
                    <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">Últimos {Math.min(matches?.length ?? 0, 12)} partidos</p>
                    <FormPills matches={matches} teamId={teamId} />
                  </div>
                </div>
              </SECTION>
            ))}
          </div>

          {/* ── Mercado de Goles (Over/Under) ── */}
          {(homeSplit || awaySplit) && (
            <SECTION icon={Target} title="Mercado de Goles (Tendencia)" id="goals-market">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: fixture?.teams?.home?.name, split: homeSplit, form: homeForm },
                  { label: fixture?.teams?.away?.name, split: awaySplit, form: awayForm },
                ].map(({ label, split, form }) => split && (
                  <div key={`goals-${label}`} className="p-4 border border-white/5 bg-black/20 rounded-xl">
                    <p className="text-sm font-bold text-white mb-3 text-center">{label}</p>
                    
                    <div className="flex justify-between items-center bg-white/5 p-2 rounded mb-2">
                      <span className="text-xs text-slate-400">Promedio Goles / Partido</span>
                      <span className="text-sm font-bold text-accent-green">
                        {form?.total > 0 ? ((form.goalsFor + form.goalsAgainst) / form.total).toFixed(1) : '-'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-white/5 p-2 rounded mb-3">
                      <span className="text-xs text-slate-400">Ambos Anotan (BTTS)</span>
                      <span className="text-sm font-bold" style={{ color: (split.bttsPct >= 60) ? '#00ff88' : '#f59e0b' }}>
                        {split.bttsPct ?? 0}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col items-center bg-white/5 p-2 rounded">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">+1.5 Goles</span>
                        <span className="text-base font-bold text-white">{split.over15Pct ?? 0}%</span>
                      </div>
                      <div className="flex flex-col items-center bg-white/5 p-2 rounded">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">+2.5 Goles</span>
                        <span className="text-base font-bold" style={{ color: (split.over25Pct >= 60) ? '#00ff88' : '#f59e0b' }}>
                          {split.over25Pct ?? 0}%
                        </span>
                      </div>
                      <div className="flex flex-col items-center bg-white/5 p-2 rounded">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">+3.5 Goles</span>
                        <span className="text-base font-bold text-slate-300">{split.over35Pct ?? 0}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SECTION>
          )}

          {/* ── H2H ── */}
          <SECTION icon={Users} title="H2H · Historial" id="h2h">
            <H2HTable matches={h2hMatches} homeId={homeId} awayId={awayId} />
          </SECTION>

          {/* ── Disciplina ── */}
          {(analysis?.homeCardsAnalysis || analysis?.awayCardsAnalysis) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: fixture?.teams?.home?.name, cards: analysis.homeCardsAnalysis },
                { label: fixture?.teams?.away?.name, cards: analysis.awayCardsAnalysis },
              ].map(({ label, cards }) => cards && (
                <SECTION key={`cards-${label}`} icon={Shield} title={`Tarjetas · ${label}`} id={`cards-${label}`}>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded mb-1">
                    <span className="text-xs text-slate-400">Media por partido</span>
                    <span className="text-sm font-bold text-amber-500">{cards?.avg}</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded">
                    <span className="text-xs text-slate-400">Partidos con +3 tarjetas</span>
                    <span className="text-sm font-bold text-red-400">{cards?.over3 ?? '-'}</span>
                  </div>
                </SECTION>
              ))}
            </div>
          )}

          {/* ── Tiros de Esquina ── */}
          {(analysis?.homeCornersAnalysis || analysis?.awayCornersAnalysis) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: fixture?.teams?.home?.name, corners: analysis.homeCornersAnalysis },
                { label: fixture?.teams?.away?.name, corners: analysis.awayCornersAnalysis },
              ].map(({ label, corners }) => corners && (
                <SECTION key={`corners-${label}`} icon={Target} title={`Córners a favor · ${label}`} id={`corners-${label}`}>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded mb-1">
                    <span className="text-xs text-slate-400">Media por partido</span>
                    <span className="text-sm font-bold text-accent-green">{corners?.avg}</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded">
                    <span className="text-xs text-slate-400">Partidos con +4 córners</span>
                    <span className="text-sm font-bold text-white">{corners?.over4 ?? '-'}</span>
                  </div>
                </SECTION>
              ))}
            </div>
          )}

          {/* ── Goles por tiempo ── */}
          {(analysis?.homeSlots?.some(s => s.goals > 0) || analysis?.awaySlots?.some(s => s.goals > 0)) && (
            <SECTION icon={Clock} title="Goles por tiempo" id="goals-time">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <GoalTimeline slots={analysis.homeSlots} teamName={fixture?.teams?.home?.name} />
                <GoalTimeline slots={analysis.awaySlots} teamName={fixture?.teams?.away?.name} />
              </div>
            </SECTION>
          )}

          {/* ── Lesiones ── */}
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

        </div>
      )}

    </div>
  );
}
