// ─────────────────────────────────────────────────────────────────
//  eloRating.js
//  Sistema de Elo Rating para fútbol (Nivel institucional)
//  + Corrección de Dixon-Coles para distribución de goles
//  Inspirado en: Elo (FIDE), Pi-Ratings, y el modelo de Pinnacle
// ─────────────────────────────────────────────────────────────────

// ── Constantes del Sistema Elo ────────────────────────────────────
const ELO_DEFAULT    = 1500;  // Rating base de equipos sin historia
const ELO_HOME_BONUS =   80;  // Ventaja de local en puntos Elo (≈60-100 es estándar en fútbol)
const K_FACTOR_BASE  =   32;  // Factor de cambio máximo por partido
const K_FACTOR_CUP   =   20;  // Copa (menos importancia para el Elo "liga")
const K_SCALE        = 400;   // Escala logarítmica (igual que ajedrez)

// ── Ratings Iniciales pre-calculados (Liga 1 Perú 2025) ──────────
// Basados en desempeño histórico, puntos de temporadas anteriores y
// clasificación en torneos continentales.
const PERU_INITIAL_ELO = {
  // Grandes / Big 3
  'universitario':       1680,
  'alianza lima':        1670,
  'sporting cristal':    1640,

  // Equipos de primer nivel
  'fbc melgar':          1580,
  'melgar':              1580,
  'cesar vallejo':       1560,
  'sport huancayo':      1530,
  'huancayo':            1530,
  'comerciantes unidos': 1520,
  'cienciano':           1510,
  'cusco fc':            1500,

  // Equipos de nivel medio
  'atletico grau':       1490,
  'atlético grau':       1490,
  'grau':                1490,
  'mannucci':            1490,
  'carlos a. mannucci':  1490,
  'alianza atletico':    1470,
  'alianza atlético':    1470,
  'sport boys':          1460,
  'deportivo garcilaso': 1450,
  'garcilaso':           1450,
  'utc':                 1450,
  'adt':                 1440,
  'los chankas':         1430,
  'chankas':             1430,
  'union comercio':      1420,
  'unión comercio':      1420,
  'ayacucho':            1415,
  'ayacucho fc':         1415,
};

// Ratings iniciales para ligas top internacionales
const INTERNATIONAL_INITIAL_ELO = {
  // España
  'real madrid':           1920, 'barcelona':          1890, 'atlético madrid':     1840,
  'atletico madrid':       1840, 'athletic club':       1760, 'real sociedad':       1750,
  'villarreal':            1740, 'sevilla':             1720, 'real betis':          1710,
  'valencia':              1680,
  // Inglaterra
  'manchester city':       1930, 'arsenal':             1880, 'liverpool':           1870,
  'manchester united':     1800, 'chelsea':             1780, 'tottenham':           1770,
  'newcastle':             1720, 'aston villa':         1700, 'west ham':            1670,
  'everton':               1640,
  // Alemania
  'bayern munich':         1910, 'bayer leverkusen':    1850, 'borussia dortmund':   1820,
  'rb leipzig':            1790, 'eintracht frankfurt': 1730, 'wolfsburg':           1680,
  // Italia
  'inter':                 1880, 'internazionale':      1880, 'napoli':              1870,
  'milan':                 1850, 'ac milan':            1850, 'juventus':            1840,
  'roma':                  1770, 'lazio':               1750, 'fiorentina':          1720,
  'atalanta':              1760,
  // Francia
  'paris saint-germain':   1890, 'psg':                 1890, 'monaco':              1760,
  'marseille':             1740, 'lille':               1720, 'lyon':                1700,
  // Argentina
  'river plate':           1870, 'boca juniors':        1860, 'racing club':         1780,
  'independiente':         1750, 'san lorenzo':         1730, 'estudiantes':         1710,
  'velez sarsfield':       1700, 'talleres':            1690,
  // Brasil
  'flamengo':              1870, 'palmeiras':           1870, 'atletico mineiro':    1820,
  'atlético mg':           1820, 'fluminense':          1790, 'botafogo':            1780,
  'sao paulo':             1770, 'são paulo':           1770, 'corinthians':         1760,
  'internacional':         1750, 'gremio':              1740, 'grêmio':              1740,
  'cruzeiro':              1720, 'santos':              1710,
};

