if (typeof File === 'undefined') { global.File = require('buffer').File; }
const axios = require('axios');
const cheerio = require('cheerio');

const CACHE = new Map();

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { CACHE.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMinutes = 60) {
  CACHE.set(key, { data, expiresAt: Date.now() + ttlMinutes * 60_000 });
}

function mapESPNToApiSports(event) {
  const comp = event.competitions[0];
  const home = comp?.competitors?.find(c => c.homeAway === 'home');
  const away = comp?.competitors?.find(c => c.homeAway === 'away');

  // Extraer nombre de la liga del shortName del evento o season
  let leagueName = "Desconocida";
  if (event.season && event.season.slug) leagueName = event.season.slug;
  if (event.links && event.links.length > 0 && event.links[0].href) {
      const match = event.links[0].href.match(/league\/([^\/]+)/);
      if (match) leagueName = match[1];
  }

  // El estado real viene dentro de comp.status (scoreboard) o event.status (schedule)
  const statusObj = comp?.status || event.status;
  let statusShort = "NS";
  const state = statusObj?.type?.state;
  if (state === 'post') statusShort = 'FT';
  else if (state === 'in') {
      const period = statusObj?.period;
      if (period === 1) statusShort = '1H';
      else if (period === 2) statusShort = '2H';
      else statusShort = 'HT';
  }

  // El tiempo transcurrido puede estar en clock o displayClock
  const elapsed = statusObj?.clock ? Math.floor(statusObj.clock / 60) : 0;

  // Score helper: puede ser objeto {value:N} o número directo
  const getScore = (c) => {
    if (!c) return null;
    if (c.score?.value !== undefined) return parseInt(c.score.value);
    if (c.score !== undefined) return parseInt(c.score);
    return null;
  };

  return {
    fixture: {
      id: event.id,
      date: event.date,
      status: { short: statusShort, elapsed }
    },
    league: {
      id: leagueName,
      name: event.season?.slug || event.name?.split(' - ')[0] || "League",
      logo: ""
    },
    teams: {
      home: { id: home?.id, name: home?.team?.name, logo: home?.team?.logo },
      away: { id: away?.id, name: away?.team?.name, logo: away?.team?.logo }
    },
    goals: {
      home: getScore(home),
      away: getScore(away)
    }
  };
}

// ─── Lista de ligas permitidas y nombres en español ─────────────────────────
const ALLOWED_LEAGUES = {
  'per.1': 'Liga 1 (Perú)',
  'bra.1': 'Brasileirão (Brasil)',
  'arg.1': 'Liga Profesional (Argentina)',
  'chi.1': 'Primera División (Chile)',
  'col.1': 'Primera A (Colombia)',
  'uru.1': 'Primera División (Uruguay)',
  'ksa.1': 'Liga Profesional Saudí (Arabia)',
  'eng.1': 'Premier League (Inglaterra)',
  'esp.1': 'LaLiga (España)',
  'ger.1': 'Bundesliga (Alemania)',
  'por.1': 'Primeira Liga (Portugal)',
  'ned.1': 'Eredivisie (Holanda)',
  'ita.1': 'Serie A (Italia)',
  'uefa.champions': 'Champions League',
  'uefa.europa': 'Europa League',
  'uefa.europa.conf': 'Conference League',
  'conmebol.libertadores': 'Copa Libertadores',
  'conmebol.sudamericana': 'Copa Sudamericana'
};

function mapLeagueInfo(leagueInfo, fixture) {
  if (!leagueInfo) return;
  // If the league is allowed, rename it properly. Otherwise, keep original or fallback
  fixture.league.name    = ALLOWED_LEAGUES[fixture.league.id] || leagueInfo.name || fixture.league.name;
  fixture.league.id      = leagueInfo.id   || leagueInfo.slug || fixture.league.id;
  fixture.league.country = leagueInfo.shortName || leagueInfo.name || '';
  if (leagueInfo.logos?.length) fixture.league.logo = leagueInfo.logos[0].href;
}

async function getTodayFixtures() {
  const cacheKey = 'espn_today_fixtures';
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const requests = Object.keys(ALLOWED_LEAGUES).map(l =>
    axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard`)
  );

  const results = await Promise.allSettled(requests);
  let allFixtures = [];

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.data.events) continue;
    // La URL original tiene el slug en algún lado, pero podemos sacarlo del link o pasar el índice
    // Wait, let's just pass the slug inside a wrapper:
  }
  // Let's rewrite the requests to pass the slug along:
  const requestsWithSlug = Object.keys(ALLOWED_LEAGUES).map(l => 
    axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard`)
      .then(res => ({ slug: l, data: res.data }))
  );

  const resultsWithSlug = await Promise.allSettled(requestsWithSlug);
  for (const r of resultsWithSlug) {
    if (r.status !== 'fulfilled' || !r.value.data.events) continue;
    const { slug, data } = r.value;
    const leagueInfo = data.leagues?.[0] || null;
    const mapped = data.events.map(e => {
      const fixture = mapESPNToApiSports(e);
      fixture.league.id = slug;
      fixture.league.name = ALLOWED_LEAGUES[slug];
      if (leagueInfo) mapLeagueInfo(leagueInfo, fixture);
      return fixture;
    });
    allFixtures.push(...mapped);
  }

  cacheSet(cacheKey, allFixtures, 5); // 5 min cache
  return allFixtures;
}

async function getLiveFixtures() {
  // Micro-caché de 15s para no bombardear ESPN cuando hay polling frecuente
  const cacheKey = 'espn_live_micro';
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const requestsWithSlug = Object.keys(ALLOWED_LEAGUES).map(l => 
    axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard`)
      .then(res => ({ slug: l, data: res.data }))
  );

  const resultsWithSlug = await Promise.allSettled(requestsWithSlug);
  let liveFixtures = [];

  for (const r of resultsWithSlug) {
    if (r.status !== 'fulfilled' || !r.value.data.events) continue;
    const { slug, data } = r.value;
    const leagueInfo = data.leagues?.[0] || null;
    data.events
      .filter(e => {
        const state = e.competitions?.[0]?.status?.type?.state || e.status?.type?.state;
        // Incluir "in" (en vivo) y "post" recientes para captar transiciones de estado
        return state === 'in' || state === 'post';
      })
      .forEach(e => {
        const state = e.competitions?.[0]?.status?.type?.state || e.status?.type?.state;
        const fixture = mapESPNToApiSports(e);
        fixture.league.id = slug;
        fixture.league.name = ALLOWED_LEAGUES[slug];
        if (leagueInfo) mapLeagueInfo(leagueInfo, fixture);
        // Marcar si está realmente en vivo para que el frontend pueda filtrar
        fixture._isLive = state === 'in';
        liveFixtures.push(fixture);
      });
  }

  cacheSet(cacheKey, liveFixtures, 0.25); // 15 segundos
  return liveFixtures;
}

module.exports = {
  getTodayFixtures,
  getLiveFixtures,
  mapESPNToApiSports,
  ALLOWED_LEAGUES
};
