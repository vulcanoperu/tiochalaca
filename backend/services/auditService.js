const supabase = require('../database');
const logger = require('../utils/logger');
const { axiosInstance, ALLOWED_LEAGUES, getMatchSummary } = require('../adapters/espnAdapter');
const { computeMatchAnalysis } = require('./matchAnalysis');
const { loadEngine } = require('./engineBridge');

/**
 * Evalúa si un pick individual fue acertado contra el resultado real.
 */
function evaluatePick(pick, homeScore, awayScore, totalGoals, totalCorners, totalCards, totalYellow, totalRed) {
  const p = pick;

  if (p.market === 'Ganador del Partido') {
    if ((p.selection === 'Victoria Local' || p.selection.includes('Local -0.5')) && homeScore > awayScore) return true;
    if ((p.selection === 'Victoria Visitante' || p.selection.includes('Visitante -0.5')) && awayScore > homeScore) return true;
    if (p.selection === 'Empate' && homeScore === awayScore) return true;
    return false;
  }
  if (p.market === 'Handicap Asiático') {
    if (p.selection.includes('Local') && homeScore > awayScore) return true;
    if (p.selection.includes('Visitante') && awayScore > homeScore) return true;
    return false;
  }
  if (p.market === 'Total de Goles') {
    const threshold = parseFloat(p.selection.split(' ')[2]);
    if (p.selection.includes('Más') && totalGoals > threshold) return true;
    if (p.selection.includes('Menos') && totalGoals < threshold) return true;
    return false;
  }
  if (p.market === 'Ambos Marcan') {
    const btts = homeScore > 0 && awayScore > 0;
    if (p.selection.includes('Sí') && btts) return true;
    if (p.selection.includes('No') && !btts) return true;
    return false;
  }
  if (p.market === 'Doble Oportunidad') {
    if (p.selection.includes('1X') && homeScore >= awayScore) return true;
    if (p.selection.includes('X2') && awayScore >= homeScore) return true;
    if (p.selection.includes('12') && homeScore !== awayScore) return true;
    return false;
  }
  if (p.market === 'Combo') {
    const btts = homeScore > 0 && awayScore > 0;
    if (p.selection === 'Ambos Marcan + Más de 2.5') return btts && totalGoals > 2.5;
    return false;
  }
  if (p.market === 'Córners Totales') {
    if (totalCorners === 0) return false;
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
    if (m) {
      const isOver = m[1] === 'Más', th = parseFloat(m[2]);
      if (isOver && totalCorners > th) return true;
      if (!isOver && totalCorners < th) return true;
    }
    return false;
  }
  if (p.market === 'Tarjetas Totales') {
    if (totalCards === 0 && totalYellow === 0) return false;
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
    if (m) {
      const isOver = m[1] === 'Más', th = parseFloat(m[2]);
      const subject = p.selection.toLowerCase().includes('amarilla') ? totalYellow :
                      p.selection.toLowerCase().includes('roja') ? totalRed : totalCards;
      if (isOver && subject > th) return true;
      if (!isOver && subject < th) return true;
    }
    return false;
  }
  if (p.market === 'Gol por Tramo') {
    return totalGoals > 0;
  }
  if (p.market === 'Goles en Vivo (1T)') {
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*) goles/);
    if (m) {
      const isOver = m[1] === 'Más', th = parseFloat(m[2]);
      if (isOver && th <= 0.5 && totalGoals > 0) return true;
      if (!isOver && th >= 2.5 && totalGoals <= 1) return true;
    }
    return false;
  }
  if (p.market === 'Estrategia en Vivo' || p.market === 'Goles en Vivo') {
    if (p.selection.includes('Más') || p.selection.includes('Menos')) {
      const match = p.selection.match(/(Más|Menos) de (\d+\.?\d*) goles/);
      if (match) {
        const isOver = match[1] === 'Más', threshold = parseFloat(match[2]);
        if (isOver && totalGoals > threshold) return true;
        if (!isOver && totalGoals < threshold) return true;
        return false;
      }
      return totalGoals > 0;
    }
    if (p.selection.includes('2do Tiempo') || p.selection.includes('Segundo Tiempo')) return totalGoals > 0;
    if (p.selection.includes('1er Tiempo') || p.selection.includes('Primer Tiempo')) return totalGoals > 0;
    if (p.selection.includes('Local') && homeScore > awayScore) return true;
    if (p.selection.includes('Visitante') && awayScore > homeScore) return true;
    if ((p.selection.includes('1X') || p.selection.includes('Remontada Local')) && homeScore >= awayScore) return true;
    if ((p.selection.includes('X2') || p.selection.includes('Remontada Visitante')) && awayScore >= homeScore) return true;
    return false;
  }
  if (p.market === 'Resultado en Vivo') {
    if ((p.selection.includes('Local') || p.selection.includes('1X')) && homeScore >= awayScore) return true;
    if ((p.selection.includes('Visitante') || p.selection.includes('X2')) && awayScore >= homeScore) return true;
    if (p.selection.includes('Empate') && homeScore === awayScore) return true;
    return false;
  }
  return false;
}