// ── Mapa en memoria para almacenar Elo actualizado en sesión ─────
// Se inicializa desde los valores pre-calculados y se actualiza con
// cada partido procesado.
const _eloStore = new Map();

/**
 * Obtiene el Elo actual de un equipo. Si no existe, devuelve el
 * valor inicial de la base de datos pre-calculada o ELO_DEFAULT.
 * @param {string} teamName
 * @returns {number}
 */
export function getTeamElo(teamName) {
  if (!teamName) return ELO_DEFAULT;
  const key = teamName.toLowerCase().trim();
  if (_eloStore.has(key)) return _eloStore.get(key);

  // Buscar en tablas iniciales (coincidencia parcial)
  const allInitial = { ...PERU_INITIAL_ELO, ...INTERNATIONAL_INITIAL_ELO };
  const match = Object.keys(allInitial).find(k => key.includes(k) || k.includes(key));
  const initial = match ? allInitial[match] : ELO_DEFAULT;
  _eloStore.set(key, initial);
  return initial;
}

/**
 * Establece manualmente el Elo de un equipo (para testing / admin)
 * @param {string} teamName
 * @param {number} elo
 */
export function setTeamElo(teamName, elo) {
  _eloStore.set(teamName.toLowerCase().trim(), elo);
}

/**
 * Probabilidad esperada de victoria del equipo A contra el equipo B
 * según la fórmula Elo estándar.
 * @param {number} eloA - Rating del equipo A
 * @param {number} eloB - Rating del equipo B
 * @param {boolean} aIsHome - Si A juega en casa (aplica HOME_BONUS)
 * @returns {number} Probabilidad de victoria de A (0–1)
 */
export function eloExpectedWin(eloA, eloB, aIsHome = false) {
  const bonus = aIsHome ? ELO_HOME_BONUS : 0;
  return 1 / (1 + Math.pow(10, (eloB - eloA - bonus) / K_SCALE));
}

/**
 * Calcula el nuevo Elo de ambos equipos tras un resultado.
 * @param {number} eloHome  - Elo actual del local
 * @param {number} eloAway  - Elo actual del visitante
 * @param {number} homeGoals
 * @param {number} awayGoals
 * @param {boolean} isCup   - Partidos de copa usan K menor
 * @returns {{ newEloHome: number, newEloAway: number, delta: number }}
 */
export function updateElo(eloHome, eloAway, homeGoals, awayGoals, isCup = false) {
  const K = isCup ? K_FACTOR_CUP : K_FACTOR_BASE;
  const expectedHome = eloExpectedWin(eloHome, eloAway, true);
  const expectedAway = 1 - expectedHome;

  // Resultado real: 1 = victoria, 0.5 = empate, 0 = derrota
  let actualHome, actualAway;
  if (homeGoals > awayGoals) { actualHome = 1;   actualAway = 0; }
  else if (homeGoals < awayGoals) { actualHome = 0; actualAway = 1; }
  else                        { actualHome = 0.5; actualAway = 0.5; }

  // Multiplicador por margen de victoria (Goal Difference multiplier)
  // Un margen mayor merece un cambio de Elo mayor, pero saturamos en 3+
  const goalDiff = Math.abs(homeGoals - awayGoals);
  const gdMultiplier = goalDiff === 0 ? 1
    : goalDiff === 1 ? 1.0
    : goalDiff === 2 ? 1.5
    : goalDiff === 3 ? 1.75
    : 1.9; // 4+ goles de diferencia

  const delta = Math.round(K * gdMultiplier * (actualHome - expectedHome));

  return {
    newEloHome: Math.round(eloHome + delta),
    newEloAway: Math.round(eloAway - delta),
    delta: Math.abs(delta),
  };
}

/**
 * Procesa un array de partidos históricos y actualiza el Elo de todos
 * los equipos involucrados en el _eloStore global.
 * Los partidos deben venir ordenados de MÁS ANTIGUOS a MÁS RECIENTES.
 * 
 * @param {Array<object>} matches - Partidos con { teams, goals, league }
 * @param {boolean} isCup
 */
