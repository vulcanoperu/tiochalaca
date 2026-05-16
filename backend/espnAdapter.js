if (typeof File === 'undefined') { global.File = require('buffer').File; }
const axios = require('axios');
const cheerio = require('cheerio');
const http = require('http');
const https = require('https');
const bsdAdapter = require('../src/services/bsdAdapter.cjs');

// Persistent agents for keep-alive
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  }
});

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
    },
    redCards: {
      home: parseInt(home?.redCards ?? 0),
      away: parseInt(away?.redCards ?? 0)
    }
  };
}

// ─── Lista de ligas permitidas y nombres en español ─────────────────────────
const ALLOWED_LEAGUES = {
  // ── Sudamérica ────────────────────────────────────────────────
  'per.1': 'Liga 1 (Perú)',
  'ecu.1': 'LigaPro (Ecuador)',
  'ven.1': 'Primera División (Venezuela)',
  'par.1': 'División Profesional (Paraguay)',
  'bra.1': 'Brasileirão (Brasil)',
  'arg.1': 'Liga Profesional (Argentina)',
  'col.1': 'Primera A (Colombia)',
  'chi.1': 'Primera División (Chile)',
  'uru.1': 'Primera División (Uruguay)',
  'conmebol.libertadores': 'Copa Libertadores',
  'conmebol.sudamericana': 'Copa Sudamericana',
  // ── América del Norte ─────────────────────────────────────────
  'mex.1': 'Liga MX (México)',
  'usa.1': 'MLS (USA)',
  // ── Europa ───────────────────────────────────────────────────
  'eng.1': 'Premier League (Inglaterra)',
  'esp.1': 'LaLiga (España)',
  'ger.1': 'Bundesliga (Alemania)',
  'fra.1': 'Ligue 1 (Francia)',
  'ita.1': 'Serie A (Italia)',
  'por.1': 'Primeira Liga (Portugal)',
  'ned.1': 'Eredivisie (Holanda)',
  'ksa.1': 'Liga Profesional Saudí (Arabia)',
  // ── Competiciones europeas ────────────────────────────────────
  'uefa.champions': 'Champions League',
  'uefa.europa': 'Europa League',
  'uefa.europa.conf': 'Conference League',
  'fifa.world': 'Copa del Mundo',
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
    axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard`)
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
    axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard`)
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

// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISIS PROFUNDO (Para reemplazar a API-Football en el motor de predicciones)
// ─────────────────────────────────────────────────────────────────────────────

async function getMatchSummary(eventId, refresh = false) {
  const cacheKey = `espn_summary_${eventId}`;
  if (!refresh) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  try {
    const res = await axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${eventId}&t=${Date.now()}`);
    
    // TTL inteligente:
    // - Si el partido terminó: 24 horas
    // - Si está en vivo o futuro: 15 segundos
    const state = res.data?.header?.competitions?.[0]?.status?.type?.state;
    const ttl = state === 'post' ? 60 * 24 : 0.25; // 15s para live/NS
    
    cacheSet(cacheKey, res.data, ttl);
    return res.data;
  } catch (err) {
    console.error(`[espnAdapter] Error summary ${eventId}:`, err.message);
    return null;
  }
}

async function getTeamSchedule(leagueSlug, teamId) {
  const cacheKey = `espn_schedule_${leagueSlug}_${teamId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    let slugs = new Set();
    if (leagueSlug && leagueSlug !== 'all') slugs.add(leagueSlug);
    try {
      const tr = await axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${teamId}`);
      const dl = tr.data?.team?.defaultLeague?.slug;
      if (dl && dl !== 'all') slugs.add(dl);
    } catch (_) {}
    if (!slugs.size) slugs.add('all');
    const results = await Promise.all(Array.from(slugs).map(s =>
      axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/teams/${teamId}/schedule`)
        .then(r => r.data?.events || []).catch(() => [])
    ));

    let events = [].concat(...results);
    if (events.length > 0) {
      // Filtrar solo los completados para calcular "Form"
      events = events.filter(e => {
        const comp = e.competitions?.[0];
        return comp?.status?.type?.completed === true;
      });
      // Ordenar más recientes primero
      events.sort((a,b) => new Date(b.date) - new Date(a.date));
    }
    cacheSet(cacheKey, events, 60 * 4); // 4 horas
    return events;
  } catch (err) {
    console.error(`[espnAdapter] Error schedule ${teamId}:`, err.message);
    return [];
  }
}

/**
 * Summary enriquecido: normaliza los datos de ESPN en un objeto consistente.
 * - Ligas top (PL, LaLiga, etc.): retorna xG, corners, tarjetas, cuotas.
 * - Ligas SAM (PER, VEN, PAR, ECU): retorna null en campos sin datos.
 *   El motor de análisis usa Poisson puro como fallback automático.
 */
