// ── Polyfill para Node 18: File no está en el scope global
if (typeof File === 'undefined') { global.File = require('buffer').File; }

/**
 * =====================================================================
 * CHALACA — Backend Scraper & Cache Server
 * =====================================================================
 * Arquitectura (100% gratuita, sin API keys):
 *   1. ESPN API interna     → Partidos, Forma, H2H, Cuotas (pickcenter)
 *   2. Axios + Cheerio      → Understat (xG), Transfermarkt (Lesiones)
 *   3. Caché en memoria TTL → Minimiza llamadas externas
 * =====================================================================
 */

require('dotenv').config({ path: __dirname + '/.env' });
const express  = require('express');
const cors     = require('cors');
const axios    = require('axios');
const cheerio  = require('cheerio');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('./database');
const JWT_SECRET = process.env.JWT_SECRET || 'chalaca_super_secret_key_2026';

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



// ════════════════════════════════════════════════════════════════════
//  ENDPOINTS
// ════════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), cacheSize: cache.size, source: 'ESPN (free)' });
});

app.delete('/api/cache', (req, res) => {
  cache.clear();
  res.json({ message: 'Caché limpiada correctamente' });
});

const { 
  getTodayFixtures, 
  getLiveFixtures, 
  getMatchSummary, 
  getEnrichedSummary, 
  getTeamSchedule, 
  ALLOWED_LEAGUES,
  axiosInstance 
} = require('./espnAdapter');