export function feedMatchesToElo(matches, isCup = false) {
  if (!matches || matches.length === 0) return;

  // Ordenar de más antiguo a más reciente para que el Elo evolucione correctamente
  const sorted = [...matches].sort((a, b) => {
    const da = new Date(a.fixture?.date || a.date || 0);
    const db = new Date(b.fixture?.date || b.date || 0);
    return da - db;
  });

  sorted.forEach(m => {
    const homeName = (m.teams?.home?.name || '').toLowerCase().trim();
    const awayName = (m.teams?.away?.name || '').toLowerCase().trim();
    if (!homeName || !awayName) return;

    const homeGoals = m.goals?.home ?? null;
    const awayGoals = m.goals?.away ?? null;
    if (homeGoals === null || awayGoals === null) return; // Partido sin resultado, omitir

    const eloHome = getTeamElo(homeName);
    const eloAway = getTeamElo(awayName);
    const { newEloHome, newEloAway } = updateElo(eloHome, eloAway, homeGoals, awayGoals, isCup);

    _eloStore.set(homeName, newEloHome);
    _eloStore.set(awayName, newEloAway);
  });
}

/**
 * Calcula las probabilidades Elo para el próximo partido.
 * Devuelve porcentajes de victoria local, empate y victoria visitante.
 * El empate se estima restando de 1 y distribuyendo la "zona gris".
 *
 * @param {string} homeTeamName
 * @param {string} awayTeamName
 * @returns {{ home: number, draw: number, away: number, eloDiff: number, homeElo: number, awayElo: number }}
 */
export function calcEloMatchProbs(homeTeamName, awayTeamName) {
  const homeElo = getTeamElo(homeTeamName);
  const awayElo = getTeamElo(awayTeamName);
  const eloDiff = homeElo - awayElo;

  // Probabilidad bruta Elo (sin empate)
  const rawHome = eloExpectedWin(homeElo, awayElo, true);
  const rawAway = 1 - rawHome;

  // Estimación del empate: basada en la diferencia de Elo.
  // Cuando los equipos están muy igualados (diff ≈ 0), el empate es más probable.
  // Fórmula ajustada a la distribución histórica del fútbol profesional (~25-30% de empates).
  const eloGap = Math.abs(eloDiff);
  const drawBase = eloGap <= 50  ? 0.29
    : eloGap <= 100 ? 0.26
    : eloGap <= 200 ? 0.22
    : eloGap <= 300 ? 0.18
    : 0.13;

  // Ajustar victoria y empate para que sumen 100%
  const scaleFactor = 1 - drawBase;
  const homeProb  = Math.round(rawHome * scaleFactor * 100);
  const awayProb  = Math.round(rawAway * scaleFactor * 100);
  const drawProb  = 100 - homeProb - awayProb;

  return {
    home:    homeProb,
    draw:    drawProb,
    away:    awayProb,
    eloDiff: Math.round(eloDiff),
    homeElo,
    awayElo,
  };
}

// ─────────────────────────────────────────────────────────────────
//  CORRECCIÓN DE DIXON-COLES
//  Mejora la distribución de Poisson ajustando la probabilidad de
//  marcadores bajos (0-0, 1-0, 0-1, 1-1) que Poisson subestima.
//
//  Referencia: Dixon & Coles (1997) "Modelling association football
//  scores and inefficiencies in the football betting market"
// ─────────────────────────────────────────────────────────────────

/**
 * Factor de corrección τ (tau) de Dixon-Coles.
 * Solo aplica a marcadores bajos (0-0, 1-0, 0-1, 1-1).
 * ρ (rho) controla la magnitud de la corrección; valores típicos: 0.1–0.2
 *
 * @param {number} homeGoals - Goles del local (entero)
 * @param {number} awayGoals - Goles del visitante (entero)
 * @param {number} lambdaHome - λ esperado del local
 * @param {number} lambdaAway - λ esperado del visitante
 * @param {number} rho - Parámetro de corrección (default 0.13)
 * @returns {number} Factor multiplicativo para la probabilidad del marcador
 */
