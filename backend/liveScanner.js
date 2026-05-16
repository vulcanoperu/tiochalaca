const supabase = require('./database');
const { getLiveFixtures } = require('./espnAdapter');

let analysisEngine = null;

async function runLiveScanner(computeMatchAnalysis) {
  if (!analysisEngine) {
    try {
      // Carga dinámica del motor de análisis del frontend (ESM) para usarlo en el backend
      const path = require('path');
      const enginePath = path.resolve(__dirname, '../src/services/analysisEngine.js').replace(/\\/g, '/');
      analysisEngine = await import('file:///' + enginePath);
    } catch (e) {
      console.error('[LiveScanner] Error cargando analysisEngine:', e.message);
      return;
    }
  }

  try {
    const fixtures = await getLiveFixtures();
    if (!fixtures || fixtures.length === 0) return;
    
    let alertsFound = 0;

    for (const fix of fixtures) {
      // Evitar partidos que no han empezado o ya terminaron
      if (!['1H', '2H', 'HT', 'ET'].includes(fix.fixture.status.short)) continue;

      const fixtureId = fix.fixture.id;
      const { data: ad, error } = await computeMatchAnalysis(fixtureId);
      if (error || !ad) continue;

      const homeId = fix.teams.home.id;
      const awayId = fix.teams.away.id;
      const hm = ad.homeMatches || [];
      const am = ad.awayMatches || [];

      // Procesar el análisis tal como lo hace el frontend
      const homeForm       = analysisEngine.calculateFormScore(hm, homeId);
      const awayForm       = analysisEngine.calculateFormScore(am, awayId);
      const homeFormAtHome = analysisEngine.calculateFormScore(hm, homeId, 'home');
      const awayFormAway   = analysisEngine.calculateFormScore(am, awayId, 'away');
      const homeSplit      = analysisEngine.calculateOverUnder(hm, homeId);
      const awaySplit      = analysisEngine.calculateOverUnder(am, awayId);
      const h2hData        = analysisEngine.analyzeH2H(ad.h2h || [], homeId, awayId);

      const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
      const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
      const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
      const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
      const leagueName = fix.league?.name || '';
      const poisson = analysisEngine.calcMatchProbabilities(hGF, hGA, aGF, aGA, leagueName);

      const liveClock = fix.fixture.status.elapsed;
      const liveHomeGoals = fix.goals.home || 0;
      const liveAwayGoals = fix.goals.away || 0;

      const picksRes = analysisEngine.generatePicks({
        homeStats: null, awayStats: null,
        h2hData, homeForm, awayForm,
        homeSplitStats: homeSplit, awaySplitStats: awaySplit,
        isLive: true, liveClock, liveHomeGoals, liveAwayGoals,
        marketInsight:   ad.marketInsight,
        homeCornersData: ad.homeCornersData,
        awayCornersData: ad.awayCornersData,
        homeCardsData:   ad.homeCardsData,
        awayCardsData:   ad.awayCardsData,
        projectedGoals:  ad.projectedGoals || 2.5,
        homeFormAtHome, awayFormAway,
        poissonProbs: poisson,
        league: fix.league?.name || '',
      });

      // Si hay recomendaciones en vivo, subirlas
      if (picksRes && picksRes.picks && picksRes.picks.length > 0) {
        const livePicks = picksRes.picks.filter(p => p.market?.toLowerCase()?.includes('vivo') || p.tier === '🔥');
        
        const newAlerts = livePicks.map(pick => ({
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
        }));

        if (newAlerts.length > 0) {
          const { data, error: upsertErr } = await supabase
            .from('live_alerts')
            .upsert(newAlerts, { onConflict: 'fixture_id,selection', ignoreDuplicates: true })
            .select();
          
          if (!upsertErr && data && data.length > 0) {
            alertsFound += data.length;
          }
        }
      }
    }

    if (alertsFound > 0) {
      console.log(`[LiveScanner] ${alertsFound} alertas generadas/actualizadas.`);
    }

  } catch (err) {
    console.error('[LiveScanner] Error en el ciclo:', err.message);
  }
}

function initLiveScanner(computeMatchAnalysis) {
  console.log('   👁️  LiveScanner activado (Monitoreo pasivo cada 2 min)');
  // Ejecutar en 15 segundos la primera vez
  setTimeout(() => runLiveScanner(computeMatchAnalysis), 15000);
  // Y luego cada 2 minutos
  setInterval(() => runLiveScanner(computeMatchAnalysis), 120 * 1000);
}

module.exports = { initLiveScanner };