// ─────────────────────────────────────────────────────────────────────
// SUMMARY ENRIQUECIDO — Stats normalizadas para el motor de análisis
// Cubre todas las ligas: retorna null en campos sin datos (SAM) para
// que el motor use Poisson puro como fallback automático.
// ─────────────────────────────────────────────────────────────────────
app.get('/api/espn/enriched/:eventId', async (req, res) => {
  try {
    const data = await getEnrichedSummary(req.params.eventId);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 1. PARTIDOS DEL DÍA — ESPN (Caché 10 mins)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/fixtures/today', async (req, res) => {
  try {
    const { date } = req.query;
    let fixtures;
    if (date) {
      // Reutilizamos la lógica de getTodayFixtures pero pasando la fecha
      const requestsWithSlug = Object.keys(ALLOWED_LEAGUES).map(l => 
        axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${date.replace(/-/g, '')}`)
          .then(res => ({ slug: l, data: res.data }))
          .catch(() => null)
      );
    
      const resultsWithSlug = await Promise.all(requestsWithSlug);
      fixtures = [];
    
      for (const r of resultsWithSlug) {
        if (!r || !r.data.events) continue;
        const { slug, data } = r;
        const mapped = data.events.map(e => {
          const fixture = mapESPNToApiSports(e);
          fixture.league.id = slug;
          fixture.league.name = ALLOWED_LEAGUES[slug];
          return fixture;
        });
        fixtures.push(...mapped);
      }
    } else {
      fixtures = await getTodayFixtures();
    }
    return res.json({ source: 'espn', fromCache: false, data: fixtures });
  } catch (err) {
    return res.status(500).json({ error: 'Error obteniendo partidos', details: err.message });
  }
});

app.get('/api/espn/summary/:eventId', async (req, res) => {
  try {
    const data = await getMatchSummary(req.params.eventId);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/espn/team/:teamId/schedule', async (req, res) => {
  try {
    const leagueSlug = req.query.league || 'all';
    const events = await getTeamSchedule(leagueSlug, req.params.teamId);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  // TTL mejorado:
  // - Días pasados: 4h (los resultados no cambian)
  // - Hoy/futuro sin live: 5 min (redujo re-fetches de cada 1 min a cada 5 min)
  // - Hoy con partidos en vivo: 2 min (más fresco, pero sin bombardear ESPN)
  const ttlBase  = isPast ? 240 : 5;

  const cacheKey = `espn_date_${date}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return res.json({ source: 'espn', fromCache: true, data: cached });

  try {
    // Timeout de 3s por liga: si ESPN tarda más, descartamos esa liga pero
    // respondemos con las demás (no bloqueamos toda la respuesta)
    const requestsWithSlug = Object.keys(ALLOWED_LEAGUES).map(l =>
      axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${dateParam}&limit=50`, { timeout: 5000 })
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

    // Si hay partidos en vivo, TTL de 2 min para mantener scores frescos
    const finalTtl = hasLiveMatches ? 2 : ttlBase;
    cacheSet(cacheKey, allFixtures, finalTtl);
    return res.json({ source: 'espn', fromCache: false, data: allFixtures });
  } catch (err) {
    return res.status(500).json({ error: 'Error obteniendo partidos por fecha', details: err.message });
  }
});

// El endpoint anterior /api/espn/summary/:id ha sido consolidado 
// con /api/espn/summary/:eventId (linea 101) que ya usa getMatchSummary con caché.

// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISIS COMPLETO DE PARTIDO — Un solo endpoint que reemplaza ~24 llamadas
// del frontend. Mueve el trabajo pesado al servidor donde hay caché en memoria.
// Para ligas SAM sin boxscore, retorna null en corners/tarjetas (no error)
// para que el motor de análisis active el fallback Poisson automáticamente.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/espn/match/:eventId/analysis', async (req, res) => {
  const { eventId } = req.params;
  const cacheKey = `match_analysis_${eventId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ fromCache: true, data: cached });

  try {
    // 1. Resumen principal del partido
    const summary = await getMatchSummary(eventId);
    if (!summary?.header) return res.status(404).json({ error: 'Partido no encontrado' });

    const comp     = summary.header.competitions[0];
    const homeComp = comp.competitors.find(c => c.homeAway === 'home');
    const awayComp = comp.competitors.find(c => c.homeAway === 'away');
    const homeId   = homeComp.id;
    const awayId   = awayComp.id;
    const leagueSlug = summary.header.league?.slug || 'all';

    // 2. Schedules de ambos equipos en paralelo (igual que el endpoint individual)
    const filterCompleted = (events) => (events || [])
      .filter(e => {
        const state = e.competitions?.[0]?.status?.type?.state;
        if (state !== 'post') return false;
        const name = (e.season?.slug || e.name || '').toLowerCase();
        return !name.includes('friendly') && !name.includes('amistoso');
      })
      .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);

    const fetchSchedule = async (teamId) => {
      const slugs = new Set(leagueSlug !== 'all' ? [leagueSlug] : []);
      try {
        const tr = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${teamId}`);
        const dl = tr.data?.team?.defaultLeague?.slug;
        if (dl && dl !== 'all') slugs.add(dl);
      } catch (_) {}
      if (!slugs.size) slugs.add('all');
      const results = await Promise.all(Array.from(slugs).map(s =>
        axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/teams/${teamId}/schedule`)
          .then(r => r.data?.events || []).catch(() => [])
      ));
      return filterCompleted(results.flat());
    };

    const [homeRaw, awayRaw] = await Promise.all([fetchSchedule(homeId), fetchSchedule(awayId)]);

    // 3. Mapear eventos al formato del motor de análisis
    const mapEvent = (ev) => {
      const c     = ev.competitions?.[0];
      const homeC = c?.competitors?.find(x => x.homeAway === 'home');
      const awayC = c?.competitors?.find(x => x.homeAway === 'away');
      const getScore = t => parseInt(t?.score?.value ?? t?.score ?? 0);
      const getName  = t => t?.team?.displayName || t?.team?.name || t?.team?.shortDisplayName || '?';
      return {
        fixture: { id: ev.id, date: ev.date, status: { short: 'FT' } },
        league:  { name: ev.league?.name || ev.season?.displayName || 'Desconocido' },
        teams:   { home: { id: homeC?.id, name: getName(homeC), winner: homeC?.winner },
                   away: { id: awayC?.id, name: getName(awayC), winner: awayC?.winner } },
        goals:   { home: getScore(homeC), away: getScore(awayC) },
      };
    };

    const enrichMatch = (m, teamId) => {
      const isHome = String(m.teams?.home?.id) === String(teamId);
      const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
      const result = isHome ? (winner === 'home' ? 'W' : winner === 'draw' ? 'D' : 'L')
                            : (winner === 'away' ? 'W' : winner === 'draw' ? 'D' : 'L');
      const dateStr = m.fixture?.date
        ? new Date(m.fixture.date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })
        : '';
      return { ...m, _isHome: isHome, _opponent: isHome ? m.teams?.away?.name : m.teams?.home?.name,
               _result: result, _date: dateStr, _league: m.league?.name || '' };
    };

    const hm = homeRaw.filter(e => String(e.id) !== String(eventId)).map(e => enrichMatch(mapEvent(e), homeId));
    const am = awayRaw.filter(e => String(e.id) !== String(eventId)).map(e => enrichMatch(mapEvent(e), awayId));

    // 4. Summaries históricos en paralelo (máx 12 por equipo = hasta 24 llamadas)
    //    El caché de getMatchSummary (24h para partidos terminados) hace esto muy rápido
    const fetchHistSummaries = async (matches) => {
      const ids     = matches.slice(0, 12).map(m => m.fixture.id);
      const results = await Promise.allSettled(ids.map(id => getMatchSummary(id)));
      return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    };

    const [homeHist, awayHist] = await Promise.all([fetchHistSummaries(hm), fetchHistSummaries(am)]);

    // 5. Extraer eventos (goles/tarjetas) de los summaries históricos
    const extractEvs = (s) => (s.keyEvents || []).map(e => {
      const t = e.type?.text || '';
      return {
        type:   (t.includes('Goal') || t.includes('Penalty - Scored')) ? 'Goal' : t.includes('Card') ? 'Card' : 'subst',
        detail: t,
        time:   { elapsed: e.clock?.value ? Math.floor(e.clock.value / 60) : parseInt(e.clock?.displayValue) || 0 },
        team:   { id: String(e.team?.id) },
        player: { name: e.participants?.[0]?.athlete?.displayName },
      };
    });

    // 6. Análisis de Corners — retorna null si ESPN no provee boxscore (ej. Liga 1 Perú)
    //    El motor de análisis omite el mercado de corners automáticamente cuando recibe null.
    const getTeamCorners = (s, tid) => {
      const teams = s?.boxscore?.teams || [];
      if (!teams[0]?.statistics) return null;  // ← Fallback SAM: no hay stats
      const t    = teams.find(t => String(t.team?.id) === String(tid));
      const stat = t?.statistics?.find(s => s.name === 'wonCorners')?.displayValue;
      return stat != null ? parseInt(stat) : null;
    };
    const analyzeCorners = (hist, tid) => {
      const arr = hist.map(s => getTeamCorners(s, tid)).filter(c => c !== null);
      if (!arr.length) return null; // null = "sin datos" → el motor usa Poisson puro
      const total = arr.reduce((a, b) => a + b, 0);
      return { avg: (total / arr.length).toFixed(1), total, max: Math.max(...arr),
               matches: arr.length, over3: arr.filter(c => c > 3).length,
               over4: arr.filter(c => c > 4).length, over5: arr.filter(c => c > 5).length };
    };

    // 7. Análisis de Tarjetas — retorna null si no hay keyEvents (ej. Venezuela)
    const analyzeCards = (hist, tid) => {
      const yArr = [], rArr = [];
      hist.forEach(s => {
        let y = 0, r = 0;
        (s.keyEvents || []).forEach(e => {
          if (e.type?.text?.includes('Card') && String(e.team?.id) === String(tid)) {
            e.type.text.toLowerCase().includes('red') ? r++ : y++;
          }
        });
        yArr.push(y); rArr.push(r);
      });
      if (!yArr.length) return null; // null = "sin datos" → motor omite mercado tarjetas
      const n = yArr.length;
      const totalY = yArr.reduce((a, b) => a + b, 0);
      const totalR = rArr.reduce((a, b) => a + b, 0);
      const total  = totalY + totalR;
      const combined = yArr.map((y, i) => y + rArr[i]);
      return {
        avg: (total / n).toFixed(1), total, max: Math.max(...combined), matches: n,
        over1: combined.filter(c => c > 1).length, over2: combined.filter(c => c > 2).length,
        over3: combined.filter(c => c > 3).length,
        yellow: totalY, avgYellow: (totalY / n).toFixed(2),
        over1Y: yArr.filter(c => c > 1).length, over2Y: yArr.filter(c => c > 2).length,
        over3Y: yArr.filter(c => c > 3).length, maxYellow: Math.max(...yArr),
        red: totalR, avgRed: (totalR / n).toFixed(2),
        over0R: rArr.filter(c => c > 0).length, maxRed: Math.max(...rArr),
      };
    };

    // 8. H2H desde summary
    const h2hTeamA  = summary.headToHeadGames?.[0]?.team;
    const resolve   = o => o?.displayName || o?.name || o?.shortName || o?.abbreviation || '?';
    const h2h = (summary.headToHeadGames?.[0]?.events || []).map(e => {
      const hg = parseInt(e.homeTeamScore ?? 0), ag = parseInt(e.awayTeamScore ?? 0);
      const aId = String(h2hTeamA?.id), bId = String(e.opponent?.id);
      const isAHome = String(e.homeTeamId) === aId;
      return {
        fixture: { date: e.gameDate, status: { short: 'FT' } },
        teams: {
          home: { id: isAHome ? aId : bId,   name: isAHome ? resolve(h2hTeamA) : resolve(e.opponent), winner: hg > ag },
          away: { id: isAHome ? bId : aId,   name: isAHome ? resolve(e.opponent) : resolve(h2hTeamA), winner: ag > hg },
        },
        goals: { home: hg, away: ag },
      };
    });

    // 9. Lesiones desde rosters
    const injuries = [];
    (summary.rosters || []).forEach(r =>
      (r.roster || []).forEach(p => {
        if (p.injured || p.status === 'out')
          injuries.push({ player: { name: p.athlete?.displayName, reason: p.status || 'Lesión',
                          photo: p.athlete?.headshot?.href }, team: { name: r.team?.displayName } });
      })
    );

    // 10. Cuotas de mercado (PickCenter de ESPN)
    let marketInsight = null, marketOdds = null;
    try {
      const pc = summary.pickcenter;
      if (Array.isArray(pc) && pc.length > 0) {
        const item = pc[0];
        const getDec = o => {
          if (!o) return null;
          const v = parseFloat(o.value || o.moneyLine || 0);
          return v > 0 ? (v / 100) + 1 : v < 0 ? (100 / Math.abs(v)) + 1 : null;
        };
        marketInsight = {
          predictions: {
            percent: {
              home: item.homeTeamOdds?.winPercentage ? `${Math.round(item.homeTeamOdds.winPercentage)}` : null,
              draw: item.drawOdds?.winPercentage     ? `${Math.round(item.drawOdds.winPercentage)}`     : null,
              away: item.awayTeamOdds?.winPercentage ? `${Math.round(item.awayTeamOdds.winPercentage)}` : null,
            },
            winner: { comment: item.provider?.name || '' },
          },
        };
        marketOdds = { home: getDec(item.homeTeamOdds), away: getDec(item.awayTeamOdds), draw: getDec(item.drawOdds) };
      }
    } catch (_) {}

    // 11. Posiciones en tabla (motivación)
    let matchStandings = null;
    try {
      const st = summary.standings?.groups?.[0]?.standings?.entries;
      if (st?.length > 0) {
        const hSt = st.find(s => String(s.team?.id) === String(homeId));
        const aSt = st.find(s => String(s.team?.id) === String(awayId));
        if (hSt && aSt) matchStandings = {
          homeRank: hSt.stats?.find(s => s.name === 'rank')?.value,
          awayRank: aSt.stats?.find(s => s.name === 'rank')?.value,
          total: st.length,
        };
      }
    } catch (_) {}

    // 12. Stats avanzadas (xG, posesión) — null para ligas sin boxscore
    let advancedStats = null;
    try {
      const box = summary.boxscore?.teams;
      if (box?.length === 2) {
        const getStat = (t, name) => { const v = parseFloat(t.statistics?.find(s => s.name === name)?.displayValue); return isNaN(v) ? null : v; };
        const hBox = box.find(t => String(t.team?.id) === String(homeId));
        const aBox = box.find(t => String(t.team?.id) === String(awayId));
        if (hBox && aBox) advancedStats = {
          home: { xG: getStat(hBox, 'expectedGoals'), possession: getStat(hBox, 'possessionPct') },
          away: { xG: getStat(aBox, 'expectedGoals'), possession: getStat(aBox, 'possessionPct') },
        };
      }
    } catch (_) {}

    const result = {
      homeMatches:    hm,
      awayMatches:    am,
      h2h,
      currentEvents:  extractEvs(summary),
      homeHistEvs:    homeHist.flatMap(s => extractEvs(s)),
      awayHistEvs:    awayHist.flatMap(s => extractEvs(s)),
      homeCornersData: analyzeCorners(homeHist, homeId),
      awayCornersData: analyzeCorners(awayHist, awayId),
      homeCardsData:   analyzeCards(homeHist, homeId),
      awayCardsData:   analyzeCards(awayHist, awayId),
      injuries, marketInsight, marketOdds, matchStandings, advancedStats,
    };

    // Caché: 4h para partidos terminados, 5 min para live/upcoming
    const matchState = summary.header?.competitions?.[0]?.status?.type?.state;
    cacheSet(cacheKey, result, matchState === 'post' ? 240 : 5);
    return res.json({ fromCache: false, data: result });

  } catch (err) {
    console.error('[match/analysis]', err.message);
    return res.status(500).json({ error: 'Error al procesar análisis del partido', details: err.message });
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
    const { data: html } = await axiosInstance.get(url);
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
// 4. LESIONES / BAJAS — Transfermarkt (Caché 3h)
// ─────────────────────────────────────────────────────────────────────
app.get('/api/scrapers/injuries', async (req, res) => {
  const { teamSlug } = req.query;
  if (!teamSlug) return res.status(400).json({ error: 'Falta teamSlug' });

  const cacheKey = `injuries_${teamSlug}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return res.json({ source: 'Caché', fromCache: true, data: cached });

  try {
    const url = `https://www.transfermarkt.com/${teamSlug}/absenzen/verein/0`;
    const { data: html } = await axiosInstance.get(url, { headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
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
    return res.status(500).json({ error: 'Error obteniendo bajas', details: err.message });
  }
});





// ─────────────────────────────────────────────────────────────────────
// 7. AUTENTICACIÓN Y ADMINISTRACIÓN DE USUARIOS
// ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const { error } = await supabase.from('users').insert([{ username, password: hash, role: 'pending' }]);
    if (error) throw error;
    res.json({ success: true, message: 'Usuario registrado correctamente' });
  } catch (e) {
    if (e.message?.includes('duplicate') || e.code === '23505') return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: user, error } = await supabase.from('users').select('*').eq('username', username).single();
    if (error || !user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress || 'Desconocida';
    
    // Actualización asíncrona para no bloquear el login (si falla porque la columna no existe, se ignora)
    supabase.from('users').update({ last_ip: clientIp, last_login: new Date().toISOString() }).eq('id', user.id).then();

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar_url: user.avatar_url } });
  } catch(e) {
    res.status(500).json({ error: 'Error en login' });
  }
});