export function dixonColesTau(homeGoals, awayGoals, lambdaHome, lambdaAway, rho = 0.13) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1; // Sin corrección para marcadores altos
}

/**
 * Función Poisson P(X = k)
 */
function poisson(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
}

/**
 * Calcula la distribución de probabilidad de marcadores con corrección
 * de Dixon-Coles. Más preciso que Poisson simple para marcadores bajos.
 *
 * @param {number} lambdaHome - Goles esperados del local (λ)
 * @param {number} lambdaAway - Goles esperados del visitante (λ)
 * @param {number} maxGoals   - Límite de marcadores a calcular (default 6)
 * @param {number} rho        - Corrección Dixon-Coles (default 0.13)
 * @returns {{ home: number, draw: number, away: number, scoreMatrix: object, over15: number, over25: number, over35: number, btts: number }}
 */
export function calcDixonColesProbs(lambdaHome, lambdaAway, maxGoals = 7, rho = 0.13) {
  let homeWin = 0, draw = 0, awayWin = 0;
  let over15 = 0, over25 = 0, over35 = 0, btts = 0;
  const scoreMatrix = {};
  let totalProb = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const tau    = dixonColesTau(h, a, lambdaHome, lambdaAway, rho);
      const prob   = poisson(lambdaHome, h) * poisson(lambdaAway, a) * tau;
      const key    = `${h}-${a}`;
      scoreMatrix[key] = +(prob * 100).toFixed(3); // En porcentaje
      totalProb += prob;

      if (h > a)  homeWin += prob;
      else if (h === a) draw += prob;
      else        awayWin += prob;

      const total = h + a;
      if (total > 1.5) over15 += prob;
      if (total > 2.5) over25 += prob;
      if (total > 3.5) over35 += prob;
      if (h > 0 && a > 0) btts += prob;
    }
  }

  // Normalizar (por si hay desviación numérica)
  const norm = totalProb > 0 ? totalProb : 1;

  return {
    home:    +(homeWin / norm * 100).toFixed(1),
    draw:    +(draw    / norm * 100).toFixed(1),
    away:    +(awayWin / norm * 100).toFixed(1),
    over15:  +(over15  / norm * 100).toFixed(1),
    over25:  +(over25  / norm * 100).toFixed(1),
    over35:  +(over35  / norm * 100).toFixed(1),
    btts:    +(btts    / norm * 100).toFixed(1),
    lambdaHome: +lambdaHome.toFixed(2),
    lambdaAway: +lambdaAway.toFixed(2),
    scoreMatrix,
  };
}

/**
 * Función principal: combina Elo + Dixon-Coles + estadísticas de forma
 * para generar las mejores estimaciones posibles de las probabilidades
 * de un partido.
 *
 * Lógica de fusión (pesos):
 *   30% Elo Rating (poder a largo plazo)
 *   70% Dixon-Coles / Poisson (forma reciente de la temporada)
 *
 * @param {object} params
 * @param {string} params.homeTeamName
 * @param {string} params.awayTeamName
 * @param {number} params.homeAvgGF  - Goles a favor del local por partido
 * @param {number} params.homeAvgGA  - Goles en contra del local por partido
 * @param {number} params.awayAvgGF  - Goles a favor del visitante por partido
 * @param {number} params.awayAvgGA  - Goles en contra del visitante por partido
 * @param {Array}  [params.homeHistory] - Partidos recientes del local (para feedear el Elo)
 * @param {Array}  [params.awayHistory] - Partidos recientes del visitante
 * @param {boolean} [params.isCupMatch]
 * @returns {object} Probabilidades fusionadas + datos diagnósticos
 */
