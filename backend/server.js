// ── Polyfill para Node 18: File no está en el scope global
if (typeof File === 'undefined') { global.File = require('buffer').File; }

/**
 * =====================================================================
 * CHALACA — Backend Scraper & Cache Server
 * =====================================================================
 * Arquitectura Optimizada:
 *   1. API-Sports             → Partidos, Forma y H2H (Usando caché local)
 *   2. Axios + Cheerio        → Understat (xG), Transfermarkt (Lesiones)
 *   3. Caché en memoria (TTL) → Protege las API keys rotativas
 * =====================================================================
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const axios    = require('axios');
const cheerio  = require('cheerio');
const { generateAIAnalysis } = require('./geminiService');

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────
// CACHÉ EN MEMORIA  (Evita consumir la cuota de la API)
// ─────────────────────────────────────────────────────────────────────
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMinutes = 60) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMinutes * 60_000 });
}

// ─────────────────────────────────────────────────────────────────────
// HTTP CLIENTE AXIOS  (para Understat y Transfermarkt)
// ─────────────────────────────────────────────────────────────────────
const http = axios.create({
  timeout: 15_000,
  headers: {
    'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  },
});

// ─────────────────────────────────────────────────────────────────────
// API-SPORTS CLIENT (CON ROTACIÓN DE LLAVES)
// ─────────────────────────────────────────────────────────────────────
const apiSports = axios.create({
  baseURL : 'https://v3.football.api-sports.io',
  timeout : 15_000,
});

let currentKeyIndex = 0;
const bannedKeys = new Set();

apiSports.interceptors.request.use((config) => {
  const keyString = process.env.FOOTBALL_API_KEY || '';
  if (keyString) {
    let keys = keyString.split(',').map(k => k.trim()).filter(Boolean);
    // Filtrar llaves baneadas temporalmente
    const activeKeys = keys.filter(k => !bannedKeys.has(k));
    if (activeKeys.length === 0) activeKeys.push(...keys); // Fallback si todas están baneadas
    
    if (activeKeys.length > 0) {
      const finalKey = activeKeys[currentKeyIndex % activeKeys.length];
      currentKeyIndex++;
      config.headers['x-apisports-key'] = finalKey;
    }
  }
  return config;
});

apiSports.interceptors.response.use(response => {
  if (response.data && response.data.errors && (response.data.errors.requests || response.data.errors.access)) {
    // Si la llave actual alcanzó el límite o está suspendida, la baneamos
    const usedKey = response.config.headers['x-apisports-key'];
    if (usedKey) bannedKeys.add(usedKey);
  }
  return response;
});

// ════════════════════════════════════════════════════════════════════
//  ENDPOINTS
// ════════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), cacheSize: cache.size, apiConfigured: !!process.env.FOOTBALL_API_KEY });
});

app.delete('/api/cache', (req, res) => {
  cache.clear();
  res.json({ message: 'Caché limpiada correctamente' });
});

const { getTodayFixtures, getLiveFixtures, ALLOWED_LEAGUES } = require('./espnAdapter');

// ─────────────────────────────────────────────────────────────────────
// 1. PARTIDOS DEL DÍA — ESPN (Caché 10 mins)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/fixtures/today', async (req, res) => {
  try {
    const fixtures = await getTodayFixtures();
    return res.json({ source: 'espn', fromCache: false, data: fixtures });
  } catch (err) {
    return res.status(500).json({ error: 'Error obteniendo partidos', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 1b. PARTIDOS EN VIVO — ESPN (Caché 1 min)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/fixtures/live', async (req, res) => {
  try {
    const fixtures = await getLiveFixtures();
    return res.json({ source: 'espn', data: fixtures });
  } catch (err) {
    return res.status(500).json({ error: 'Error obteniendo partidos en vivo', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 1c. PARTIDOS POR FECHA — ESPN (fecha: YYYY-MM-DD)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/fixtures/date/:date', async (req, res) => {
  const { date } = req.params; // 'YYYY-MM-DD'
  const dateParam = date.replace(/-/g, ''); // 'YYYYMMDD' para ESPN

  const todayStr = new Date().toISOString().slice(0, 10);
  const isPast   = date < todayStr;
  const ttl      = isPast ? 60 : 1; // días pasados: 60 min / hoy y futuro: 1 min

  const cacheKey = `espn_date_${date}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return res.json({ source: 'espn', fromCache: true, data: cached });

  try {
    const requestsWithSlug = Object.keys(ALLOWED_LEAGUES).map(l =>
      axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${dateParam}&limit=50`)
        .then(res => ({ slug: l, data: res.data }))
    );
    const resultsWithSlug = await Promise.allSettled(requestsWithSlug);

    let allFixtures = [];
    let hasLiveMatches = false;

    for (const r of resultsWithSlug) {
      if (r.status !== 'fulfilled' || !r.value.data.events) continue;
      const { slug, data } = r.value;
      const leagueInfo = data.leagues?.[0];
      data.events.forEach(e => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find(c => c.homeAway === 'home');
        const away = comp?.competitors?.find(c => c.homeAway === 'away');
        const statusObj = comp?.status || e.status;
        const state  = statusObj?.type?.state;
        const getScore = c => {
          if (!c) return null;
          if (c.score?.value !== undefined) return parseInt(c.score.value);
          if (c.score !== undefined) return parseInt(c.score);
          return null;
        };
        let statusShort = 'NS';
        if (state === 'post') statusShort = 'FT';
        else if (state === 'in') {
          const p = statusObj?.period;
          statusShort = p === 1 ? '1H' : p === 2 ? '2H' : 'HT';
          hasLiveMatches = true;
        }

        const fixture = {
          fixture: { id: e.id, date: e.date, status: { short: statusShort, elapsed: statusObj?.clock ? Math.floor(statusObj.clock / 60) : 0 } },
          league:  {
            id:      slug,
            name:    ALLOWED_LEAGUES[slug],
            logo:    leagueInfo?.logos?.[0]?.href || '',
            country: leagueInfo?.shortName || '',
          },
          teams: {
            home: { id: home?.id, name: home?.team?.displayName || home?.team?.name, logo: home?.team?.logo },
            away: { id: away?.id, name: away?.team?.displayName || away?.team?.name, logo: away?.team?.logo },
          },
          goals: { home: getScore(home), away: getScore(away) },
        };
        allFixtures.push(fixture);
      });
    }

    // Si hay partidos en vivo, forzar caché a 1 minuto sin importar el día
    const finalTtl = hasLiveMatches ? 1 : ttl;
    cacheSet(cacheKey, allFixtures, finalTtl);
    return res.json({ source: 'espn', fromCache: false, data: allFixtures });
  } catch (err) {
    return res.status(500).json({ error: 'Error obteniendo partidos por fecha', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PROXY PARA ESPN (Evitar CORS en Frontend)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/espn/summary/:id', async (req, res) => {
  try {
    const { data } = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${req.params.id}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/espn/team/:id/schedule', async (req, res) => {
  try {
    const teamId     = req.params.id;
    const leagueSlug = req.query.league || 'all';

    // Función para filtrar y ordenar partidos completados
    const filterCompleted = (events) => (events || [])
      .filter(e => {
        const state = e.competitions?.[0]?.status?.type?.state;
        if (state !== 'post') return false;
        
        // Excluir amistosos
        const isFriendly = 
          e.season?.slug?.toLowerCase().includes('friendly') || 
          e.name?.toLowerCase().includes('friendly') ||
          e.name?.toLowerCase().includes('amistoso');
        
        return !isFriendly;
      })
      // Eliminar duplicados (puede pasar si combinamos ligas/temporadas)
      .filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);

    // Determinar ligas a consultar para combinar liga local + torneos internacionales
    const leaguesToFetch = new Set();
    if (leagueSlug && leagueSlug !== 'all') leaguesToFetch.add(leagueSlug);

    try {
      // Obtener la liga local (defaultLeague) del equipo desde ESPN
      const teamRes = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${teamId}`);
      const defaultLeague = teamRes.data?.team?.defaultLeague?.slug;
      if (defaultLeague && defaultLeague !== 'all') {
        leaguesToFetch.add(defaultLeague);
      }
    } catch (e) {
      console.warn(`No se pudo obtener liga local para el equipo ${teamId}`);
    }

    if (leaguesToFetch.size === 0) leaguesToFetch.add('all'); // Fallback

    // Consultar ambas ligas en paralelo
    const fetchPromises = Array.from(leaguesToFetch).map(slug => 
      axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${teamId}/schedule`)
           .then(res => res.data?.events || [])
           .catch(e => { console.warn(`Fallo al obtener schedule de ${slug} para ${teamId}`); return []; })
    );

    const results = await Promise.all(fetchPromises);
    const combinedEvents = results.flat();

    let completed = filterCompleted(combinedEvents);

    res.json({ events: completed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 2. FORMA RECIENTE DEL EQUIPO — api-sports (Caché 2h)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/scrapers/team-form', async (req, res) => {
  const { teamName, apiSportsId } = req.query;
  if (!apiSportsId) return res.status(400).json({ error: 'Falta apiSportsId' });

  const cacheKey = `team_form_${apiSportsId}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return res.json({ source: 'api-sports', fromCache: true, data: cached });

  try {
    const r = await apiSports.get('/fixtures', { params: { team: apiSportsId, season: 2024 } });
    const allFixtures = (r.data.response || []).filter(f => f.fixture.status.short === 'FT');
    // Tomar los últimos 10 partidos ordenados por fecha
    const fixtures = allFixtures.sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date)).slice(0, 10).map(f => {
      const isHome = f.teams.home.id === parseInt(apiSportsId);
      const hg = f.goals.home, ag = f.goals.away;
      let result = 'D';
      if (hg !== null && ag !== null)
        result = isHome ? (hg > ag ? 'W' : hg < ag ? 'L' : 'D') : (ag > hg ? 'W' : ag < hg ? 'L' : 'D');
      return {
        result,
        score   : `${hg ?? '?'} - ${ag ?? '?'}`,
        opponent: isHome ? f.teams.away.name : f.teams.home.name,
        isHome,
        date    : f.fixture.date,
      };
    });

    const payload = { teamName, recentForm: fixtures };
    cacheSet(cacheKey, payload, 120);
    return res.json({ source: 'api-sports', fromCache: false, data: payload });
  } catch (err) {
    return res.status(500).json({ error: 'Error obteniendo forma del equipo', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 3. xG + ESTADÍSTICAS AVANZADAS — Understat (Caché 6h)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/scrapers/xg', async (req, res) => {
  const { teamName, season = '2024' } = req.query;
  if (!teamName) return res.status(400).json({ error: 'Falta teamName' });

  const cacheKey = `xg_${teamName}_${season}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return res.json({ source: 'Understat', fromCache: true, data: cached });

  const slug = teamName.replace(/ /g, '_');
  const url  = `https://understat.com/team/${encodeURIComponent(slug)}/${season}`;

  try {
    const { data: html } = await http.get(url);
    const $ = cheerio.load(html);

    let datesData = null;
    $('script').each((_, el) => {
      const text = $(el).html() || '';
      if (text.includes('datesData')) {
        const m = text.match(/var datesData\s*=\s*JSON\.parse\('(.+?)'\)/s);
        if (m) {
          try {
            datesData = JSON.parse(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
          } catch {}
        }
      }
    });

    if (!datesData) throw new Error('Datos no encontrados en Understat');

    const matches = datesData.slice(-15).map(m => ({
      date        : m.datetime,
      opponent    : m.h_team === slug.replace(/_/g,' ') ? m.a_team : m.h_team,
      isHome      : m.h_team === slug.replace(/_/g,' '),
      result      : m.result,
      goals       : parseInt(m.scored),
      goalsAgainst: parseInt(m.missed),
      xG          : parseFloat(m.xG),
      xGA         : parseFloat(m.xGA),
    }));

    cacheSet(cacheKey, matches, 360);
    return res.json({ source: 'Understat', fromCache: false, data: matches });
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener xG', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 4. LESIONES / BAJAS — Transfermarkt → Fallback api-sports (Caché 3h)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/scrapers/injuries', async (req, res) => {
  const { teamSlug, apiSportsId } = req.query;
  if (!teamSlug && !apiSportsId) return res.status(400).json({ error: 'Falta teamSlug o apiSportsId' });

  const cacheKey = `injuries_${teamSlug || apiSportsId}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return res.json({ source: 'Caché', fromCache: true, data: cached });

  if (teamSlug) {
    try {
      const url = `https://www.transfermarkt.com/${teamSlug}/absenzen/verein/0`;
      const { data: html } = await http.get(url, { headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
      const $ = cheerio.load(html);

      const injuries = [];
      $('table.items tbody tr').each((_, row) => {
        const name   = $(row).find('td.hauptlink a').first().text().trim();
        const reason = $(row).find('td').eq(3).text().trim();
        const until  = $(row).find('td').eq(5).text().trim();
        if (name) injuries.push({ name, reason, returnDate: until });
      });

      cacheSet(cacheKey, injuries, 180);
      return res.json({ source: 'Transfermarkt', fromCache: false, data: injuries });
    } catch (err) {
      console.warn(`[Transfermarkt] Falló. Usando api-sports.`);
    }
  }

  if (!apiSportsId) return res.status(422).json({ error: 'Sin ID para fallback' });
  try {
    const r      = await apiSports.get('/injuries', { params: { team: apiSportsId, season: 2024 } });
    const injuries = (r.data.response || []).map(i => ({
      name      : i.player.name,
      reason    : i.player.reason,
      returnDate: null,
    }));
    cacheSet(cacheKey, injuries, 180);
    return res.json({ source: 'api-sports', fromCache: false, data: injuries });
  } catch (err) {
    return res.status(500).json({ error: 'Error en bajas', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 5. H2H — api-sports (Caché 48h)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/scrapers/h2h', async (req, res) => {
  const { home, away, homeApiId, awayApiId } = req.query;
  if (!homeApiId || !awayApiId) return res.status(400).json({ error: 'Faltan homeApiId y/o awayApiId' });

  const cacheKey = `h2h_${homeApiId}_${awayApiId}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return res.json({ source: 'api-sports', fromCache: true, data: cached });

  try {
    const r = await apiSports.get('/fixtures/headtohead', {
      params: { h2h: `${homeApiId}-${awayApiId}` },
    });
    const allFixtures = (r.data.response || []).filter(f => f.fixture.status.short === 'FT');
    const matches = allFixtures.sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date)).slice(0, 10).map(f => ({
      date  : f.fixture.date,
      home  : { name: f.teams.home.name, goals: f.goals.home },
      away  : { name: f.teams.away.name, goals: f.goals.away },
      winner: f.teams.home.winner ? f.teams.home.name : f.teams.away.winner ? f.teams.away.name : 'Draw',
      league: f.league.name,
    }));

    cacheSet(cacheKey, matches, 2880); // 48h
    return res.json({ source: 'api-sports', fromCache: false, data: matches });
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener H2H', details: err.message });
  }
});


// ─────────────────────────────────────────────────────────────────────
// 6. ANÁLISIS IA — Gemini (Caché 30 min por fixture)
// ─────────────────────────────────────────────────────────────────────
app.post('/api/ai/analyze', async (req, res) => {
  const matchData = req.body;
  if (!matchData || !matchData.homeName || !matchData.awayName) {
    return res.status(400).json({ error: 'Datos del partido incompletos' });
  }

  const cacheKey = `ai_analysis_${matchData.fixtureId || matchData.homeName}_${matchData.awayName}`;
  const cached   = cacheGet(cacheKey);
  if (cached) {
    return res.json({ source: 'cache', fromCache: true, data: cached });
  }

  try {
    const { text } = await generateAIAnalysis(matchData);
    let parsedData = text;
    try {
      parsedData = JSON.parse(text);
    } catch (e) {
      console.warn('Gemini response was not valid JSON:', text.substring(0, 50));
    }
    cacheSet(cacheKey, parsedData, 30); // 30 minutos
    return res.json({ source: 'gemini', fromCache: false, data: parsedData });
  } catch (err) {
    console.error('[Gemini] Error:', err.message);
    return res.status(500).json({ error: 'Error generando análisis IA', details: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n⚽ ══════════════════════════════════════════════════');
  console.log(`   CHALACA Backend Ligero  →  http://localhost:${PORT}`);
  console.log('   ══════════════════════════════════════════════════');
  console.log('   ✓ Caché en Memoria Activa');
  console.log('   ✓ Transfermarkt & Understat Scrapers Activos');
  console.log('   ✓ API-Sports (Caché proxy) Activa');
  console.log(`   ✓ Gemini IA ${process.env.GEMINI_API_KEY ? 'Activa ✨' : 'INACTIVA (sin GEMINI_API_KEY)'}`);
  console.log('⚽ ══════════════════════════════════════════════════\n');
});