async function runDailyAudit(date, forceRefresh = false) {
  const auditCacheKey = `audit_${date}`;
  if (!forceRefresh) {
    try {
      const { data: cached } = await supabase.from('analysis_cache').select('data').eq('event_id', auditCacheKey).single();
      if (cached && cached.data) {
        const dateParam = date.replace(/-/g, '');
        let espnTotalFinished = 0;
        try {
          const espnChecks = await Promise.allSettled(
            Object.keys(ALLOWED_LEAGUES).map(l =>
              axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${dateParam}&limit=50`, { timeout: 4000 })
                .then(r => r.data?.events?.filter(e => e.competitions?.[0]?.status?.type?.state === 'post').length || 0)
                .catch(() => 0)
            )
          );
          espnTotalFinished = espnChecks.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
        } catch (_) {}

        const cachedAnalyzedCount = cached.data.totalMatches || 0;
        if (espnTotalFinished <= cachedAnalyzedCount) {
          logger.info('audit', `Caché válido para ${date}: ${cachedAnalyzedCount} partidos cacheados vs ${espnTotalFinished} ESPN terminados`);
          return { fromCache: true, data: cached.data };
        } else {
          logger.info('audit', `Caché OBSOLETO para ${date}: ${cachedAnalyzedCount} cacheados vs ${espnTotalFinished} ESPN terminados → recalculando`);
        }
      }
    } catch (_) {}
  }

  const engine = await loadEngine();
  if (!engine) throw new Error('No se pudo cargar el motor de análisis');

  let snapshots = [];
  try {
    const { data } = await supabase.from('daily_snapshots').select('*').eq('snapshot_date', date);
    if (data) snapshots = data;
  } catch (e) {
    logger.warn('audit', 'No se pudieron cargar daily_snapshots: ' + e.message);
  }

  const dateParam = date.replace(/-/g, '');
  const requests = Object.keys(ALLOWED_LEAGUES).map(l =>
    axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${dateParam}&limit=50`, { timeout: 15000 })
      .then(r => ({ slug: l, data: r.data }))
      .catch((e) => {
        console.error(`Error fetching league ${l}:`, e.message);
        return null;
      })
  );
  const results = await Promise.allSettled(requests);

  let allFixtures = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value?.data?.events) continue;
    const { slug, data } = r.value;
    const leagueInfo = data.leagues?.[0];
    data.events.forEach(e => {
      const comp = e.competitions?.[0];
      const home = comp?.competitors?.find(c => c.homeAway === 'home');
      const away = comp?.competitors?.find(c => c.homeAway === 'away');
      const statusObj = comp?.status || e.status;
      const state = statusObj?.type?.state;
      if (state !== 'post') return;
      const getScore = c => {
        if (!c) return null;
        if (c.score?.value !== undefined) return parseInt(c.score.value);
        if (c.score !== undefined) return parseInt(c.score);
        return null;
      };
      allFixtures.push({
        fixture: { id: e.id, date: e.date, status: { short: 'FT' } },
        league: { id: slug, name: ALLOWED_LEAGUES[slug], logo: leagueInfo?.logos?.[0]?.href || '' },
        teams: {
          home: { id: home?.id, name: home?.team?.displayName || home?.team?.name, logo: home?.team?.logo },
          away: { id: away?.id, name: away?.team?.displayName || away?.team?.name, logo: away?.team?.logo },
        },
        goals: { home: getScore(home), away: getScore(away) },
      });
    });
  }

  let totalPicks = 0, hits = 0, misses = 0, skippedMatches = 0;
  let matchReports = [];
  let processErrors = [];
  let usedSnapshots = 0;

  const processMatch = async (f) => {
    try {
      const eventId = f.fixture.id;
      const homeScore = parseInt(f.goals.home);
      const awayScore = parseInt(f.goals.away);
      if (isNaN(homeScore) || isNaN(awayScore)) return;
      const totalGoals = homeScore + awayScore;

      let picks = [];
      const snapshot = snapshots.find(s => s.event_id === String(eventId));
      let analysisData = null;
      let summary = null;

      if (snapshot && Array.isArray(snapshot.predictions)) {
        picks = snapshot.predictions;
        usedSnapshots++;
        summary = await getMatchSummary(eventId);
      } else {
        const [analysisResult, summaryRes] = await Promise.all([
          computeMatchAnalysis(eventId),
          getMatchSummary(eventId),
        ]);
        analysisData = analysisResult.data;
        summary = summaryRes;
        if (!analysisData) return;

        const homeId = f.teams.home.id;
        const awayId = f.teams.away.id;
        const hm = analysisData.homeMatches || [];
        const am = analysisData.awayMatches || [];

        const homeForm = engine.calculateFormScore(hm, homeId);
        const awayForm = engine.calculateFormScore(am, awayId);
        const homeFormAtHome = engine.calculateFormScore(hm, homeId, 'home');
        const awayFormAway = engine.calculateFormScore(am, awayId, 'away');
        const homeSplit = engine.calculateOverUnder(hm, homeId);
        const awaySplit = engine.calculateOverUnder(am, awayId);
        const h2hData = engine.analyzeH2H(analysisData.h2h || [], homeId, awayId);
        const homeSlots = engine.analyzeGoalsByTimeSlot(analysisData.homeHistEvs || [], homeId);
        const awaySlots = engine.analyzeGoalsByTimeSlot(analysisData.awayHistEvs || [], awayId);

        const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
        const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
        const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
        const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
        const poissonProbs = engine.calcMatchProbabilities(hGF, hGA, aGF, aGA, f.league.name || '');

        const city = summary?.gameInfo?.venue?.address?.city || '';
        const calcRest = (matches) => {
          if (!matches?.length) return null;
          const lastDate = matches[0]?.fixture?.date;
          if (!lastDate) return null;
          const matchDate = new Date(f.fixture.date);
          return Math.floor((matchDate - new Date(lastDate)) / (1000 * 60 * 60 * 24));
        };

        const picksResult = engine.generatePicks({
          homeStats: null, awayStats: null,
          homeForm, awayForm, homeFormAtHome, awayFormAway,
          homeSplitStats: homeSplit, awaySplitStats: awaySplit,
          h2hData, homeSlots, awaySlots, poissonProbs,
          isLive: false, liveClock: "0'", liveHomeGoals: 0, liveAwayGoals: 0,
          marketInsight: analysisData.marketInsight,
          homeCornersData: analysisData.homeCornersData,
          awayCornersData: analysisData.awayCornersData,
          homeCardsData: analysisData.homeCardsData,
          awayCardsData: analysisData.awayCardsData,
          injuries: analysisData.injuries || [],
          marketOdds: analysisData.marketOdds,
          matchStandings: analysisData.matchStandings,
          advancedStats: analysisData.advancedStats,
          refereeStats: analysisData.refereeStats,
          leagueName: f.league.name,
          homeTeamName: f.teams.home.name,
          awayTeamName: f.teams.away.name,
          city,
          homeRestDays: calcRest(hm),
          awayRestDays: calcRest(am),
          homeHistory: hm,
          awayHistory: am,
        });

        picks = Array.isArray(picksResult) ? picksResult : (picksResult?.picks || []);
      }

      const getTeamStat = (homeAway, statName) => {
        const team = summary?.boxscore?.teams?.find(t => t.homeAway === homeAway);
        if (!team) return 0;
        const stat = team.statistics?.find(s => s.name === statName);
        return stat ? parseInt(stat.displayValue) || 0 : 0;
      };
      const totalCorners = getTeamStat('home', 'wonCorners') + getTeamStat('away', 'wonCorners');
      const totalYellow = getTeamStat('home', 'yellowCards') + getTeamStat('away', 'yellowCards');
      const totalRed = getTeamStat('home', 'redCards') + getTeamStat('away', 'redCards');
      const totalCards = totalYellow + totalRed;

      let matchHits = 0, matchMisses = 0;
      const pickDetails = [];

      picks.forEach(p => {
        const win = evaluatePick(p, homeScore, awayScore, totalGoals, totalCorners, totalCards, totalYellow, totalRed);
        if (win) { hits++; matchHits++; } else { misses++; matchMisses++; }
        totalPicks++;
        pickDetails.push({
          selection: p.selection,
          market: p.market,
          probability: p.probability,
          odds: p.odds,
          tier: p.tier,
          isHit: win,
        });
      });

      matchReports.push({
        id: eventId,
        home: f.teams.home.name,
        away: f.teams.away.name,
        homeLogo: f.teams.home.logo,
        awayLogo: f.teams.away.logo,
        homeScore,
        awayScore,
        league: f.league.name,
        leagueLogo: f.league.logo,
        hits: matchHits,
        misses: matchMisses,
        picks: pickDetails,
      });
    } catch (e) {
      console.error('Error processing match:', f.fixture?.id, e);
      processErrors.push({ id: f.fixture?.id, error: e.message || String(e) });
      skippedMatches++;
    }
  };

  let idx = 0;
  const worker = async () => {
    while (idx < allFixtures.length) {
      const i = idx++;
      await processMatch(allFixtures[i]);
    }
  };
  await Promise.all(Array(4).fill(null).map(() => worker()));

  matchReports.sort((a, b) => b.misses - a.misses);
  logger.info('audit', `Auditoría procesada. ${usedSnapshots} partidos usaron snapshot CRON. ${allFixtures.length - usedSnapshots} recalculados.`);

  const auditResult = {
    date,
    totalMatches: matchReports.length,
    rawFixturesCount: allFixtures.length,
    skippedMatches,
    totalPicks,
    hits,
    misses,
    winRate: totalPicks > 0 ? parseFloat(((hits / totalPicks) * 100).toFixed(1)) : 0,
    reports: matchReports,
    debugErrors: processErrors.slice(0, 5), // Solo enviar los primeros 5 para no saturar
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const allMatchesAnalyzed = matchReports.length >= allFixtures.length;
  if (date < todayStr && matchReports.length > 0 && allMatchesAnalyzed) {
    try {
      await supabase.from('analysis_cache').upsert({
        event_id: auditCacheKey,
        data: auditResult,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'event_id' });
      logger.info('audit', `Auditoría ${date} cacheada: ${matchReports.length}/${allFixtures.length} partidos, ${auditResult.winRate}% acierto`);
    } catch (_) {}
  } else if (date < todayStr && !allMatchesAnalyzed) {
    logger.info('audit', `Auditoría ${date} NO cacheada: solo ${matchReports.length}/${allFixtures.length} partidos procesados (resultado incompleto)`);
  }

  return { fromCache: false, data: auditResult };
}

module.exports = {
  evaluatePick,
  runDailyAudit
};