export function calcCombinedProbs({
  homeTeamName,
  awayTeamName,
  homeAvgGF,
  homeAvgGA,
  awayAvgGF,
  awayAvgGA,
  homeHistory = [],
  awayHistory = [],
  isCupMatch  = false,
  leagueName  = '',
}) {
  // 1. Actualizar Elo con los últimos resultados de ambos equipos
  const allHistory = [...(homeHistory || []), ...(awayHistory || [])];
  if (allHistory.length > 0) {
    feedMatchesToElo(allHistory, isCupMatch);
  }

  // 2. Probabilidades Elo (largo plazo)
  const eloProbs = calcEloMatchProbs(homeTeamName, awayTeamName);

  // 3. λ ajustado por la defensa rival (modelo Dixon-Coles base)
  // λ_home = promedio de goles del local * promedio de goles en contra del visitante
  //          normalizado por la media de la liga.
  // AJUSTE: El promedio de la liga varía según la competición.
  const isSaudi = /saudi|arabia/i.test(leagueName);
  const leagueAvg = isSaudi ? 1.48 : 1.3; // Saudi Pro League es más goleadora (3.0 total vs 2.6)

  const lambdaHome = Math.max((homeAvgGF * awayAvgGA) / leagueAvg, 0.2);
  const lambdaAway = Math.max((awayAvgGF * homeAvgGA) / leagueAvg, 0.2);

  // 4. Probabilidades Dixon-Coles (corto plazo / forma actual)
  const dcProbs = calcDixonColesProbs(lambdaHome, lambdaAway);

  // 5. Fusión ponderada: 30% Elo + 70% Dixon-Coles
  const ELO_WEIGHT = 0.30;
  const DC_WEIGHT  = 0.70;

  const fusedHome = Math.round(eloProbs.home * ELO_WEIGHT + dcProbs.home * DC_WEIGHT);
  const fusedAway = Math.round(eloProbs.away * ELO_WEIGHT + dcProbs.away * DC_WEIGHT);
  const fusedDraw = 100 - fusedHome - fusedAway;

  return {
    // Probabilidades finales fusionadas
    home:    fusedHome,
    draw:    Math.max(fusedDraw, 5),  // Mínimo 5% de empate siempre
    away:    fusedAway,

    // Mercados de goles (exclusivamente de Dixon-Coles, más preciso)
    over15:  parseFloat(dcProbs.over15),
    over25:  parseFloat(dcProbs.over25),
    over35:  parseFloat(dcProbs.over35),
    btts:    parseFloat(dcProbs.btts),

    // Lambdas calculados
    lambdaHome: dcProbs.lambdaHome,
    lambdaAway: dcProbs.lambdaAway,

    // Datos de diagnóstico
    _elo: {
      homeElo:  eloProbs.homeElo,
      awayElo:  eloProbs.awayElo,
      eloDiff:  eloProbs.eloDiff,
      eloHome:  eloProbs.home,
      eloAway:  eloProbs.away,
      eloDraw:  eloProbs.draw,
    },
    _dc: {
      dcHome:   dcProbs.home,
      dcAway:   dcProbs.away,
      dcDraw:   dcProbs.draw,
    },
    _top5Scores: getTopScores(dcProbs.scoreMatrix, 5),
  };
}

/**
 * Utilidad: extrae los N marcadores más probables de la matriz de marcadores
 * @param {object} scoreMatrix - { '1-0': 12.5, '0-0': 9.8, ... }
 * @param {number} n
 * @returns {Array<{ score: string, pct: number }>}
 */
export function getTopScores(scoreMatrix, n = 5) {
  return Object.entries(scoreMatrix)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([score, pct]) => ({ score, pct: +pct.toFixed(1) }));
}

/**
 * Devuelve el estado actual del ranking Elo de todos los equipos en memoria.
 * @param {string} [leagueFilter] - Filtrar por prefijo de nombre (ej: para debug)
 * @returns {Array<{ team: string, elo: number }>}
 */
export function getEloRankings(leagueFilter = null) {
  const entries = Array.from(_eloStore.entries())
    .filter(([name]) => !leagueFilter || name.includes(leagueFilter.toLowerCase()))
    .sort(([, a], [, b]) => b - a)
    .map(([team, elo]) => ({ team, elo }));
  return entries;
}

