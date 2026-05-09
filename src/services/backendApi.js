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
  const d = date || new Date().toLocaleDateString('sv-SE');
  // /fixtures/date/:date is the fully implemented endpoint with caching and league mapping.
  // /fixtures/today crashes when a ?date= param is passed (mapESPNToApiSports is undefined).
  return backendGet(`/api/fixtures/date/${d}`);
}

export async function getMatchAnalysisFromBackend(eventId) {
  return backendGet(`/api/espn/match/${eventId}/analysis`);
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

// ─────────────────────────────────────────────────────────────────────
// 8. AUTENTICACIÓN Y ADMINISTRACIÓN DE USUARIOS
// ─────────────────────────────────────────────────────────────────────
export async function loginUser(username, password) {
  try {
    const res = await backend.post('/api/auth/login', { username, password });
    if (res.data.token) {
      sessionStorage.setItem('chalaca_token', res.data.token);
      sessionStorage.setItem('chalaca_user', JSON.stringify(res.data.user));
      return { success: true, user: res.data.user };
    }
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

export async function loginWithGoogle(access_token) {
  try {
    const res = await backend.post('/api/auth/google', { access_token });
    if (res.data.token) {
      sessionStorage.setItem('chalaca_token', res.data.token);
      sessionStorage.setItem('chalaca_user', JSON.stringify(res.data.user));
      return { success: true, user: res.data.user };
    }
    return { success: false, error: 'No se recibió token' };
  } catch (err) {
    const detail = err.response?.data?.details;
    const msg = err.response?.data?.error || err.message;
    return { success: false, error: detail ? `${msg}: ${detail}` : msg };
  }
}

export async function logoutUser() {
  sessionStorage.clear(); // Limpiar todo lo nuestro
  
  // Limpiar llaves de Supabase en localStorage por la fuerza para evitar que
  // recupere la sesión si signOut() falla o es muy lento.
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-')) {
      localStorage.removeItem(key);
    }
  });

  try {
    const { supabase } = await import('../lib/supabaseClient');
    await supabase.auth.signOut();
  } catch (e) {
    console.error('Error cerrando sesión en Supabase', e);
  }
}



export async function registerUser(username, password) {
  try {
    const res = await backend.post('/api/auth/register', { username, password });
    return { success: res.data.success, message: res.data.message };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

export function getAuthHeaders() {
  const token = sessionStorage.getItem('chalaca_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAdminUsers() {
  try {
    const res = await backend.get('/api/admin/users', { headers: getAuthHeaders() });
    return { success: true, users: res.data };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

export async function deleteUser(userId) {
  try {
    const res = await backend.delete(`/api/admin/users/${userId}`, { headers: getAuthHeaders() });
    return { success: res.data.success };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

export async function forceResetPassword(userId, newPassword) {
  try {
    const res = await backend.put(`/api/admin/users/${userId}/password`, { password: newPassword }, { headers: getAuthHeaders() });
    return { success: res.data.success, message: res.data.message };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 9. GESTIÓN DE PICKS (APUESTAS) EN BD
// ─────────────────────────────────────────────────────────────────────
export async function getDbPicks() {
  try {
    const res = await backend.get('/api/picks', { headers: getAuthHeaders() });
    return { success: true, picks: res.data };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

export async function saveDbPick(pickData) {
  try {
    const res = await backend.post('/api/picks', pickData, { headers: getAuthHeaders() });
    return { success: res.data.success, id: res.data.id };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

export async function updateDbPick(pickId, updatedData) {
  try {
    const res = await backend.put(`/api/picks/${pickId}`, updatedData, { headers: getAuthHeaders() });
    return { success: res.data.success };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

export async function deleteDbPick(pickId) {
  try {
    const res = await backend.delete(`/api/picks/${pickId}`, { headers: getAuthHeaders() });
    return { success: res.data.success };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

export async function clearAllDbPicks() {
  try {
    const res = await backend.delete('/api/picks', { headers: getAuthHeaders() });
    return { success: res.data.success };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}
