/**
 * database.js — Re-export de supabase/client.js (compatibilidad)
 *
 * ⚠️ DEPRECADO: Usar require('./supabase/client') en código nuevo.
 * Este archivo se mantiene para no romper imports existentes.
 */
module.exports = require('./supabase/client');
