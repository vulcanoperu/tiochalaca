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
    // Añadimos un timestamp (?t=Date.now()) para evitar el caché agresivo (CDN) de ESPN 
    // que suele causar un desfase de ~1 minuto en los partidos en vivo.
    const { data } = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${req.params.id}&t=${Date.now()}`);
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

    if (!dbUser) {
      // Crear usuario nuevo desde Google
      const username = fullName.replace(/\s+/g, '_').toLowerCase();
      const { data: newUser, error: insertErr } = await supabase.from('users')
        .insert([{ username, email, google_id: googleId, avatar_url: avatarUrl, password: '', role: 'pending' }])
        .select()
        .single();
      if (insertErr) throw insertErr;
      dbUser = newUser;
    } else if (!dbUser.google_id) {
      // Vincular cuenta existente con Google
      await supabase.from('users').update({ google_id: googleId, avatar_url: avatarUrl, email }).eq('id', dbUser.id);
    }

    const token = jwt.sign(
      { id: dbUser.id, username: dbUser.username, role: dbUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: dbUser.id, username: dbUser.username, role: dbUser.role, avatar_url: avatarUrl } });
  } catch (e) {
    console.error('[Google Auth]', e.message);
    res.status(500).json({ error: 'Error en autenticación con Google' });
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
    const { data: users, error } = await supabase.from('users').select('id, username, role, created_at').order('created_at', { ascending: false });
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
    console.log(`   CHALACA Backend Ligero  →  http://localhost:${PORT}`);
    console.log('   ══════════════════════════════════════════════════');
    console.log('   ✓ Caché en Memoria Activa');
    console.log('   ✓ Transfermarkt & Understat Scrapers Activos');
    console.log('   ✓ API-Sports (Caché proxy) Activa');
    console.log('⚽ ══════════════════════════════════════════════════\n');
  });
}

module.exports = app;
