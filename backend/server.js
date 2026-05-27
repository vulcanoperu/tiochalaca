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
// UTILIDADES (Logger y Manejo de Errores)
// ─────────────────────────────────────────────────────────────────────
const logger = require('./utils/logger');
const errorHandler = require('./utils/errorHandler');

// ─────────────────────────────────────────────────────────────────────
// CACHÉ — Módulo centralizado (memoria + Supabase)
// ─────────────────────────────────────────────────────────────────────
const cache = require('./cache/cacheManager');
const cacheGet = cache.get;
const cacheSet = cache.set;
const supabaseCacheGet = cache.supabaseGet;
const supabaseCacheSet = cache.supabaseSet;

const fotmobAdapter = require('./adapters/fotmobAdapter');

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
  res.json({ status: 'ok', time: new Date().toISOString(), cacheSize: cache.size(), source: 'ESPN (free)' });
});

app.delete('/api/cache', (req, res) => {
  cache.clear();
  res.json({ message: 'Caché limpiada correctamente', cleared: true });
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
  const ttlBase  = isPast ? 240 : 5;

  const cacheKey = `espn_date_${date}`;

  // 1. Caché en memoria (local dev, misma instancia)
  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ source: 'espn', fromCache: true, data: cached });

  // 2. Caché en Supabase para días pasados (Vercel: sin memoria persistente)
  if (isPast) {
    try {
      const { data: sbCached } = await supabase
        .from('analysis_cache')
        .select('data')
        .eq('event_id', cacheKey)
        .single();
      if (sbCached?.data) {
        cacheSet(cacheKey, sbCached.data, ttlBase);
        return res.json({ source: 'espn', fromCache: true, data: sbCached.data });
      }
    } catch (_) {}
  }

  try {
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

    // Persistir en Supabase si es un día pasado (para Vercel cold starts)
    if (isPast && allFixtures.length > 0) {
      supabase.from('analysis_cache').upsert({
        event_id: cacheKey,
        data: allFixtures,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 días
      }, { onConflict: 'event_id' }).then(() => {}).catch(() => {});
    }

    return res.json({ source: 'espn', fromCache: false, data: allFixtures });
  } catch (err) {
    return res.status(500).json({ error: 'Error obteniendo partidos por fecha', details: err.message });
  }
});


// El endpoint anterior /api/espn/summary/:id ha sido consolidado 
// con /api/espn/summary/:eventId (linea 101) que ya usa getMatchSummary con caché.