async function getEnrichedSummary(eventId) {
  const raw = await getMatchSummary(eventId);
  if (!raw) return null;

  const comp     = raw.header?.competitions?.[0];
  const homeComp = comp?.competitors?.find(c => c.homeAway === 'home');
  const awayComp = comp?.competitors?.find(c => c.homeAway === 'away');

  // Boxscore stats
  const bsTeams  = raw.boxscore?.teams || [];
  const homeBs   = bsTeams.find(t => t.homeAway === 'home');
  const awayBs   = bsTeams.find(t => t.homeAway === 'away');

  const getStat = (teamBs, name) => {
    if (!teamBs?.statistics) return null;
    const s = teamBs.statistics.find(s =>
      s.name === name || s.label?.toLowerCase().includes(name.toLowerCase())
    );
    if (!s) return null;
    const val = parseFloat(s.displayValue ?? s.value);
    return isNaN(val) ? null : val;
  };

  // Corners
  const homeCorners = getStat(homeBs, 'cornerKicks') ?? getStat(homeBs, 'corners');
  const awayCorners = getStat(awayBs, 'cornerKicks') ?? getStat(awayBs, 'corners');

  // xG (solo ligas Tier 1)
  const homeXG = getStat(homeBs, 'xG') ?? getStat(homeBs, 'expectedGoals');
  const awayXG = getStat(awayBs, 'xG') ?? getStat(awayBs, 'expectedGoals');

  // Posesión
  const homePoss = getStat(homeBs, 'possessionPct') ?? getStat(homeBs, 'possession');
  const awayPoss = getStat(awayBs, 'possessionPct') ?? getStat(awayBs, 'possession');

  // Tarjetas: primero del boxscore, fallback desde plays/timeline
  const getCards = (teamBs, color) => {
    const fromStats = getStat(teamBs, color === 'yellow' ? 'yellowCards' : 'redCards');
    if (fromStats !== null) return fromStats;
    const teamId = teamBs?.team?.id;
    return (raw.plays || []).filter(p =>
      p.team?.id === teamId &&
      p.type?.text?.toLowerCase().includes(color === 'yellow' ? 'yellow' : 'red')
    ).length || null;
  };

  // Cuotas / Value Bets desde pickcenter
  let marketOdds = null;
  const pc = raw.pickcenter;
  if (Array.isArray(pc) && pc.length > 0) {
    const item = pc[0];
    const statusObjLocal  = comp?.status;
    const isLiveLocal     = statusObjLocal?.type?.state === 'in';
    const toDecimal = ml => {
      if (!ml) return null;
      // Convert American odds to decimal
      const oddsNum = typeof ml === 'string' ? parseInt(ml.replace('+', '')) : ml;
      if (isNaN(oddsNum)) return null;
      return oddsNum > 0 ? +(1 + oddsNum / 100).toFixed(2) : +(1 - 100 / oddsNum).toFixed(2);
    };

    // ESPN usa moneyLine, pero a veces usa "odds" dentro de close, open o live
    const getOddsValue = (oddsObj) => {
      if (!oddsObj) return null;
      if (oddsObj.moneyLine) return oddsObj.moneyLine;
      if (oddsObj.odds) return oddsObj.odds; // American odds
      return null;
    };

    const getMarket = (itemMarket, isOverUnder) => {
      if (!itemMarket) return null;
      // Para Over/Under, debemos asegurarnos de que la línea no haya cambiado
      if (isOverUnder) {
        const closeLine = itemMarket.close?.line?.replace(/[^\d.]/g, '');
        if (isLiveLocal && itemMarket.live?.odds) {
          const liveLine = itemMarket.live?.line?.replace(/[^\d.]/g, '');
          // Solo usar cuota en vivo si la línea base (ej. 2.5) sigue siendo la misma
          if (liveLine === closeLine) {
             return parseInt(itemMarket.live.odds.replace('+', ''));
          }
        }
        if (itemMarket.close?.odds) return parseInt(itemMarket.close.odds.replace('+', ''));
        if (itemMarket.open?.odds) return parseInt(itemMarket.open.odds.replace('+', ''));
        return null;
      } else {
        if (isLiveLocal && itemMarket.live?.odds) return parseInt(itemMarket.live.odds.replace('+', ''));
        if (itemMarket.close?.odds) return parseInt(itemMarket.close.odds.replace('+', ''));
        if (itemMarket.open?.odds) return parseInt(itemMarket.open.odds.replace('+', ''));
        return null;
      }
    };

    const homeML = getOddsValue(item.homeTeamOdds) ?? getMarket(item.homeTeamOdds, false);
    const awayML = getOddsValue(item.awayTeamOdds) ?? getMarket(item.awayTeamOdds, false);
    const drawML = getOddsValue(item.drawOdds) ?? getMarket(item.drawOdds, false);
    
    // Para Over/Under
    const overML = getMarket(item.total?.over, true) ?? getOddsValue({odds: item.overOdds});
    const underML = getMarket(item.total?.under, true) ?? getOddsValue({odds: item.underOdds});

    let overUnderLine = item.overUnder ?? item.total?.over?.close?.line?.replace(/[^\d.]/g, '');
    if (overUnderLine) overUnderLine = parseFloat(overUnderLine);

    if (homeML || awayML || overML) {
      marketOdds = {
        home:      toDecimal(homeML),
        away:      toDecimal(awayML),
        draw:      toDecimal(drawML),
        overUnder: overUnderLine || null,
        overOdds:  toDecimal(overML),
        underOdds: toDecimal(underML),
        provider:  item.provider?.name ?? 'ESPN BET',
      };
    }
  }

  // --- VARIABLES COMUNES PARA BSD ---
  let espnLeagueSlug = raw.header?.season?.slug || raw.header?.league?.slug;
  if (!espnLeagueSlug && raw.header?.links?.[0]?.href) {
    const match = raw.header.links[0].href.match(/league\/([^\/]+)/);
    if (match) espnLeagueSlug = match[1];
  }
  
  const matchDate = comp?.date || raw.header?.competitions?.[0]?.date;
  const homeName = homeComp?.team?.displayName ?? homeBs?.team?.displayName;
  const awayName = awayComp?.team?.displayName ?? awayBs?.team?.displayName;

  // --- BSD FALLBACK PARA CUOTAS ---
  // Si ESPN no entregó cuotas (Pickcenter vacío o no cargó), consultamos BSD
  if (!marketOdds) {
    if (espnLeagueSlug && matchDate && homeName && awayName) {
      const bsdOdds = await bsdAdapter.getBSDOdds(espnLeagueSlug, matchDate, homeName, awayName);
      if (bsdOdds) {
        marketOdds = bsdOdds;
        console.log(`[bsdAdapter] Recuperadas cuotas de consenso de BSD para ${homeName} vs ${awayName}`);
      }
    }
  }
  
  // --- BSD FALLBACK PARA ALINEACIONES ---
  // Podemos inyectar las lineups confirmadas de BSD si es necesario
  let bsdLineupsObj = null;
  if (espnLeagueSlug && matchDate && homeName && awayName) {
      bsdLineupsObj = await bsdAdapter.getBSDLineups(espnLeagueSlug, matchDate, homeName, awayName);
  }

  // Árbitro, venue, asistencia
  const venue      = raw.gameInfo?.venue?.fullName ?? raw.gameInfo?.venue?.name ?? null;
  const city       = raw.gameInfo?.venue?.address?.city ?? null;
  const referee    = raw.gameInfo?.officials?.[0]?.fullName ?? null;
  const attendance = raw.gameInfo?.attendance ?? null;

  // Lesiones (cuando ESPN las reporta)
  const injuries = [];
  (raw.injuries || []).forEach(teamInj => {
    (teamInj.injuries || []).forEach(inj => {
      injuries.push({
        name:       inj.athlete?.displayName ?? 'Unknown',
        team:       teamInj.team?.displayName ?? '',
        status:     inj.type ?? inj.status ?? 'Questionable',
        returnDate: null,
      });
    });
  });

  // Estado del partido
  const statusObj  = comp?.status;
  const isLive     = statusObj?.type?.state === 'in';
  const isFinished = statusObj?.type?.state === 'post';

  return {
    _raw: raw,                  // raw original para compatibilidad con código existente
    eventId,
    isLive,
    isFinished,
    clock:      statusObj?.displayClock ?? null,
    period:     statusObj?.period ?? null,
    venue,
    city,
    referee,
    attendance,
    homeTeam: {
      id:    homeComp?.id ?? homeBs?.team?.id,
      name:  homeComp?.team?.displayName ?? homeBs?.team?.displayName,
      logo:  homeComp?.team?.logo,
      score: parseInt(homeComp?.score ?? 0),
    },
    awayTeam: {
      id:    awayComp?.id ?? awayBs?.team?.id,
      name:  awayComp?.team?.displayName ?? awayBs?.team?.displayName,
      logo:  awayComp?.team?.logo,
      score: parseInt(awayComp?.score ?? 0),
    },
    stats: {
      home: {
        xG:            homeXG,
        corners:       homeCorners,
        yellowCards:   getCards(homeBs, 'yellow'),
        redCards:      getCards(homeBs, 'red'),
        possession:    homePoss,
        shots:         getStat(homeBs, 'shots'),
        shotsOnTarget: getStat(homeBs, 'shotsOnTarget') ?? getStat(homeBs, 'onTarget'),
      },
      away: {
        xG:            awayXG,
        corners:       awayCorners,
        yellowCards:   getCards(awayBs, 'yellow'),
        redCards:      getCards(awayBs, 'red'),
        possession:    awayPoss,
        shots:         getStat(awayBs, 'shots'),
        shotsOnTarget: getStat(awayBs, 'shotsOnTarget') ?? getStat(awayBs, 'onTarget'),
      },
    },
    marketOdds,
    injuries,
    // Acceso directo a sub-estructuras del raw para compatibilidad con código existente
    pickcenter: raw.pickcenter,
    boxscore:   raw.boxscore,
    plays:      raw.plays,
    gameInfo:   raw.gameInfo,
    rosters:    raw.rosters,
    bsdLineups: bsdLineupsObj, // Alineaciones confirmadas de BSD
  };
}

module.exports = {
  getTodayFixtures,
  getLiveFixtures,
  getMatchSummary,
  getEnrichedSummary,
  getTeamSchedule,
  mapESPNToApiSports,
  ALLOWED_LEAGUES,
  axiosInstance
};

