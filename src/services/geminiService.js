/**
 * =====================================================================
 * geminiService.js — Cliente del Análisis IA de CHALACA
 * =====================================================================
 * Llama al endpoint /api/ai/analyze del backend que usa Google Gemini
 * para generar análisis tipster profesional de alto nivel.
 * =====================================================================
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

/**
 * Solicita un análisis IA completo del partido al backend Gemini.
 *
 * @param {Object} matchData - Datos completos del partido
 * @param {string} matchData.fixtureId
 * @param {string} matchData.homeName
 * @param {string} matchData.awayName
 * @param {string} matchData.leagueName
 * @param {string} matchData.kickoff
 * @param {Object} matchData.homeForm
 * @param {Object} matchData.awayForm
 * @param {Object} matchData.homeSplit
 * @param {Object} matchData.awaySplit
 * @param {Object|null} matchData.h2hData
 * @param {Object|null} matchData.poisson
 * @param {Array}  matchData.injuries
 * @param {Array}  matchData.picks
 * @param {Array}  matchData.homeMatches
 * @param {Array}  matchData.awayMatches
 * @returns {Promise<{text: string, fromCache: boolean}>}
 */
export async function getGeminiAnalysis(matchData) {
  const res = await fetch(`${BACKEND_URL}/api/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(matchData),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return { text: json.data, fromCache: json.fromCache };
}
