/**
 * bsdAdapter.js — Bzzoiro Sports Data (BSD) Integration
 *
 * Fuente complementaria de odds y lineups cuando ESPN no provee datos.
 * API Base: https://sports.bzzoiro.com/api/v2
 * Auth:     Authorization: Token {BSD_API_KEY}
 *
 * Lo que BSD aporta vs ESPN:
 *   - Odds consenso de 15+ casas (home_win, draw, away_win, BTTS, Over/Under 1.5/2.5/3.5)
 *   - Lineups confirmadas antes del kick-off
 *   - Cobertura de: PL, LaLiga, Serie A, Bundesliga, Ligue 1, MLS, Saudi, Liga MX, UCL/UEL
 */

const axios = require('axios');

const BSD_API_KEY = process.env.BSD_API_KEY || '8c6cdc6bcd76fc6f2c05b42ddfd43bf4698a3dc6';
const BSD_BASE    = 'https://sports.bzzoiro.com/api/v2';

// ── Mapping ESPN league slugs → BSD league IDs ─────────────────────────────
const ESPN_TO_BSD_LEAGUE = {
  'eng.1':               1,   // Premier League
  'esp.1':               3,   // La Liga
  'ita.1':               4,   // Serie A
  'ger.1':               5,   // Bundesliga
  'fra.1':               6,   // Ligue 1
  'uefa.champions':      7,   // Champions League
  'uefa.europa':         8,   // Europa League
  'bra.1':               9,   // Brasileirão
  'ned.1':               10,  // Eredivisie
  'por.1':               2,   // Liga Portugal
  'ksa.1':               17,  // Saudi Pro League
  'usa.1':               18,  // MLS
  'mex.1':               19,  // Liga MX Apertura (fallback)
  'conmebol.libertadores': 32,
  'conmebol.sudamericana': 33,
};

// ── Cache simple en memoria ─────────────────────────────────────────────────
const BSD_CACHE = new Map();

function bsdCacheGet(key) {
  const entry = BSD_CACHE.get(key);
  if (!entry) return undefined;                          // undefined = no cache
  if (Date.now() > entry.expiresAt) { BSD_CACHE.delete(key); return undefined; }
  return entry.data;                                     // puede ser null (resultado válido vacío)
}

function bsdCacheSet(key, data, ttlMinutes = 30) {
  BSD_CACHE.set(key, { data, expiresAt: Date.now() + ttlMinutes * 60_000 });
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function bsdGet(path) {
  try {
    const res = await axios.get(`${BSD_BASE}${path}`, {
      headers: { Authorization: `Token ${BSD_API_KEY}` },
      timeout: 8000,
    });
    return res.data;
  } catch (err) {
    console.warn(`[bsdAdapter] GET ${path} → ${err.response?.status || err.message}`);
    return null;
  }
}

// ── Normalización de nombre de equipo para fuzzy matching ──────────────────
function normTeam(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9]/g, '');                        // solo alfanumérico
}

/**
 * Busca el ID de evento en BSD dado:
 *   - espnLeagueSlug: e.g. 'esp.1'
 *   - matchDate: ISO string o 'YYYY-MM-DD'
 *   - homeTeamName, awayTeamName: nombres tal como vienen de ESPN
 *
 * Retorna el BSD event_id (número) o null si no se encuentra.
 */
async function findBSDEventId(espnLeagueSlug, matchDate, homeTeamName, awayTeamName) {
  const bsdLeagueId = ESPN_TO_BSD_LEAGUE[espnLeagueSlug];
  if (!bsdLeagueId) return null;

  const dateStr  = (matchDate || '').slice(0, 10); // YYYY-MM-DD
  const cacheKey = `bsd_events_${bsdLeagueId}_${dateStr}`;

  let events = bsdCacheGet(cacheKey);
  if (events === undefined) {
    const data = await bsdGet(`/events/?league_id=${bsdLeagueId}&date=${dateStr}&limit=50`);
    events = data?.results ?? null;
    bsdCacheSet(cacheKey, events, 60); // 1 hora
  }

  if (!events || events.length === 0) return null;

  const homeN = normTeam(homeTeamName);
  const awayN  = normTeam(awayTeamName);

  const found = events.find(e => {
    const bH = normTeam(e.home_team);
    const bA = normTeam(e.away_team);
    const homeMatch = bH.includes(homeN) || homeN.includes(bH);
    const awayMatch = bA.includes(awayN) || awayN.includes(bA);
    return homeMatch && awayMatch;
  });

  return found?.id ?? null;
}

