/**
 * ═══════════════════════════════════════════════════════════════════
 * utils/logger.js — Logger estructurado para Chalaca
 * ═══════════════════════════════════════════════════════════════════
 * Reemplaza console.log/error/warn con timestamps y contexto.
 * Compatible con el formato actual: logger.info('[modulo]', mensaje)
 *
 * Niveles: info, warn, error, debug, audit
 * ═══════════════════════════════════════════════════════════════════
 */

const LOG_LEVELS = { debug: 0, info: 1, audit: 2, warn: 3, error: 4 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

/**
 * Genera timestamp corto en formato HH:MM:SS
 */
function ts() {
  return new Date().toLocaleTimeString('es-PE', { hour12: false });
}

/**
 * Formatea y emite un log si el nivel es suficiente.
 * @param {'debug'|'info'|'audit'|'warn'|'error'} level
 * @param {string} context - Módulo o etiqueta (ej: 'espnAdapter', 'batch/analysis')
 * @param  {...any} args   - Mensaje y datos adicionales
 */
function log(level, context, ...args) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;

  const icons = { debug: '🔍', info: 'ℹ️ ', audit: '📊', warn: '⚠️ ', error: '❌' };
  const icon = icons[level] || '';
  const prefix = `${ts()} ${icon} [${context}]`;

  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

module.exports = {
  debug: (context, ...args) => log('debug', context, ...args),
  info:  (context, ...args) => log('info',  context, ...args),
  audit: (context, ...args) => log('audit', context, ...args),
  warn:  (context, ...args) => log('warn',  context, ...args),
  error: (context, ...args) => log('error', context, ...args),

  /** Banner de inicio del servidor (formato especial) */
  banner: (port) => {
    console.log('');
    console.log('⚽ ══════════════════════════════════════════════════');
    console.log(`   CHALACA Backend  →  http://localhost:${port}`);
    console.log('   ══════════════════════════════════════════════════');
    console.log('   ✓ Fuente de datos: ESPN (100% gratuito)');
    console.log('   ✓ Caché en Memoria Activa');
    console.log('   ✓ Logger estructurado activo');
    console.log('   ✓ Endpoint /api/espn/match/:id/analysis listo');
    console.log('⚽ ══════════════════════════════════════════════════');
    console.log('');
  },
};