// Ver perfil (útil para revisar si el rol cambió)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase.from('users').select('role').eq('id', req.user.id).single();
    if (error || !user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ role: user.role });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── Google OAuth via Supabase ──────────────────────────────────────────
// El frontend obtiene la sesión de Supabase tras el OAuth y nos manda
// el access_token. Nosotros verificamos con Supabase y devolvemos nuestro JWT.
app.post('/api/auth/google', async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ error: 'Falta access_token' });

  try {
    // Verificar el token con Supabase Auth
    const { data: { user: googleUser }, error } = await supabase.auth.getUser(access_token);
    if (error || !googleUser) return res.status(401).json({ error: 'Token de Google inválido' });

    const email      = googleUser.email;
    const googleId   = googleUser.id;
    const avatarUrl  = googleUser.user_metadata?.avatar_url || null;
    const fullName   = googleUser.user_metadata?.full_name || googleUser.user_metadata?.name || email.split('@')[0];

    // Buscar usuario existente por google_id o email
    let { data: existing } = await supabase.from('users')
      .select('*')
      .or(`google_id.eq.${googleId},email.eq.${email}`)
      .maybeSingle();

    let dbUser = existing;

    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress || 'Desconocida';

    if (!dbUser) {
      // Crear usuario nuevo desde Google
      let username = fullName.replace(/\s+/g, '_').toLowerCase();
      // Asegurar que el username es único intentando insertarlo, si falla, añadir random
      let insertErr = null;
      let newUser = null;
      
      const insertAttempt = async (uname) => {
        return await supabase.from('users')
          .insert([{ username: uname, email, google_id: googleId, avatar_url: avatarUrl, password: '', role: 'pending', last_ip: clientIp, last_login: new Date().toISOString() }])
          .select()
          .single();
      };

      let attempt = await insertAttempt(username);
      if (attempt.error && (attempt.error.code === '23505' || attempt.error.message.includes('duplicate'))) {
        // Colisión de username, añadir random
        username = `${username}_${Math.floor(Math.random() * 10000)}`;
        attempt = await insertAttempt(username);
      }

      if (attempt.error) throw attempt.error;
      dbUser = attempt.data;
    } else {
      // Vincular cuenta o actualizar IP de login (se ignora error de columna faltante)
      const updatePayload = { last_ip: clientIp, last_login: new Date().toISOString() };
      if (!dbUser.google_id) {
        updatePayload.google_id = googleId;
        updatePayload.avatar_url = avatarUrl;
        updatePayload.email = email;
      }
      supabase.from('users').update(updatePayload).eq('id', dbUser.id).then();
    }

    const token = jwt.sign(
      { id: dbUser.id, username: dbUser.username, role: dbUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: dbUser.id, username: dbUser.username, role: dbUser.role, avatar_url: avatarUrl } });
  } catch (e) {
    console.error('[Google Auth]', e.message, e);
    res.status(500).json({ error: 'Error en autenticación con Google', details: e.message || e.toString() });
  }
});