// ─────────────────────────────────────────────────────────────────────────────
// HELPER CENTRAL: computeMatchAnalysis(eventId)
// Flujo de caché: Memoria (ms) → Supabase (ms) → ESPN scraping (s)
// Reutilizado por el endpoint individual y el endpoint batch.
// ─────────────────────────────────────────────────────────────────────────────
async function computeMatchAnalysis(eventId, refresh = false) {
  const cacheKey = `match_analysis_${eventId}`;

  if (!refresh) {
    const inMemory = cacheGet(cacheKey);
    if (inMemory) return { data: inMemory, fromCache: 'memory' };

    const fromSupabase = await supabaseCacheGet(eventId);
    if (fromSupabase) {
      cacheSet(cacheKey, fromSupabase, 240);
      return { data: fromSupabase, fromCache: 'supabase' };
    }
  }

  // 3. Scraping ESPN (frío — sin caché)
  try {
    const summary = await getMatchSummary(eventId, refresh);
    if (!summary?.header) return { data: null, fromCache: false };

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

    // 6. Análisis Estadístico Avanzado (Corners, Remates, Faltas, Fueras de Juego)
    const getTeamStat = (s, tid, statName) => {
      const teams = s?.boxscore?.teams || [];
      if (!teams[0]?.statistics) return null;
      const t = teams.find(t => String(t.team?.id) === String(tid));
      const stat = t?.statistics?.find(s => s.name === statName)?.displayValue;
      return stat != null ? parseFloat(stat) : null;
    };
    const analyzeStat = (hist, tid, statName, thresholds) => {
      const arr = hist.map(s => getTeamStat(s, tid, statName)).filter(c => c !== null && !isNaN(c));
      if (!arr.length) return null;
      const total = arr.reduce((a, b) => a + b, 0);
      const res = { 
        avg: +(total / arr.length).toFixed(1), total, max: Math.max(...arr), matches: arr.length 
      };
      if (thresholds) {
        thresholds.forEach(th => {
          res[`over${th}`] = arr.filter(c => c > th).length;
        });
      }
      return res;
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
        // ESPN standings en el summary: el ID del equipo está en entry.id, NO en entry.team.id
        // (entry.team es un string con el nombre del equipo)
        const hSt = st.find(s => String(s.id) === String(homeId));
        const aSt = st.find(s => String(s.id) === String(awayId));
        if (hSt && aSt) matchStandings = {
          homeRank: hSt.stats?.find(s => s.name === 'rank')?.value,
          awayRank: aSt.stats?.find(s => s.name === 'rank')?.value,
          total: st.length,
        };
      }
    } catch (_) {}

    // 11b. Fallback: si el summary no trajo tabla (partido finalizado), la pedimos por separado
    if (!matchStandings && leagueSlug && leagueSlug !== 'all') {
      try {
        const stRes = await axios.get(
          `https://site.api.espn.com/apis/v2/sports/soccer/${leagueSlug}/standings`,
          { timeout: 4000 }
        );
        const entries = stRes.data?.standings?.entries || 
                        stRes.data?.children?.[0]?.standings?.entries || [];
        if (entries.length > 0) {
          // El endpoint /standings usa entry.team.id; el del summary usa entry.id
          const findEntry = (e, id) => String(e.team?.id) === String(id) || String(e.id) === String(id);
          const hSt = entries.find(e => findEntry(e, homeId));
          const aSt = entries.find(e => findEntry(e, awayId));
          if (hSt && aSt) {
            const getRank = (e) => {
              return e.stats?.find(s => s.name === 'rank')?.value
                  || e.stats?.find(s => s.abbreviation === 'RK')?.value
                  || entries.indexOf(e) + 1;
            };
            matchStandings = {
              homeRank: getRank(hSt),
              awayRank: getRank(aSt),
              total: entries.length,
            };
          }
        }
      } catch (_) {
        // Si falla el endpoint de standings, seguimos sin datos
      }
    }

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

    // 12b. FOTMOB FALLBACK: Extraer Cuotas Reales y xG si ESPN no los tiene
    try {
      if ((!advancedStats || !marketOdds) && summary.header) {
        const d = summary.header.competitions?.[0]?.date;
        if (d) {
          const dateStr = new Date(d).toISOString().split('T')[0].replace(/-/g, '');
          const hmName = homeComp.team?.name || homeComp.team?.displayName || '';
          const awName = awayComp.team?.name || awayComp.team?.displayName || '';
          
          const fotmobId = await fotmobAdapter.findFotmobMatchId(dateStr, hmName, awName);
          if (fotmobId) {
            const fotmobData = await fotmobAdapter.getMatchDetail(fotmobId);
            if (fotmobData) {
              // Extraer xG si falta en ESPN
              if (!advancedStats && fotmobData.stats && fotmobData.stats.length > 0) {
                 const xGStat = fotmobData.stats.find(s => s.title?.toLowerCase().includes('expected goals') || s.key === 'expected_goals');
                 if (xGStat) {
                    advancedStats = {
                      home: { xG: parseFloat(xGStat.stats[0]), possession: null },
                      away: { xG: parseFloat(xGStat.stats[1]), possession: null }
                    };
                 }
              }
              // Extraer cuotas 1x2 si falta en ESPN (y si el partido no empezó)
              if (!marketOdds && fotmobData.odds && matchState !== 'post') {
                 const matchOdds = fotmobData.odds;
                 if (matchOdds) {
                    // Mapeo simple si FotMob provee decimal odds (dependerá de la estructura real de Fotmob)
                    // Este es un fallback suave.
                    marketOdds = { fotmob: true }; // Flag
                 }
              }
            }
          }
        }
      }
    } catch (err) {
      logger.warn('fotmobFallback', 'Error en fallback de FotMob:', err.message);
    }
    // 13. Datos del Árbitro
    let refereeStats = null;
    try {
      const refereeName = summary.gameInfo?.officials?.[0]?.fullName || 
                          summary.header?.competitions?.[0]?.officials?.[0]?.fullName || 
                          summary.officials?.[0]?.fullName ||
                          summary.boxscore?.officials?.[0]?.fullName;
      if (refereeName) {
        const { data: refCache } = await supabase.from('analysis_cache').select('data').eq('event_id', `referee_${refereeName}`).single();
        if (refCache && refCache.data) {
          refereeStats = refCache.data;
        } else {
          refereeStats = { name: refereeName, matches: 0, yellow: 0, red: 0, avgYellow: 0, avgRed: 0 };
        }
      }
    } catch (_) {}

    const result = {
      homeMatches:    hm,
      awayMatches:    am,
      h2h,
      currentEvents:  extractEvs(summary),
      homeHistEvs:    homeHist.flatMap(s => extractEvs(s)),
      awayHistEvs:    awayHist.flatMap(s => extractEvs(s)),
      homeCornersData: analyzeStat(homeHist, homeId, 'wonCorners', [3, 4, 5]),
      awayCornersData: analyzeStat(awayHist, awayId, 'wonCorners', [3, 4, 5]),
      homeShotsData:   analyzeStat(homeHist, homeId, 'shotsOnTarget', [3, 4, 5, 6]),
      awayShotsData:   analyzeStat(awayHist, awayId, 'shotsOnTarget', [3, 4, 5, 6]),
      homeFoulsData:   analyzeStat(homeHist, homeId, 'foulsCommitted', [9, 11, 13]),
      awayFoulsData:   analyzeStat(awayHist, awayId, 'foulsCommitted', [9, 11, 13]),
      homeCardsData:   analyzeCards(homeHist, homeId),
      awayCardsData:   analyzeCards(awayHist, awayId),
      injuries, marketInsight, marketOdds, matchStandings, advancedStats,
      refereeStats,
      rosters: summary.rosters || null,
    };

    // Caché en memoria: 4h para terminados, 5 min para live/upcoming
    const matchState = summary.header?.competitions?.[0]?.status?.type?.state;

    // FASE AUDITORÍA: Si el partido ya terminó, inyectamos el resultado real de mercados secundarios
    if (matchState === 'post') {
      const getS = (tid, name) => parseInt(summary.boxscore?.teams?.find(t => String(t.team?.id) === String(tid))?.statistics?.find(st => st.name === name)?.displayValue || 0);
      result.matchResult = {
        corners: getS(homeId, 'wonCorners') + getS(awayId, 'wonCorners'),
        cards: result.currentEvents.filter(e => e.type === 'Card').length,
        shotsOnTarget: getS(homeId, 'shotsOnTarget') + getS(awayId, 'shotsOnTarget'),
        fouls: getS(homeId, 'foulsCommitted') + getS(awayId, 'foulsCommitted')
      };
      logger.audit('audit', `Match ${eventId} Result: Corners=${result.matchResult.corners}, Cards=${result.matchResult.cards}`);
    }

    const ttl = matchState === 'post' ? 240 : 5;
    cacheSet(cacheKey, result, ttl);

    // Persistencia en Supabase para partidos terminados o pre-partido (para guardar cuotas antes del inicio)
    if (matchState === 'post' || matchState === 'pre') {
      supabaseCacheSet(eventId, result, matchState === 'post' ? 720 : 2); // 30 días o 2 horas
    }

    // Recuperar cuotas pre-match si estamos en vivo y ESPN ya las ocultó
    if (matchState === 'in' && (!result.marketOdds || !result.marketInsight)) {
      try {
        const { data: cached } = await supabase.from('analysis_cache').select('data').eq('fixture_id', eventId).single();
        if (cached && cached.data) {
          if (!result.marketOdds && cached.data.marketOdds) result.marketOdds = cached.data.marketOdds;
          if (!result.marketInsight && cached.data.marketInsight) result.marketInsight = cached.data.marketInsight;
        }
      } catch (err) { /* silent fallback */ }
    }

    return { data: result, fromCache: false };

  } catch (err) {
    logger.error('computeMatchAnalysis', err.message);
    return { data: null, fromCache: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT INDIVIDUAL — Wrapper ligero sobre computeMatchAnalysis
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/espn/match/:eventId/analysis', async (req, res) => {
  const { eventId } = req.params;
  const refresh = req.query.refresh === 'true';
  const { data, fromCache, error } = await computeMatchAnalysis(eventId, refresh);
  if (error) return res.status(500).json({ error: 'Error al procesar análisis', details: error });
  if (!data) return res.status(404).json({ error: 'Partido no encontrado' });
  return res.json({ fromCache: !!fromCache, data });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT BATCH — Procesa múltiples partidos en paralelo (máx 20 IDs/llamada)
// POST /api/analysis/batch  Body: { eventIds: [id1, id2, ...] }
// Responde: { data: { [id]: analysisData | null } }
// Cada ID sigue: Memoria → Supabase → ESPN (solo si necesario)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/analysis/batch', async (req, res) => {
  const { eventIds } = req.body;
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return res.status(400).json({ error: 'eventIds debe ser un array no vacío' });
  }

  const ids = [...new Set(eventIds)].slice(0, 20); // Deduplicar y limitar a 20
  const results = {};
  let idx = 0;

  // Pool de 8 workers concurrentes internos
  const worker = async () => {
    while (idx < ids.length) {
      const i = idx++;
      const eventId = ids[i];
      // Nota: el batch siempre intenta usar caché a menos que el engine requiera recalculación interna
      const { data } = await computeMatchAnalysis(eventId, req.query.refresh === 'true');
      results[eventId] = data;
    }
  };

  try {
    await Promise.all(Array(8).fill(null).map(() => worker()));
    return res.json({ data: results });
  } catch (err) {
    logger.error('batch/analysis', err.message);
    return res.status(500).json({ error: 'Error en análisis batch', details: err.message });
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
      logger.warn('computeMatchAnalysis', `No se pudo obtener liga local para el equipo ${teamId}`);
    }

    if (leaguesToFetch.size === 0) leaguesToFetch.add('all'); // Fallback

    // Consultar ambas ligas en paralelo
    const fetchPromises = Array.from(leaguesToFetch).map(slug => 
      axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${teamId}/schedule`)
           .then(res => res.data?.events || [])
           .catch(e => { logger.warn('computeMatchAnalysis', `Fallo al obtener schedule de ${slug} para ${teamId}`); return []; })
    );

    const results = await Promise.all(fetchPromises);
    const combinedEvents = results.flat();

    let completed = filterCompleted(combinedEvents);

    res.json({ events: completed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



// [ENDPOINT ELIMINADO] /api/scrapers/xg (Understat)
// La extracción de estadísticas avanzadas y xG ha sido delegada a FotMob (fotmobAdapter)
// para garantizar datos oficiales unificados y mejorar la latencia del backend.

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
    logger.error('Google Auth', e.message, e);
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

// ─────────────────────────────────────────────────────────────────────
// VALUE BET DISCOVERIES — Guardar y consultar oportunidades detectadas
// POST /api/value-bets          → Registrar una Value Bet al descubrirla
// GET  /api/value-bets?date=... → Obtener las Value Bets de una jornada
// ─────────────────────────────────────────────────────────────────────

// POST /api/value-bets — Upsert: si ya existe el mismo fixture+selection, ignora el duplicate
app.post('/api/value-bets', async (req, res) => {
  const { fixture_id, home_team, away_team, league, market, selection, probability, odds_at_detection, argument, match_date } = req.body;
  if (!fixture_id || !selection) {
    return res.status(400).json({ error: 'fixture_id y selection son obligatorios' });
  }
  try {
    const { data, error } = await supabase
      .from('value_bet_discoveries')
      .upsert(
        { fixture_id: String(fixture_id), home_team, away_team, league, market, selection, probability, odds_at_detection, argument, match_date: match_date || new Date().toISOString().slice(0, 10), detected_at: new Date().toISOString() },
        { onConflict: 'fixture_id,selection', ignoreDuplicates: true }
      )
      .select()
      .single();

    // ignoreDuplicates devuelve null en data si ya existía — lo manejamos como éxito
    if (error) throw error;
    return res.json({ success: true, data: data || null, isNew: !!data });
  } catch (err) {
    logger.error('value-bets POST', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/value-bets?date=YYYY-MM-DD — Todos los descubrimientos de una jornada
app.get('/api/value-bets', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase
      .from('value_bet_discoveries')
      .select('*')
      .eq('match_date', date)
      .order('detected_at', { ascending: true });
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  } catch (err) {
    logger.error('value-bets GET', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// ESTADÍSTICAS Y AUDITORÍA
// GET /api/stats/leagues → Retorna la efectividad real agrupada por liga y mercado
// ─────────────────────────────────────────────────────────────────────
app.get('/api/stats/leagues', async (req, res) => {
  try {
    const { date } = req.query;

    // 1. Obtener todos los picks recomendados
    let query = supabase.from('value_bet_discoveries').select('*');
    if (date) {
      query = query.eq('match_date', date);
    }
    const { data: picks, error } = await query;
    if (error) throw error;
    
    if (!picks || picks.length === 0) {
      return res.json({ success: true, data: { leagues: [], markets: [] } });
    }

    const leagueStats = {};
    const marketStats = {};

    // 2. Procesar cada pick para determinar si fue acierto
    // Usamos Promise.all para paralelizar las llamadas a ESPN
    await Promise.all(picks.map(async (pick) => {
      const { fixture_id, league, market, selection } = pick;
      
      // Inicializar liga y mercado
      if (!leagueStats[league]) leagueStats[league] = { total: 0, wins: 0, losses: 0, pending: 0 };
      if (!marketStats[market]) marketStats[market] = { total: 0, wins: 0, losses: 0, pending: 0 };
      
      leagueStats[league].total += 1;
      marketStats[market].total += 1;

      try {
        // Intentar obtener el resultado final del partido
        // Podemos usar el helper getMatchSummary (está en caché si se consultó antes)
        const summary = await getMatchSummary(fixture_id);
        const state = summary?.header?.competitions?.[0]?.status?.type?.state;
        
        if (state === 'post') {
          // Partido finalizado, evaluar resultado
          const competitors = summary.header.competitions[0].competitors;
          const home = competitors.find(c => c.homeAway === 'home');
          const away = competitors.find(c => c.homeAway === 'away');
          
          const homeScore = parseInt(home?.score || '0');
          const awayScore = parseInt(away?.score || '0');
          
          const selStr = selection.toLowerCase();
          let won = false;

          // Lógica básica de resolución (Parser de Selecciones)
          if (selStr.includes('victoria local') || selStr.includes('local -0.5')) {
            won = homeScore > awayScore;
          } else if (selStr.includes('victoria visitante') || selStr.includes('visitante -0.5')) {
            won = awayScore > homeScore;
          } else if (selStr.includes('empate') && !selStr.includes('doble') && !selStr.includes('sin empate')) {
             won = homeScore === awayScore;
          } else if (selStr.includes('doble oportunidad') || selStr.includes('1x') || selStr.includes('x2')) {
            if (selStr.includes('local')) won = homeScore >= awayScore;
            if (selStr.includes('visitante')) won = awayScore >= homeScore;
          } else {
            // Si el mercado es complejo (Ej. Over de goles), por ahora lo contamos como pendiente hasta tener parser completo
            leagueStats[league].pending += 1;
            marketStats[market].pending += 1;
            return;
          }

          if (won) {
            leagueStats[league].wins += 1;
            marketStats[market].wins += 1;
          } else {
            leagueStats[league].losses += 1;
            marketStats[market].losses += 1;
          }

        } else {
          // Aún no se juega o está en vivo
          leagueStats[league].pending += 1;
          marketStats[market].pending += 1;
        }
      } catch (err) {
        // Falló al obtener resultado de ESPN
        leagueStats[league].pending += 1;
        marketStats[market].pending += 1;
      }
    }));

    // 3. Formatear y ordenar resultados
    const leaguesArray = Object.keys(leagueStats).map(name => {
      const stats = leagueStats[name];
      const finished = stats.wins + stats.losses;
      const winRate = finished > 0 ? ((stats.wins / finished) * 100).toFixed(1) : 0;
      return { name, total: stats.total, wins: stats.wins, losses: stats.losses, pending: stats.pending, winRate: parseFloat(winRate) };
    });
    
    const marketsArray = Object.keys(marketStats).map(name => {
      const stats = marketStats[name];
      const finished = stats.wins + stats.losses;
      const winRate = finished > 0 ? ((stats.wins / finished) * 100).toFixed(1) : 0;
      return { name, total: stats.total, wins: stats.wins, losses: stats.losses, pending: stats.pending, winRate: parseFloat(winRate) };
    });

    // Ordenar por efectividad (mayor a menor) y luego por volumen (mayor a menor)
    leaguesArray.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    marketsArray.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);

    return res.json({ success: true, data: { leagues: leaguesArray, markets: marketsArray } });

  } catch (err) {
    logger.error('stats/leagues', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// AUDITORÍA SERVER-SIDE — Misma lógica que AuditDashboard.jsx
// GET /api/stats/audit?date=YYYY-MM-DD → Corre el motor + evalúa resultados
// Cachea resultados en Supabase para no recalcular cada vez
// ─────────────────────────────────────────────────────────────────────
let _auditEngine = null;
async function loadAuditEngine() {
  if (_auditEngine) return _auditEngine;
  try {
    // Usar tempEngine.mjs que vive dentro de backend/ y funciona en Vercel
    // (evita rutas absolutas file:// que fallan en entornos serverless)
    const path = require('path');
    const enginePath = path.resolve(__dirname, './tempEngine.mjs');
    const engineUrl = 'file:///' + enginePath.replace(/\\/g, '/');
    _auditEngine = await import(engineUrl);
    logger.info('audit', 'tempEngine.mjs cargado para auditoría.');
    return _auditEngine;
  } catch (e) {
    logger.error('audit', 'Error cargando tempEngine:', e.message);
    return null;
  }
}

/**
 * Evalúa si un pick individual fue acertado contra el resultado real.
 * Réplica EXACTA de la lógica de AuditDashboard.jsx (líneas 161-265).
 */
function evaluatePick(pick, homeScore, awayScore, totalGoals, totalCorners, totalCards, totalYellow, totalRed) {
  const p = pick;

  if (p.market === 'Ganador del Partido') {
    if ((p.selection === 'Victoria Local' || p.selection.includes('Local -0.5')) && homeScore > awayScore) return true;
    if ((p.selection === 'Victoria Visitante' || p.selection.includes('Visitante -0.5')) && awayScore > homeScore) return true;
    if (p.selection === 'Empate' && homeScore === awayScore) return true;
    return false;
  }
  if (p.market === 'Handicap Asiático') {
    if (p.selection.includes('Local') && homeScore > awayScore) return true;
    if (p.selection.includes('Visitante') && awayScore > homeScore) return true;
    return false;
  }
  if (p.market === 'Total de Goles') {
    const threshold = parseFloat(p.selection.split(' ')[2]);
    if (p.selection.includes('Más') && totalGoals > threshold) return true;
    if (p.selection.includes('Menos') && totalGoals < threshold) return true;
    return false;
  }
  if (p.market === 'Ambos Marcan') {
    const btts = homeScore > 0 && awayScore > 0;
    if (p.selection.includes('Sí') && btts) return true;
    if (p.selection.includes('No') && !btts) return true;
    return false;
  }
  if (p.market === 'Doble Oportunidad') {
    if (p.selection.includes('1X') && homeScore >= awayScore) return true;
    if (p.selection.includes('X2') && awayScore >= homeScore) return true;
    if (p.selection.includes('12') && homeScore !== awayScore) return true;
    return false;
  }
  if (p.market === 'Combo') {
    const btts = homeScore > 0 && awayScore > 0;
    if (p.selection === 'Ambos Marcan + Más de 2.5') return btts && totalGoals > 2.5;
    return false;
  }
  if (p.market === 'Córners Totales') {
    if (totalCorners === 0) return false;
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
    if (m) {
      const isOver = m[1] === 'Más', th = parseFloat(m[2]);
      if (isOver && totalCorners > th) return true;
      if (!isOver && totalCorners < th) return true;
    }
    return false;
  }
  if (p.market === 'Tarjetas Totales') {
    if (totalCards === 0 && totalYellow === 0) return false;
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
    if (m) {
      const isOver = m[1] === 'Más', th = parseFloat(m[2]);
      const subject = p.selection.toLowerCase().includes('amarilla') ? totalYellow :
                      p.selection.toLowerCase().includes('roja') ? totalRed : totalCards;
      if (isOver && subject > th) return true;
      if (!isOver && subject < th) return true;
    }
    return false;
  }
  if (p.market === 'Gol por Tramo') {
    return totalGoals > 0;
  }
  if (p.market === 'Goles en Vivo (1T)') {
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*) goles/);
    if (m) {
      const isOver = m[1] === 'Más', th = parseFloat(m[2]);
      if (isOver && th <= 0.5 && totalGoals > 0) return true;
      if (!isOver && th >= 2.5 && totalGoals <= 1) return true;
    }
    return false;
  }
  if (p.market === 'Estrategia en Vivo' || p.market === 'Goles en Vivo') {
    if (p.selection.includes('Más') || p.selection.includes('Menos')) {
      const match = p.selection.match(/(Más|Menos) de (\d+\.?\d*) goles/);
      if (match) {
        const isOver = match[1] === 'Más', threshold = parseFloat(match[2]);
        if (isOver && totalGoals > threshold) return true;
        if (!isOver && totalGoals < threshold) return true;
        return false;
      }
      return totalGoals > 0;
    }
    if (p.selection.includes('2do Tiempo') || p.selection.includes('Segundo Tiempo')) return totalGoals > 0;
    if (p.selection.includes('1er Tiempo') || p.selection.includes('Primer Tiempo')) return totalGoals > 0;
    if (p.selection.includes('Local') && homeScore > awayScore) return true;
    if (p.selection.includes('Visitante') && awayScore > homeScore) return true;
    if ((p.selection.includes('1X') || p.selection.includes('Remontada Local')) && homeScore >= awayScore) return true;
    if ((p.selection.includes('X2') || p.selection.includes('Remontada Visitante')) && awayScore >= homeScore) return true;
    return false;
  }
  if (p.market === 'Resultado en Vivo') {
    if ((p.selection.includes('Local') || p.selection.includes('1X')) && homeScore >= awayScore) return true;
    if ((p.selection.includes('Visitante') || p.selection.includes('X2')) && awayScore >= homeScore) return true;
    if (p.selection.includes('Empate') && homeScore === awayScore) return true;
    return false;
  }
  return false;
}

app.get('/api/stats/audit', async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'Falta parámetro date (YYYY-MM-DD)' });

  const forceRefresh = req.query.refresh === 'true';

  // ── Verificar caché de Supabase ────────────────────────────────────
  // IMPORTANTE: solo usamos el caché si tiene TODOS los partidos del día.
  // Si el caché fue guardado cuando solo algunos partidos habían terminado,
  // lo ignoramos y recalculamos para obtener datos completos.
  const auditCacheKey = `audit_${date}`;
  if (!forceRefresh) {
    try {
      const { data: cached } = await supabase.from('analysis_cache').select('data').eq('event_id', auditCacheKey).single();
      if (cached && cached.data) {
        // Contar cuántos partidos ESPN tiene ahora para ese día
        const dateParam = date.replace(/-/g, '');
        let espnTotalFinished = 0;
        try {
          const espnChecks = await Promise.allSettled(
            Object.keys(ALLOWED_LEAGUES).map(l =>
              axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${dateParam}&limit=50`, { timeout: 4000 })
                .then(r => r.data?.events?.filter(e => e.competitions?.[0]?.status?.type?.state === 'post').length || 0)
                .catch(() => 0)
            )
          );
          espnTotalFinished = espnChecks.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
        } catch (_) {}

        // Usar el caché solo si tiene tantos (o más) partidos ANALIZADOS como ESPN reporta terminados ahora
        const cachedAnalyzedCount = cached.data.totalMatches || 0;
        if (espnTotalFinished <= cachedAnalyzedCount) {
          logger.info('audit', `Caché válido para ${date}: ${cachedAnalyzedCount} partidos cacheados vs ${espnTotalFinished} ESPN terminados`);
          return res.json({ success: true, fromCache: true, data: cached.data });
        } else {
          logger.info('audit', `Caché OBSOLETO para ${date}: ${cachedAnalyzedCount} cacheados vs ${espnTotalFinished} ESPN terminados → recalculando`);
        }
      }
    } catch (_) {}
  }

  // Cargar el motor de análisis
  const engine = await loadAuditEngine();
  if (!engine) return res.status(500).json({ error: 'No se pudo cargar el motor de análisis' });

  try {
    // 1. Obtener partidos del día
    const dateParam = date.replace(/-/g, '');
    const requests = Object.keys(ALLOWED_LEAGUES).map(l =>
      axiosInstance.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${dateParam}&limit=50`, { timeout: 5000 })
        .then(r => ({ slug: l, data: r.data }))
        .catch(() => null)
    );
    const results = await Promise.allSettled(requests);

    let allFixtures = [];
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
        if (state !== 'post') return; // Solo partidos finalizados
        const getScore = c => {
          if (!c) return null;
          if (c.score?.value !== undefined) return parseInt(c.score.value);
          if (c.score !== undefined) return parseInt(c.score);
          return null;
        };
        allFixtures.push({
          fixture: { id: e.id, date: e.date, status: { short: 'FT' } },
          league: { id: slug, name: ALLOWED_LEAGUES[slug], logo: leagueInfo?.logos?.[0]?.href || '' },
          teams: {
            home: { id: home?.id, name: home?.team?.displayName || home?.team?.name, logo: home?.team?.logo },
            away: { id: away?.id, name: away?.team?.displayName || away?.team?.name, logo: away?.team?.logo },
          },
          goals: { home: getScore(home), away: getScore(away) },
        });
      });
    }

    // 2. Procesar cada partido
    let totalPicks = 0, hits = 0, misses = 0, skippedMatches = 0;
    let matchReports = [];

    const processMatch = async (f) => {
      try {
        const eventId = f.fixture.id;
        const [analysisResult, summary] = await Promise.all([
          computeMatchAnalysis(eventId),
          getMatchSummary(eventId),
        ]);
        const analysisData = analysisResult.data;
        if (!analysisData) return;

        const homeScore = parseInt(f.goals.home);
        const awayScore = parseInt(f.goals.away);
        if (isNaN(homeScore) || isNaN(awayScore)) return;
        const totalGoals = homeScore + awayScore;

        const homeId = f.teams.home.id;
        const awayId = f.teams.away.id;
        const hm = analysisData.homeMatches || [];
        const am = analysisData.awayMatches || [];

        const homeForm = engine.calculateFormScore(hm, homeId);
        const awayForm = engine.calculateFormScore(am, awayId);
        const homeFormAtHome = engine.calculateFormScore(hm, homeId, 'home');
        const awayFormAway = engine.calculateFormScore(am, awayId, 'away');
        const homeSplit = engine.calculateOverUnder(hm, homeId);
        const awaySplit = engine.calculateOverUnder(am, awayId);
        const h2hData = engine.analyzeH2H(analysisData.h2h || [], homeId, awayId);
        const homeSlots = engine.analyzeGoalsByTimeSlot(analysisData.homeHistEvs || [], homeId);
        const awaySlots = engine.analyzeGoalsByTimeSlot(analysisData.awayHistEvs || [], awayId);

        const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
        const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
        const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
        const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
        const poissonProbs = engine.calcMatchProbabilities(hGF, hGA, aGF, aGA, f.league.name || '');

        const city = summary?.gameInfo?.venue?.address?.city || '';

        const calcRest = (matches) => {
          if (!matches?.length) return null;
          const lastDate = matches[0]?.fixture?.date;
          if (!lastDate) return null;
          const matchDate = new Date(f.fixture.date);
          return Math.floor((matchDate - new Date(lastDate)) / (1000 * 60 * 60 * 24));
        };

        const picksResult = engine.generatePicks({
          homeStats: null, awayStats: null,
          homeForm, awayForm, homeFormAtHome, awayFormAway,
          homeSplitStats: homeSplit, awaySplitStats: awaySplit,
          h2hData, homeSlots, awaySlots, poissonProbs,
          isLive: false, liveClock: "0'", liveHomeGoals: 0, liveAwayGoals: 0,
          marketInsight: analysisData.marketInsight,
          homeCornersData: analysisData.homeCornersData,
          awayCornersData: analysisData.awayCornersData,
          homeCardsData: analysisData.homeCardsData,
          awayCardsData: analysisData.awayCardsData,
          injuries: analysisData.injuries || [],
          marketOdds: analysisData.marketOdds,
          matchStandings: analysisData.matchStandings,
          advancedStats: analysisData.advancedStats,
          refereeStats: analysisData.refereeStats,
          leagueName: f.league.name,
          homeTeamName: f.teams.home.name,
          awayTeamName: f.teams.away.name,
          city,
          homeRestDays: calcRest(hm),
          awayRestDays: calcRest(am),
          homeHistory: hm,
          awayHistory: am,
        });

        const picks = Array.isArray(picksResult) ? picksResult : (picksResult?.picks || []);
        // NO hacer return temprano aquí si picks.length === 0.
        // Queremos que el partido cuente como "analizado" aunque no haya encontrado apuestas de valor.

        // Obtener stats reales del boxscore
        const getTeamStat = (homeAway, statName) => {
          const team = summary?.boxscore?.teams?.find(t => t.homeAway === homeAway);
          if (!team) return 0;
          const stat = team.statistics?.find(s => s.name === statName);
          return stat ? parseInt(stat.displayValue) || 0 : 0;
        };
        const totalCorners = getTeamStat('home', 'wonCorners') + getTeamStat('away', 'wonCorners');
        const totalYellow = getTeamStat('home', 'yellowCards') + getTeamStat('away', 'yellowCards');
        const totalRed = getTeamStat('home', 'redCards') + getTeamStat('away', 'redCards');
        const totalCards = totalYellow + totalRed;

        let matchHits = 0, matchMisses = 0;
        const pickDetails = [];

        picks.forEach(p => {
          const win = evaluatePick(p, homeScore, awayScore, totalGoals, totalCorners, totalCards, totalYellow, totalRed);
          if (win) { hits++; matchHits++; } else { misses++; matchMisses++; }
          totalPicks++;
          pickDetails.push({
            selection: p.selection,
            market: p.market,
            probability: p.probability,
            odds: p.odds,
            tier: p.tier,
            isHit: win,
          });
        });

        matchReports.push({
          id: eventId,
          home: f.teams.home.name,
          away: f.teams.away.name,
          homeLogo: f.teams.home.logo,
          awayLogo: f.teams.away.logo,
          homeScore,
          awayScore,
          league: f.league.name,
          leagueLogo: f.league.logo,
          hits: matchHits,
          misses: matchMisses,
          picks: pickDetails,
        });
      } catch (e) {
        skippedMatches++;
      }
    };

    // Pool de 4 workers
    let idx = 0;
    const worker = async () => {
      while (idx < allFixtures.length) {
        const i = idx++;
        await processMatch(allFixtures[i]);
      }
    };
    await Promise.all(Array(4).fill(null).map(() => worker()));

    // Ordenar por fallos (más fallos primero, para estudio)
    matchReports.sort((a, b) => b.misses - a.misses);

    const auditResult = {
      date,
      totalMatches: matchReports.length,
      rawFixturesCount: allFixtures.length,
      skippedMatches,
      totalPicks,
      hits,
      misses,
      winRate: totalPicks > 0 ? parseFloat(((hits / totalPicks) * 100).toFixed(1)) : 0,
      reports: matchReports,
    };

    // ── Cachear en Supabase ────────────────────────────────────────────
    // Solo guardar si:
    //   1. El día ya terminó (date < hoy)
    //   2. Se analizaron TODOS los partidos disponibles (sin partidos perdidos)
    //      → matchReports.length debe igualar allFixtures.length
    //      Esto previene cachear resultados parciales (cuando solo 8 de 12 habían terminado)
    const todayStr = new Date().toISOString().slice(0, 10);
    const allMatchesAnalyzed = matchReports.length >= allFixtures.length; // Todos los terminados fueron procesados
    if (date < todayStr && matchReports.length > 0 && allMatchesAnalyzed) {
      try {
        await supabase.from('analysis_cache').upsert({
          event_id: auditCacheKey,
          data: auditResult,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días
        }, { onConflict: 'event_id' });
        logger.info('audit', `Auditoría ${date} cacheada: ${matchReports.length}/${allFixtures.length} partidos, ${auditResult.winRate}% acierto`);
      } catch (_) {}
    } else if (date < todayStr && !allMatchesAnalyzed) {
      logger.info('audit', `Auditoría ${date} NO cacheada: solo ${matchReports.length}/${allFixtures.length} partidos procesados (resultado incompleto)`);
    }

    return res.json({ success: true, fromCache: false, data: auditResult });
  } catch (err) {
    logger.error('stats/audit', err.message);
    return res.status(500).json({ error: err.message });
  }
});


if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    logger.banner(PORT);

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
        logger.info('cache', `Caché pre-calentado: ${fixtures.length} partidos del ${todayKey}`);
      }).catch(() => {});
    }, 1000); // 1s después del arranque para no bloquear el bind del puerto
  });
}
// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT ALERTAS EN VIVO — Guarda pronósticos generados durante el partido
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/live-alerts', async (req, res) => {
  const alerts = req.body.alerts; // array of alerts
  if (!alerts || alerts.length === 0) return res.json({ success: true, count: 0 });
  
  try {
    const { data, error } = await supabase
      .from('live_alerts')
      .upsert(alerts, { onConflict: 'fixture_id,selection', ignoreDuplicates: true });
      
    if (error) throw error;
    res.json({ success: true, count: alerts.length });
  } catch (err) {
    logger.error('liveAlerts', 'Error saving live alerts:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para el panel admin (obtiene ultimas 50 alertas)
app.get('/api/admin/live-alerts', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('live_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ success: true, alerts: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN DE TAREAS EN SEGUNDO PLANO
// ─────────────────────────────────────────────────────────────────────────────
const { initValueBetScanner } = require('./jobs/valueBetScanner');
initValueBetScanner(computeMatchAnalysis);

// Middleware centralizado de errores
app.use(errorHandler);

module.exports = app;
module.exports.computeMatchAnalysis = computeMatchAnalysis;
