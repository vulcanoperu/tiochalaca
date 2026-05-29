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
    // Usar ruta absoluta (en formato file://) para que funcione bien en import() dinámico
    const enginePath = path.resolve(__dirname, '../../src/services/analysisEngine.js');
    const engineUrl = url.pathToFileURL(enginePath).href;

    const engineModule = await import(engineUrl);
    
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
