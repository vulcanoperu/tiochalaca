/**
 * =====================================================================
 * backendApi.js — Cliente del Backend Scraper de CHALACA
 * =====================================================================
 * Este módulo conecta el frontend React con el servidor Node.js local
 * que hace scraping a FotMob, Understat y Transfermarkt.
 *
 * Si el backend no está corriendo (ej: en producción sin servidor local),
 * cada función automáticamente hace fallback a los hooks de footballApi.js.
 * =====================================================================
 */

import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const BACKEND_TIMEOUT = 20000; // 20s (puppeteer puede tardar un poco)

const backend = axios.create({
  baseURL: BACKEND_URL,
  timeout: BACKEND_TIMEOUT,
});

// ─────────────────────────────────────────────────────────────────────
// Helper genérico — captura errores de red (backend offline)
// ─────────────────────────────────────────────────────────────────────
async function backendGet(path, params = {}) {
  try {
    const res = await backend.get(path, { params });
    return { ok: true, data: res.data.data, source: res.data.source, fromCache: res.data.fromCache };
  } catch (err) {
    const isOffline = !err.response; // backend no está corriendo
    console.warn(`[BackendAPI] ${isOffline ? 'Backend offline' : 'Error'} en ${path}:`, err.message);
    return { ok: false, data: null, source: null, error: err.message, isOffline };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 1. HEALTH — Verificar si el backend está activo
// ─────────────────────────────────────────────────────────────────────
export async function checkBackendHealth() {
  try {
    const res = await backend.get('/api/health', { timeout: 3000 });
    return { online: true, ...res.data };
  } catch {
    return { online: false };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 2. PARTIDOS DEL DÍA — FotMob → Fallback api-sports (en el backend)
//    Devuelve fixtures ya normalizados
// ─────────────────────────────────────────────────────────────────────
export async function getTodayFixturesFromBackend(date) {
  const d = date || new Date().toISOString().split('T')[0];
  return backendGet('/api/fixtures/today', { date: d });
}

// ─────────────────────────────────────────────────────────────────────
// 3. FORMA RECIENTE — FotMob → Fallback api-sports (en el backend)
//    teamName: nombre del equipo  | apiSportsId: ID numérico de api-sports
// ─────────────────────────────────────────────────────────────────────
export async function getTeamFormFromBackend(teamName, apiSportsId) {
  return backendGet('/api/scrapers/team-form', { teamName, apiSportsId });
}

// ─────────────────────────────────────────────────────────────────────
// 4. xG / ESTADÍSTICAS AVANZADAS — Understat
//    teamName: nombre del equipo  | season: año (ej: 2024)
// ─────────────────────────────────────────────────────────────────────
export async function getTeamXGFromBackend(teamName, season = '2024') {
  return backendGet('/api/scrapers/xg', { teamName, season });
}

// ─────────────────────────────────────────────────────────────────────
// 5. LESIONES / BAJAS — Transfermarkt → Fallback api-sports
//    teamSlug: slug de Transfermarkt (ej: "arsenal-fc")
//    apiSportsId: ID de api-sports para fallback
// ─────────────────────────────────────────────────────────────────────
export async function getTeamInjuriesFromBackend(teamSlug, apiSportsId) {
  return backendGet('/api/scrapers/injuries', { teamSlug, apiSportsId });
}

// ─────────────────────────────────────────────────────────────────────
// 6. H2H — via api-sports desde el backend (no gasta cuota del frontend)
//    home/away: nombres | homeApiId/awayApiId: IDs de api-sports
// ─────────────────────────────────────────────────────────────────────
export async function getH2HFromBackend(home, away, homeApiId, awayApiId) {
  return backendGet('/api/scrapers/h2h', { home, away, homeApiId, awayApiId });
}

// ─────────────────────────────────────────────────────────────────────
// 7. LIMPIAR CACHÉ DEL BACKEND
// ─────────────────────────────────────────────────────────────────────
export async function clearBackendCache() {
  try {
    await backend.delete('/api/cache');
    return true;
  } catch {
    return false;
  }
}