// ─────────────────────────────────────────────────────────────────
//  EXPECTATIVA PITAGÓRICA (Pythagorean Expectation)
//  Adaptada al fútbol con exponente 1.35 (calibrado empíricamente).
//  Predice el porcentaje de victorias "real" basado en goles, NO en resultados.
//  Un equipo con W% real >> W% pitagórico está ganando "con suerte".
//  Un equipo con W% real << W% pitagórico está rindiendo por encima de sus goles.
//
//  Referencia: Bill James (baseball) → adaptado por Pomeroy, Vollman et al.
// ─────────────────────────────────────────────────────────────────

const PYTHAG_EXPONENT = 1.35; // Calibrado para fútbol (baseball usa 2.0)

/**
 * Calcula la expectativa pitagórica de un equipo y detecta si está
 * "sobre-puntuando" o "infra-puntuando" respecto a sus goles reales.
 *
 * @param {Array<object>} matches  - Últimos partidos con { goals, teams }
 * @param {string}        teamId   - ID del equipo a evaluar
 * @returns {{
 *   pythagWinPct:  number,   // W% esperada por goles (0-100)
 *   actualWinPct:  number,   // W% real (victorias / total) (0-100)
 *   delta:         number,   // Diferencia: actual - pitagórica (positivo = suerte, negativo = infravalorado)
 *   overPerforming: boolean, // true si el equipo está ganando más de lo que sus goles explican
 *   underPerforming: boolean,// true si el equipo debería tener más puntos de los que tiene
 *   label:         string,   // Etiqueta legible para el motor
 *   adjustment:    number,   // Penalización (-) o boost (+) sugerido para el effectiveScore
 * }}
 */
export function calcPythagoreanExpectation(matches, teamId) {
  const EMPTY = {
    pythagWinPct: null, actualWinPct: null, delta: 0,
    overPerforming: false, underPerforming: false,
    label: 'Sin datos', adjustment: 0,
  };

  if (!matches || matches.length < 5) return EMPTY;

  const pool = matches.slice(0, 15); // Últimos 15 partidos máximo
  let gf = 0, gc = 0, wins = 0, total = 0;

  pool.forEach(m => {
    const isHome = String(m.teams?.home?.id) === String(teamId);
    const hg = m.goals?.home ?? 0;
    const ag = m.goals?.away ?? 0;
    const myGF = isHome ? hg : ag;
    const myGC = isHome ? ag : hg;
    const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
    const won = isHome ? winner === 'home' : winner === 'away';

    gf += myGF;
    gc += myGC;
    if (won) wins++;
    total++;
  });

  if (total === 0 || (gf === 0 && gc === 0)) return EMPTY;

  // Fórmula pitagórica
  const gfPow = Math.pow(Math.max(gf, 0.1), PYTHAG_EXPONENT);
  const gcPow = Math.pow(Math.max(gc, 0.1), PYTHAG_EXPONENT);
  const pythagWinPct = Math.round((gfPow / (gfPow + gcPow)) * 100);
  const actualWinPct = Math.round((wins / total) * 100);
  const delta = actualWinPct - pythagWinPct;

  // Un delta > +12 indica suerte sostenida → penalización futura esperada
  // Un delta < -12 indica infrarendimiento → el equipo vale más de lo que parece
  const overPerforming  = delta > 12;
  const underPerforming = delta < -12;

  let label = 'Rendimiento coherente';
  let adjustment = 0;

  if (overPerforming) {
    // Está ganando por encima de sus goles → probable regresión a la media
    const severity = delta > 20 ? 'severa' : 'moderada';
    label = `⚠️ Sobre-puntuando (${severity}): W%Real ${actualWinPct}% vs Pitagórica ${pythagWinPct}%`;
    adjustment = delta > 20 ? -10 : -5; // Penalización al effectiveScore
  } else if (underPerforming) {
    // Tiene más goles de los que reflejan sus puntos → equipo infravalorado
    label = `💡 Infra-puntuando: W%Real ${actualWinPct}% vs Pitagórica ${pythagWinPct}%`;
    adjustment = delta < -20 ? +8 : +4;  // Boost al effectiveScore
  }

  return {
    pythagWinPct, actualWinPct, delta,
    overPerforming, underPerforming,
    label, adjustment,
    gf: +(gf / total).toFixed(2),
    gc: +(gc / total).toFixed(2),
  };
}

