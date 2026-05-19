/**
 * ═══════════════════════════════════════════════════════════════════
 * training/versionLog.js — Bitácora de versiones del motor
 * ═══════════════════════════════════════════════════════════════════
 * Registra cada ajuste del motor con sus métricas de rendimiento.
 * Permite rastrear la evolución del modelo a lo largo del tiempo.
 *
 * Tabla Supabase: version_log
 * ═══════════════════════════════════════════════════════════════════
 */

const supabase = require('../supabase/client');
const logger = require('../utils/logger');

const MODULE = 'versionLog';

/**
 * Registra una nueva versión del motor en la bitácora.
 *
 * @param {object} params
 * @param {string} params.version       - Identificador de versión (ej: 'v4.2.1')
 * @param {string} params.cambios       - Descripción de los cambios realizados
 * @param {number} params.winRate       - Porcentaje de aciertos (0-100)
 * @param {string[]} params.ligas       - Ligas evaluadas (ej: ['eng.1', 'esp.1'])
 * @param {number} params.partidos      - Total de partidos evaluados
 * @param {object} [params.metadata]    - Datos extra (market breakdown, etc.)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function logVersion({ version, cambios, winRate, ligas = [], partidos = 0, metadata = {} }) {
  try {
    const { data, error } = await supabase
      .from('version_log')
      .insert({
        version,
        cambios,
        aciertos_porcentaje: winRate,
        ligas_probadas: ligas,
        partidos_evaluados: partidos,
        metadata,
      })
      .select('id')
      .single();

    if (error) {
      logger.error(MODULE, 'Error guardando versión:', error.message);
      return { success: false, error: error.message };
    }

    logger.audit(MODULE, `Versión ${version} registrada — WR: ${winRate}%, ${partidos} partidos, ${ligas.length} ligas`);
    return { success: true, id: data.id };
  } catch (err) {
    logger.error(MODULE, 'Excepción:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Obtiene el historial de versiones del motor (más reciente primero).
 *
 * @param {number} [limit=20] - Número máximo de versiones a retornar
 * @returns {Promise<Array>}
 */
async function getHistory(limit = 20) {
  try {
    const { data, error } = await supabase
      .from('version_log')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(MODULE, 'Error obteniendo historial:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error(MODULE, 'Excepción:', err.message);
    return [];
  }
}

/**
 * Obtiene la última versión registrada.
 * @returns {Promise<object|null>}
 */
async function getLatest() {
  const history = await getHistory(1);
  return history.length > 0 ? history[0] : null;
}

/**
 * Compara dos versiones y retorna el delta de rendimiento.
 *
 * @param {string} versionA - Versión base
 * @param {string} versionB - Versión nueva
 * @returns {Promise<{delta: number, improved: boolean, a: object, b: object}|null>}
 */
async function compareVersions(versionA, versionB) {
  try {
    const { data, error } = await supabase
      .from('version_log')
      .select('*')
      .in('version', [versionA, versionB]);

    if (error || !data || data.length < 2) return null;

    const a = data.find(v => v.version === versionA);
    const b = data.find(v => v.version === versionB);
    if (!a || !b) return null;

    const delta = (b.aciertos_porcentaje || 0) - (a.aciertos_porcentaje || 0);
    return {
      delta: +delta.toFixed(1),
      improved: delta > 0,
      a, b,
    };
  } catch (err) {
    logger.error(MODULE, 'Error comparando versiones:', err.message);
    return null;
  }
}

module.exports = {
  logVersion,
  getHistory,
  getLatest,
  compareVersions,
};