/**
 * Obtiene las cuotas de BSD para un partido ESPN.
 *
 * Retorna un objeto compatible con espnAdapter.marketOdds, o null si BSD
 * tampoco tiene datos (match muy antiguo / liga no cubierta).
 *
 * Estructura retornada:
 * {
 *   home, draw, away,            <- decimal odds
 *   overUnder: 2.5,
 *   overOdds, underOdds,         <- over/under 2.5
 *   over15Odds, under15Odds,
 *   over35Odds, under35Odds,
 *   bttsYes, bttsNo,
 *   provider: 'BSD',
 *   source: 'bsd',
 * }
 */
async function getBSDOdds(espnLeagueSlug, matchDate, homeTeamName, awayTeamName) {
  const cacheKey = `bsd_odds_${espnLeagueSlug}_${(matchDate||'').slice(0,10)}_${normTeam(homeTeamName)}_${normTeam(awayTeamName)}`;
  const cached = bsdCacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const eventId = await findBSDEventId(espnLeagueSlug, matchDate, homeTeamName, awayTeamName);
  if (!eventId) {
    bsdCacheSet(cacheKey, null, 15);
    return null;
  }

  const data = await bsdGet(`/events/${eventId}/odds/`);
  if (!data?.odds) {
    bsdCacheSet(cacheKey, null, 15);
    return null;
  }

  const o = data.odds;

  const result = {
    home:        o.home_win        ?? null,
    draw:        o.draw            ?? null,
    away:        o.away_win        ?? null,
    overUnder:   2.5,
    overOdds:    o.over_25_goals   ?? null,
    underOdds:   o.under_25_goals  ?? null,
    over15Odds:  o.over_15_goals   ?? null,
    under15Odds: o.under_15_goals  ?? null,
    over35Odds:  o.over_35_goals   ?? null,
    under35Odds: o.under_35_goals  ?? null,
    bttsYes:     o.btts_yes        ?? null,
    bttsNo:      o.btts_no         ?? null,
    provider:    'BSD (Bzzoiro Sports Data)',
    source:      'bsd',
  };

  // Solo retornar si hay al menos una cuota numérica válida
  const hasAnyOdds = [result.home, result.draw, result.away, result.overOdds, result.underOdds]
    .some(v => typeof v === 'number' && v > 1.0);

  const final = hasAnyOdds ? result : null;
  bsdCacheSet(cacheKey, final, 30);
  return final;
}

/**
 * Obtiene las alineaciones confirmadas de BSD.
 *
 * Retorna el objeto lineups de BSD o null.
 * {
 *   event_id,
 *   lineup_status: 'confirmed' | 'predicted' | 'unavailable',
 *   lineups: { home: { team_name, formation, players: [...] }, away: {...} }
 * }
 */
async function getBSDLineups(espnLeagueSlug, matchDate, homeTeamName, awayTeamName) {
  const cacheKey = `bsd_lineups_${espnLeagueSlug}_${(matchDate||'').slice(0,10)}_${normTeam(homeTeamName)}`;
  const cached = bsdCacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const eventId = await findBSDEventId(espnLeagueSlug, matchDate, homeTeamName, awayTeamName);
  if (!eventId) {
    bsdCacheSet(cacheKey, null, 15);
    return null;
  }

  const data = await bsdGet(`/events/${eventId}/lineups/`);
  if (!data?.lineups) {
    bsdCacheSet(cacheKey, null, 15);
    return null;
  }

  bsdCacheSet(cacheKey, data, 60);
  return data;
}

/**
 * Limpia el cache de BSD (útil desde endpoints de administración).
 */
function clearBSDCache() {
  BSD_CACHE.clear();
}

module.exports = {
  getBSDOdds,
  getBSDLineups,
  findBSDEventId,
  clearBSDCache,
  ESPN_TO_BSD_LEAGUE,
};
