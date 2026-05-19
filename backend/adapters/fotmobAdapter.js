/**
 * ═══════════════════════════════════════════════════════════════════
 * adapters/fotmobAdapter.js — Extractor de FotMob (xG, Cuotas, Lineups)
 * ═══════════════════════════════════════════════════════════════════
 * Cumple con la Interfaz Estándar de Adaptador:
 * - getFixtures()
 * - getLiveMatches()
 * - getMatchDetail(matchId)
 * - getTeamHistory(league, teamId)
 *
 * Utiliza Axios para extraer el JSON estático (__NEXT_DATA__) y Playwright 
 * como fallback para rutinas complejas (como indica la arquitectura).
 * ═══════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { chromium } = require('playwright-chromium');
const logger = require('../utils/logger');

const MODULE = 'fotmobAdapter';

// Configuración de Axios para engañar protecciones básicas
const axiosInstance = axios.create({
  baseURL: 'https://www.fotmob.com',
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  }
});

// Rate limiting para evitar baneos de FotMob (Max 8 req/min)
let requestTimes = [];
async function rateLimit() {
  const now = Date.now();
  requestTimes = requestTimes.filter(time => now - time < 60000);
  if (requestTimes.length >= 8) {
    const oldest = Math.min(...requestTimes);
    const waitTime = 60000 - (now - oldest);
    logger.warn(MODULE, `Rate limit alcanzado (8/min). Esperando ${waitTime}ms...`);
    await new Promise(r => setTimeout(r, waitTime));
  }
  requestTimes.push(Date.now());
}

/**
 * Extrae el estado SSR (Next.js) directamente del HTML de una ruta.
 * Extremadamente rápido y evita cargar assets de Playwright.
 */
async function fetchNextData(path) {
  await rateLimit();
  try {
    const res = await axiosInstance.get(path);
    const match = res.data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return null;
    return JSON.parse(match[1]);
  } catch (err) {
    logger.error(MODULE, `Error fetching SSR data para ${path}:`, err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFAZ ESTÁNDAR
// ─────────────────────────────────────────────────────────────────────────────

async function getFixtures(dateStr) {
  // dateStr format: YYYYMMDD
  // Fotmob a veces bloquea el API directa, podemos intentar leer el SSR de /matches
  // Si no está disponible, retornamos vacío para que el sistema use ESPN.
  logger.info(MODULE, `Obteniendo fixtures para ${dateStr}`);
  const data = await fetchNextData(`/?date=${dateStr}`);
  
  if (!data?.props?.pageProps?.fallback) return [];

  const keys = Object.keys(data.props.pageProps.fallback);
  const matchesKey = keys.find(k => k.includes('matches'));
  if (!matchesKey) return [];

  const fallbackData = data.props.pageProps.fallback[matchesKey];
  let fixtures = [];

  // Parsear la estructura de Fotmob (puede ser leagues array o matches array)
  if (fallbackData.leagues) {
      fallbackData.leagues.forEach(league => {
          if (league.matches) fixtures.push(...league.matches);
      });
  } else if (fallbackData.matches && Array.isArray(fallbackData.matches)) {
      fallbackData.matches.forEach(league => {
          if (league.matches) fixtures.push(...league.matches);
      });
  }
  return fixtures;
}

async function getLiveMatches() {
  logger.info(MODULE, 'Obteniendo live matches de FotMob');
  // Se lee la página principal sin fecha para ver los de hoy en vivo
  const data = await fetchNextData('/');
  if (!data?.props?.pageProps?.fallback) return [];
  
  // Filtrar solo los que están en vivo
  // (Simplificado para el boilerplate)
  return [];
}

/**
 * Obtiene detalles profundos de un partido (xG, Cuotas reales, Lineups)
 * @param {string} matchId - ID de Fotmob
 */
async function getMatchDetail(matchId) {
  logger.debug(MODULE, `Obteniendo detalles del partido ${matchId}`);
  const data = await fetchNextData(`/match/${matchId}`);
  
  if (!data?.props?.pageProps?.fallback) return null;

  const matchKey = Object.keys(data.props.pageProps.fallback).find(k => k.includes('matchDetails'));
  if (!matchKey) return null;

  const matchData = data.props.pageProps.fallback[matchKey];
  const content = matchData?.content;
  if (!content) return null;

  // Extraer información valiosa (xG, cuotas, alineaciones)
  const stats = content.stats?.Periods?.All?.stats || [];
  const lineup = content.lineup || null;
  const odds = content.odds || null; // Cuotas reales de Fotmob

  return {
    fotmobId: matchId,
    stats,
    lineup,
    odds,
    rawContent: content
  };
}

async function getTeamHistory(leagueSlug, teamId) {
  // Para Fotmob, el historial de equipo está en /team/{teamId}/overview
  logger.debug(MODULE, `Obteniendo historial de equipo ${teamId}`);
  const data = await fetchNextData(`/team/${teamId}/overview`);
  if (!data?.props?.pageProps?.fallback) return [];
  
  const teamKey = Object.keys(data.props.pageProps.fallback).find(k => k.includes('team'));
  if (!teamKey) return [];
  
  const teamData = data.props.pageProps.fallback[teamKey];
  return teamData?.fixtures?.history || [];
}

/**
 * Fallback de Playwright por si Axios es bloqueado o necesitamos ejecutar JS
 * Limitado a 8 requests por minuto según el plan.
 */
async function getMatchDetailPlaywright(matchId) {
  await rateLimit();
  logger.audit(MODULE, `Lanzando Playwright para match ${matchId}`);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`https://www.fotmob.com/match/${matchId}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Aquí podríamos extraer el DOM si el SSR falló
    const content = await page.content();
    const match = content.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if(match) return JSON.parse(match[1]);
    
    return null;
  } catch(e) {
    logger.error(MODULE, 'Error en Playwright:', e.message);
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * Busca el ID del partido en FotMob cruzando la fecha y los nombres de los equipos.
 */
async function findFotmobMatchId(dateStr, homeName, awayName) {
  try {
    const fixtures = await getFixtures(dateStr);
    if (!fixtures || fixtures.length === 0) return null;
    
    // Normalizar nombres para facilitar la búsqueda
    const normalize = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const h1 = normalize(homeName);
    const a1 = normalize(awayName);

    const match = fixtures.find(f => {
      const h2 = normalize(f.home?.name || '');
      const a2 = normalize(f.away?.name || '');
      return (h1.includes(h2) || h2.includes(h1)) && (a1.includes(a2) || a2.includes(a1));
    });

    return match ? match.id : null;
  } catch (err) {
    logger.error(MODULE, 'Error mapeando FotMob ID:', err.message);
    return null;
  }
}

module.exports = {
  getFixtures,
  getLiveMatches,
  getMatchDetail,
  getTeamHistory,
  getMatchDetailPlaywright, // Exportado para emergencias
  findFotmobMatchId
};
