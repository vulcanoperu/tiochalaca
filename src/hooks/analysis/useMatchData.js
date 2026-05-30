import { useState, useEffect, useCallback, useRef } from 'react';
import {
  calculateFormScore, calculateOverUnder, analyzeGoalsByTimeSlot,
  analyzeH2H, generatePicks, calcMatchProbabilities,
} from '../../services/analysisEngine';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export function useMatchData(fixtureId) {
  const [fixture, setFixture] = useState(null);
  const [homeMatches, setHomeMatches] = useState([]);
  const [awayMatches, setAwayMatches] = useState([]);
  const [h2hMatches, setH2HMatches] = useState([]);
  const [injuries, setInjuries] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [picksResult, setPicksResult] = useState(null);
  const [livePicksResult, setLivePicksResult] = useState(null);
  const [matchStats, setMatchStats] = useState(null);

  const sentAlertsRef = useRef(new Set());
  const baseRef = useRef(null);
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const [isLiveMatch, setIsLiveMatch] = useState(false);
  const [tick, setTick] = useState(0);

  const parseLiveStatus = useCallback((statusObj, state) => {
    const rawDisplay = statusObj?.displayClock || '0:00';
    const period = statusObj?.period ?? 1;
    const description = statusObj?.type?.description || '';
    const descLower = description.toLowerCase();
    const isHalftime = state === 'in' && (
      descLower === 'halftime' ||
      descLower === 'half time' ||
      descLower === 'half-time' ||
      descLower.includes('entretiempo') ||
      (descLower.includes('half') && !descLower.includes('1st') && !descLower.includes('2nd') && !descLower.includes('first') && !descLower.includes('second'))
    );
    const parts = rawDisplay.split(':');
    const clockMins = parseInt(parts[0]) || 0;
    const clockSecs = parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
    const hasSeconds = parts.length > 1;

    const elapsedSec = state === 'in' && !isHalftime ? clockMins * 60 + clockSecs : null;
    const short = state === 'post' ? 'FT' : state === 'in' ? (isHalftime ? 'HT' : 'LIVE') : 'NS';
    return { short, long: description, rawDisplay, period, isHalftime, elapsedSec, hasSeconds };
  }, []);

  const extractCorners = useCallback((summaryData) => {
    const teams = summaryData?.boxscore?.teams || [];
    if (!teams[0]?.statistics) return null;
    const homeStat = teams.find(t => t.homeAway === 'home')?.statistics?.find(s => s.name === 'wonCorners')?.displayValue || '0';
    const awayStat = teams.find(t => t.homeAway === 'away')?.statistics?.find(s => s.name === 'wonCorners')?.displayValue || '0';
    return { home: parseInt(homeStat), away: parseInt(awayStat) };
  }, []);

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

  const SESSION_KEY = `chalaca_analysis_v3_${fixtureId}`;
  const SESSION_TTL_LIVE = 5 * 60 * 1000;
  const SESSION_TTL_DONE = 4 * 60 * 60 * 1000;
  const IS_DEV = import.meta.env.DEV === true;

  const fetchAll = useCallback(async () => {
    if (!fixtureId) return;
    setError(null);

    if (!IS_DEV) {
      try {
        const cached = sessionStorage.getItem(SESSION_KEY);
        if (cached) {
          const { ts, fixture: f, homeMatches: hm, awayMatches: am, h2hMatches: h2h,
                  injuries: inj, events: evs, analysis: an, picksResult: pr,
                  livePicksResult: lpr, isLiveMatch: ilm, elapsedSec } = JSON.parse(cached);
          
          const statusShort = f?.fixture?.status?.short;
          let ttl = SESSION_TTL_DONE;
          if (ilm || statusShort === 'LIVE' || statusShort === 'HT') ttl = SESSION_TTL_LIVE;
          else if (statusShort === 'NS') ttl = 30 * 1000;

          if (Date.now() - ts < ttl) {
            setFixture(f); setHomeMatches(hm); setAwayMatches(am); setH2HMatches(h2h); setLivePicksResult(lpr || null);
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
            return;
          }
        }
      } catch (_) {}
    }

    setLoading(true);
    try {
      const summaryRes = await fetch(`${BACKEND_URL}/api/espn/match/${fixtureId}/summary?_t=${Date.now()}`, { cache: 'no-store' });
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
        league: { name: summary.header.league?.name || "Liga", id: summary.header.league?.id || "0" },
        city: summary.gameInfo?.venue?.address?.city || null,
        venue: summary.gameInfo?.venue?.fullName || summary.gameInfo?.venue?.address?.city || null,
        referee: summary.gameInfo?.officials?.[0]?.fullName || summary.header?.competitions?.[0]?.officials?.[0]?.fullName || summary.officials?.[0]?.fullName || summary.boxscore?.officials?.[0]?.fullName || null,
        teams: {
          home: { id: homeId, name: homeComp.team.name, logo: homeComp.team.logos?.[0]?.href },
          away: { id: awayId, name: awayComp.team.name, logo: awayComp.team.logos?.[0]?.href }
        },
        goals: { home: getScore(homeComp), away: getScore(awayComp) },
        corners: extractCorners(summary)
      };
      setFixture(fix);

      const stats = extractMatchStats(summary);
      if (stats) setMatchStats(stats);
      else setMatchStats(null);

      if (parsed.elapsedSec !== null) {
        baseRef.current = { serverSec: parsed.elapsedSec, startedAt: Date.now() };
        setIsLiveMatch(true);
      } else {
        baseRef.current = null;
        setIsLiveMatch(false);
      }

      setLoading(false);
      setLoadingAnalysis(true);

      const analysisRes = await fetch(`${BACKEND_URL}/api/espn/match/${fixtureId}/analysis`);
      if (!analysisRes.ok) throw new Error('Error al procesar el análisis del partido');
      const { data: ad } = await analysisRes.json();

      const hm = ad.homeMatches;
      const am = ad.awayMatches;
      const h2h = ad.h2h;

      setHomeMatches(hm); setAwayMatches(am); setH2HMatches(h2h);
      setInjuries(ad.injuries); setEvents(ad.currentEvents);

      const isCupMatch = /cup|copa|taça|pokal|coppa|libertadores|sudamericana|conmebol|champions|europa|conference/i.test(fix.league?.name || '');
      const homeForm = calculateFormScore(hm, homeId, null, isCupMatch);
      const awayForm = calculateFormScore(am, awayId, null, isCupMatch);
      const homeFormAtHome = calculateFormScore(hm, homeId, 'home', isCupMatch);
      const awayFormAway = calculateFormScore(am, awayId, 'away', isCupMatch);
      const homeSplit = calculateOverUnder(hm, homeId);
      const awaySplit = calculateOverUnder(am, awayId);
      const h2hData = analyzeH2H(h2h, homeId, awayId);
      const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
      const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);

      const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
      const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
      const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
      const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
      const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA, fix?.league?.name || '');

      const isLive = summary.header?.competitions?.[0]?.status?.type?.state === 'in';
      const liveClock = summary.header?.competitions?.[0]?.status?.displayClock || "0'";
      const liveHomeGoals = parseInt(homeComp?.score ?? 0);
      const liveAwayGoals = parseInt(awayComp?.score ?? 0);

      const calcRest = (matches) => {
        if (!matches?.length) return null;
        const lastDate = matches[0]?.fixture?.date;
        if (!lastDate) return null;
        return Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000);
      };

      const engineBaseArgs = {
        homeStats: null, awayStats: null, h2hData, homeForm, awayForm,
        homeSplitStats: homeSplit, awaySplitStats: awaySplit, marketInsight: ad.marketInsight,
        homeCornersData: ad.homeCornersData, awayCornersData: ad.awayCornersData,
        homeCardsData: ad.homeCardsData, awayCardsData: ad.awayCardsData,
        homeSlots, awaySlots, homeFormAtHome, awayFormAway, poissonProbs: poisson,
        injuries: ad.injuries, homeTeamName: fix.teams.home.name, awayTeamName: fix.teams.away.name,
        leagueName: fix.league.name, homeRestDays: calcRest(hm), awayRestDays: calcRest(am),
        homeHistory: hm, awayHistory: am, city: fix.city, marketOdds: ad.marketOdds,
        matchStandings: ad.matchStandings, advancedStats: ad.advancedStats, refereeStats: ad.refereeStats,
      };

      const picksRes = generatePicks({ ...engineBaseArgs, isLive: false, liveClock: "0'", liveHomeGoals: 0, liveAwayGoals: 0 });
      let liveRes = null;
      if (isLive) liveRes = generatePicks({ ...engineBaseArgs, isLive: true, liveClock, liveHomeGoals, liveAwayGoals });

      const analysisObj = {
        homeForm, awayForm, homeFormAtHome, awayFormAway, homeSplit, awaySplit, h2hData, poisson,
        homeSlots, awaySlots, homeCardsAnalysis: ad.homeCardsData, awayCardsAnalysis: ad.awayCardsData,
        homeCornersAnalysis: ad.homeCornersData, awayCornersAnalysis: ad.awayCornersData, marketInsight: ad.marketInsight,
      };
      setAnalysis(analysisObj);
      setPicksResult(picksRes);
      setLivePicksResult(liveRes);

      if (isLive && liveRes && liveRes.picks?.length > 0) {
        const livePicks = liveRes.picks.filter(p => p.market?.toLowerCase()?.includes('vivo') || p.tier === '🔥');
        const newAlerts = [];
        livePicks.forEach(pick => {
           const alertId = `${fixtureId}_${pick.selection}`;
           if (!sentAlertsRef.current.has(alertId)) {
             sentAlertsRef.current.add(alertId);
             newAlerts.push({
               fixture_id: fixtureId, home_team: fix.teams.home.name, away_team: fix.teams.away.name,
               league: fix.league.name, minute: parseInt(liveClock) || 0, score: `${liveHomeGoals}-${liveAwayGoals}`,
               market: pick.market, selection: pick.selection, probability: pick.probability, created_at: new Date().toISOString()
             });
           }
        });
        if (newAlerts.length > 0) {
          fetch(`${BACKEND_URL}/api/live-alerts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alerts: newAlerts })
          }).catch(err => console.error('Error sending live alerts:', err));
        }
      }

      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          ts: Date.now(), fixture: fix, homeMatches: hm, awayMatches: am, h2hMatches: h2h,
          injuries: ad.injuries, events: ad.currentEvents, analysis: analysisObj, picksResult: picksRes,
          livePicksResult: liveRes, isLiveMatch: isLive, elapsedSec: parsed.elapsedSec,
        }));
      } catch (_) {}

    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar el análisis.');
    } finally {
      setLoading(false);
      setLoadingAnalysis(false);
    }
  }, [fixtureId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const pollLiveStatus = useCallback(async () => {
    if (!fixtureId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/espn/match/${fixtureId}/summary?_t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const comp = data.header?.competitions?.[0];
      if (!comp) return;
      const statusObj = comp.status;
      const state = statusObj?.type?.state;
      const parsed = parseLiveStatus(statusObj, state);
      const homeComp = comp.competitors?.find(c => c.homeAway === 'home');
      const awayComp = comp.competitors?.find(c => c.homeAway === 'away');
      const getScore = c => parseInt(c?.score ?? 0);

      setFixture(prev => prev ? ({
        ...prev,
        fixture: {
          ...prev.fixture, status: { short: parsed.short, long: parsed.long },
          isHalftime: parsed.isHalftime, livePeriod: parsed.period,
        },
        goals: { home: getScore(homeComp), away: getScore(awayComp) },
        corners: extractCorners(data) || prev.corners,
      }) : prev);

      const liveStats = extractMatchStats(data);
      if (liveStats) setMatchStats(liveStats);

      if (parsed.elapsedSec !== null) {
        if (!parsed.hasSeconds && baseRef.current) {
           const currentExpectedMins = Math.floor(baseRef.current.serverSec / 60);
           const newMins = Math.floor(parsed.elapsedSec / 60);
           if (currentExpectedMins !== newMins) baseRef.current = { serverSec: parsed.elapsedSec, startedAt: Date.now() };
        } else {
           baseRef.current = { serverSec: parsed.elapsedSec, startedAt: Date.now() };
        }
        setIsLiveMatch(true);
      } else {
        baseRef.current = null;
        setIsLiveMatch(false);
        if (parsed.short === 'FT') {
          clearInterval(pollRef.current); clearInterval(timerRef.current);
          pollRef.current = null; timerRef.current = null;
        }
      }
    } catch (_) {}
  }, [fixtureId, parseLiveStatus, extractMatchStats, extractCorners]);

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const status = fixture?.fixture?.status?.short;
    if (status === 'LIVE' || status === 'HT') {
      pollLiveStatus();
      pollRef.current = setInterval(pollLiveStatus, 15_000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fixture?.fixture?.status?.short, pollLiveStatus]);

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (isLiveMatch && baseRef.current) {
      setTick(t => t + 1);
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [isLiveMatch]);

  return {
    fixture, homeMatches, awayMatches, h2hMatches, injuries, events,
    loading, loadingAnalysis, error, analysis, picksResult, livePicksResult, matchStats, fetchAll
  };
}
