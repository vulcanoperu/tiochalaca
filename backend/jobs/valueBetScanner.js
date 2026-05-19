/**
 * ═══════════════════════════════════════════════════════════════════
 * jobs/valueBetScanner.js — Scanner de Value Bets en vivo
 * ═══════════════════════════════════════════════════════════════════
 * Reemplaza al antiguo liveScanner.js.
 * 
 * Funciones:
 * 1. Escanea partidos en vivo usando la interfaz de adaptador (getLiveMatches).
 * 2. Carga dinámicamente el motor de análisis (ESM).
 * 3. Si detecta apuestas de alto valor (EV+ o Live), inserta en Supabase.
 * 4. La tabla live_alerts en Supabase usará Realtime para notificar al frontend.
 * ═══════════════════════════════════════════════════════════════════
 */

const path = require('path');
const supabase = require('../supabase/client');
const logger = require('../utils/logger');
const { getLiveMatches } = require('../adapters/espnAdapter');

const MODULE = 'valueBetScanner';
let analysisEngine = null;

async function loadEngine() {
  if (analysisEngine) return;
  try {
    // Carga dinámica del motor de análisis del frontend (ESM) para usarlo en el backend
    const enginePath = path.resolve(__dirname, '../../src/services/analysisEngine.js').replace(/\\/g, '/');
    analysisEngine = await import('file:///' + enginePath);
    logger.info(MODULE, 'analysisEngine cargado correctamente.');
  } catch (e) {
    logger.error(MODULE, 'Error cargando analysisEngine:', e.message);
  }
}

/**
 * Escanea partidos en vivo y detecta oportunidades.
 * @param {Function} computeMatchAnalysis - Función de análisis inyectada desde server.js
 */
async function scanLiveMatches(computeMatchAnalysis) {
  await loadEngine();
  if (!analysisEngine) return;

  try {
    const fixtures = await getLiveMatches();
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
      
      let poisson;
      // Compatibilidad con firmas de calcMatchProbabilities (objeto o params posicionales)
      if (typeof analysisEngine.calcMatchProbabilities === 'function' && analysisEngine.calcMatchProbabilities.length === 1) {
          poisson = analysisEngine.calcMatchProbabilities({ hGF, hGA, aGF, aGA, leagueName });
      } else {
          poisson = analysisEngine.calcMatchProbabilities(hGF, hGA, aGF, aGA, leagueName);
      }

      const liveClock = fix.fixture.status.elapsed || 0;
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
        league: leagueName,
      });

      // Si hay recomendaciones en vivo, subirlas a Supabase
      if (picksRes && picksRes.picks && picksRes.picks.length > 0) {
        // Filtrar picks relevantes: 🔥 (alta confianza) o marcados para "vivo"
        const livePicks = picksRes.picks.filter(p => p.market?.toLowerCase().includes('vivo') || p.tier === '🔥');
        
        const newAlerts = livePicks.map(pick => ({
          match_id: fixtureId.toString(),
          home_team: fix.teams.home.name,
          away_team: fix.teams.away.name,
          league: leagueName,
          market: pick.market,
          our_probability: pick.probability,
          bookmaker_odds: pick.odds || null,
          ev_percentage: pick.ev || null,
          minute: parseInt(liveClock) || 0,
          match_score: `${liveHomeGoals}-${liveAwayGoals}`,
          detected_at: new Date().toISOString(),
          is_active: true
        }));

        if (newAlerts.length > 0) {
          // Usamos la nueva tabla live_alerts (Paso 1)
          const { data, error: upsertErr } = await supabase
            .from('live_alerts')
            .upsert(newAlerts, { onConflict: 'match_id,market,minute', ignoreDuplicates: true })
            .select();
          
          if (!upsertErr && data && data.length > 0) {
            alertsFound += data.length;
          } else if (upsertErr) {
            logger.error(MODULE, 'Error insertando alertas:', upsertErr.message);
          }
        }
      }
    }

    if (alertsFound > 0) {
      logger.audit(MODULE, `${alertsFound} alertas generadas/actualizadas.`);
    }

  } catch (err) {
    logger.error(MODULE, 'Error en el ciclo de escaneo:', err.message);
  }
}

/**
 * Inicia el loop de monitoreo en segundo plano.
 * @param {Function} computeMatchAnalysis - Función inyectada desde server.js
 */
function initValueBetScanner(computeMatchAnalysis) {
  logger.info(MODULE, 'Value Bet Scanner activado (Monitoreo cada 2 min)');
  // Ejecutar en 15 segundos la primera vez
  setTimeout(() => scanLiveMatches(computeMatchAnalysis), 15000);
  // Y luego cada 2 minutos
  setInterval(() => scanLiveMatches(computeMatchAnalysis), 120 * 1000);
}

module.exports = { initValueBetScanner, scanLiveMatches };
