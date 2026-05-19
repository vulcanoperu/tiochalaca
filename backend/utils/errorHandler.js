/**
 * ═══════════════════════════════════════════════════════════════════
 * utils/errorHandler.js — Manejo centralizado de errores para Express
 * ═══════════════════════════════════════════════════════════════════
 * Se registra como middleware final: app.use(errorHandler)
 * Captura errores no manejados en cualquier endpoint.
 * ═══════════════════════════════════════════════════════════════════
 */

const logger = require('./logger');

/**
 * Middleware de error para Express.
 * Captura cualquier error que no fue atrapado por un try/catch en el endpoint.
 *
 * Uso: app.use(errorHandler);  // SIEMPRE al final de las rutas
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';
  const path = req.originalUrl || req.url;
  const method = req.method;

  logger.error('express', `${method} ${path} → ${status}: ${message}`);

  // En desarrollo, incluir stack trace
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(status).json({
    error: message,
    status,
    ...(isDev && { stack: err.stack }),
  });
}

/**
 * Wrapper para rutas async que podrían lanzar errores sin catch.
 * Uso: app.get('/ruta', asyncHandler(async (req, res) => { ... }));
 *
 * @param {Function} fn - Función async de Express (req, res, next)
 * @returns {Function}
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = errorHandler;
module.exports.asyncHandler = asyncHandler;