// ─────────────────────────────────────────────────────────────────
//  ÍNDICE DE VOLATILIDAD (Glicko-2 simplificado)
//  Mide la INCERTIDUMBRE del Elo de un equipo según dos factores:
//    1. Inactividad: Cuántos días lleva sin jugar
//    2. Inconsistencia: Cuántas veces alternó W-L (zigzag) en los últimos partidos
//
//  Un Elo con alta volatilidad debería generar picks más conservadores.
// ─────────────────────────────────────────────────────────────────

/**
 * Calcula el índice de volatilidad de un equipo (0 = muy estable, 100 = muy incierto).
 *
 * @param {Array<object>} matches    - Últimos partidos del equipo (más reciente primero)
 * @param {string}        teamId     - ID del equipo
 * @returns {{
 *   volatility:       number,   // Índice 0–100
 *   label:            string,   // Etiqueta legible
 *   daysSinceLastGame: number | null,
 *   inconsistencyScore: number, // Cuántas veces alternó W→L o L→W
 *   trustPenalty:     number,   // Penalización de confianza sugerida (0–15 puntos)
 *   isHighVolatility: boolean,
 * }}
 */
export function calcVolatilityIndex(matches, teamId) {
  const EMPTY = {
    volatility: 0, label: 'Sin datos', daysSinceLastGame: null,
    inconsistencyScore: 0, trustPenalty: 0, isHighVolatility: false,
  };

  if (!matches || matches.length < 3) return EMPTY;

  // ── 1. Inactividad ───────────────────────────────────────────
  const lastMatch = matches[0];
  const lastDate  = new Date(lastMatch?.fixture?.date || lastMatch?.date || 0);
  const now       = new Date();
  const daysSinceLastGame = isNaN(lastDate) ? null : Math.floor((now - lastDate) / 86400000);

  let inactivityScore = 0;
  if (daysSinceLastGame !== null) {
    if (daysSinceLastGame > 21) inactivityScore = 50;      // +3 semanas sin jugar
    else if (daysSinceLastGame > 14) inactivityScore = 30; // 2–3 semanas
    else if (daysSinceLastGame > 9) inactivityScore = 15;  // 10–14 días
  }

  // ── 2. Inconsistencia de resultados (zigzag W-L-W-L) ─────────
  const pool = matches.slice(0, 10);
  const results = pool.map(m => {
    const isHome = String(m.teams?.home?.id) === String(teamId);
    const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
    return isHome ? (winner === 'home' ? 'W' : winner === 'draw' ? 'D' : 'L')
                  : (winner === 'away' ? 'W' : winner === 'draw' ? 'D' : 'L');
  });

  // Contamos cuántos cambios W→L o L→W hay (ignora empates para este cálculo)
  const nonDraws = results.filter(r => r !== 'D');
  let switches = 0;
  for (let i = 1; i < nonDraws.length; i++) {
    if (nonDraws[i] !== nonDraws[i - 1]) switches++;
  }
  // Normalizar a 0–50 (máximo 9 cambios posibles en 10 partidos)
  const inconsistencyScore = Math.round((switches / Math.max(nonDraws.length - 1, 1)) * 50);

  // ── 3. Volatilidad total y penalización ──────────────────────
  const volatility = Math.min(inactivityScore + inconsistencyScore, 100);
  const isHighVolatility = volatility >= 50;

  // La penalización reduce la confianza en el pick (no los goles esperados)
  // Cap en 15 puntos para no distorsionar el motor cuando hay alta volatilidad
  const trustPenalty = volatility >= 70 ? 15
    : volatility >= 50 ? 10
    : volatility >= 30 ? 5
    : 0;

  const label = volatility >= 70 ? `🔴 Alta incertidumbre (${daysSinceLastGame !== null ? `${daysSinceLastGame}d inactivo, ` : ''}zigzag: ${switches} cambios)`
    : volatility >= 50 ? `🟡 Incertidumbre moderada`
    : volatility >= 30 ? `🟡 Ligera inestabilidad`
    : `✅ Equipo estable`;

  return {
    volatility, label, daysSinceLastGame,
    inconsistencyScore: switches, trustPenalty, isHighVolatility,
  };
}