// Middleware de Autenticación
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  next();
}

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase.from('users').select('id, username, role, created_at, email, google_id, last_ip, last_login').order('created_at', { ascending: false });
    if (error) throw error;
    
    // Obtener todas las picks
    const { data: allPicks } = await supabase.from('picks').select('user_id, pick_data');
    
    const usersWithStats = users.map(u => {
      const userPicks = (allPicks || []).filter(p => p.user_id === u.id);
      let total = 0, won = 0, lost = 0;
      userPicks.forEach(p => {
        const pd = p.pick_data;
        if (pd?.picks) {
          pd.picks.forEach(pick => {
            total++;
            if (pick.status === 'WON') won++;
            if (pick.status === 'LOST') lost++;
          });
        }
      });
      return { ...u, stats: { total, won, lost } };
    });

    res.json(usersWithStats);
  } catch (e) {
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

app.get('/api/admin/users/:ip/location', authenticateToken, requireAdmin, async (req, res) => {
  const { ip } = req.params;
  // Fallbacks for localhost IPs
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
    return res.json({ status: 'success', country: 'Localhost', regionName: 'Desarrollo', city: 'Local' });
  }
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}?lang=es`);
    res.json(response.data);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching location' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  if (req.params.id == req.user.id) return res.status(400).json({ error: 'No puedes borrar tu propia cuenta' });
  try {
    await supabase.from('users').delete().eq('id', req.params.id);
    // Picks cascade automatically if foreign key is ON DELETE CASCADE, which is the case in our SQL
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Error borrando usuario' });
  }
});

// Cambiar rol de usuario
app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['pending', 'user', 'vip', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (req.params.id == req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
  try {
    await supabase.from('users').update({ role }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al cambiar rol' });
  }
});

// Crear usuario desde el panel admin
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, role = 'user' } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const { error } = await supabase.from('users').insert([{ username, password: hash, role }]);
    if (error) throw error;
    res.json({ success: true, message: 'Usuario creado correctamente' });
  } catch (e) {
    if (e.message?.includes('duplicate') || e.code === '23505') return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error interno' });
  }
});

// Cambiar contraseña de usuario (Fuerza bruta de admin)
app.put('/api/admin/users/:id/password', authenticateToken, requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'La contraseña no puede estar vacía' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    await supabase.from('users').update({ password: hash }).eq('id', req.params.id);
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (e) {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 8. APUESTAS (PICKS) DEL USUARIO
// ─────────────────────────────────────────────────────────────────────
app.get('/api/picks', authenticateToken, async (req, res) => {
  try {
    const { data: picks, error } = await supabase.from('picks').select('*').eq('user_id', req.user.id).order('date', { ascending: false });
    if (error) throw error;
    const formatted = picks.map(p => ({
      ...p.pick_data,
      id: p.id
    }));
    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: 'Error obteniendo picks' });
  }
});

app.post('/api/picks', authenticateToken, async (req, res) => {
  try {
    const entry = req.body;
    const { data, error } = await supabase.from('picks').insert([{
      user_id: req.user.id,
      fixture_id: entry.fixtureId,
      home_team: entry.home,
      away_team: entry.away,
      date: entry.date || new Date().toISOString(),
      pick_data: entry
    }]).select('id').single();
    
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (e) {
    res.status(500).json({ error: 'Error guardando pick' });
  }
});

app.put('/api/picks/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase.from('picks').update({ pick_data: req.body }).eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error actualizando pick' });
  }
});

app.delete('/api/picks/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase.from('picks').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error borrando pick' });
  }
});

app.delete('/api/picks', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase.from('picks').delete().eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error borrando historial' });
  }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log('\n⚽ ══════════════════════════════════════════════════');
    console.log(`   CHALACA Backend  →  http://localhost:${PORT}`);
    console.log('   ══════════════════════════════════════════════════');
    console.log('   ✓ Fuente de datos: ESPN (100% gratuito)');
    console.log('   ✓ Caché en Memoria Activa');
    console.log('   ✓ Transfermarkt & Understat Scrapers Activos');
    console.log('   ✓ Endpoint /api/espn/match/:id/analysis listo');
    console.log('⚽ ══════════════════════════════════════════════════\n');

    // ── Pre-calentamiento del caché al arrancar ───────────────────────────
    // Precarga los partidos de hoy en background para que el primer usuario
    // no experimente la carga lenta de 20+ llamadas a ESPN.
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
        cacheSet(`espn_date_${todayKey}`, fixtures, hasLive ? 2 : 5);
        console.log(`✓ Caché pre-calentado: ${fixtures.length} partidos del ${todayKey}`);
      }).catch(() => {});
    }, 1000); // 1s después del arranque para no bloquear el bind del puerto
  });
}

module.exports = app;
