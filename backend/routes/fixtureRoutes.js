const express = require('express');
const supabase = require('../database');
const logger = require('../utils/logger');
const cache = require('../cache/cacheManager');
const { ALLOWED_LEAGUES, axiosInstance, getMatchSummary } = require('../adapters/espnAdapter');
const fotmobAdapter = require('../adapters/fotmobAdapter');
const { computeMatchAnalysis } = require('../services/matchAnalysis');

const cacheGet = cache.get;
const cacheSet = cache.set;
const router = express.Router();

router.get('/fixtures', async (req, res) => {
  const { date } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const targetDate = date || today;
  const dateParam = targetDate.replace(/-/g, '');
  
  const cacheKey = `espn_date_${targetDate}`;
  const inMemory = cacheGet(cacheKey);
  if (inMemory) return res.json({ success: true, fromCache: 'memory', data: inMemory });

  try {
    const requests = Object.keys(ALLOWED_LEAGUES).map(l =>
      axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${dateParam}&limit=50`, { timeout: 5000 })
        .then(r => ({ slug: l, data: r.data }))
        .catch(() => null)
    );
    const results = await Promise.allSettled(requests);
    
    let fixtures = [];
    let hasLive = false;

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
        
        const getScore = c => {
          if (!c) return null;
          if (c.score?.value !== undefined) return parseInt(c.score.value);
          if (c.score !== undefined) return parseInt(c.score);
          return null;
        };

        let statusShort = 'NS';
        if (state === 'post') statusShort = 'FT';
        else if (state === 'in') {
          statusShort = statusObj?.period === 1 ? '1H' : '2H';
          hasLive = true;
        }

        fixtures.push({
          fixture: { 
            id: e.id, 
            date: e.date,
            status: { 
              short: statusShort, 
              elapsed: statusObj?.clock ? Math.floor(statusObj.clock / 60) : 0 
            }
          },
          league: { 
            id: slug, 
            name: ALLOWED_LEAGUES[slug], 
            logo: leagueInfo?.logos?.[0]?.href || '',
            country: leagueInfo?.shortName || ''
          },
          teams: {
            home: { id: home?.id, name: home?.team?.displayName || home?.team?.name, logo: home?.team?.logo },
            away: { id: away?.id, name: away?.team?.displayName || away?.team?.name, logo: away?.team?.logo },
          },
          goals: { home: getScore(home), away: getScore(away) },
        });
      });
    }

    const ttl = hasLive ? 2 : 5;
    cacheSet(cacheKey, fixtures, ttl);
    res.json({ success: true, fromCache: false, data: fixtures });

  } catch (err) {
    res.status(500).json({ error: 'Error fetching fixtures' });
  }
});

router.get('/live', async (req, res) => {
  const cacheKey = 'fotmob_live_matches';
  const inMemory = cacheGet(cacheKey);
  if (inMemory) return res.json({ success: true, fromCache: true, data: inMemory });
  
  try {
    const liveMatches = await fotmobAdapter.getLiveMatches();
    cacheSet(cacheKey, liveMatches, 1);
    res.json({ success: true, fromCache: false, data: liveMatches });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching live matches' });
  }
});

// Guardar los picks pre-partido en Supabase para protegerlos del re-cálculo en vivo
async function saveSnapshotToSupabase(eventId, matchAnalysis) {
  if (!matchAnalysis || !matchAnalysis.homeMatches) return;
  const matchDate = new Date().toISOString().slice(0, 10);
  try {
    await supabase.from('daily_snapshots').upsert({
      event_id: String(eventId),
      snapshot_date: matchDate,
      predictions: matchAnalysis.picks || [] // Se asume que el frontend calculará picks y luego se hace el guardado si es necesario, pero computeMatchAnalysis no retorna picks, lo hace tempEngine.
      // Corrección: El endpoint original de /analysis no guardaba picks, porque computeMatchAnalysis NO devuelve picks. 
      // Si queremos snapshots de predicciones, esto debe ser llamado desde el CRON/ValueBets.
      // Se mantiene aquí como placeholder estructural si el frontend enviaba un POST, 
      // pero el server.js actual NO generaba los picks en /api/espn/match/:eventId/analysis.
    }, { onConflict: 'event_id' });
  } catch (e) {
    logger.warn('snapshot', 'Error saving snapshot:', e.message);
  }
}

router.get('/espn/match/:eventId/analysis', async (req, res) => {
  const { eventId } = req.params;
  const refresh = req.query.refresh === 'true';

  const result = await computeMatchAnalysis(eventId, refresh);
  if (result.error) return res.status(500).json({ error: result.error });

  // Disparar persistencia de snapshot sin bloquear
  if (result.data) {
     saveSnapshotToSupabase(eventId, result.data).catch(() => {});
  }

  res.json(result);
});

router.get('/espn/match/:eventId/summary', async (req, res) => {
  try {
    const s = await getMatchSummary(req.params.eventId);
    res.json(s);
  } catch (e) {
    res.status(500).json({ error: 'Error getting summary' });
  }
});

router.get('/espn/standings/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const r = await axiosInstance.get(`https://site.api.espn.com/apis/v2/sports/soccer/${leagueId}/standings`, { timeout: 4000 });
    res.json({ success: true, data: r.data });
  } catch (e) {
    res.status(500).json({ error: 'Error fetching standings' });
  }
});

module.exports = router;
