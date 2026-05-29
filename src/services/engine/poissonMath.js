/**
 * Math utilities for Poisson distribution and Brier Score
 */
/**
 * Descripción del descanso entre partidos
 */
export function getRestDays(lastMatch) {
  if (!lastMatch?.fixture?.date) return null;
  const last = new Date(lastMatch.fixture.date);
  const now  = new Date();
  const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  return diff;
}

/**
 * Calcula probabilidades de resultado con el método Poisson simplificado
 */
export function poissonProb(lambda, k) {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return Math.pow(Math.E, -lambda) * Math.pow(lambda, k) / factorial;
}

export function calcMatchProbabilities(homeAvgGF, homeAvgGA, awayAvgGF, awayAvgGA, leagueName = '') {
  const isSaudi = /saudi|arabia/i.test(leagueName);
  const isLaLiga = /laliga|la liga|spain|españa|esp\.1/i.test(leagueName);
  const leagueAvg = isSaudi ? 1.48 : isLaLiga ? 1.18 : 1.3;
  const lambdaHome = (homeAvgGF * awayAvgGA) / leagueAvg;
  const lambdaAway = (awayAvgGF * homeAvgGA) / leagueAvg;

  let homeWin = 0, draw = 0, awayWin = 0;
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const p = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  const total = homeWin + draw + awayWin;
  return {
    home: +(homeWin / total * 100).toFixed(1),
    draw: +(draw    / total * 100).toFixed(1),
    away: +(awayWin / total * 100).toFixed(1),
    lambdaHome: +lambdaHome.toFixed(2),
    lambdaAway: +lambdaAway.toFixed(2),
  };
}

// ─────────────────────────────────────────────────────────────────
//  FASE 2: BRIER SCORE (Auditoría de Precisión)
//  Mide la exactitud del motor predictivo comparando la probabilidad
//  proyectada contra el resultado real (1 = acertó, 0 = falló).
//  Un Brier Score de 0 es perfecto. 0.25 es adivinar al azar.
// ─────────────────────────────────────────────────────────────────

/**
 * Calcula el Brier Score para un conjunto de predicciones pasadas.
 * 
 * @param {Array<{ probability: number, result: number }>} predictions 
 *        probability: Probabilidad en formato 0-100 dada por el motor
 *        result: 1 si el evento sucedió (acierto), 0 si no sucedió (fallo)
 * @returns {{ brierScore: number, label: string, isAccurate: boolean }}
 */
export function calcBrierScore(predictions) {
  if (!predictions || predictions.length === 0) {
    return { brierScore: null, label: 'Sin suficientes datos', isAccurate: false };
  }

  let sumOfSquares = 0;
  let validCount = 0;

  predictions.forEach(p => {
    if (typeof p.probability !== 'number' || typeof p.result !== 'number') return;
    
    // Normalizar probabilidad de 0-100 a 0-1
    const probObj = p.probability > 1 ? p.probability / 100 : p.probability;
    // Resultado debe ser estrictamente 0 o 1
    const outcome = p.result > 0 ? 1 : 0; 
    
    sumOfSquares += Math.pow(probObj - outcome, 2);
    validCount++;
  });

  if (validCount === 0) return { brierScore: null, label: 'Sin datos válidos', isAccurate: false };

  const brierScore = sumOfSquares / validCount;
  
  // Evaluación del Brier Score:
  // < 0.15 = Nivel Institucional Excelente
  // < 0.20 = Muy bueno
  // < 0.25 = Promedio (Margen del corredor)
  // > 0.25 = Peor que lanzar una moneda
  
  const isAccurate = brierScore <= 0.22;
  const label = brierScore <= 0.15 ? '🟢 Nivel Sniper Institucional' 
              : brierScore <= 0.20 ? '🟢 Altamente preciso'
              : brierScore <= 0.24 ? '🟡 Aceptable / Promedio'
              : '🔴 Impreciso (Requiere re-calibración)';

  return {
    brierScore: +brierScore.toFixed(3),
    label,
    isAccurate,
    sampleSize: validCount
  };
}
