import axios from 'axios';

// ─────────────────────────────────────────────────────────────────
//  API-Football  (api-sports.io)  —  Free Plan: 100 req/day
//  Registro gratuito en https://www.api-football.com/
//  Sustituye YOUR_API_KEY por tu clave real.
// ─────────────────────────────────────────────────────────────────
const ENV_API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY || '';
const BASE_URL = 'https://v3.football.api-sports.io';

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Interceptor para inyectar la API key en cada petición (Soporta múltiples keys)
let currentKeyIndex = 0;

http.interceptors.request.use((config) => {
  const localKey = localStorage.getItem('football_api_key');
  const keyString = localKey || ENV_API_KEY;
  
  if (keyString) {
    // Extraer todas las keys separadas por coma y limpiar espacios
    const keys = keyString.split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      // Rotar (Round-Robin) para distribuir el límite
      const finalKey = keys[currentKeyIndex % keys.length];
      currentKeyIndex++;
      config.headers['x-apisports-key'] = finalKey;
    }
  }
  return config;
});

// ── Top leagues IDs ─────────────────────────────────────────────
export const TOP_LEAGUES = [
  { id: 39,  name: 'Premier League',     country: 'England',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', season: 2024 },
  { id: 140, name: 'La Liga',            country: 'Spain',    flag: '🇪🇸', season: 2024 },
  { id: 78,  name: 'Bundesliga',         country: 'Germany',  flag: '🇩🇪', season: 2024 },
  { id: 135, name: 'Serie A',            country: 'Italy',    flag: '🇮🇹', season: 2024 },
  { id: 61,  name: 'Ligue 1',            country: 'France',   flag: '🇫🇷', season: 2024 },
  { id: 2,   name: 'UEFA Champions Lg',  country: 'Europe',   flag: '🇪🇺', season: 2024 },
  { id: 3,   name: 'UEFA Europa Lg',     country: 'Europe',   flag: '🇪🇺', season: 2024 },
  { id: 281, name: 'Liga 1',             country: 'Peru',     flag: '🇵🇪', season: 2024 },
  { id: 128, name: 'Liga Profesional',   country: 'Argentina',flag: '🇦🇷', season: 2024 },
  { id: 253, name: 'MLS',                country: 'USA',      flag: '🇺🇸', season: 2024 },
  { id: 262, name: 'Liga MX',            country: 'Mexico',   flag: '🇲🇽', season: 2024 },
];

// ── Helper: safe get con Caché Local ─────────────────────────────
const CACHE_PREFIX = 'chalaca_cache_';

const safeGet = async (url, params = {}, ttlHours = 24) => {
  try {
    // Generar una clave única para esta petición
    const cacheKey = CACHE_PREFIX + url + '_' + JSON.stringify(params);
    
    // 1. Revisar Caché Local si ttlHours > 0
    if (ttlHours > 0) {
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        try {
          const cached = JSON.parse(cachedStr);
          const now = new Date().getTime();
          if (now < cached.expiry) {
            console.log(`[Cache Hit] Ahorrando API en: ${url}`);
            return cached.data;
          } else {
            localStorage.removeItem(cacheKey);
          }
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      }
    }

    // 2. Si no hay caché válida, pedir a la API
    const res = await http.get(url, { params });
    
    if (res.data && res.data.errors) {
      const errorKeys = Object.keys(res.data.errors);
      if (errorKeys.length > 0) {
        const errorMsg = res.data.errors[errorKeys[0]];
        console.error('[footballApi] API Error:', errorMsg);
        if (errorKeys.includes('rateLimit')) {
          throw new Error('Límite de peticiones alcanzado (10/minuto). Espera 60 segundos y recarga.');
        } else if (errorKeys.includes('requests')) {
          throw new Error('Límite diario de peticiones alcanzado.');
        }
        return []; 
      }
    }
    
    const responseData = res.data.response || [];
    
    // 3. Guardar en caché si es válido y ttl > 0
    if (ttlHours > 0 && responseData && (Array.isArray(responseData) ? responseData.length > 0 : true)) {
      const expiry = new Date().getTime() + (ttlHours * 60 * 60 * 1000);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ data: responseData, expiry }));
      } catch (e) {
        // Si el localStorage se llena (QuotaExceeded), borramos las cachés antiguas de la app
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
        }
      }
    }

    return responseData;
  } catch (err) {
    console.error(`[footballApi] HTTP Error en ${url}:`, err.message);
    return [];
  }
};

// ── Endpoints ────────────────────────────────────────────────────

/** Get fixtures for a specific date or for a league/season */
export const getFixtures = (params) => safeGet('/fixtures', params, 6);

/** Get today's fixtures across top leagues (ESPN BACKEND) */
export const getTodayFixtures = async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await axios.get(`${import.meta.env.VITE_BACKEND_URL || ''}/api/fixtures/today?date=${today}`);
    if (res.data && res.data.data) {
      return res.data.data;
    }
    return [];
  } catch (err) {
    console.error("Backend local no responde", err);
    return [];
  }
};

/** Get live fixtures (Caché de solo 1 minuto = 0.016 horas) */
export const getLiveFixtures = () => safeGet('/fixtures', { live: 'all' }, 0.016);

/** Get last N fixtures for a team (Caché de 12 horas) */
export const getTeamLastMatches = (teamId, last = 10) => safeGet('/fixtures', { team: teamId, last, timezone: 'America/Lima' }, 12);

/** Get team statistics in a league (Caché de 24 horas) */
export const getTeamStatistics = (teamId, leagueId, season) => safeGet('/teams/statistics', { team: teamId, league: leagueId, season }, 24);

/** Get H2H between two teams (Caché de 48 horas) */
export const getH2H = (homeId, awayId, last = 10) => safeGet('/fixtures/headtohead', { h2h: `${homeId}-${awayId}`, last }, 48);

/** Get injuries for a fixture (Caché de 4 horas) */
export const getInjuries = (fixtureId) => safeGet('/injuries', { fixture: fixtureId }, 4);

/** Get fixture statistics (Caché de 2 horas) */
export const getFixtureStatistics = (fixtureId) => safeGet('/fixtures/statistics', { fixture: fixtureId }, 2);

/** Get fixture events (goals, cards, etc.) (Caché de 2 horas) */
export const getFixtureEvents = (fixtureId) => safeGet('/fixtures/events', { fixture: fixtureId }, 2);

/** Get predicted lineups (Caché de 6 horas) */
export const getLineups = (fixtureId) => safeGet('/fixtures/lineups', { fixture: fixtureId }, 6);

/** Get player statistics for a fixture (Caché de 12 horas) */
export const getFixturePlayers = (fixtureId) => safeGet('/fixtures/players', { fixture: fixtureId }, 12);

/** Get standings (Caché de 12 horas) */
export const getStandings = (leagueId, season) => safeGet('/standings', { league: leagueId, season }, 12);

/** Get predictions (api-football built-in) (Caché de 24 horas) */
export const getOfficialPrediction = (fixtureId) => safeGet('/predictions', { fixture: fixtureId }, 24);

/** Check API status and quota (Sin caché, siempre real) */
export const checkApiStatus = () => safeGet('/status', {}, 0);

export default http;
