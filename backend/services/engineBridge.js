const logger = require('../utils/logger');
const path = require('path');
const url = require('url');

let engineInstance = null;

/**
 * Carga el motor de análisis desde el frontend usando import() dinámico.
 * Esto evita duplicar el código del motor (anterior tempEngine.mjs).
 */
async function loadEngine() {
  if (engineInstance) return engineInstance;

  try {
    const engineModule = await import('../../src/services/analysisEngine.js');
    
    engineInstance = engineModule;
    logger.info('engineBridge', 'Motor de análisis frontend cargado correctamente vía import()');
    return engineInstance;
  } catch (err) {
    logger.error('engineBridge', 'Error al cargar el motor frontend:', err.message);
    throw err;
  }
}

module.exports = {
  loadEngine
};
