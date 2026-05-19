/**
 * ═══════════════════════════════════════════════════════════════════
 * cache/cacheManager.js — Caché en memoria con TTL + Supabase persistente
 * ═══════════════════════════════════════════════════════════════════
 * Extraído de server.js para desacoplar la lógica de caché.
 *
 * Dos niveles de caché:
 *   1. Memoria (Map)  → Acceso instantáneo (ms), se pierde al reiniciar
 *   2. Supabase       → Persistente (30 días para post-match), sobrevive reinicios
 *
 * Flujo de lectura: Memoria → Supabase → Scraping (frío)
 * ═══════════════════════════════════════════════════════════════════
 */

const supabase = require('../supabase/client');

// ─────────────────────────────────────────────────────────────────────
// CACHÉ EN MEMORIA (Map con TTL)
// ─────────────────────────────────────────────────────────────────────
const cache = new Map();

/**
 * Obtiene un valor del caché en memoria.
 * @param {string} key
 * @returns {*|null} Datos cacheados o null si expiró/no existe
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

/**
 * Guarda un valor en el caché en memoria con TTL.
 * @param {string} key
 * @param {*} data
 * @param {number} ttlMinutes - Tiempo de vida en minutos (default: 60)
 */
function set(key, data, ttlMinutes = 60) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMinutes * 60_000 });
}

/**
 * Limpia toda la caché en memoria.
 */
function clear() {
  cache.clear();
}

/**
 * Retorna el número de entradas en caché.
 * @returns {number}
 */
function size() {
  return cache.size;
}

// ─────────────────────────────────────────────────────────────────────
// CACHÉ PERSISTENTE — Supabase (tabla: analysis_cache)
// Para partidos terminados: TTL de 30 días (720h).
// Los datos son inmutables post-FT.
// Si la tabla no existe aún, falla silenciosamente (usa solo memoria).
// ─────────────────────────────────────────────────────────────────────

/**
 * Obtiene datos de la caché persistente en Supabase.
 * @param {string} eventId
 * @returns {Promise<*|null>}
 */
async function supabaseGet(eventId) {
  try {
    const { data, error } = await supabase
      .from('analysis_cache')
      .select('data')
      .eq('event_id', String(eventId))
      .gt('expires_at', new Date().toISOString())
      .single();
    if (error || !data) return null;
    return data.data;
  } catch (e) {
    return null;
  }
}

/**
 * Persiste datos en Supabase con TTL configurable.
 * @param {string} eventId
 * @param {object} analysisData
 * @param {number} ttlHours - Tiempo de vida en horas (default: 720 = 30 días)
 */
async function supabaseSet(eventId, analysisData, ttlHours = 720) {
  try {
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
    await supabase
      .from('analysis_cache')
      .upsert(
        { event_id: String(eventId), data: analysisData, match_state: 'post', expires_at: expiresAt },
        { onConflict: 'event_id' }
      );
  } catch (e) {
    // Fallo silencioso — la tabla aún no existe o hay error de conexión
  }
}

module.exports = {
  get,
  set,
  clear,
  size,
  supabaseGet,
  supabaseSet,
};
