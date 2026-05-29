require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const errorHandler = require('./utils/errorHandler');
const cache = require('./cache/cacheManager');
const { ALLOWED_LEAGUES } = require('./adapters/espnAdapter');
const axios = require('axios');
const { computeMatchAnalysis } = require('./services/matchAnalysis');

const app = express();

// ── Configuración de Express
app.use(cors({ origin: ['http://localhost:5173', 'https://chalaca-ai.vercel.app'] }));
app.use(express.json());

// ── Rutas
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/picks', require('./routes/picksRoutes'));
app.use('/api/value-bets', require('./routes/valueBetRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));
app.use('/api/live-alerts', require('./routes/liveAlertRoutes'));
app.use('/api', require('./routes/fixtureRoutes')); // Contiene /api/fixtures, /api/live, /api/espn/*

// ── Tareas en segundo plano
const { initValueBetScanner } = require('./jobs/valueBetScanner');
initValueBetScanner(computeMatchAnalysis);

// ── Middleware centralizado de errores
app.use(errorHandler);

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    logger.banner(PORT);
    
    // ── Pre-calentamiento del caché al arrancar (solo local)
    const todayKey = new Date().toISOString().slice(0, 10);
    setTimeout(() => {
      const dateParam = todayKey.replace(/-/g, '');
      const preRequests = Object.keys(ALLOWED_LEAGUES).map(l =>
        axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${dateParam}&limit=50`, { timeout: 3000 })
          .then(r => ({ slug: l, data: r.data }))
          .catch(() => null)
      );
      Promise.allSettled(preRequests).then(results => {
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
            const getScore = c => { if (!c) return null; return c.score?.value !== undefined ? parseInt(c.score.value) : parseInt(c.score ?? null); };
            let statusShort = 'NS';
            if (state === 'post') statusShort = 'FT';
            else if (state === 'in') { statusShort = statusObj?.period === 1 ? '1H' : '2H'; hasLive = true; }
            fixtures.push({
              fixture: { id: e.id, date: e.date, status: { short: statusShort, elapsed: statusObj?.clock ? Math.floor(statusObj.clock / 60) : 0 } },
              league:  { id: slug, name: ALLOWED_LEAGUES[slug], logo: leagueInfo?.logos?.[0]?.href || '', country: leagueInfo?.shortName || '' },
              teams:   { home: { id: home?.id, name: home?.team?.displayName || home?.team?.name, logo: home?.team?.logo }, away: { id: away?.id, name: away?.team?.displayName || away?.team?.name, logo: away?.team?.logo } },
              goals:   { home: getScore(home), away: getScore(away) },
            });
          });
        }
        cache.set(`espn_date_${todayKey}`, fixtures, hasLive ? 2 : 5);
        logger.info('cache', `Caché pre-calentado: ${fixtures.length} partidos del ${todayKey}`);
      }).catch(() => {});
    }, 1000);
  });
}

module.exports = app;
module.exports.computeMatchAnalysis = computeMatchAnalysis;
