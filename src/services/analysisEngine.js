import { calcCombinedProbs, calcPythagoreanExpectation, calcVolatilityIndex } from './eloRating.js';
// ─────────────────────────────────────────────────────────────────
//  analysisEngine.js
//  Motor de análisis tipster profesional — v4 (Elo + Dixon-Coles)
//  Fuente de datos: ESPN (gratuito, sin API keys)
// ─────────────────────────────────────────────────────────────────

/**
 * Calcula la tendencia de forma reciente ponderada
 * @param {Array}  matches - Últimos partidos (más reciente primero)
 * @param {string} teamId  - ID del equipo
 * @param {string} side    - 'home' | 'away' | null (todos)
 */
export function calculateFormScore(matches, teamId, side = null) {
  if (!matches || matches.length === 0) return { score: 0, label: 'Sin datos', wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, total: 0 };

  // ── Filtro por condición de local/visitante ──────────────────
  let pool = matches;
  if (side === 'home') {
    pool = matches.filter(m => String(m.teams?.home?.id) === String(teamId));
  } else if (side === 'away') {
    pool = matches.filter(m => String(m.teams?.away?.id) === String(teamId));
  }
  if (pool.length === 0) return { score: 0, label: 'Sin datos', wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, total: 0 };

  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  const weights = [4, 4, 3, 3, 2, 1, 1, 1, 1, 1, 1, 1]; // 70% peso a los últimos 5 partidos (Recency Extrema)

  let weightedScore = 0;
  let totalWeight = 0;

  pool.slice(0, 12).forEach((m, i) => {
    const w = weights[i] || 1;
    const isHome = String(m.teams?.home?.id) === String(teamId);
    const homeGoals = m.goals?.home ?? 0;
    const awayGoals = m.goals?.away ?? 0;
    const gf = isHome ? homeGoals : awayGoals;
    const ga = isHome ? awayGoals : homeGoals;

    goalsFor += gf;
    goalsAgainst += ga;

    const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
    const result = isHome ? winner === 'home' ? 'W' : winner === 'draw' ? 'D' : 'L'
                          : winner === 'away' ? 'W' : winner === 'draw' ? 'D' : 'L';

    if (result === 'W') { wins++; weightedScore += 3 * w; }
    else if (result === 'D') { draws++; weightedScore += 1 * w; }
    else { losses++; }
    totalWeight += w;
  });

  const maxPossible = totalWeight * 3;
  const score = totalWeight > 0 ? Math.round((weightedScore / maxPossible) * 100) : 0;
  const label = score >= 75 ? 'Excelente' : score >= 55 ? 'Buena' : score >= 35 ? 'Regular' : 'Mala';

  return { score, label, wins, draws, losses, goalsFor, goalsAgainst, total: Math.min(pool.length, 12) };
}

/**
 * Analiza goles por tramo de tiempo
 */
export function analyzeGoalsByTimeSlot(events, teamId) {
  const slots = [
    { key: '0-15',   label: "0'–15'",   goals: 0, conceded: 0 },
    { key: '16-30',  label: "16'–30'",  goals: 0, conceded: 0 },
    { key: '31-45',  label: "31'–45'",  goals: 0, conceded: 0 },
    { key: '46-60',  label: "46'–60'",  goals: 0, conceded: 0 },
    { key: '61-75',  label: "61'–75'",  goals: 0, conceded: 0 },
    { key: '76-90',  label: "76'–90'",  goals: 0, conceded: 0 },
  ];

  if (!events || events.length === 0) return slots;

  events.forEach(ev => {
    if (ev.type !== 'Goal' || ev.detail === 'Missed Penalty') return;
    const min = ev.time?.elapsed || 0;
    const scoringTeam = String(ev.team?.id);
    const isOurGoal = scoringTeam === String(teamId);

    let slotIndex = 0;
    if      (min <= 15) slotIndex = 0;
    else if (min <= 30) slotIndex = 1;
    else if (min <= 45) slotIndex = 2;
    else if (min <= 60) slotIndex = 3;
    else if (min <= 75) slotIndex = 4;
    else                slotIndex = 5;

    if (isOurGoal) slots[slotIndex].goals++;
    else           slots[slotIndex].conceded++;
  });

  return slots;
}

/**
 * Calcula frecuencia de Over/Under a partir de los últimos partidos
 */
export function calculateOverUnder(matches, teamId) {
  const result = { over15: 0, over25: 0, over35: 0, btts: 0, total: 0 };
  if (!matches || matches.length === 0) return result;

  matches.slice(0, 12).forEach(m => {
    const hg = m.goals?.home ?? 0;
    const ag = m.goals?.away ?? 0;
    const total = hg + ag;
    const isHome = String(m.teams?.home?.id) === String(teamId);
    const gf = isHome ? hg : ag;
    const ga = isHome ? ag : hg;

    if (total > 1.5) result.over15++;
    if (total > 2.5) result.over25++;
    if (total > 3.5) result.over35++;
    if (gf > 0 && ga > 0) result.btts++;
    result.total++;
  });

  if (result.total > 0) {
    result.over15Pct = Math.round(result.over15 / result.total * 100);
    result.over25Pct = Math.round(result.over25 / result.total * 100);
    result.over35Pct = Math.round(result.over35 / result.total * 100);
    result.bttsPct   = Math.round(result.btts   / result.total * 100);
  }

  return result;
}

/**
 * Analiza tarjetas de los últimos partidos
 */
export function analyzeCards(events, teamId, numMatches = 1) {
  let yellow = 0, red = 0;
  if (!events) return { yellow: 0, red: 0, avgYellow: 0, avgRed: 0 };

  events.forEach(ev => {
    if (ev.type !== 'Card') return;
    if (String(ev.team?.id) !== String(teamId)) return;
    if (ev.detail === 'Yellow Card') yellow++;
    if (ev.detail === 'Red Card') red++;
  });

  const n = Math.max(1, numMatches);
  return { 
    yellow, 
    red, 
    avgYellow: +(yellow / n).toFixed(2), 
    avgRed: +(red / n).toFixed(2) 
  };
}

/**
 * Calcula la frecuencia de ambos equipos anotan en H2H
 */
export function analyzeH2H(h2hMatches, homeId, awayId) {
  if (!h2hMatches || h2hMatches.length === 0) return null;

  let homeWins = 0, awayWins = 0, draws = 0;
  let totalGoals = 0, btts = 0, over15 = 0, over25 = 0;

  h2hMatches.slice(0, 12).forEach(m => {
    const hg = m.goals?.home ?? 0;
    const ag = m.goals?.away ?? 0;
    const total = hg + ag;
    totalGoals += total;

    if (total > 1.5) over15++;
    if (total > 2.5) over25++;
    if (hg > 0 && ag > 0) btts++;

    const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';

    const isHomeTeamHome = String(m.teams?.home?.id) === String(homeId);
    if (winner === 'draw') draws++;
    else if ((winner === 'home' && isHomeTeamHome) || (winner === 'away' && !isHomeTeamHome)) homeWins++;
    else awayWins++;
  });

  const n = Math.min(h2hMatches.length, 12);
  return {
    homeWins,
    awayWins,
    draws,
    homeWinPct: Math.round(homeWins / n * 100),
    awayWinPct: Math.round(awayWins / n * 100),
    drawPct:    Math.round(draws    / n * 100),
    avgGoals:   +(totalGoals / n).toFixed(1),
    bttsPct:    Math.round(btts   / n * 100),
    over15Pct:  Math.round(over15  / n * 100),
    over25Pct:  Math.round(over25  / n * 100),
    total: n,
  };
}

/**
 * Verifica si el partido es un derbi/clásico reconocido de alta volatilidad
 */
export function isDerbyMatch(home, away) {
  if (!home || !away) return false;
  const h = home.toLowerCase();
  const a = away.toLowerCase();
  
  const derbies = [
    ['palmeiras', 'santos'],
    ['palmeiras', 'corinthians'],
    ['palmeiras', 'são paulo'],
    ['santos', 'corinthians'],
    ['santos', 'são paulo'],
    ['corinthians', 'são paulo'],
    ['flamengo', 'fluminense'],
    ['flamengo', 'vasco'],
    ['flamengo', 'botafogo'],
    ['cruzeiro', 'atlético-mg'],
    ['cruzeiro', 'atletico mg'],
    ['internacional', 'grêmio'],
    ['gremio', 'internacional'],
    ['boca juniors', 'river plate'],
    ['racing club', 'independiente'],
    ['san lorenzo', 'huracán'],
    ['real madrid', 'barcelona'],
    ['real madrid', 'atlético madrid'],
    ['sevilla', 'real betis'],
    ['arsenal', 'tottenham'],
    ['manchester united', 'manchester city'],
    ['manchester united', 'liverpool'],
    ['everton', 'liverpool'],
    ['ac milan', 'internazionale'],
    ['milan', 'inter'],
    ['juventus', 'internazionale'],
    ['juventus', 'inter'],
    ['roma', 'lazio'],
    ['mönchengladbach', 'dortmund'],
    ['bayern', 'dortmund'],
    ['alianza lima', 'universitario'],
    ['sporting cristal', 'universitario'],
    ['alianza lima', 'sporting cristal'],
    ['chivas', 'américa'],
    ['cruz azul', 'américa'],
    ['nacional', 'peñarol'],
    ['colo colo', 'universidad de chile'],
    // Clásicos Chilenos adicionales
    ['universidad de chile', 'universidad católica'],
    ['colo colo', 'universidad católica'],
    ['deportes concepcion', 'huachipato'],
    ['deportes concepción', 'huachipato'],
    ['everton', 'santiago wanderers'],
    ['la serena', 'coquimbo unido'],
    ['palestino', 'unión española'],
    ['palestino', 'audax italiano'],
    ['unión española', 'audax italiano'],
    ['cobreloa', 'cobresal'],
    ['millonarios', 'santa fe'],
    ['nacional', 'medellín'],
    ['al nassr', 'al hilal'],
    ['al-nassr', 'al-hilal'],
    ['al ittihad', 'al ahli'],
    ['al-ittihad', 'al-ahli']
  ];

  return derbies.some(pair => {
    if (h.includes(pair[0]) && a.includes(pair[1])) return true;
    if (a.includes(pair[0]) && h.includes(pair[1])) return true;
    return false;
  });
}

/**
 * Motor principal de generación de picks
 * v3 — Mercados extendidos + ESPN como fuente única (gratuita)
 * @param {object} marketInsight   - Cuotas/predicción del PickCenter de ESPN (opcional)
 * @param {object} homeCornersData - { avg, over3, over4, over5, matches }
 * @param {object} awayCornersData - { avg, over3, over4, over5, matches }
 * @param {object} homeCardsData   - { avg, over1, over2, over3, matches }
 * @param {object} awayCardsData   - { avg, over1, over2, over3, matches }
 * @param {object} homeSlots       - Goles por tramo (analyzeGoalsByTimeSlot)
 * @param {object} awaySlots       - Goles por tramo
 * @param {Array}  injuries        - Lista de bajas del partido [{team:{name}, player:{name}}]
 * @param {string} homeTeamName    - Nombre del equipo local (para filtrar lesiones)
 * @param {string} awayTeamName    - Nombre del equipo visitante
 * @param {number} homeRestDays    - Días desde el último partido del local
 * @param {number} awayRestDays    - Días desde el último partido del visitante
 * @param {Array}  homeHistory     - Lista de últimos partidos del local (para fatiga)
 * @param {Array}  awayHistory     - Lista de últimos partidos del visitante
 */

// --- NUEVOS FACTORES DE PREVENCIÓN ---
const ALTITUDE_CITIES = [
  'la paz', 'quito', 'cusco', 'bogota', 'bogotá', 'arequipa', 'potosi', 'potosí', 
  'oruro', 'el alto', 'huancayo', 'cajamarca', 'latacunga', 'riobamba', 'ambato',
  // Ciudades de altura específicas del Perú
  'juliaca', 'puno', 'cerro de pasco', 'ayacucho', 'abancay', 'andahuaylazo', 'huaraz'
];

// Equipos peruanos de costa/llano (sufren el factor altitud)
const PERU_COASTAL_TEAMS = [
  'alianza lima', 'universitario', 'sporting cristal', 'sport boys',
  'cesar vallejo', 'mannucci', 'grau', 'atlético grau', 'alianza atletico', 
  'unión comercio'
];

// Equipos peruanos que juegan habitualmente en altura
const PERU_HIGHLAND_TEAMS = [
  'huancayo', 'sport huancayo', 'comerciantes unidos', 'cienciano', 
  'cusco fc', 'deportivo garcilaso', 'garcilaso', 'FBC melgar', 'melgar', 
  'ayacucho', 'utc', 'adt', 'los chankas', 'chankas'
];

const HIERARCHY_TEAMS = [
  // Argentina
  'river plate', 'boca juniors', 'racing', 'independiente', 'san lorenzo', 'estudiantes', 'velez',
  // Brasil
  'flamengo', 'palmeiras', 'sao paulo', 'são paulo', 'corinthians', 'atletico mg', 'atlético mg', 
  'gremio', 'grêmio', 'internacional', 'fluminense', 'botafogo', 'cruzeiro'
];

function checkCalendarFatigue(history) {
  if (!history || history.length < 3) return false;
  // Consideramos fatiga si ha jugado 3 partidos en los últimos 8 días
  const now = new Date();
  const recentMatches = history.filter(m => {
    const matchDate = new Date(m.fixture?.date || m.date);
    const diffDays = (now - matchDate) / 86400000;
    return diffDays >= 0 && diffDays <= 8;
  });
  return recentMatches.length >= 3;
}

/**
 * AJUSTE #1: "Resaca Internacional"
 * Equipos que jugaron competiciones internacionales hace <=4 días sufren una
 * penalización extra de forma porque suelen rotar jugadores o regresan con fatiga.
 */
function checkInternationalHangover(teamName, history) {
  if (!history || history.length === 0) return { penalty: 0, note: '' };

  const now = new Date();
  // Detectar si el último partido fue en Copa Internacional
  // Incluye: Libertadores, Sudamericana, Champions, Europa, Conference, AFC Champions League
  const intlMatch = history.find(m => {
    const lg = (m.league?.name || m._league || '').toLowerCase();
    const isIntl = lg.includes('libertadores') || lg.includes('sudamericana') ||
                   lg.includes('champions') || lg.includes('europa') ||
                   lg.includes('conference') ||
                   lg.includes('afc') || lg.includes('asian') || lg.includes('asia');
    if (!isIntl) return false;
    const matchDate = new Date(m.fixture?.date || m.date);
    const diffDays = (now - matchDate) / 86400000;
    return diffDays >= 0 && diffDays <= 4; // Jugó copa hace <=4 días
  });

  if (intlMatch) {
    const daysAgo = Math.round((now - new Date(intlMatch.fixture?.date || intlMatch.date)) / 86400000);
    return {
      penalty: daysAgo <= 2 ? 22 : 15, // Penalización máxima y severa por rotaciones/fatiga
      note: `⚠️ Resaca internacional (${daysAgo}d desde Copa)`
    };
  }
  return { penalty: 0, note: '' };
}

/**
 * AJUSTE ACL (Saudi Big 4): "Congestión de Copa Asiática"
 * Los 4 Grandes saudíes (Hilal, Nassr, Ahli, Ittihad) rotan plantilla
 * cuando tienen partidos de AFC Champions League Elite en ventanas de 7 días.
 * Si el historial muestra una copa asiática reciente (<=7 días), el equipo
 * no aliniará su once titular → los picks de Ganador/Hándicap no son fiables.
 *
 * @returns {{ isAtRisk: boolean, note: string }}
 */
const SAUDI_BIG4_NAMES = ['al-hilal', 'al hilal', 'al-nassr', 'al nassr', 'al-ahli', 'al ahli', 'al-ittihad', 'al ittihad'];

function checkACLCongestion(teamName, history) {
  const teamLow = (teamName || '').toLowerCase();
  const isBig4 = SAUDI_BIG4_NAMES.some(t => teamLow.includes(t));
  if (!isBig4) return { isAtRisk: false, note: '' };
  if (!history || history.length === 0) return { isAtRisk: false, note: '' };

  const now = new Date();
  const recentACL = history.find(m => {
    const lg = (m.league?.name || m._league || '').toLowerCase();
    const isACL = lg.includes('afc') || lg.includes('asian') || lg.includes('champions');
    if (!isACL) return false;
    const matchDate = new Date(m.fixture?.date || m.date);
    const diffDays = (now - matchDate) / 86400000;
    return diffDays >= 0 && diffDays <= 7; // Copa asiática en los últimos 7 días
  });

  if (recentACL) {
    const daysAgo = Math.round((now - new Date(recentACL.fixture?.date || recentACL.date)) / 86400000);
    return {
      isAtRisk: true,
      note: `⚠️ ACL Congestion: ${teamName} jugó copa asiática hace ${daysAgo}d. Rotación probable.`
    };
  }
  return { isAtRisk: false, note: '' };
}

/**
 * AJUSTE #2: Verificación de "Portería Perforada Reciente" para filtro Sniper.
 * Un equipo NO califica como Sniper Elite (favorito de casa) si ha
 * concedido goles en sus últimos 3 partidos de local.
 * Retorna true si la defensa local está en forma (apta para Sniper).
 */
function checkSniperCleanSheetGuard(homeFormAtHome, homeTeamId, homeHistory) {
  // Necesitamos al menos 3 partidos en casa recientes
  if (!homeFormAtHome || homeFormAtHome.total < 3) return true; // Sin datos = no bloqueamos
  if (!homeHistory || homeHistory.length === 0) return true;

  // Filtrar solo partidos de local (los últimos 3)
  const recentHome = homeHistory
    .filter(m => String(m.teams?.home?.id) === String(homeTeamId))
    .slice(0, 3);

  if (recentHome.length < 3) return true; // No hay suficientes datos locales

  // Si concedió goles en TODOS los últimos 3 de casa → defensa porosa → bloquear Sniper
  const allConceded = recentHome.every(m => (m.goals?.away ?? 0) > 0);
  return !allConceded; // true = defensa OK (Sniper habilitado), false = defensa porosa (bloqueado)
}

/**
 * Evalúa el riesgo de altitud con inteligencia peruana:
 * - 'high':   equipo costeño viaja a altura (penalización máxima)
 * - 'medium': equipo de jerarquía foráneo visita ciudad de altura
 * - null:     dos equipos de altura o partido sin riesgo
 */
function checkAltitudeRisk(teamName, city, homeTeamName = '') {
  if (!city) return null;
  const cityLow = city.toLowerCase();
  const teamLow = teamName.toLowerCase();
  const homeLow = homeTeamName.toLowerCase();

  const isAltitudeCity = ALTITUDE_CITIES.some(c => cityLow.includes(c));
  if (!isAltitudeCity) return null;

  // Si el local también es equipo de altura, no hay ventaja (se anulan)
  const isHomeHighland = PERU_HIGHLAND_TEAMS.some(t => homeLow.includes(t));
  if (isHomeHighland) return null;

  // Si el visitante es un equipo costero peruano → penalización alta
  const isAwayCoastal = PERU_COASTAL_TEAMS.some(t => teamLow.includes(t));
  if (isAwayCoastal) return 'high';

  // Si el visitante es un equipo de jerarquía foráneo → penalización media
  const isHierarchyTeam = HIERARCHY_TEAMS.some(t => teamLow.includes(t));
  if (isHierarchyTeam) return 'medium';

  return null;
}
export function generatePicks({
  homeStats, awayStats, h2hData, homeForm, awayForm,
  homeSplitStats, awaySplitStats,
  isLive, liveClock, liveHomeGoals, liveAwayGoals,
  marketInsight,          // Cuotas/predicción del PickCenter de ESPN
  homeCornersData, awayCornersData,
  homeShotsData, awayShotsData,
  homeFoulsData, awayFoulsData,
  homeCardsData, awayCardsData,
  homeSlots, awaySlots,
  homeFormAtHome, awayFormAway,
  poissonProbs,
  injuries = [],
  homeTeamName = '',
  awayTeamName = '',
  leagueName = '',
  homeRestDays = null,
  awayRestDays = null,
  homeHistory = [],
  awayHistory = [],
  city = '',
  marketOdds = null,
  matchStandings = null,
  advancedStats = null,
  refereeStats = null,
  rosters = null,
}) {
  const picks = [];

  const minMatches = 6;
  const homeTotal = homeForm.total || 0;
  const awayTotal = awayForm.total || 0;
  
  if (!isLive && (homeTotal < minMatches || awayTotal < minMatches)) {
    const minTeam = homeTotal < awayTotal ? `Local (${homeTotal} PJ)` : `Visitante (${awayTotal} PJ)`;
    return { 
      picks: [], 
      reason: `El equipo ${minTeam} registra muy pocos partidos en el año actual. No es recomendable apostar sin datos suficientes.`
    };
  }

  const isDerby = isDerbyMatch(homeTeamName, awayTeamName);
  const isCupMatch = /cup|copa|taça|pokal|coppa|friendl/i.test(leagueName);
  const isSudamericana = /sudamericana/i.test(leagueName);
  const isDefensiveLeague = /serie a|primeira liga|portugal|italia/i.test(leagueName);
  // ── Liga 1 Perú: Ajuste Especial ─────────────────────────────
  const isLiga1Peru = /liga 1|liga1|peru|perú/i.test(leagueName);

  // ── MLS (USA): Liga Cerrada sin Descensos ────────────────────
  const isMLS = /mls|major league soccer|usa\.1/i.test(leagueName);

  // ── LaLiga España: Módulo específico ─────────────────────────
  // LaLiga es la liga táctica europea por excelencia: baja anotación (~2.4 goles/p),
  // muchas tarjetas por VAR estricto y final de temporada muy cerrado por el descenso.
  const isLaLiga = /laliga|la liga|spain|españa|esp\.1|primera.*división/i.test(leagueName);
  // Equipos en zona de descenso real en LaLiga (últimas 3 posiciones de 20)
  // Se detecta dinámicamente via matchStandings; este flag se activa abajo.
  let laLigaRelegationZone = false;
  if (isLaLiga && matchStandings && matchStandings.total >= 18) {
    const tot = matchStandings.total;
    laLigaRelegationZone =
      matchStandings.homeRank >= tot - 2 || matchStandings.awayRank >= tot - 2;
  }
  // Equipos "grandes" de LaLiga que generan miedo en rivales pequeños
  const LALIGA_GIANTS = ['real madrid', 'barcelona', 'atlético madrid', 'atletico madrid', 'sevilla', 'real sociedad', 'villarreal', 'athletic'];
  const homeIsLaLigaGiant = isLaLiga && LALIGA_GIANTS.some(t => homeTeamName.toLowerCase().includes(t));
  const awayIsLaLigaGiant = isLaLiga && LALIGA_GIANTS.some(t => awayTeamName.toLowerCase().includes(t));

  // ── #0: Nuevos Factores de Prevención (Fatiga y Altitud) ──────────
  const homeFatigue = checkCalendarFatigue(homeHistory);
  const awayFatigue = checkCalendarFatigue(awayHistory);
  const altitudeRisk = checkAltitudeRisk(awayTeamName, city, homeTeamName);

  // AJUSTE #1: Resaca Internacional (copas continentales recientes)
  const homeHangover = checkInternationalHangover(homeTeamName, homeHistory);
  const awayHangover = checkInternationalHangover(awayTeamName, awayHistory);

  // AJUSTE ACL: Congestión de Copa Asiática (Saudi Big 4)
  const homeACL = checkACLCongestion(homeTeamName, homeHistory);
  const awayACL = checkACLCongestion(awayTeamName, awayHistory);
  // Si hay riesgo ACL, añadimos una penalización adicional sobre la resaca estándar
  const homeACLPenalty = homeACL.isAtRisk ? 18 : 0;
  const awayACLPenalty = awayACL.isAtRisk ? 18 : 0;

  let homeFatiguePenalty = homeFatigue ? 12 : 0;
  let awayFatiguePenalty = awayFatigue ? 12 : 0;

  // Sumar la penalización de resaca internacional (no acumula con la fatiga de calendario)
  // El ACL Penalty es adicional y se apila porque es un riesgo de rotación diferente a la fatiga pura.
  homeFatiguePenalty = Math.max(homeFatiguePenalty, homeHangover.penalty) + homeACLPenalty;
  awayFatiguePenalty = Math.max(awayFatiguePenalty, awayHangover.penalty) + awayACLPenalty;

  // AJUSTE #3: Suavizar penalización de altitud para Big 3 con alto control de posesión.
  // Si el visitante (Big 3) promedió >60% de posesión en sus últimos partidos,
  // se asume que pueden controlar el ritmo del juego a pesar de la altitud.
  const PERU_BIG3_NAMES = ['universitario', 'alianza lima', 'sporting cristal'];
  const isAwayBig3Visitor = PERU_BIG3_NAMES.some(t => awayTeamName.toLowerCase().includes(t));
  const awayAvgPossession = advancedStats?.away?.possession ?? null;
  let altitudeSofteningNote = '';
  let altitudeSoftening = 0;
  if (isLiga1Peru && isAwayBig3Visitor && altitudeRisk === 'high' && awayAvgPossession !== null && awayAvgPossession > 60) {
    altitudeSoftening = 8; // Suavizamos 8 puntos: de 28 → 20
    altitudeSofteningNote = `Posesión visitante alta (${awayAvgPossession}%) modera el impacto de la altura.`;
  }

  // Penalización por altitud escalonada según origen del visitante
  let altitudePenalty = altitudeRisk === 'high' ? (28 - altitudeSoftening) // Costeño en altura → penalización máxima (suavizada si alta posesión)
                      : altitudeRisk === 'medium' ? 18 // Jerarquía foránea en altura
                      : 0;

  const homeAvgGF = homeForm.total > 0 ? +(homeForm.goalsFor  / homeForm.total).toFixed(2) : 0;
  const homeAvgGA = homeForm.total > 0 ? +(homeForm.goalsAgainst / homeForm.total).toFixed(2) : 0;
  const awayAvgGF = awayForm.total > 0 ? +(awayForm.goalsFor  / awayForm.total).toFixed(2) : 0;
  const awayAvgGA = awayForm.total > 0 ? +(awayForm.goalsAgainst / awayForm.total).toFixed(2) : 0;

  // ── #1: Escala de confianza por tamaño de muestra ─────────────────
  // Con pocos partidos exigimos mayor umbral de probabilidad para reducir falsos positivos
  const minSample = Math.min(homeTotal, awayTotal);
  // Umbral dinámico: con 6 PJ exigimos 70%, con 12 PJ exigimos 62%
  // ── #1: Filtro de Selectividad "Sniper Mode" ─────────────────
  // Para alcanzar >80% de acierto, exigimos umbrales matemáticos mucho más altos.
  const dynamicMinProb = minSample >= 12 ? 75
    : minSample >= 10 ? 76
    : minSample >= 8  ? 78
    : minSample >= 6  ? 80
    : 80; // < 6 PJ nunca llega aquí (bloqueado arriba)

  // ── #2: Penalización por lesiones ──────────────────────────────
  // Contamos bajas por equipo. Cada baja resta pequeña parte de la proyección de goles
  const homeInjuries = injuries.filter(inj =>
    inj.team?.name && homeTeamName &&
    inj.team.name.toLowerCase().includes(homeTeamName.toLowerCase().split(' ')[0])
  ).length;
  const awayInjuries = injuries.filter(inj =>
    inj.team?.name && homeTeamName &&
    !inj.team.name.toLowerCase().includes(homeTeamName.toLowerCase().split(' ')[0])
  ).length;

  // Cada baja descuenta 0.08 goles esperados (cap en 0.4 = 5 bajas)
  const homeInjPenalty  = Math.min(homeInjuries * 0.08, 0.40);
  const awayInjPenalty  = Math.min(awayInjuries  * 0.08, 0.40);
  // Penaliza el score de forma en 3 puntos por cada baja (cap 12pts)
  const homeFormPenalty = Math.min(homeInjuries * 3, 12);
  const awayFormPenalty = Math.min(awayInjuries  * 3, 12);

  // ── #2b: Validación de Alineaciones (Roster Analysis) ──────────
  // Detecta si un jugador ofensivo clave está AUSENTE del XI titular.
  // Un "jugador clave" es el delantero o centrocampista con más goles en el roster.
  let homeLineupNote = '';
  let awayLineupNote = '';
  let homeRosterGoalsPenalty = 0;
  let awayRosterGoalsPenalty = 0;

  if (rosters && rosters.length === 2) {
    const analyzeRoster = (rosterEntry) => {
      const starters = (rosterEntry.roster || []).filter(p => p.starter);
      const bench    = (rosterEntry.roster || []).filter(p => !p.starter);
      
      // Extraemos los goles de cada jugador de campo (no porteros) del roster completo
      const getGoals = (p) => {
        const stat = (p.stats || []).find(s => s.name === 'totalGoals');
        return stat ? parseFloat(stat.value || 0) : 0;
      };
      const attackers = (rosterEntry.roster || []).filter(p => {
        const pos = p.position?.abbreviation?.toUpperCase();
        return pos === 'F' || pos === 'FW' || pos === 'MF' || pos === 'M';
      });

      if (!attackers.length) return null;

      // Buscamos al jugador con más goles
      const topScorer = attackers.reduce((best, p) => getGoals(p) > getGoals(best) ? p : best, attackers[0]);
      const topGoals  = getGoals(topScorer);
      if (topGoals < 2) return null; // No es un goleador diferencial si marcó menos de 2

      const name = topScorer.athlete?.displayName || 'Goleador clave';
      const isStarting = starters.some(p => p.athlete?.id === topScorer.athlete?.id);

      if (!isStarting) {
        return { name, goals: topGoals, note: `[📋 ALINEACIÓN] ${name} (${topGoals} goles) no figura en el XI titular.` };
      }
      return null;
    };

    // Identificamos qué roster es local y cuál es visitante
    const homeRosterEntry = rosters.find(r => r.homeAway === 'home') || rosters[0];
    const awayRosterEntry = rosters.find(r => r.homeAway === 'away') || rosters[1];

    const homeAbsent = analyzeRoster(homeRosterEntry);
    const awayAbsent = analyzeRoster(awayRosterEntry);

    if (homeAbsent) {
      homeRosterGoalsPenalty = 0.15; // Penalización de 0.15 λ al gol esperado
      homeLineupNote = homeAbsent.note;
    }
    if (awayAbsent) {
      awayRosterGoalsPenalty = 0.15;
      awayLineupNote = awayAbsent.note;
    }
  }

  // ── #3: Penalización por cansancio (días de descanso) ─────────────
  // < 3 días = alta fatiga, 3-4 días = leve, ≥5 días = descansado
  const calcRestPenalty = (days) => {
    if (days === null || days === undefined) return { goalsPenalty: 0, formPenalty: 0, label: '' };
    if (days <= 2)  return { goalsPenalty: 0.15, formPenalty: 8,  label: `⚠️ Cansancio crítico (${days}d)` };
    if (days <= 4)  return { goalsPenalty: 0.06, formPenalty: 3,  label: `⚠️ Poco descanso (${days}d)` };
    return { goalsPenalty: 0, formPenalty: 0, label: '' };
  };
  const homeRest = calcRestPenalty(homeRestDays);
  const awayRest = calcRestPenalty(awayRestDays);

  // ── #4: Ajuste por xG (Expected Goals) ─────────────────────────
  let xGBoostHome = 0, xGBoostAway = 0;
  if (advancedStats?.home?.xG) {
    // Si genera más xG que goles reales, recibe un ligero boost (crea peligro). Si no, penaliza levemente.
    xGBoostHome = (advancedStats.home.xG - homeAvgGF) * 0.25; 
  }
  if (advancedStats?.away?.xG) {
    xGBoostAway = (advancedStats.away.xG - awayAvgGF) * 0.25;
  }

  // ── #5: Factor Motivación — Sistema Jerárquico de Contexto ─────────────
  // JERARQUÍA (en orden de importancia):
  //   1. ¿El colero AÚN PELEA? (FightIndex: mide cuánto está luchando por sus puntos)
  //   2. ¿El grande tiene objetivos pendientes? (ObjectiveStatus: ¿de vacaciones o con hambre?)
  //   3. Promedio de goles (pesa poco al final de temporada — se aplica al final)

  let homeMotivPenalty = 0, awayMotivPenalty = 0;
  let homeMotivNote = '', awayMotivNote = '';
  let relaxationGoalsPenalty = 0;
  
  // ── Boosts Especiales de Supervivencia ─────────────────────────
  let survivalBoost1X = 0;
  let survivalBoostHomeWin = 0;
  let survivalBoostX2 = 0;
  let survivalBoostAwayWin = 0;

  // ── Helpers de posición ────────────────────────────────────────────────
  const calcFightIndex = (history, teamId) => {
    // Mide cuánto está "peleando" un colero en sus últimos 8 partidos.
    // Priorizamos NO PERDER (Empates y Victorias) como factor de lucha.
    if (!history || history.length === 0) return 0.5; // Sin datos = promedio
    const recent = history.slice(0, 8);
    let unbeaten = 0;
    let wins = 0;
    recent.forEach(m => {
      const isHome = String(m.teams?.home?.id) === String(teamId);
      const hw = m.teams?.home?.winner;
      const aw = m.teams?.away?.winner;
      const winner = hw ? 'home' : aw ? 'away' : 'draw';
      const result = isHome ? (winner === 'home' ? 'W' : winner === 'draw' ? 'D' : 'L')
                            : (winner === 'away' ? 'W' : winner === 'draw' ? 'D' : 'L');
      if (result === 'W' || result === 'D') unbeaten++;
      if (result === 'W') wins++;
    });
    // Índice basado 80% en no perder (resistencia) y 20% en ganar (golpe)
    const unbeatenRatio = unbeaten / recent.length;
    const winRatio = wins / recent.length;
    return Math.min(unbeatenRatio * 0.8 + winRatio * 0.2, 1);
  };

  // ── SISTEMA DE MOTIVACIÓN Y SUPERVIVENCIA (Global) ──
  // Personalizado para ligas con formato tradicional de Descenso y Copas Internacionales.
  const hasRelegationSystem = !leagueName.toLowerCase().includes('mls');
  if (hasRelegationSystem && matchStandings && matchStandings.total >= 10) {
    const tot = matchStandings.total;
    const hr = matchStandings.homeRank;
    const ar = matchStandings.awayRank;

    const isRelegation = (r) => r >= tot - 5;  // últimos 5 puestos (ej: 15 a 20)
    const isTop        = (r) => r <= 4;         // top 4 (Zona Champions en España)
    const isClinched   = (r) => r <= 1;         // campeón o matemáticamente inalcanzable
    const isMidTable   = (r) => r > 4 && r < tot - 5;

    // ── CRITERIO 1: FightIndex del colero ──────────────────────────────
    // Distingue entre "colero con mecha" vs "cadáver matemático"
    const homeFightIndex = isRelegation(hr)
      ? calcFightIndex(homeHistory, homeHistory?.[0]?.teams?.home?.id || homeHistory?.[0]?.teams?.away?.id)
      : 1.0; // Si no es colero, no aplica
    const awayFightIndex = isRelegation(ar)
      ? calcFightIndex(awayHistory, awayHistory?.[0]?.teams?.home?.id || awayHistory?.[0]?.teams?.away?.id)
      : 1.0;

    // ── CRITERIO 2: ObjectiveStatus del grande (¿vacaciones o hambre?) ─
    // Si el grande sigue peleando el título o la Champions, no se relaja.
    // Si ya cumplió o está en mitad de tabla sin motivación, se relaja.
    const awayObjective = isTop(ar) ? (isClinched(ar) ? 'vacation' : 'fighting') : 'neutral';
    const homeObjective = isTop(hr) ? (isClinched(hr) ? 'vacation' : 'fighting') : 'neutral';

    // ── LÓGICA PRINCIPAL: Colero local vs Grande visitante ─────────────
    if (isRelegation(hr) && (isTop(ar) || isMidTable(ar))) {

      // ── Si el grande no se juega nada (vacaciones) ──
      if (awayObjective === 'vacation' || isMidTable(ar)) {
        // Boost al colero local según qué tanto pelea (FightIndex)
        const fightBoost = Math.round(homeFightIndex * 25); // Max +25, min 0
        homeMotivPenalty = -fightBoost;

        if (homeFightIndex >= 0.6) {
          // Colero con mecha vs grande relajado → partido muy cerrado, pocos goles
          relaxationGoalsPenalty = awayObjective === 'vacation' ? 0.55 : 0.35;
          homeMotivNote = `🔥 Supervivencia (FightIdx: ${(homeFightIndex * 100).toFixed(0)}%) vs Grande Relajado → Partido Cerrado`;
          // ¡Masivo boost de supervivencia! (Max 50 puntos para contrarrestar el sesgo de Poisson)
          survivalBoost1X = Math.round(homeFightIndex * 50); // Sube hasta 50 puntos el 1X
          survivalBoostHomeWin = Math.round(homeFightIndex * 30);
        } else {
          // Colero rendido vs grande relajado → poca motivación de ambos lados, partido muerto
          relaxationGoalsPenalty = 0.25;
          homeMotivNote = `💀 Colero Rendido (FightIdx: ${(homeFightIndex * 100).toFixed(0)}%) — Sin tensión real`;
          survivalBoost1X = 10;
        }

        if (awayObjective === 'vacation') {
          awayMotivNote = '😴 Grande de vacaciones (objetivo cumplido)';
        } else if (isMidTable(ar)) {
          awayMotivNote = '🧘 Visitante cómodo en tabla (sin urgencia)';
        }
      } else if (awayObjective === 'fighting') {
        // Grande sigue peleando → no se relaja, partido normal con algo de tensión
        const fightBoost = Math.round(homeFightIndex * 12); // Boost reducido al colero
        homeMotivPenalty = -fightBoost;
        relaxationGoalsPenalty = 0; // No aplicamos penalización de goles: el grande va a atacar
        homeMotivNote = `⚔️ Supervivencia Local (FightIdx: ${(homeFightIndex * 100).toFixed(0)}%) vs Grande con Objetivos`;
        awayMotivNote = '🎯 Visitante motivado (pelea clasificación/título)';
        // Boost moderado porque el rival sí se juega la vida, pero el miedo al descenso da fuerzas extra
        survivalBoost1X = Math.round(homeFightIndex * 40);
        survivalBoostHomeWin = Math.round(homeFightIndex * 20);
      }
    }

    // ── LÓGICA INVERSA: Grande local vs Colero visitante ───────────────
    else if (isRelegation(ar) && (isTop(hr) || isMidTable(hr))) {
      if (homeObjective === 'vacation' || isMidTable(hr)) {
        const fightBoost = Math.round(awayFightIndex * 20); // Max +20 al visitante desesperado
        awayMotivPenalty = -fightBoost;
        relaxationGoalsPenalty = homeObjective === 'vacation' ? 0.40 : 0.25;

        if (awayFightIndex >= 0.6) {
          awayMotivNote = `🔥 Visitante se juega la vida (FightIdx: ${(awayFightIndex * 100).toFixed(0)}%) vs Local Relajado`;
          survivalBoostX2 = Math.round(awayFightIndex * 35); // Visitante desesperado
          survivalBoostAwayWin = Math.round(awayFightIndex * 18);
        } else {
          awayMotivNote = `💀 Visitante casi rendido (FightIdx: ${(awayFightIndex * 100).toFixed(0)}%)`;
          survivalBoostX2 = 8;
        }
        if (homeObjective === 'vacation') {
          homeMotivNote = '😴 Local de vacaciones (objetivo cumplido)';
        } else {
          homeMotivNote = '🧘 Local cómodo (sin presión real)';
        }
      } else if (homeObjective === 'fighting') {
        // Grande local sigue con hambre: partido normal, pocos beneficios al colero
        const fightBoost = Math.round(awayFightIndex * 8);
        awayMotivPenalty = -fightBoost;
        relaxationGoalsPenalty = 0;
        awayMotivNote = `⚔️ Visitante lucha (FightIdx: ${(awayFightIndex * 100).toFixed(0)}%) pero el local tiene objetivos`;
        survivalBoostX2 = Math.round(awayFightIndex * 30);
        survivalBoostAwayWin = Math.round(awayFightIndex * 15);
      }
    }

    // ── CASO GENÉRICO: Sin colero pero sí hay diferencia de urgencia ───
    else {
      const isClutch = (r) => r <= 4 || r >= tot - 3;
      const isChill  = (r) => r > 5 && r < tot - 4;
      if (isClutch(hr) && isChill(ar)) {
        homeMotivPenalty = -15;
        homeMotivNote = 'Urgencia máxima (pelea tabla)';
      } else if (isChill(hr) && isClutch(ar)) {
        awayMotivPenalty = -15;
        awayMotivNote = 'Urgencia máxima (pelea tabla)';
      }
    }
  }

  // Aplicamos todos los ajustes a los promedios de gol y scores de forma
  const adjHomeAvgGF = Math.max(homeAvgGF - homeInjPenalty - homeRest.goalsPenalty + xGBoostHome - homeRosterGoalsPenalty, 0.3);
  const adjAwayAvgGF = Math.max(awayAvgGF - awayInjPenalty  - awayRest.goalsPenalty + xGBoostAway - awayRosterGoalsPenalty, 0.3);
  const adjHomeAvgGA = homeAvgGA; // Las defensas no se ven tan afectadas
  const adjAwayAvgGA = awayAvgGA;

  const isSaudi = /saudi|arabia/i.test(leagueName);
  // LaLiga: media de goles más baja de las 5 grandes ligas (~2.4 goles/p = λ 1.18)
  // Esto evita que el modelo sobreestime goles en España.
  const leagueAvg = isSaudi ? 1.48 : isLaLiga ? 1.18 : 1.3;

  const lambdaHome = (adjHomeAvgGF * adjAwayAvgGA) / leagueAvg;
  const lambdaAway = (adjAwayAvgGF * adjHomeAvgGA) / leagueAvg;
  const projectedGoals = Math.max(+(lambdaHome + lambdaAway - relaxationGoalsPenalty).toFixed(2), 0.5);

  // ── #6: Elo Rating + Dixon-Coles (Nivel Institucional) ─────────────
  // Combina poder histórico (Elo) + forma actual (Dixon-Coles) para
  // generar probabilidades de nivel "Sharp Book" en paralelo.
  const eloCombined = calcCombinedProbs({
    homeTeamName,
    awayTeamName,
    homeAvgGF: adjHomeAvgGF,
    homeAvgGA: adjHomeAvgGA,
    awayAvgGF: adjAwayAvgGF,
    awayAvgGA: adjAwayAvgGA,
    homeHistory,
    awayHistory,
    isCupMatch,
    leagueName,
  });
  // Cada 50 pts de diferencia Elo = 1 punto de efectividad (cap ±10)
  const eloAdj = Math.min(Math.max(Math.round(eloCombined._elo.eloDiff / 50), -10), 10);
  const eloLabel = `Elo: ${eloCombined._elo.homeElo} vs ${eloCombined._elo.awayElo} (Δ${eloCombined._elo.eloDiff >= 0 ? '+' : ''}${eloCombined._elo.eloDiff})`;

  // ── #7: Expectativa Pitagórica ─────────────────────────────────
  // Detecta si un equipo está ganando por encima o por debajo de su capacidad
  // real (medida por goles a favor/en contra). La regresión a la media es inevitable.
  const homeTeamId = homeHistory?.[0]?.teams?.home?.id || homeHistory?.[0]?.teams?.away?.id || null;
  const awayTeamId = awayHistory?.[0]?.teams?.home?.id || awayHistory?.[0]?.teams?.away?.id || null;
  const homePythag = calcPythagoreanExpectation(homeHistory, homeTeamId);
  const awayPythag = calcPythagoreanExpectation(awayHistory, awayTeamId);

  // ── #8: Índice de Volatilidad (Glicko-2 simplificado) ──────────
  // Mide la incertidumbre del Elo según inactividad y zigzag de resultados.
  // Alta volatilidad → picks más conservadores (penalización de confianza).
  const homeVolatility = calcVolatilityIndex(homeHistory, homeTeamId);
  const awayVolatility  = calcVolatilityIndex(awayHistory, awayTeamId);

  // Notas de contexto que se inyectarán en los argumentos de los picks
  const homeContextNote = [
    homeInjuries > 0 ? `${homeInjuries} baja(s)` : '',
    homeRest.label,
    homeHangover.note,
    advancedStats?.home?.xG ? `xG: ${advancedStats.home.xG}` : '',
    homeMotivNote,
  ].filter(Boolean).join(', ');
  const awayContextNote = [
    awayInjuries > 0 ? `${awayInjuries} baja(s)` : '',
    awayRest.label,
    awayHangover.note,
    advancedStats?.away?.xG ? `xG: ${advancedStats.away.xG}` : '',
    awayMotivNote,
    altitudeSofteningNote,
  ].filter(Boolean).join(', ');

  const isHomeFortress = homeFormAtHome?.total >= 4 && homeFormAtHome?.losses === 0;
  
  const homeScoreAdv = homeForm.score - awayForm.score;
  
  // ── Liga 1 Perú: Excepciones y Jerarquía ─────────────────────
  let liga1HomeBonus = isLiga1Peru ? 18 : 0;
  
  // Excepción Alianza Atlético (Sullana): Cuando juegan contra U o Alianza Lima, 
  // la federación los hace jugar en Trujillo (terreno neutral/sin ventaja térmica).
  const isSullanaHome = homeTeamName.toLowerCase().includes('alianza atletico') || homeTeamName.toLowerCase().includes('alianza atlético');
  const isAwayUorAlianza = awayTeamName.toLowerCase().includes('universitario') || awayTeamName.toLowerCase().includes('alianza lima');
  if (isLiga1Peru && isSullanaHome && isAwayUorAlianza) {
    liga1HomeBonus = 0; // Pierden el bonus de localía brutal de Sullana
  }

  // Factor "Césped Sintético" en Liga 1 Perú
  const isSyntheticHome = ['unión comercio', 'union comercio', 'chankas', 'los chankas'].some(t => homeTeamName.toLowerCase().includes(t));
  let syntheticPenalty = 0;
  if (isLiga1Peru && isSyntheticHome) {
    const isSyntheticAway = ['unión comercio', 'union comercio', 'chankas', 'los chankas'].some(t => awayTeamName.toLowerCase().includes(t));
    if (!isSyntheticAway) syntheticPenalty = 8;
  }

  // "Survival Boost" (Efecto Descenso) ahora es global, omitimos el específico de Liga 1.
  
  // Usa forma en casa del local con penalizaciones de lesión, cansancio y motivación aplicadas. Bonifica si es fortaleza.
  // Incluye ajuste pitagórico y penalización de volatilidad (Fase 1 de mejoras institucionales).
  let homeEffectiveScore = Math.max(
    (homeFormAtHome?.total >= 3 ? homeFormAtHome.score : homeForm.score)
    - homeFormPenalty - homeRest.formPenalty - homeMotivPenalty - homeFatiguePenalty
    + (isHomeFortress && liga1HomeBonus > 0 ? 15 : 0) + liga1HomeBonus + eloAdj
    + homePythag.adjustment        // Pitagórico: penaliza si gana con suerte, boost si infravalorado
    - homeVolatility.trustPenalty, // Volatilidad: reduce confianza si está inactivo o zigzagueando
    0
  );
  let awayEffectiveScore = Math.max(
    (awayFormAway?.total >= 3 ? awayFormAway.score : awayForm.score)
    - awayFormPenalty - awayRest.formPenalty - awayMotivPenalty - awayFatiguePenalty
    - altitudePenalty - syntheticPenalty - eloAdj
    + awayPythag.adjustment        // Pitagórico: mismo ajuste para el visitante
    - awayVolatility.trustPenalty, // Volatilidad: penaliza al visitante inestable
    0
  );

  // Jerarquía Global (Big Teams): Protegemos a los equipos grandes
  // para que el algoritmo nunca los trate como equipos débiles, asegurando un piso de rendimiento.
  const isHomeHierarchy = HIERARCHY_TEAMS.some(t => homeTeamName.toLowerCase().includes(t)) || 
                          (isLiga1Peru && ['universitario', 'alianza lima', 'sporting cristal'].some(t => homeTeamName.toLowerCase().includes(t)));
  const isAwayHierarchy = HIERARCHY_TEAMS.some(t => awayTeamName.toLowerCase().includes(t)) || 
                          (isLiga1Peru && ['universitario', 'alianza lima', 'sporting cristal'].some(t => awayTeamName.toLowerCase().includes(t)));

  // AJUSTE #2: Sniper Clean Sheet Guard
  // El piso de jerarquía local se eleva a 65, PERO si la defensa está porosa 
  // (concedió en sus últimos 3 de casa), NO aplicamos el piso de Sniper (sí el piso básico de 58).
  const homeId = homeHistory?.[0]?.teams?.home?.id || homeHistory?.[0]?.teams?.away?.id || null;
  const sniperGuardOk = checkSniperCleanSheetGuard(homeFormAtHome, homeId, homeHistory);

  if (isHomeHierarchy) {
    if (sniperGuardOk) {
      homeEffectiveScore = Math.max(homeEffectiveScore, 65); // Piso de jerarquía pleno en casa
    } else {
      homeEffectiveScore = Math.max(homeEffectiveScore, 58); // Piso reducido: defensa porosa detectada
    }
  }
  if (isAwayHierarchy && altitudeRisk !== 'high') {
    awayEffectiveScore = Math.max(awayEffectiveScore, 60); // Piso de jerarquía de visita (si no hay altura extrema)
  }

  // Penalización Sudamericana: Visitantes sufren más en este torneo (15% extra skeptiscim)
  if (isSudamericana) {
    awayEffectiveScore *= 0.85;
  }

  // Penalización Anti-Copas: Si es partido de copa, la estadística del favorito no es confiable por rotaciones
  if (isCupMatch) {
    if (homeEffectiveScore > awayEffectiveScore) homeEffectiveScore -= 25;
    else if (awayEffectiveScore > homeEffectiveScore) awayEffectiveScore -= 25;
  }

  // Ahora el H2H pesa mucho menos (10%) para priorizar la forma de la temporada actual
  const h2hWeight  = h2hData ? 0.10 : 0;
  const teamWeight = h2hData ? 0.45 : 0.5;

  // ── Traductor a Lenguaje Coloquial Peruano (Modo Chalaca) ───────
  const translateToPeruvian = (text) => {
    if (!text) return text;
    let p = text;
    
    // Términos técnicos → Coloquiales
    p = p.replace(/Poisson indica/gi, "La calculadora me dice que");
    p = p.replace(/superior en forma efectiva/gi, "viene más embalado");
    p = p.replace(/claramente superior/gi, "está en su salsa");
    p = p.replace(/inferior/gi, "viene medio golpeado");
    p = p.replace(/Protección ante el empate/gi, "por si las moscas, nos cubrimos con el empate");
    p = p.replace(/Probabilidad/gi, "Chance");
    p = p.replace(/proyecta/gi, "pinta para");
    p = p.replace(/histórico/gi, "de toda la vida");
    p = p.replace(/ventaja/gi, "está un paso adelante");
    p = p.replace(/Value Bet/gi, "¡Fierrazo con cuota de regalo!");
    p = p.replace(/el mercado paga/gi, "la casa de apuestas se ha palteado y paga");
    p = p.replace(/nosotros proyectamos/gi, "nosotros le tenemos más fe y vemos un");
    p = p.replace(/Zona Descenso/gi, "Están con el agua al cuello");
    p = p.replace(/máxima tensión táctica/gi, "se juegan el pellejo");
    p = p.replace(/baja anotación/gi, "partido bien tacaño con los goles");
    p = p.replace(/Dixon-Coles confirma/gi, "las matemáticas me dan la razón");
    p = p.replace(/Doble confirmación/gi, "está recontra asegurado");
    p = p.replace(/Potencial ofensivo/gi, "están con la mecha prendida");
    p = p.replace(/defensa sólida/gi, "están bien parados atrás");
    p = p.replace(/se juegan mucho/gi, "están que queman");
    p = p.replace(/Cuota de valor/gi, "Está para aprovecharla");
    p = p.replace(/remontada/gi, "volteada");
    p = p.replace(/apostar/gi, "meterle unas fichas");
    p = p.replace(/está de relajo/gi, "está en modo vacaciones");
    p = p.replace(/ya son campeones/gi, "ya campeonaron, juegan por cumplir");
    p = p.replace(/Urgencia máxima/gi, "Están desesperados por los puntos");

    // Muletillas peruanas al inicio o final (probabilístico para variedad)
    const filler = ["Sobrino, ", "Habla, ", "Mira, ", "Te canto la fija: ", "Ojo ahí, ", "Atento, "];
    const ender = [". ¡Aprovecha!", ". Está cantado.", ". ¡No seas sano!", ". Es un fierrazo.", ". ¡Gente, ahí está el billete!", ". Vamos con todo."];
    
    if (!p.includes("Sobrino") && Math.random() > 0.4) {
      p = filler[Math.floor(Math.random() * filler.length)] + p;
    }
    if (Math.random() > 0.4) {
      p = p + ender[Math.floor(Math.random() * ender.length)];
    }

    return p;
  };

  // ── Constructor de Argumento Narrativo en Lenguaje Sencillo ─────
  // Genera una explicación de 1-2 líneas en español coloquial peruano
  // basada en el contexto real del partido (motivación, jerarquía, forma).
  const buildNarrativeArgument = (market, selection) => {
    const home = homeTeamName;
    const away = awayTeamName;
    const homeStar  = isHomeHierarchy;
    const awayStar  = isAwayHierarchy;
    const homeUrgent = homeMotivNote.toLowerCase().includes('urgencia') || homeContextNote.toLowerCase().includes('urgencia');
    const awayUrgent = awayMotivNote.toLowerCase().includes('urgencia') || awayContextNote.toLowerCase().includes('urgencia');
    const homeStrong  = homeEffectiveScore >= 65;
    const awayStrong  = awayEffectiveScore >= 65;
    const homeTired   = homeRest.label.includes('Cansancio') || homeRest.label.includes('Poco');
    const awayTired   = awayRest.label.includes('Cansancio') || awayRest.label.includes('Poco');
    const homeInjured = homeInjuries > 0;
    const awayInjured = awayInjuries > 0;
    const bigGoals    = projectedGoals >= 2.8;
    const lowGoals    = projectedGoals <= 2.0;
    const isChampion  = awayContextNote.toLowerCase().includes('campe') || homeContextNote.toLowerCase().includes('campe');
    const relegZone   = laLigaRelegationZone ||
                        homeContextNote.toLowerCase().includes('descenso') ||
                        awayContextNote.toLowerCase().includes('descenso') ||
                        homeUrgent || awayUrgent;

    // Piezas de contexto reutilizables
    const urgencyLine = homeUrgent
      ? `${home} se juega el pellejo en esta cancha — necesita los puntos sí o sí.`
      : awayUrgent
        ? `${away} llega con el agua al cuello y va a salir a buscar el resultado a como dé lugar.`
        : '';
    const hierarchyLine = (homeStar && !awayStrong)
      ? `${home} es un equipo grande; aunque el rival lo intente, la jerarquía suele pesar.`
      : (awayStar && !homeStrong)
        ? `${away} viene con más calidad encima y eso se nota cuando el partido se complica.`
        : '';
    const fatigueLine = homeTired
      ? `${home} viene con las piernas pesadas, jugó hace muy poco.`
      : awayTired
        ? `${away} llega cansado — jugó hace poquísimos días y eso se siente en el segundo tiempo.`
        : '';
    const injuryLine = homeInjured
      ? `${home} tiene bajas importantes en su alineación.`
      : awayInjured
        ? `${away} no viene completo; le faltan jugadores clave.`
        : '';
    const relaxLine = isChampion
      ? `Un equipo ya campeonó y hoy sale a cumplir — sin esa hambre que te da jugarte algo importante.`
      : '';

    // ── Narrativas por mercado ──────────────────────────────────────
    const sel = (selection || '').toLowerCase();
    const goalsNote = bigGoals
      ? `El modelo proyecta unos ${projectedGoals} goles en total, lo cual es bastante.`
      : lowGoals
        ? `El modelo solo espera ${projectedGoals} goles en total, así que el partido pinta cerrado.`
        : `El modelo proyecta alrededor de ${projectedGoals} goles en total.`;

    // Doble Oportunidad X2
    if (market === 'Doble Oportunidad' && sel.includes('x2')) {
      if (relaxLine && urgencyLine) {
        return `${relaxLine} ${urgencyLine} En ese escenario, el visitante puede salir a especular y el empate se convierte en un resultado muy probable. La apuesta X2 te cubre tanto si el visitante gana como si empatan, dándote dos oportunidades de cobrar en lugar de una sola.`;
      }
      if (awayStar) {
        return `${hierarchyLine} Aunque ${home} empuje de local, el visitante tiene el nivel suficiente para al menos no perder. ${fatigueLine || ''} Con esta apuesta ganas si el partido termina en empate o con victoria del visitante — no necesitas que gane con autoridad, basta con que no pierda.`.trim();
      }
      return `El visitante llega en un buen momento y fuera de casa también sabe rendir. Un empate siempre es posible en este tipo de partidos y esta apuesta te protege de eso. ${goalsNote} Con el X2 tienes dos de los tres resultados posibles a tu favor.`;
    }

    // Doble Oportunidad 1X
    if (market === 'Doble Oportunidad' && sel.includes('1x')) {
      if (homeUrgent) {
        return `${home} necesita los puntos con urgencia y eso se nota en cómo un equipo sale al campo — con más intensidad, más presión y más ganas de no ceder. Cuando un equipo pelea por la tabla de local, raramente pierde. La apuesta 1X te cubre tanto si gana como si empatan, así que si el partido se tranca y no hay ganador claro, igual cobras.`;
      }
      if (homeStar) {
        return `${hierarchyLine} De local y con su gente en las tribunas, ${home} tiene un piso de rendimiento muy alto — es muy difícil que salga de su cancha sin nada. ${fatigueLine || ''} La 1X te da dos resultados a tu favor: si gana cobras, si empata también. Solo pierdes si el visitante da el golpe de gracia.`.trim();
      }
      return `${home} está bien en casa esta temporada y el partido pinta trabado. La 1X es la apuesta más inteligente cuando no estás seguro del resultado exacto pero sí confías en que el local no debería perder. ${goalsNote} Si el partido se pone difícil, el empate es siempre el "salvavidas" del local.`;
    }

    // Más de 1.5 goles
    if (market === 'Total de Goles' && sel.includes('1.5') && sel.includes('más')) {
      if (bigGoals) {
        return `Ambos equipos vienen anotando con regularidad y los números lo respaldan. ${goalsNote} Para que pierdas esta apuesta, el partido tendría que terminar 1-0 o 0-0 — y eso es bastante raro dado cómo viene el marcador promedio de los dos. Es una de las apuestas más "seguras" del mercado cuando ambos tienen ritmo goleador.`;
      }
      if (urgencyLine) {
        return `${urgencyLine} Cuando un equipo necesita los tres puntos, el partido se abre porque no puede jugar especulando. Eso suele generar más llegadas y más goles. ${goalsNote} Aunque solo necesitas 2 goles para ganar esta apuesta, lo más probable es que el partido tenga bastante más movimiento que eso.`;
      }
      return `Los dos equipos anotan con regularidad esta temporada. ${goalsNote} Que el partido termine 0-0 o 1-0 sería una rareza — los números nos dicen que casi siempre hay al menos dos goles cuando estos equipos juegan. Es la apuesta de menor riesgo dentro del mercado de goles.`;
    }

    // Más de 2.5 goles
    if (market === 'Total de Goles' && sel.includes('2.5') && sel.includes('más')) {
      if (bigGoals && !relaxLine) {
        return `Los dos equipos atacan bien y ninguno defiende de manera sólida. ${goalsNote} Que el partido tenga 3 o más goles es el escenario más esperado — no sería ninguna sorpresa. ${urgencyLine || ''} Esta es una apuesta que el modelo recomienda cuando la proyección de goles supera claramente el umbral de 2.5.`.trim();
      }
      if (relaxLine) {
        return `${relaxLine} Sin embargo, el otro equipo sí tiene motivos para atacar y va a salir a buscar el resultado. Eso abre espacios y los goles suelen aparecer cuando uno empuja y el otro especula. ${goalsNote} Con 3 goles o más, esta apuesta cierra.`;
      }
      return `El partido pinta para ir de ida y vuelta. ${goalsNote} Con los promedios de gol de ambos, 3 tantos o más es el resultado más natural. Esta apuesta tiene sentido cuando los dos equipos llegan con buen ritmo ofensivo y sin necesidad de cerrarse atrás.`;
    }

    // Menos de 2.5 goles
    if (market === 'Total de Goles' && sel.includes('2.5') && sel.includes('menos')) {
      if (relegZone) {
        return `Cuando uno o los dos equipos están peleando el descenso, el partido cambia completamente de carácter. Se juegan demasiado como para arriesgarse — se cierran atrás, cuidan el resultado y atacan solo con garantías. ${goalsNote} En ese tipo de partidos los goles escasean y el Under 2.5 tiene mucho valor.`;
      }
      if (lowGoals) {
        return `Ninguno de los dos anota mucho esta temporada — son equipos que cuidan más el arco que el ataque. ${goalsNote} Un partido trabado y cerrado es lo más probable acá. La apuesta Under 2.5 gana si el partido termina 0-0, 1-0, 0-1, 1-1 o 2-0/0-2.`;
      }
      return `Los dos equipos llegan con la cabeza más en el resultado que en hacer un espectáculo. ${goalsNote} Se esperan pocas llegadas claras y el partido tiene pinta de definirse con poco margen. Under 2.5 es una apuesta táctica para partidos donde ninguno se suele ir al ataque sin control.`;
    }

    // Más de 3.5 goles
    if (market === 'Total de Goles' && sel.includes('3.5')) {
      return `El partido pinta para una fiesta de goles. ${goalsNote} ${urgencyLine || ''} Ambos equipos atacan con ritmo y las defensas de los dos dejan espacios. Con 4 goles o más, esta apuesta cierra — y según los números no es una locura pedirlo. Es el mercado ideal cuando el modelo proyecta un partido muy abierto.`.trim();
    }

    // Victoria Local
    if (market === 'Ganador del Partido' && sel.includes('local')) {
      const ctx = [urgencyLine, hierarchyLine, fatigueLine ? `Por si fuera poco, ${fatigueLine.toLowerCase()}` : '', injuryLine ? `Además, ${injuryLine.toLowerCase()}` : ''].filter(Boolean);
      if (ctx.length > 0) {
        return `${ctx.join(' ')} ${goalsNote} Todos estos factores juntos apuntan a ${home} como el favorito claro del partido hoy.`;
      }
      return `${home} está en un gran momento y de local se le ve sólido. ${goalsNote} Sus números en casa esta temporada respaldan que hoy puede ganar — tiene la forma, el apoyo del público y el terreno conocido a su favor.`;
    }

    // Victoria Visitante
    if (market === 'Ganador del Partido' && sel.includes('visitante')) {
      const ctx = [urgencyLine || hierarchyLine, fatigueLine ? `Para colmo, ${fatigueLine.toLowerCase()}` : '', injuryLine ? `Y ${injuryLine.toLowerCase()}` : ''].filter(Boolean);
      if (ctx.length > 0) {
        return `${ctx.join(' ')} ${goalsNote} Con todo eso, ${away} llega como favorito y tiene los argumentos para llevarse los tres puntos de aquí.`;
      }
      return `${away} viene en racha y de visita también sabe rendir. ${goalsNote} El local no está en su mejor momento como para plantarle cara — los números del visitante fuera de casa esta temporada son muy buenos.`;
    }

    // Empate
    if (market === 'Ganador del Partido' && sel.includes('empate')) {
      if (relaxLine) {
        return `${relaxLine} En ese contexto, el empate no le viene mal a ninguno — uno porque no se la juega y el otro porque puede conformarse con el punto. ${goalsNote} Las matemáticas lo ven como el resultado más "neutral" del partido y la historia entre estos dos equipos también lo respalda.`;
      }
      return `Los dos equipos están bastante parejos en nivel esta temporada. Ninguno domina claramente al otro y el partido podría ir para cualquier lado. ${goalsNote} El empate es el resultado que aparece más frecuente en este tipo de enfrentamientos equilibrados — y el modelo lo recoge como una opción real.`;
    }

    // Ambos Marcan
    if (market === 'Ambos Marcan') {
      if (homeInjured || awayInjured) {
        return `${injuryLine} A pesar de eso, ambos equipos tienen jugadores que llegan al arco con regularidad y la costumbre de marcar en sus partidos. ${goalsNote} Esta apuesta no pide que haya muchos goles — solo que los dos equipos anoten al menos uno cada uno, y eso es algo que suele pasar con estos rivales.`;
      }
      return `Los dos equipos anotan seguido — tanto el local como el visitante tienen jugadores que generan peligro y terminan dentro del marcador. ${goalsNote} No se trata solo de que haya goles en el partido, sino de que los dos equipos aparezcan en el tablero. Según sus promedios, eso es lo más habitual.`;
    }

    // Handicap Asiático (Negativo: -0.5)
    if (market === 'Handicap Asiático') {
      // ── Handicap Positivo (+1.5 / +2.0): Protección al underdog ──
      if (sel.includes('+')) {
        const line = sel.includes('+2') ? '+2.0' : '+1.5';
        const protTeam = sel.toLowerCase().includes('visitante') ? away : home;
        const favTeam  = sel.toLowerCase().includes('visitante') ? home : away;
        if (line === '+2.0') {
          return `${protTeam} llega como el equipo más débil según las cuotas, pero no es un equipo que se deje golear fácilmente. Con el hándicap ${line}, solo pierdes la apuesta si ${favTeam} gana por 3 o más goles — algo poco frecuente. Si ${favTeam} gana por exactamente 2, te devuelven el dinero. Y si gana por 1, empatan o ${protTeam} gana, cobras. ${goalsNote} Es la forma más inteligente de respaldar al underdog sin arriesgar demasiado.`;
        }
        return `Con el hándicap ${line} le das una ventaja virtual de 1.5 goles a ${protTeam}. Eso significa que solo pierdes si ${favTeam} gana por 2 o más goles. Un resultado ajustado como 1-0 o 2-1 ya te da ganador. ${goalsNote} Es una apuesta defensiva que aprovecha la solidez del rival menos favorito.`;
      }
      // ── Handicap Negativo (-0.5): Favorito claro ──
      if (homeStar && sel.includes('local')) {
        return `${home} tiene demasiada jerarquía para conformarse con un empate acá. El handicap asiático -0.5 es más inteligente que apostar a la victoria directa: te da exactamente la misma lógica pero con una cuota más atractiva. ${goalsNote} Si ${home} gana, tú cobras — y según el análisis, ganar es lo que el modelo espera.`;
      }
      if (awayStar && sel.includes('visitante')) {
        return `${away} viene a buscar los tres puntos, no a especular con un empate. El handicap -0.5 del visitante te da la mejor cuota disponible para ese pronóstico. ${goalsNote} Si el visitante se lleva el partido — que es lo que el modelo anticipa — con el handicap cobras mejor que con el resultado directo.`;
      }
      return `Un equipo domina claramente en este análisis. El handicap asiático te permite apostar a esa superioridad con una cuota más jugosa que el 1X2 tradicional. ${goalsNote} Si el favorito gana como se espera, con el handicap siempre cobras mejor.`;
    }

    // Combo BTTS + Over
    if (market === 'Combo') {
      return `El partido tiene todos los ingredientes para un poco de todo: ataque de los dos lados, goles cruzados y bastante movimiento en el marcador. ${goalsNote} Es la apuesta "combinada" más completa: necesitas que ambos anoten y que en total haya 3 o más goles. Cuando el modelo proyecta un partido abierto, este combo tiene mucho sentido.`;
    }

    // Resultado en Vivo
    if (market === 'Resultado en Vivo') {
      const liveCtx = sel.includes('1x')
        ? `El equipo local tiene el carácter y la presión del marcador para reaccionar — es difícil que se quede con nada jugando de local.`
        : `El equipo que va perdiendo aún tiene tiempo y las condiciones del partido indican que puede reaccionar.`;
      return `Según cómo está el partido en este momento, las condiciones favorecen claramente este resultado. ${liveCtx} El motor ajusta las probabilidades minuto a minuto y en este instante ve una oportunidad real. No dejes pasar la cuota — en vivo cambia rápido.`;
    }

    // Goles en Vivo
    if (market === 'Goles en Vivo') {
      return `El partido ya entró en goles y quedan minutos con los dos equipos buscando el resultado. Cuando hay goles en la primera parte, las probabilidades de que vengan más en la segunda son altas — los equipos se abren y dejan espacios. El modelo calcula que todavía hay margen real para que caiga otro tanto. Entra mientras la cuota todavía es buena.`;
    }

    // Estrategia en Vivo
    if (market === 'Estrategia en Vivo') {
      return `Esta no es para entrarla ahorita — es una estrategia para tenerla lista y activarla si el partido llega a esa situación. Cuando se da ese escenario, la cuota sube mucho y ahí es donde está el valor real. El motor la detecta como una oportunidad potencial de alta recompensa. Monitorea el partido y entra en el momento exacto.`;
    }

    // Genérico
    return `El análisis de forma, jerarquía y contexto de ambos equipos apunta a este resultado como el más probable hoy. ${goalsNote} El motor lo identifica como una oportunidad clara después de cruzar los datos de los últimos partidos de los dos equipos.`;
  };



  // Helper to add a pick with calculated fair odds o cuotas reales de ESPN
  const addPick = (pick) => {
    // Aplicar traducción coloquial peruana al argumento técnico
    pick.argument = translateToPeruvian(pick.argument);
    // Añadir sustento narrativo en lenguaje sencillo
    pick.narrative = buildNarrativeArgument(pick.market, pick.selection);
    
    // 1. Calcular cuota teórica base (y aplicar pisos realistas si ESPN falla)
    let theoreticalOdds = null;
    if (pick.probability) {
      let fairOdds = 100 / pick.probability;
      theoreticalOdds = +(fairOdds * 0.95).toFixed(2);
      
      // Aplicar pisos de mercado realista si no tenemos cuota de ESPN
      if (pick.selection === 'Más de 1.5 goles' && theoreticalOdds < 1.20) theoreticalOdds = 1.22;
      if (pick.selection === 'Más de 2.5 goles' && theoreticalOdds < 1.50) theoreticalOdds = 1.55;
      if (pick.selection === 'Menos de 2.5 goles' && theoreticalOdds < 1.40) theoreticalOdds = 1.45;
      if (pick.selection === 'Menos de 3.5 goles' && theoreticalOdds < 1.15) theoreticalOdds = 1.18;
      if (pick.selection.includes('empata o gana') && theoreticalOdds < 1.15) theoreticalOdds = 1.18; // Doble Op
      if (pick.market === 'Ganador del Partido' && theoreticalOdds < 1.30) theoreticalOdds = 1.35;
      
      if (theoreticalOdds < 1.05) theoreticalOdds = 1.05;
    }
    
    let finalOdds = theoreticalOdds;
    let isValueBet = false;
    let realMOdds = null;

    // 2. Si hay cuotas reales de ESPN, intentar reemplazar o derivar
    if (marketOdds && pick.probability) {
      // Evitar que cuotas pre-partido sobrescriban mercados en vivo
      const isPreMatchMarket = ['Total de Goles', 'Ganador del Partido', 'Handicap Asiático', 'Doble Oportunidad'].includes(pick.market);
      
      if (isPreMatchMarket) {
        let mOdds = null;
      
      // Mercados Directos
      if (pick.selection === 'Victoria Local' || pick.selection === 'Local -0.5 (Gana sin empate)') mOdds = marketOdds.home;
      if (pick.selection === 'Victoria Visitante' || pick.selection === 'Visitante -0.5 (Gana sin empate)') mOdds = marketOdds.away;
      if (pick.selection === 'Empate') mOdds = marketOdds.draw;
      
      // Goles (Directos)
      if (marketOdds.overUnder === 2.5) {
        if (pick.selection === 'Más de 2.5 goles') mOdds = marketOdds.overOdds;
        if (pick.selection === 'Menos de 2.5 goles') mOdds = marketOdds.underOdds;
        
        // Goles (Derivados)
        if (pick.selection === 'Más de 1.5 goles' && marketOdds.overOdds) {
           // Aproximación estándar de O1.5 basado en O2.5
           // Usualmente si O2.5 es 2.05, O1.5 es 1.35
           mOdds = 1 + ((marketOdds.overOdds - 1) * 0.35);
           if (mOdds < 1.1) mOdds = 1.15;
        }
        if (pick.selection === 'Más de 3.5 goles' && marketOdds.overOdds) {
           mOdds = 1 + ((marketOdds.overOdds - 1) * 2.8);
        }
      }

      // Doble Oportunidad (Derivada)
      // Cuota 1X = (Local * Empate) / (Local + Empate)
      if (pick.selection === 'Local o Empate (1X)' && marketOdds.home && marketOdds.draw) {
        mOdds = (marketOdds.home * marketOdds.draw) / (marketOdds.home + marketOdds.draw);
      }
      if (pick.selection === 'Visitante o Empate (X2)' && marketOdds.away && marketOdds.draw) {
        mOdds = (marketOdds.away * marketOdds.draw) / (marketOdds.away + marketOdds.draw);
      }

      // Handicap Asiático Positivo (Derivada del spread de ESPN)
      // ESPN provee spread -1.5 del favorito. El +1.5 del underdog es el inverso.
      // Para +2.0 aplicamos un factor de ajuste conservador.
      if (pick.selection.includes('+1.5') && marketOdds.spreadOddsAway) {
        mOdds = marketOdds.spreadOddsAway; // Cuota directa del +1.5 de ESPN
      }
      if (pick.selection.includes('+2.0') && marketOdds.spreadOddsAway) {
        // +2.0 es una línea más segura que +1.5, así que la cuota es menor
        mOdds = 1 + ((marketOdds.spreadOddsAway - 1) * 0.65);
        if (mOdds < 1.20) mOdds = 1.25;
      }

      if (mOdds && mOdds > 1.01) {
        realMOdds = mOdds;
        finalOdds = mOdds;
        
        const impliedProb = 100 / mOdds;
        // Detección de Value Bet: Si nuestra probabilidad es mucho mayor que la que asume la casa de apuestas
        if (pick.probability >= impliedProb + 5) {
           isValueBet = true;
           pick.tier = '💎';
           pick.argument = `¡VALUE BET! El mercado paga ${mOdds.toFixed(2)} (implica ${Math.round(impliedProb)}%). Nosotros proyectamos ${pick.probability}%. ` + pick.argument;
        }
      }
    }
    }

    if (!pick.odds) {
      pick.odds = finalOdds ? finalOdds.toFixed(2) : '1.80+';
    }

    // ── Fase 2: Criterio de Kelly (Gestión de Banca) ─────────────
    // Kelly Fraccional (1/4) para reducir volatilidad en apuestas deportivas.
    if (finalOdds && finalOdds > 1.0 && pick.probability) {
      const p = pick.probability / 100;
      const o = finalOdds;
      const fullKelly = (p * o - 1) / (o - 1);
      
      if (fullKelly > 0) {
        // Cuarto de Kelly (max 5% del bankroll para evitar la ruina)
        const quarterKelly = Math.min(fullKelly * 0.25, 0.05); 
        pick.suggestedStake = +(quarterKelly * 100).toFixed(1); // En porcentaje (ej. 2.5)
      } else {
        pick.suggestedStake = 0; // Valor Esperado (EV) negativo
      }
    }

    // ── Clasificación de Perfil: Segura vs Valor ───────────────────
    const oddsFinal = finalOdds || 1.80;
    if (pick.probability >= 78 && oddsFinal <= 1.55) {
      pick.category = 'segura';
      if (!pick.tier || pick.tier === '🟡') pick.tier = '🟢';
      if (!pick.risk || pick.risk === 'Alto') pick.risk = 'Bajo';
    } else if (isValueBet || (pick.probability >= 45 && pick.probability < 72 && oddsFinal >= 2.00)) {
      pick.category = 'valor';
      if (!isValueBet) pick.tier = '💎';
    } else {
      pick.category = 'moderada';
    }

    picks.push(pick);
  };



  // ── Apuestas en Vivo (Live) ───────────────────────────────────
  if (isLive) {
    const min = parseInt(liveClock) || 0;
    const totalGoals = (liveHomeGoals || 0) + (liveAwayGoals || 0);
    const liveHomeAdv = homeEffectiveScore - awayEffectiveScore; // usa split+penalizado

    // Goles restantes esperados (ajustado por tiempo transcurrido)
    const pctTimeLeft = Math.max(0, (90 - min) / 90);
    const goalsExpectedRemaining = +(projectedGoals * pctTimeLeft).toFixed(2);

    // 1. Gol en el 1er tiempo (0-0 y queda tiempo)
    if (min >= 15 && min <= 35 && totalGoals === 0 && projectedGoals >= 2.5) {
      // Prob basada en goles esperados en el tiempo restante del 1T
      const pctLeft1T = Math.max(0, (45 - min) / 45);
      const goalsLeft1T = +(projectedGoals * 0.45 * (1 - pctLeft1T * 0.3)).toFixed(2);
      // P(al menos 1 gol) = 1 - P(0 goles) usando Poisson
      const p0 = Math.pow(Math.E, -goalsLeft1T);
      const prob1T = Math.min(Math.round((1 - p0) * 100), 88);
      addPick({
        market: 'Goles en Vivo (1T)',
        selection: 'Más de 0.5 goles en el 1er Tiempo',
        probability: prob1T,
        tier: '🔥',
        argument: `Min ${min}' sin goles. Goles esperados 1T restante: ~${goalsLeft1T}. Proyección total: ${projectedGoals}.`,
        risk: prob1T >= 78 ? 'Moderado' : 'Alto',
      });
    }

    // 2. Gol tardio (0-0 en el min 60+)
    if (min >= 60 && totalGoals === 0 && projectedGoals > 2.0) {
      const goalsLeft = +(projectedGoals * pctTimeLeft).toFixed(2);
      const p0 = Math.pow(Math.E, -goalsLeft);
      const prob = Math.min(Math.round((1 - p0) * 100), 90);
      addPick({
        market: 'Goles en Vivo',
        selection: 'Más de 0.5 goles',
        probability: prob,
        tier: '🔥',
        argument: `Min ${min}' sin goles. Goles esperados restantes: ~${goalsLeft} (de ${projectedGoals} proyectados). Alta presión para romper el cero.`,
        risk: prob >= 78 ? 'Moderado' : 'Alto',
      });
    }

    // 3. Under de goles en partidos muy goleados (min 75+, ya hay 4+)
    if (min >= 75 && totalGoals > 3) {
      const goalsLeft = +(projectedGoals * pctTimeLeft).toFixed(2);
      // P(0 o 1 gol más) = P(0) + P(1) con Poisson
      const p0 = Math.pow(Math.E, -goalsLeft);
      const p1 = goalsLeft * p0;
      const probUnder = Math.min(Math.round((p0 + p1) * 100), 88);
      addPick({
        market: 'Goles en Vivo',
        selection: `Menos de ${totalGoals + 1.5} goles`,
        probability: probUnder,
        tier: '🔥',
        argument: `Min ${min}' con ${totalGoals} goles. Goles restantes esperados: ~${goalsLeft}. Baja probabilidad de 2+ goles adicionales.`,
        risk: 'Bajo',
      });
    }

    // 4. Presión del favorito Local (usa scores efectivos penalizados)
    // — Solo se activa si el local tiene ventaja real Y el visitante no es un gigante
    const isAwayHierarchy = HIERARCHY_TEAMS.some(t => awayTeamName.toLowerCase().includes(t));
    // Contra equipos de jerarquía exigimos un margen mucho mayor para no generar falsos positivos
    const requiredAdv = isAwayHierarchy ? 30 : 18;
    const requiredHomeScore = isAwayHierarchy ? 72 : 65;

    if (min >= 45 && liveHomeAdv >= requiredAdv && homeEffectiveScore >= requiredHomeScore) {
      if (liveHomeGoals < liveAwayGoals || liveHomeGoals === liveAwayGoals) {
        const isLosing = liveHomeGoals < liveAwayGoals;
        // Texto semánticamente correcto según el marcador actual
        const situationLabel = isLosing
          ? `Va perdiendo ${liveHomeGoals}-${liveAwayGoals}. Momento de remontada.`
          : `Marcador igualado ${liveHomeGoals}-${liveAwayGoals}. Presión final: el local domina sin convertir.`;

        const liveProbability = Math.min(
          Math.round(homeEffectiveScore * 0.7 + (h2hData?.homeWinPct ?? 50) * 0.3),
          isAwayHierarchy ? 74 : 80 // Cap más bajo contra equipos grandes
        );

        if (liveProbability >= 70) {
          addPick({
            market: 'Resultado en Vivo',
            selection: isLosing ? 'Local empata o gana (1X)' : 'Victoria Local',
            probability: liveProbability,
            tier: '🔥',
            argument: `Local superior en forma efectiva: ${homeEffectiveScore}% (Gral: ${homeForm.score}%) vs Visitante: ${awayEffectiveScore}% (Gral: ${awayForm.score}%). Min ${min}'. ${situationLabel}`,
            risk: isAwayHierarchy ? 'Alto' : 'Moderado',
          });
        }
      }
    }


    // 5. Goles sobre la marcha (partido ya abierto)
    if (min > 20 && min < 65 && totalGoals > 0 && goalsExpectedRemaining >= 1.0) {
      const p0 = Math.pow(Math.E, -goalsExpectedRemaining);
      const probMore = Math.min(Math.round((1 - p0) * 100), 87);
      addPick({
        market: 'Goles en Vivo',
        selection: `Más de ${totalGoals + 0.5} goles`,
        probability: probMore,
        tier: '🔥',
        argument: `Min ${min}' con ${totalGoals} gol(es). Quedan ~${goalsExpectedRemaining} goles esperados. Alta probabilidad de más goles.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Boost de confianza desde datos de cuotas (ESPN PickCenter) ──
  // Suma hasta +8 puntos si las cuotas de mercado coinciden con nuestro análisis
  const officialHomeWinPct = marketInsight ? parseInt(marketInsight.predictions?.percent?.home) || 0 : 0;
  const officialDrawPct    = marketInsight ? parseInt(marketInsight.predictions?.percent?.draw)  || 0 : 0;
  const officialAwayWinPct = marketInsight ? parseInt(marketInsight.predictions?.percent?.away)  || 0 : 0;
  const officialWinner     = marketInsight?.predictions?.winner?.comment || '';
  const hasOfficial        = officialHomeWinPct + officialDrawPct + officialAwayWinPct > 0;

  // ── Over 2.5 ──────────────────────────────────────────────────
  const homeOver25Pct  = homeSplitStats?.over25Pct ?? 0;
  const awayOver25Pct  = awaySplitStats?.over25Pct ?? 0;
  const h2hOver25Pct   = h2hData?.over25Pct ?? 0;
  let combinedOver25 = Math.round(homeOver25Pct * teamWeight + awayOver25Pct * teamWeight + h2hOver25Pct * h2hWeight);

  // ── Over 1.5 ──────────────────────────────────────────────────
  const homeOver15Pct  = homeSplitStats?.over15Pct ?? 0;
  const awayOver15Pct  = awaySplitStats?.over15Pct ?? 0;
  // Ahora usamos el dato real del H2H en lugar del proxy *1.2
  const h2hOver15Pct   = h2hData?.over15Pct ?? (h2hData ? Math.min(Math.round(h2hData.over25Pct * 1.2), 100) : 0);
  let combinedOver15 = Math.round(homeOver15Pct * teamWeight + awayOver15Pct * teamWeight + h2hOver15Pct * h2hWeight);

  // Penalización directa a los Over por desmotivación/partidos trabados
  if (relaxationGoalsPenalty > 0) {
    combinedOver15 = Math.max(combinedOver15 - 18, 0);
    combinedOver25 = Math.max(combinedOver25 - 25, 0);
  }
  
  const isDeepDefensiveLeague = /arg|uru|sudamericana/i.test(leagueName);
  const over15Threshold = isDeepDefensiveLeague ? 2.5 : (isDefensiveLeague ? 2.3 : 1.8);
  const requiredCombinedOver15 = isDeepDefensiveLeague ? 85 : 78;
  
  if (combinedOver15 >= requiredCombinedOver15 && projectedGoals >= over15Threshold) {
    // Boost si Dixon-Coles confirma el Over 1.5 (modelo institucional de acuerdo)
    const dcBoost15 = parseFloat(eloCombined.over15) >= combinedOver15 + 7 ? 3 : 0;
    const prob = Math.min(combinedOver15 + dcBoost15, 91);
    if (prob >= 68) {
      addPick({
        market: 'Total de Goles',
        selection: 'Más de 1.5 goles',
        probability: prob,
        tier: prob >= 85 ? '🟢' : prob >= 75 ? '🔵' : '🟡',
        argument: `${combinedOver15}% de partidos con 2+ goles (DC: ${eloCombined.over15}%). Proyección: ${projectedGoals} goles.${dcBoost15 > 0 ? ' ✅ Dixon-Coles confirma.' : ''}`,
        risk: prob >= 85 ? 'Bajo' : 'Moderado',
      });
    }
  }

  // ── Over 2.5 ──────────────────────────────────────────────────
  // Liga 1 Perú: exigimos un umbral más alto porque el torneo es más defensivo
  // y los partidos suelen terminar con pocos goles (1-0, 0-0 frecuentes)
  const over25Threshold = isLiga1Peru ? 3.2 : isDefensiveLeague ? 2.7 : 2.5;
  const over25MinCombined = isLiga1Peru ? 78 : 70; // También exigir más frecuencia histórica
  if (combinedOver25 >= over25MinCombined && projectedGoals >= over25Threshold) {
    const officialBoost = hasOfficial && officialWinner?.toLowerCase().includes('goals') ? 4 : 0;
    // Boost si Dixon-Coles también supera el umbral (doble confirmación)
    const dcBoost25 = parseFloat(eloCombined.over25) >= over25MinCombined ? 3 : 0;
    const prob = Math.min(combinedOver25 + officialBoost + dcBoost25, 88);
    if (prob >= 62) {
      const ctxNote = [homeContextNote, awayContextNote].filter(Boolean).join(' · ');
      addPick({
        market: 'Total de Goles',
        selection: 'Más de 2.5 goles',
        probability: prob,
        tier: prob >= 82 ? '🟢' : prob >= 72 ? '🔵' : '🟡',
        argument: `${combinedOver25}% histórico con 3+ goles · DC: ${eloCombined.over25}% · λ ${eloCombined.lambdaHome}+${eloCombined.lambdaAway}. Proyección: ${projectedGoals} goles.${dcBoost25 > 0 ? ' ✅ Doble confirmación.' : ''}${ctxNote ? ` Contexto: ${ctxNote}.` : ''}`,
        risk: prob >= 82 ? 'Bajo' : 'Moderado',
      });
    }
  }

  // ── Over 3.5 ──────────────────────────────────────────────────
  const homeOver35Pct  = homeSplitStats?.over35Pct ?? 0;
  const awayOver35Pct  = awaySplitStats?.over35Pct ?? 0;
  const h2hOver35Pct   = h2hData ? Math.round(h2hData.over25Pct * 0.6) : 0; // proxy conservador
  const combinedOver35 = Math.round(homeOver35Pct * teamWeight + awayOver35Pct * teamWeight + h2hOver35Pct * h2hWeight);
  if (combinedOver35 >= 55 && projectedGoals >= 3.0) {
    const prob = Math.min(combinedOver35, 84);
    addPick({
      market: 'Total de Goles',
      selection: 'Más de 3.5 goles',
      probability: prob,
      tier: prob >= 75 ? '🔵' : '🟡',
      argument: `${combinedOver35}% de partidos con 4+ goles. Proyección: ${projectedGoals} goles. Partido con alto potencial ofensivo.`,
      risk: 'Alto',
    });
  }

  // ── Under 2.5 ─────────────────────────────────────────────────
  const under25Pct = 100 - combinedOver25;
  // LaLiga fin de temporada: bajamos el umbral de proyección a 2.3 (liga táctica)
  // y reducimos el combinado mínimo a 68% porque el descenso cierra aún más los partidos.
  const under25GoalsThreshold = isLaLiga ? 2.3 : 2.0;
  const under25MinCombined    = isLaLiga ? 68  : 72;
  if (under25Pct >= under25MinCombined && projectedGoals <= under25GoalsThreshold) {
    const laLigaUnderBoost = (isLaLiga && laLigaRelegationZone) ? 8 : (isLaLiga ? 4 : 0);
    const prob = Math.min(under25Pct + laLigaUnderBoost, 87);
    if (prob >= 65) {
      const laLigaNote = isLaLiga
        ? (laLigaRelegationZone
            ? ' [🇪🇸 LaLiga · Zona Descenso] Partido de máxima tensión táctica al final de temporada.'
            : ' [🇪🇸 LaLiga] Liga de baja anotación — proyección ajustada al modelo español.')
        : '';
      addPick({
        market: 'Total de Goles',
        selection: 'Menos de 2.5 goles',
        probability: prob,
        tier: prob >= 82 ? '🟢' : '🔵',
        argument: `${under25Pct}% de probabilidad de partido cerrado. Proyección: ${projectedGoals} goles. Defensa sólida de ambos equipos.${laLigaNote}`,
        risk: prob >= 82 ? 'Bajo' : 'Moderado',
      });
    }
  }

  // ── Ambos Anotan ───────────────────────────────────────────────
  const homeBttsPct  = homeSplitStats?.bttsPct ?? 0;
  const awayBttsPct  = awaySplitStats?.bttsPct ?? 0;
  const h2hBttsPct   = h2hData?.bttsPct ?? 0;
  const combinedBTTS = Math.round(homeBttsPct * teamWeight + awayBttsPct * teamWeight + h2hBttsPct * h2hWeight);

  // Liga 1 Perú: Ajuste de BTTS por altitud
  let bttsThreshold = 2.5;
  let bttsMinCombined = 70;
  if (isLiga1Peru) {
    if (altitudeRisk) {
      // En altura, es mucho más difícil que ambos anoten (visitante se ahoga)
      bttsThreshold = 3.2;
      bttsMinCombined = 82;
    } else {
      // En llano/costa (Lima, Trujillo, Callao), los partidos son más abiertos
      bttsThreshold = 2.4;
      bttsMinCombined = 68;
    }
  }

  if (combinedBTTS >= bttsMinCombined && projectedGoals >= bttsThreshold) {
    const prob = Math.min(combinedBTTS, 87);
    if (prob >= 62) {
      addPick({
        market: 'Ambos Marcan',
        selection: 'Sí, ambos anotan',
        probability: prob,
        tier: prob >= 82 ? '🟢' : prob >= 72 ? '🔵' : '🟡',
        argument: `${combinedBTTS}% de partidos con gol de ambos equipos. Local anota ${homeAvgGF}/p, Visitante ${awayAvgGF}/p. ${isLiga1Peru && altitudeRisk ? '(A pesar de la altura)' : ''}`,
        risk: prob >= 82 ? 'Bajo' : 'Moderado',
      });
    }
  }

  // ── BTTS + Over 2.5 (Combo) ────────────────────────────────────
  if (combinedBTTS >= 68 && combinedOver25 >= 65 && projectedGoals >= 2.6 && awayAvgGF > 1.1) {
    const prob = Math.min(Math.round((combinedBTTS + combinedOver25) / 2) - 5, 80);
    if (prob >= 52) {
      addPick({
        market: 'Combo',
        selection: 'Ambos Marcan + Más de 2.5',
        probability: prob,
        tier: prob >= 65 ? '🔵' : '🟡',
        argument: `BTTS: ${combinedBTTS}% · Over 2.5: ${combinedOver25}%. Alta probabilidad de partido abierto con gol de ambos y 3+ goles en total.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Ganador: Local ─────────────────────────────────────────────
  const effectiveAdv = homeEffectiveScore - awayEffectiveScore;

  const officialHomeBoost = hasOfficial && officialHomeWinPct >= 55 ? Math.round((officialHomeWinPct - 50) * 0.2) : 0;
  const officialAwayBoost = hasOfficial && officialAwayWinPct >= 55 ? Math.round((officialAwayWinPct - 50) * 0.2) : 0;

  // Pick de EMPATE desde Poisson (dato real, no inventado)
  if (!isLive && poissonProbs && poissonProbs.draw >= 30 && (h2hData?.drawPct ?? 0) >= 25) {
    const drawProb = Math.round(poissonProbs.draw * 0.6 + (h2hData?.drawPct ?? 25) * 0.4);
    if (drawProb >= 25 && drawProb <= 55) { // rango extendido para value bets
      addPick({
        market: 'Ganador del Partido',
        selection: 'Empate',
        probability: drawProb,
        tier: drawProb >= 38 ? '🟡' : '🟡',
        argument: `Poisson indica ${poissonProbs.draw.toFixed(1)}% de empate. H2H: ${h2hData?.drawPct ?? '?'}% de empates históricos. Cuota de valor en mercados equilibrados.`,
        risk: 'Alto',
        units: '1-2u',
      });
    }
  }

  if (homeEffectiveScore >= 58 && awayEffectiveScore <= 52 && effectiveAdv >= 12) {
    let prob = Math.min(Math.round(homeEffectiveScore * 0.6 + (h2hData?.homeWinPct ?? 50) * 0.4) + officialHomeBoost + survivalBoostHomeWin, 86);
    if (prob >= 60) {
      const splitNote = homeFormAtHome?.total >= 3 ? ` (Casa: ${homeFormAtHome.wins}G/${homeFormAtHome.total}PJ)` : '';
      addPick({
        market: 'Ganador del Partido',
        selection: 'Victoria Local',
        probability: prob,
        tier: prob >= 80 ? '🔵' : prob >= 70 ? '🟡' : '💎',
        argument: `Forma local efectiva: ${homeEffectiveScore}% (Gral: ${homeForm.score}%)${splitNote}. Visitante efectivo: ${awayEffectiveScore}% (Gral: ${awayForm.score}%). Ventaja: +${effectiveAdv}pts. H2H: ${h2hData?.homeWinPct ?? '?'}%. ${eloLabel}. DC Win: ${eloCombined.home}%.${hasOfficial ? ` Oficial: ${officialHomeWinPct}%.` : ''}`,
        risk: 'Moderado',
        units: '3-5u',
      });
    }
  }

  // ── Ganador: Visitante ─────────────────────────────────────────
  if (awayEffectiveScore >= 58 && homeEffectiveScore <= 52 && -effectiveAdv >= 12) {
    let prob = Math.min(Math.round(awayEffectiveScore * 0.6 + (h2hData?.awayWinPct ?? 50) * 0.4) + officialAwayBoost + survivalBoostAwayWin, 86);
    if (prob >= 60) {
      const splitNote = awayFormAway?.total >= 3 ? ` (Fuera: ${awayFormAway.wins}G/${awayFormAway.total}PJ)` : '';
      addPick({
        market: 'Ganador del Partido',
        selection: 'Victoria Visitante',
        probability: prob,
        tier: prob >= 80 ? '🔵' : prob >= 70 ? '🟡' : '💎',
        argument: `Forma visitante efectiva: ${awayEffectiveScore}% (Gral: ${awayForm.score}%)${splitNote}. Local efectivo: ${homeEffectiveScore}% (Gral: ${homeForm.score}%). H2H: ${h2hData?.awayWinPct ?? '?'}%. ${eloLabel}. DC Win: ${eloCombined.away}%.${hasOfficial ? ` Oficial: ${officialAwayWinPct}%.` : ''}`,
        risk: 'Moderado',
        units: '3-5u',
      });
    }
  }

  // ── Handicap Asiático -0.5 (Local favorito claro) ──────────────
  if (homeForm.score >= 65 && homeScoreAdv >= 18 && (h2hData?.homeWinPct ?? 0) >= 40) {
    const prob = Math.min(Math.round(homeForm.score * 0.55 + (h2hData?.homeWinPct ?? 50) * 0.35 + officialHomeWinPct * 0.1), 85);
    if (prob >= 55) {
      addPick({
        market: 'Handicap Asiático',
        selection: 'Local -0.5 (Gana sin empate)',
        probability: prob,
        tier: prob >= 78 ? '🔵' : prob >= 65 ? '🟡' : '💎',
        argument: `Local claramente superior (Forma: ${homeForm.score}%, ventaja +${homeScoreAdv}pts). HA -0.5 elimina el riesgo de empate con mejor cuota que 1X2.`,
        risk: 'Moderado',
        units: '3-4u',
      });
    }
  }

  // ── Handicap Asiático -0.5 (Visitante favorito claro) ──────────
  if (awayForm.score >= 65 && -homeScoreAdv >= 18 && (h2hData?.awayWinPct ?? 0) >= 40) {
    const prob = Math.min(Math.round(awayForm.score * 0.55 + (h2hData?.awayWinPct ?? 50) * 0.35 + officialAwayWinPct * 0.1), 85);
    if (prob >= 55) {
      addPick({
        market: 'Handicap Asiático',
        selection: 'Visitante -0.5 (Gana sin empate)',
        probability: prob,
        tier: prob >= 78 ? '🔵' : prob >= 65 ? '🟡' : '💎',
        argument: `Visitante claramente superior (Forma: ${awayForm.score}%, ventaja +${-homeScoreAdv}pts). HA -0.5 elimina el riesgo de empate.`,
        risk: 'Moderado',
        units: '3-4u',
      });
    }
  }

  // ── Handicap Asiático Positivo: Underdog +1.5 / +2.0 ──────────
  // Mercado defensivo: respalda al equipo menos favorito con protección.
  // Se activa cuando hay una brecha grande de cuotas (favorito masivo) PERO
  // el underdog demuestra solidez defensiva o resiliencia en el H2H.
  //
  // Lógica de activación:
  //   1. El favorito tiene moneyline <= -400 (probabilidad implícita >= 80%)
  //   2. El underdog concede pocos goles (avgGA <= 1.3) O el H2H fue cerrado
  //   3. El underdog no fue goleado en sus últimos partidos
  //
  // Línea seleccionada:
  //   +2.0 → Cuando la brecha es extrema (moneyline <= -450) y defensa sólida
  //   +1.5 → Cuando la brecha es grande pero no extrema
  if (!isLive && marketOdds) {
    const homeML = marketOdds.home || 0;
    const awayML = marketOdds.away || 0;

    // Determinar quién es el favorito masivo y quién es el underdog
    const homeFavMassive = homeML > 0 && homeML <= 1.25; // Cuota decimal <= 1.25 = favorito brutal
    const awayFavMassive = awayML > 0 && awayML <= 1.25;

    // Alternativa: detectar favorito por moneyline americano si las cuotas vienen en ese formato
    const homeMLAmerican = marketOdds.homeMoneyLine || 0;
    const awayMLAmerican = marketOdds.awayMoneyLine || 0;
    const homeFavByML = homeMLAmerican <= -400 || homeFavMassive;
    const awayFavByML = awayMLAmerican <= -400 || awayFavMassive;

    // También detectamos favorito masivo por la diferencia de effectiveScore
    const homeFavByScore = effectiveAdv >= 25;
    const awayFavByScore = -effectiveAdv >= 25;

    const isMassiveFavorite = homeFavByML || awayFavByML || homeFavByScore || awayFavByScore;
    const favoriteIsHome = homeFavByML || homeFavByScore;

    if (isMassiveFavorite) {
      // El underdog es el equipo contrario al favorito
      const underdogName   = favoriteIsHome ? awayTeamName : homeTeamName;
      const favoriteName   = favoriteIsHome ? homeTeamName : awayTeamName;
      const underdogAvgGA  = favoriteIsHome ? awayAvgGA : homeAvgGA;
      const underdogForm   = favoriteIsHome ? awayForm : homeForm;
      const underdogSide   = favoriteIsHome ? 'Visitante' : 'Local';
      const favoriteScore  = favoriteIsHome ? homeEffectiveScore : awayEffectiveScore;
      const underdogScore  = favoriteIsHome ? awayEffectiveScore : homeEffectiveScore;

      // Condiciones de solidez defensiva del underdog
      const defenseSolid  = underdogAvgGA <= 1.3;
      const h2hWasTight   = h2hData && h2hData.avgGoals <= 2.5;
      const underdogNotCollapsing = underdogForm.score >= 35; // No está en caída libre

      // Score diferencial para elegir la línea
      const scoreDiff = Math.abs(effectiveAdv);

      if ((defenseSolid || h2hWasTight) && underdogNotCollapsing) {
        // ── +2.0: Brecha extrema + defensa sólida del underdog ──
        // Solo si la diferencia de scores es >= 30 o el favorito tiene moneyline <= -450
        const isExtremeFav = (homeMLAmerican <= -450 || awayMLAmerican <= -450) ||
                             (homeML > 0 && homeML <= 1.20) || (awayML > 0 && awayML <= 1.20) ||
                             scoreDiff >= 30;

        if (isExtremeFav && defenseSolid) {
          // Probabilidad: P(underdog pierde por <= 1 gol) + P(empate) + P(underdog gana)
          // Aproximación via Poisson: P(diff <= 1) para el underdog
          let probHA20 = 0;
          const lH = favoriteIsHome ? lambdaHome : lambdaAway;
          const lA = favoriteIsHome ? lambdaAway : lambdaHome;
          for (let f = 0; f <= 6; f++) {
            for (let u = 0; u <= 6; u++) {
              const p = poissonProb(lH, f) * poissonProb(lA, u);
              // Underdog "gana" con +2.0 si: pierde por 0-1, empata, o gana
              if (f - u <= 1) probHA20 += p;
            }
          }
          const prob20 = Math.min(Math.round(probHA20 * 100), 92);

          if (prob20 >= 60) {
            const h2hNote = h2hWasTight ? ` H2H cerrado (${h2hData.avgGoals} goles/p).` : '';
            addPick({
              market: 'Handicap Asiático',
              selection: `${underdogSide} +2.0 (Pierde por ≤1, empate o victoria)`,
              probability: prob20,
              tier: prob20 >= 82 ? '🟢' : prob20 >= 72 ? '🔵' : '🟡',
              argument: `${underdogName} concede solo ${underdogAvgGA} goles/p → defensa ordenada contra favorito masivo.${h2hNote} Con +2.0: si pierde por 1 gol cobras, por 2 te devuelven, solo fallas si golean por 3+. Forma efectiva: ${favoriteName} ${favoriteScore}% vs ${underdogName} ${underdogScore}%.`,
              risk: prob20 >= 78 ? 'Bajo' : 'Moderado',
              units: '3-4u',
            });
          }
        }

        // ── +1.5: Brecha grande pero no extrema, o defensa menos sólida ──
        // Se activa si no se generó el +2.0, o si la brecha es moderada
        if (!isExtremeFav || !defenseSolid) {
          let probHA15 = 0;
          const lH2 = favoriteIsHome ? lambdaHome : lambdaAway;
          const lA2 = favoriteIsHome ? lambdaAway : lambdaHome;
          for (let f = 0; f <= 6; f++) {
            for (let u = 0; u <= 6; u++) {
              const p = poissonProb(lH2, f) * poissonProb(lA2, u);
              // Underdog "gana" con +1.5 si: pierde por 0-1 gol, empata, o gana
              if (f - u <= 1) probHA15 += p;
            }
          }
          const prob15 = Math.min(Math.round(probHA15 * 100), 90);

          if (prob15 >= 62) {
            addPick({
              market: 'Handicap Asiático',
              selection: `${underdogSide} +1.5 (Pierde por ≤1 o no pierde)`,
              probability: prob15,
              tier: prob15 >= 80 ? '🟢' : prob15 >= 70 ? '🔵' : '🟡',
              argument: `${underdogName} no se deja golear fácil (${underdogAvgGA} GA/p). Con +1.5: solo fallas si el favorito gana por 2+ goles. Forma efectiva: ${favoriteName} ${favoriteScore}% vs ${underdogName} ${underdogScore}%.`,
              risk: prob15 >= 75 ? 'Bajo' : 'Moderado',
              units: '2-3u',
            });
          }
        }
      }
    }
  }

  // ── Doble Oportunidad: Local o Empate (1X) ────────────────────
  // Usamos Poisson: prob 1X = P(local gana) + P(empate)
  if (!isLive && poissonProbs) {
    const prob1X = Math.round(poissonProbs.home + poissonProbs.draw);
    const h2hBase1X = h2hData ? (h2hData.homeWinPct + h2hData.drawPct) : prob1X;
    let combined1X = Math.round(prob1X * 0.6 + h2hBase1X * 0.4) + survivalBoost1X;

    // Liga 1 Perú: el Doble Oportunidad (1X) es el mercado estrella (68%).
    // Módulo AFA: Liga muy propensa al empate, bajamos umbral a 70% (Parity Filter).
    const isAFA = leagueName.toLowerCase().includes('argentina');
    let threshold1X = isLiga1Peru ? 62 : (isAFA ? 65 : 68);
    // Si hay boost de supervivencia fuerte, bajamos el umbral porque Poisson
    // castiga demasiado al colero basándose en stats del gigante antes de estar "de vacaciones".
    if (survivalBoost1X >= 30) {
      threshold1X = 45; // Apuesta táctica pura (ignora la baja prob de Poisson)
    } else if (survivalBoost1X >= 25) {
      threshold1X = 60; 
    } else if (survivalBoost1X > 0) {
      threshold1X = 65;
    }

    // Si hay boost de supervivencia, somos más tolerantes con el poisson local bruto
    const poissonThreshold = survivalBoost1X > 0 ? 80 : 70;

    if (combined1X >= threshold1X && poissonProbs.home < poissonThreshold) {
      const afaNote = isAFA ? `[🛡️ AFA Parity] ` : '';
      const survivalNote = survivalBoost1X > 0 ? `🔥 Efecto Supervivencia (+${survivalBoost1X}%). ` : '';
      addPick({
        market: 'Doble Oportunidad',
        selection: 'Local o Empate (1X)',
        probability: Math.min(combined1X, 86),
        tier: '🔵',
        argument: `${afaNote}${survivalNote}Poisson: Local ${poissonProbs.home.toFixed(1)}% + Empate ${poissonProbs.draw.toFixed(1)}%. Protección ante jerarquía visitante relajada.`,
        risk: 'Bajo',
        units: '3-4u',
      });
    }

    const probX2 = Math.round(poissonProbs.away + poissonProbs.draw);
    const h2hBaseX2 = h2hData ? (h2hData.awayWinPct + h2hData.drawPct) : probX2;
    let combinedX2 = Math.round(probX2 * 0.6 + h2hBaseX2 * 0.4) + survivalBoostX2;
    // X2 en AFA usa umbral estándar (75%): el visitante en Argentina es muy volátil.
    const thresholdX2 = 68;
    
    const poissonX2Threshold = survivalBoostX2 > 0 ? 80 : 70;

    if (combinedX2 >= thresholdX2 && poissonProbs.away < poissonX2Threshold) {
      const afaNote = isAFA ? `[🛡️ AFA Parity] ` : '';
      const survivalNote = survivalBoostX2 > 0 ? `🔥 Efecto Supervivencia (+${survivalBoostX2}%). ` : '';
      addPick({
        market: 'Doble Oportunidad',
        selection: 'Visitante o Empate (X2)',
        probability: Math.min(combinedX2, 86),
        tier: '🔵',
        argument: `${afaNote}${survivalNote}Poisson: Visitante ${poissonProbs.away.toFixed(1)}% + Empate ${poissonProbs.draw.toFixed(1)}%. Protección ante local relajado.`,
        risk: 'Bajo',
        units: '3-4u',
      });
    }
  }

  // ── Estrategia en Vivo (Pre-match) ────────────────────────────
  if (!isLive) {
    if (projectedGoals >= 2.5 && combinedOver25 >= 60) {
      addPick({
        market: 'Estrategia en Vivo',
        selection: 'Apostar "Más de 1.5 goles" si llegan 0-0 al minuto 30',
        probability: 70,
        odds: '1.80+',
        tier: '🔥',
        argument: `Si el partido llega al minuto 30 sin goles, la cuota de goles subirá exponencialmente. Entrar ahí.`,
        risk: 'Moderado'
      });
    } else if (homeForm.score >= 65 && awayForm.score <= 45 && homeScoreAdv >= 20) {
      addPick({
        market: 'Estrategia en Vivo',
        selection: 'Victoria Local si empieza perdiendo',
        probability: 65,
        odds: '2.50+',
        tier: '🔥',
        argument: `El local es superior. Si el visitante anota primero de forma inesperada, apostar a la remontada o empate (1X) local tendrá mucho valor.`,
        risk: 'Alto'
      });
    } else {
       addPick({
        market: 'Estrategia en Vivo',
        selection: 'Gol en el 2do Tiempo',
        probability: 75,
        odds: '1.50+',
        tier: '🔥',
        argument: `Si el partido llega empatado al descanso (especialmente 0-0), apostar a que habrá más de 0.5 goles en el segundo tiempo.`,
        risk: 'Moderado'
      });
    }
  }

  // ── Corners del partido (ambos equipos) ────────────────────────
  if (homeCornersData && awayCornersData && homeCornersData.matches >= 4 && awayCornersData.matches >= 4) {
    const combinedAvgCorners = parseFloat(homeCornersData.avg) + parseFloat(awayCornersData.avg);
    const over8Pct = Math.round(
      ((homeCornersData.over4 / homeCornersData.matches) * 0.5 +
       (awayCornersData.over4 / awayCornersData.matches) * 0.5) * 100
    );
    const over10Pct = Math.round(
      ((homeCornersData.over5 / homeCornersData.matches) * 0.5 +
       (awayCornersData.over5 / awayCornersData.matches) * 0.5) * 100
    );
    if (over8Pct >= 60 && combinedAvgCorners >= 8) {
      addPick({
        market: 'Córners Totales',
        selection: 'Más de 8.5 córners',
        probability: Math.min(over8Pct, 88),
        tier: over8Pct >= 75 ? '🔵' : '🟡',
        argument: `Promedio combinado de córners: ${combinedAvgCorners.toFixed(1)}/p. Local: ${homeCornersData.avg}/p · Visitante: ${awayCornersData.avg}/p. El ${over8Pct}% de sus partidos superan esta línea.`,
        risk: over8Pct >= 75 ? 'Moderado' : 'Alto',
      });
    }
    if (over10Pct >= 55 && combinedAvgCorners >= 10) {
      addPick({
        market: 'Córners Totales',
        selection: 'Más de 10.5 córners',
        probability: Math.min(over10Pct, 86),
        tier: '🟡',
        argument: `${over10Pct}% de partidos con 11+ córners combinados. Promedio: ${combinedAvgCorners.toFixed(1)}/p.`,
        risk: 'Alto',
      });
    }
  }

  // ── Tarjetas del partido (ambos equipos + Árbitro) ──────────────
  if (homeCardsData && awayCardsData && homeCardsData.matches >= 4 && awayCardsData.matches >= 4) {
    let combinedAvgCards = parseFloat(homeCardsData.avg) + parseFloat(awayCardsData.avg);
    let overCardsPct = Math.round(
      ((homeCardsData.over2 / homeCardsData.matches) * 0.5 +
       (awayCardsData.over2 / awayCardsData.matches) * 0.5) * 100
    );

    let targetCards = 3.5;
    let minPct = 60;
    let tensionNote = '';
    let refereeNote = '';

    // Ajuste por Árbitro (Nivel Institucional)
    if (refereeStats && refereeStats.matches > 0) {
      const refAvg = refereeStats.avgYellow + refereeStats.avgRed;
      const refBias = refAvg - 5.0; // Asumimos 5.0 como media de liga
      if (refBias >= 1.0) { // Árbitro muy tarjetero
        overCardsPct = Math.min(overCardsPct + 15, 95);
        targetCards = 4.5;
        refereeNote = `⚖️ Árbitro riguroso (${refereeStats.name}): Promedia ${refAvg.toFixed(1)} tarjetas por partido.`;
      } else if (refBias <= -1.0) { // Árbitro muy permisivo
        overCardsPct = Math.max(overCardsPct - 15, 0);
        refereeNote = `⚖️ Árbitro permisivo (${refereeStats.name}): Solo promedia ${refAvg.toFixed(1)} tarjetas.`;
      } else {
        refereeNote = `⚖️ Árbitro (${refereeStats.name}): ${refAvg.toFixed(1)} tarjetas (Promedio neutro).`;
      }
    }

    // Liga 1 Perú: Ajuste para Clásicos de Provincia o Pelea por el Descenso
    if (isLiga1Peru) {
      const isRelegationFight = matchStandings && matchStandings.total >= 10 && 
        (matchStandings.homeRank >= matchStandings.total - 4 || matchStandings.awayRank >= matchStandings.total - 4);
      
      if (isDerby || isRelegationFight) {
        overCardsPct = Math.min(overCardsPct + 20, 90); // Boost masivo de probabilidad
        targetCards = 4.5; // Elevamos la línea porque en Perú estos partidos promedian 6+ tarjetas
        minPct = 55;
        tensionNote = isDerby ? '🔥 Clásico de alta fricción.' : '🔥 Partido de vida o muerte (descenso).';
      }
    }

    // ── LaLiga España: VAR estricto + descenso = muchas tarjetas ────
    // En España el VAR interviene más que en cualquier otra liga Top 5.
    // En partidos de descenso de final de temporada esto se dispara.
    if (isLaLiga) {
      const isLaLigaRelegFight = matchStandings && matchStandings.total >= 18 &&
        (matchStandings.homeRank >= matchStandings.total - 4 || matchStandings.awayRank >= matchStandings.total - 4);
      if (isLaLigaRelegFight || isDerby) {
        overCardsPct = Math.min(overCardsPct + 15, 90);
        targetCards  = 4.5;
        minPct       = 58;
        tensionNote  = isLaLigaRelegFight
          ? '🇪🇸 VAR + Descenso LaLiga: nerviosismo extremo, tarjetazo seguro.'
          : '🇪🇸 Derbi LaLiga con VAR activo.';
      } else {
        // LaLiga estándar: el VAR ya genera una tarjeta extra de media vs otras ligas
        overCardsPct = Math.min(overCardsPct + 6, 90);
        tensionNote  = '🇪🇸 LaLiga: VAR estricto eleva media de tarjetas.';
      }
    }

    if (overCardsPct >= minPct && combinedAvgCards >= 3) {
      addPick({
        market: 'Tarjetas Totales',
        selection: `Más de ${targetCards} tarjetas`,
        probability: Math.min(overCardsPct, 88),
        tier: overCardsPct >= 75 ? '🔵' : '🟡',
        argument: `Promedio combinado: ${combinedAvgCards.toFixed(1)}/p. ${tensionNote} ${refereeNote}`,
        risk: targetCards > 3.5 ? 'Alto' : 'Moderado',
      });
    }
  }

  // ── Remates al Arco (Shots on Target) ──────────────────────────
  if (homeShotsData && awayShotsData && homeShotsData.matches >= 4 && awayShotsData.matches >= 4) {
    const combinedAvgShots = parseFloat(homeShotsData.avg) + parseFloat(awayShotsData.avg);
    const overShotsPct = Math.round(
      ((homeShotsData.over4 / homeShotsData.matches) * 0.5 +
       (awayShotsData.over4 / awayShotsData.matches) * 0.5) * 100
    );
    if (overShotsPct >= 65 && combinedAvgShots >= 8.5) {
      addPick({
        market: 'Remates al Arco',
        selection: 'Más de 8.5 remates al arco',
        probability: Math.min(overShotsPct, 88),
        tier: '🔵',
        argument: `Promedio combinado: ${combinedAvgShots.toFixed(1)}/p. Ambos equipos generan muchas ocasiones directas a portería.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Faltas Cometidas (Fouls) ───────────────────────────────────
  if (homeFoulsData && awayFoulsData && homeFoulsData.matches >= 4 && awayFoulsData.matches >= 4) {
    const combinedAvgFouls = parseFloat(homeFoulsData.avg) + parseFloat(awayFoulsData.avg);
    const overFoulsPct = Math.round(
      ((homeFoulsData.over11 / homeFoulsData.matches) * 0.5 +
       (awayFoulsData.over11 / awayFoulsData.matches) * 0.5) * 100
    );
    if (overFoulsPct >= 65 && combinedAvgFouls >= 22.5) {
      addPick({
        market: 'Faltas Totales',
        selection: 'Más de 22.5 faltas',
        probability: Math.min(overFoulsPct, 86),
        tier: '🟡',
        argument: `Promedio combinado: ${combinedAvgFouls.toFixed(1)}/p. Historial de mucha fricción e interrupciones.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Gol en el 2do Tiempo (datos de tramos) ──────────────────────
  if (!isLive && homeSlots && awaySlots) {
    const home2T = (homeSlots[3]?.goals || 0) + (homeSlots[4]?.goals || 0) + (homeSlots[5]?.goals || 0);
    const away2T = (awaySlots[3]?.goals || 0) + (awaySlots[4]?.goals || 0) + (awaySlots[5]?.goals || 0);
    const total2T = home2T + away2T;
    const total1T = (homeSlots[0]?.goals||0)+(homeSlots[1]?.goals||0)+(homeSlots[2]?.goals||0)
                  + (awaySlots[0]?.goals||0)+(awaySlots[1]?.goals||0)+(awaySlots[2]?.goals||0);
    if (total2T > 0 && total1T > 0) {
      const pct2T = Math.round(total2T / (total2T + total1T) * 100);
      if (pct2T >= 58 && projectedGoals >= 2.0) {
        addPick({
          market: 'Gol por Tramo',
          selection: 'Gol en el 2do Tiempo',
          probability: Math.min(pct2T + 10, 85),
          tier: '🔵',
          argument: `El ${pct2T}% de los goles de estos equipos caen en la 2ª mitad. Alta probabilidad de actividad goleadora en el tramo 46'–90'.`,
          risk: 'Moderado',
        });
      }
    }
  }

  // ── MÓDULO DE MOTIVACIÓN Y CONTEXTO ──────────────────────────
  let isDeadRubber = false;
  let isRelegationBattle = false; // Ambos pelean descenso
  let survivalBoostHome = false;  // Solo local pelea descenso, visitante relajado
  let survivalBoostAway = false;  // Solo visitante pelea descenso, local relajado

  if (matchStandings && matchStandings.total >= 10) {
     const tot = matchStandings.total;
     const midTableStart = Math.floor(tot * 0.35);
     const midTableEnd = tot - 5;
     
     const homeInMid = matchStandings.homeRank >= midTableStart && matchStandings.homeRank <= midTableEnd;
     const awayInMid = matchStandings.awayRank >= midTableStart && matchStandings.awayRank <= midTableEnd;
     
     // Bloqueamos la detección de descenso para ligas cerradas (como la MLS)
     const hasRelegationSystem = !isMLS;
     const homeInRelegation = hasRelegationSystem && matchStandings.homeRank >= tot - 4; // Últimos 5
     const awayInRelegation = hasRelegationSystem && matchStandings.awayRank >= tot - 4; // Últimos 5

     if (homeInMid && awayInMid) {
         isDeadRubber = true;
     }

     // 🚨 MODO DESCENSO: Ambos en el sótano (Duelo de Miedo)
     if (homeInRelegation && awayInRelegation) {
         isRelegationBattle = true;
         const combinedUnder25 = ((100 - (homeSplitStats?.over25Pct || 50)) + (100 - (awaySplitStats?.over25Pct || 50))) / 2;
         if (!isLive && combinedUnder25 >= 60) {
            addPick({
              market: 'Total de Goles',
              selection: 'Menos de 2.5 goles',
              probability: Math.min(combinedUnder25 + 15, 85),
              tier: '🟡',
              argument: `[🚨 Duelo de Miedo] Ambos equipos pelean el descenso directo. Históricamente, estos choques generan un "bloque bajo" por miedo a perder. Expectativa de partido muy táctico y cerrado.`,
              risk: 'Moderado',
              units: '2-3u'
            });
         }
     } 
     // 🚨 SURVIVAL BOOST: Uno pelea descenso y el otro no se juega nada
     else if (homeInRelegation && awayInMid) {
         survivalBoostHome = true;
         const baseProb = poissonProbs ? Math.round(poissonProbs.home + poissonProbs.draw) : 65;
         if (!isLive && baseProb >= 60) {
            addPick({
              market: 'Doble Oportunidad',
              selection: 'Local o Empate (1X)',
              probability: Math.min(baseProb + 15, 86),
              tier: '🔵',
              argument: `[🔥 Survival Boost] El local se juega la permanencia ante un visitante acomodado en mitad de tabla. La urgencia extrema favorece la protección del 1X.`,
              risk: 'Bajo',
              units: '3-4u'
            });
         }
     } else if (awayInRelegation && homeInMid) {
         survivalBoostAway = true;
         const baseProb = poissonProbs ? Math.round(poissonProbs.away + poissonProbs.draw) : 65;
         if (!isLive && baseProb >= 60) {
            addPick({
              market: 'Doble Oportunidad',
              selection: 'Visitante o Empate (X2)',
              probability: Math.min(baseProb + 15, 86),
              tier: '🔵',
              argument: `[🔥 Survival Boost] El visitante se juega la vida por no descender ante un local relajado. La necesidad crítica de sumar activa el X2.`,
              risk: 'Bajo',
              units: '3-4u'
            });
         }
     }
  }

  // ── FILTRO DE CONSISTENCIA: Eliminar picks contradictorios ────────
  // Detecta y resuelve picks que se contradicen entre sí (1X+X2, Over+Under, etc.)
  // Regla general: se mantiene el pick de mayor probabilidad y se elimina el menor.
  function resolveContradictoryPicks(rawPicks) {
    const toRemove = new Set();
    const removalLog = [];

    // Helper: clasificar picks por familia de resultado
    const findPicks = (predicate) => rawPicks.filter((p, i) => !toRemove.has(i) && predicate(p));
    const markForRemoval = (pick, reason) => {
      const idx = rawPicks.indexOf(pick);
      if (idx !== -1) {
        toRemove.add(idx);
        removalLog.push(`[CONTRADICCIÓN] Eliminado: "${pick.selection}" (${pick.probability}%) — ${reason}`);
      }
    };

    // Resolver conflicto: mantiene el de mayor probabilidad, elimina el(los) otro(s)
    const resolveConflict = (picksA, picksB, reasonLabel) => {
      if (picksA.length === 0 || picksB.length === 0) return;
      const all = [...picksA, ...picksB].sort((a, b) => b.probability - a.probability);
      const winner = all[0];
      all.slice(1).forEach(loser => {
        markForRemoval(loser, `${reasonLabel}: "${winner.selection}" (${winner.probability}%) tiene mayor prob.`);
      });
    };

    // ── Regla 1: 1X + X2 simultáneo (cubren los 3 resultados → sin valor) ──
    const home1X = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('1X') || p.selection.includes('Local')));
    const awayX2 = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('X2') || p.selection.includes('Visitante')));
    resolveConflict(home1X, awayX2, '1X vs X2');

    // ── Regla 2: Victoria Local + Victoria Visitante (imposible) ──
    const homeWin = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Local'));
    const awayWin = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Visitante'));
    resolveConflict(homeWin, awayWin, 'Victoria Local vs Visitante');

    // ── Regla 3: Victoria Local + X2 (contradicción directa) ──
    const homeWin2 = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Local'));
    const awayX2_2 = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('X2') || (p.selection.includes('Visitante') && p.selection.includes('Empate'))));
    resolveConflict(homeWin2, awayX2_2, 'Victoria Local vs X2');

    // ── Regla 4: Victoria Visitante + 1X (contradicción directa) ──
    const awayWin2 = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Visitante'));
    const home1X_2 = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('1X') || (p.selection.includes('Local') && p.selection.includes('Empate'))));
    resolveConflict(awayWin2, home1X_2, 'Victoria Visitante vs 1X');

    // ── Regla 5: Victoria Local/Visitante + Empate ──
    const anyWin = findPicks(p => p.market === 'Ganador del Partido' && (p.selection.includes('Local') || p.selection.includes('Visitante')));
    const drawPicks = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Empate'));
    resolveConflict(anyWin, drawPicks, 'Victoria vs Empate');

    // ── Regla 6: Over 2.5 + Under 2.5 (mutuamente excluyentes) ──
    const over25 = findPicks(p => p.selection === 'Más de 2.5 goles');
    const under25 = findPicks(p => p.selection === 'Menos de 2.5 goles');
    resolveConflict(over25, under25, 'Over 2.5 vs Under 2.5');

    // ── Regla 7: Handicap Negativo Local + X2 / Handicap Negativo Visitante + 1X ──
    const haLocalNeg = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Local') && p.selection.includes('-'));
    const x2Final = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('X2') || (p.selection.includes('Visitante') && p.selection.includes('Empate'))));
    resolveConflict(haLocalNeg, x2Final, 'Handicap -0.5 Local vs X2');

    const haAwayNeg = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Visitante') && p.selection.includes('-'));
    const x1Final = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('1X') || (p.selection.includes('Local') && p.selection.includes('Empate'))));
    resolveConflict(haAwayNeg, x1Final, 'Handicap -0.5 Visitante vs 1X');

    // ── Regla 9: Handicap Positivo (+1.5/+2.0) + Victoria del mismo lado ──
    // HA +1.5 Visitante no contradice Victoria Local (es coherente: ambos dicen que el local gana)
    // PERO HA +1.5 Visitante SÍ contradice HA -0.5 Visitante (uno dice que gana, el otro que pierde ajustado)
    const haLocalPos = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Local') && p.selection.includes('+'));
    const haLocalNeg2 = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Local') && p.selection.includes('-'));
    resolveConflict(haLocalPos, haLocalNeg2, 'HA + Local vs HA - Local');

    const haAwayPos = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Visitante') && p.selection.includes('+'));
    const haAwayNeg2 = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Visitante') && p.selection.includes('-'));
    resolveConflict(haAwayPos, haAwayNeg2, 'HA + Visitante vs HA - Visitante');

    // ── Regla 8: Doble Oportunidad duplicada del mismo lado ──
    // (Ej: dos picks "1X" generados por Poisson + Survival Boost)
    const all1X = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('1X') || (p.selection.includes('Local') && !p.selection.includes('Visitante'))));
    if (all1X.length > 1) {
      const best1X = all1X.sort((a, b) => b.probability - a.probability)[0];
      all1X.slice(1).forEach(dup => markForRemoval(dup, `Duplicado 1X: fusionado con "${best1X.selection}" (${best1X.probability}%)`));
    }

    const allX2 = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('X2') || (p.selection.includes('Visitante') && !p.selection.includes('Local'))));
    if (allX2.length > 1) {
      const bestX2 = allX2.sort((a, b) => b.probability - a.probability)[0];
      allX2.slice(1).forEach(dup => markForRemoval(dup, `Duplicado X2: fusionado con "${bestX2.selection}" (${bestX2.probability}%)`));
    }

    // Log de eliminaciones
    if (removalLog.length > 0) {
      console.log('\n=== FILTRO DE CONTRADICCIONES ===');
      removalLog.forEach(log => console.log(log));
      console.log(`Total eliminados: ${removalLog.length} de ${rawPicks.length} picks\n`);
    }

    return rawPicks.filter((_, i) => !toRemove.has(i));
  }

  const consistentPicks = resolveContradictoryPicks(picks);

  // Filtro: picks con tier definido y probabilidad >= umbrales inteligentes
  let filtered = consistentPicks.filter(p => {
    if (!p.tier) return false;
    
    // Filtro Apagón (Blackout Filter)
    const isPremier = leagueName.toLowerCase().includes('premier');
    const isGoalMarket = p.market === 'Total de Goles' || p.market === 'Ambos Marcan' || p.market === 'Combo';
    
    if (isPremier && isGoalMarket) {
      return false; // Bloqueo total
    }

    // ── MÓDULO ARABIA SAUDÍ (Saudi Pro League) ──────────────────────
    // En esta liga, los 4 Grandes tienen una ventaja tan brutal sobre el
    // resto que el sistema puede ser más agresivo (82% en lugar de 88%).
    const isSaudi = leagueName.toLowerCase().includes('saudi') || leagueName.toLowerCase().includes('arabia');
    const SAUDI_BIG4 = ['Al-Hilal', 'Al Hilal', 'Al-Nassr', 'Al Nassr', 'Al-Ahli', 'Al Ahli', 'Al-Ittihad', 'Al Ittihad'];
    const homeIsBig4 = SAUDI_BIG4.some(t => homeTeamName?.includes(t));
    const awayIsBig4 = SAUDI_BIG4.some(t => awayTeamName?.includes(t));
    const isBig4Match = isSaudi && (homeIsBig4 || awayIsBig4);

    // Poda de Ganador Directo (1X2) y Handicap Negativo (-0.5)
    // NOTA: Los Handicap Positivos (+1.5/+2.0) son mercados defensivos (como Doble Oportunidad)
    // y NO deben pasar por este filtro de 82%. Se evalúan más abajo con umbrales estándar.
    const isPositiveHandicap = p.market === 'Handicap Asiático' && p.selection.includes('+');
    if ((p.market === 'Ganador del Partido' || p.market === 'Handicap Asiático') && !isPositiveHandicap) {
      // FILTRO ACL: Si el equipo favorito (el que generó el pick) está en riesgo
      // de rotación por congestión ACL, bloqueamos Ganador/Hándicap sin importar la prob.
      const favorsHome = p.selection.includes('Local') || p.selection.includes('Local');
      const favorsAway = p.selection.includes('Visitante');
      if (isSaudi) {
        if (favorsHome && homeACL.isAtRisk) return false; // 🚫 Local Big4 en rotación
        if (favorsAway && awayACL.isAtRisk) return false;  // 🚫 Visitante Big4 en rotación
      }
      // Umbral normal de probabilidad (reducido a 82% para capturar Bankers)
      const threshold = isBig4Match ? 80 : 82;
      if (p.probability < threshold) return false;
    }

    // ── MÓDULO AFA (Liga Profesional Argentina) ──────────────────────
    const isAFA = leagueName.toLowerCase().includes('argentina');
    
    // Limpieza de Mercados Secundarios en AFA
    if (isAFA && ['Córners Totales', 'Faltas Totales'].includes(p.market)) {
      return false; // ESPN no provee data consistente para AFA
    }

    // Penalización "Gigante en Crisis" (Boca/River como visitantes)
    if (isAFA && p.market === 'Ganador del Partido') {
      const AFA_GIANTS = ['Boca Juniors', 'River Plate'];
      const awayIsGiant = AFA_GIANTS.some(t => awayTeamName?.includes(t));
      if (awayIsGiant && p.selection.includes('Visitante') && advancedStats?.away?.xG < 1.2) {
        p.probability -= 10; // Penalización del 10%
        p.argument = `[⚠️ MODO AFA] ${p.argument} (El gigante visitante llega en mala forma ofensiva, cuota posiblemente inflada).`;
      }
    }

    // ── MÓDULO LaLiga (España) ──────────────────────────────────────
    if (isLaLiga) {
      // 1) Bloquear Faltas: ESPN no es consistente en LaLiga
      if (p.market === 'Faltas Totales') return false;

      // 2) Penalización "Gran Equipo de Visita": Real Madrid/Barça/Atleti
      //    visitando a un equipo de descenso generan MIEDO DEFENSIVO en el rival.
      //    Eso cierra el partido → Victoria directa del grande es menos probable
      //    que un Doble Oportunidad. Bloqueamos 'Victoria Visitante' pura si hay
      //    descenso en juego y el grande visita.
      if (awayIsLaLigaGiant && laLigaRelegationZone && p.market === 'Ganador del Partido' && p.selection.includes('Visitante')) {
        // No bloqueamos, pero añadimos advertencia y bajamos probabilidad
        p.probability = Math.max(p.probability - 8, 60);
        p.argument = `[🇪🇸 LaLiga] ${p.argument} (⚠️ Rival en descenso juega cerrado ante grande — riesgo de partido tenso y a la contra).`;
      }

      // 3) Over 2.5 bloqueado si es partido de descenso en LaLiga
      //    (estos partidos raramente superan 2 goles — media histórica ~1.8 en ZD)
      if (laLigaRelegationZone && p.selection === 'Más de 2.5 goles') return false;

      // 4) Boost argumental para picks de Under en contexto de descenso
      if (laLigaRelegationZone && p.selection.includes('Menos de') && !p.argument.includes('[🇪🇸')) {
        p.argument = `[🇪🇸 LaLiga · Fin Temporada] ${p.argument}`;
      }
    }

    // Umbrales Inteligentes por Mercado (con bypass para Value Bets)
    const isValueCategory = p.category === 'valor';
    let requiredProb;
    if (p.market === 'Doble Oportunidad') {
      const hasSurvivalBoost = p.argument && p.argument.includes('Efecto Supervivencia');
      if (hasSurvivalBoost) {
        requiredProb = 40;
      } else {
        requiredProb = isLaLiga ? 65 : (isAFA ? 65 : (isDeadRubber ? 78 : 68));
      }
    } else if (['Córners Totales', 'Tarjetas Totales', 'Remates al Arco', 'Faltas Totales'].includes(p.market)) {
      requiredProb = isDeadRubber ? 75 : 65;
    } else if (isGoalMarket && isSaudi) {
      const involvesBig4 = homeIsBig4 || awayIsBig4;
      requiredProb = (isDeadRubber || isRelegationBattle) ? 75 : (involvesBig4 ? 65 : 72);
    } else if (isGoalMarket && isLaLiga) {
      if (p.selection.includes('Menos de')) {
        requiredProb = laLigaRelegationZone ? 68 : 72;
      } else {
        requiredProb = laLigaRelegationZone ? 80 : 75;
      }
    } else if (isAFA && p.selection === 'Menos de 2.5 goles') {
      const bothDefensesGood = homeAvgGA < 1.1 && awayAvgGA < 1.1;
      requiredProb = bothDefensesGood ? 70 : 78;
      if (bothDefensesGood && p.probability >= requiredProb && !p.argument.includes('[🛡️ MODO AFA]')) {
         p.argument = `[🛡️ MODO AFA] ${p.argument} (Liga de baja anotación y ambas defensas sólidas).`;
      }
    } else {
      // Regla general: mercados volátiles
      requiredProb = isDeadRubber ? 82 : Math.max(72, dynamicMinProb - 8);
    }

    // Value Bets con EV positivo pasan con umbral reducido (-15 puntos)
    if (isValueCategory && p.probability >= requiredProb - 15) return true;
    
    return p.probability >= requiredProb;
  });

  // ── FILTRO ANTI-CLÁSICOS (SNIPER MODE) ────────────────────────
  // Bypass si ambos equipos son máquinas ofensivas en el momento (para evitar falsos Under en derbis rotos)
  const bothTeamsScoringWell = (advancedStats?.home?.xG >= 1.8 && advancedStats?.away?.xG >= 1.8) || (homeAvgGF >= 1.8 && awayAvgGF >= 1.8);

  if (isDerby && !isLive && !bothTeamsScoringWell) {
    // Si es un derbi pre-match, bloqueamos todos los mercados especulativos (Victorias, Ambos Anotan, Overs)
    filtered = filtered.filter(p => 
      p.selection.includes('Menos de 2.5') || 
      p.selection.includes('Menos de 3.5') ||
      p.selection === 'Empate' ||
      p.market === 'Tarjetas Totales'
    );
    
    // Si no quedó ningún pick (lo normal, porque filtramos casi todos), inyectamos el Under 3.5 seguro
    if (filtered.length === 0) {
      filtered.push({
        market: 'Total de Goles',
        selection: 'Menos de 3.5 goles',
        probability: 85,
        tier: '🟢',
        argument: `[🚨 MODO DERBI] Partido de Altísima Tensión detectado. La estadística histórica de forma se anula en los clásicos. Se espera un partido táctico y cerrado.`,
        risk: 'Bajo',
      });
    } else {
      // Modificar el argumento de los picks que sobrevivieron
      filtered.forEach(p => p.argument = `[🚨 MODO DERBI] ${p.argument}`);
    }
  }

  // ── MODO DESCENSO (RELEGATION BATTLE) ──────────────────────
  // En peleas por el descenso de final de temporada, el miedo a perder domina.
  if (isRelegationBattle && !isLive) {
    // Bloquear picks especulativos ofensivos (Overs y Ambos Anotan)
    filtered = filtered.filter(p => {
       if (p.selection.includes('Más de') || p.selection === 'Ambos Anotan: Sí') return false;
       return true;
    });

    // Inyectar el pick seguro de Under 3.5 si no existe ya
    const hasUnder35 = filtered.some(p => p.selection === 'Menos de 3.5 goles');
    if (!hasUnder35) {
      filtered.push({
        market: 'Total de Goles',
        selection: 'Menos de 3.5 goles',
        probability: 85,
        tier: '🟢',
        argument: `[📉 MODO DESCENSO] Duelo directo por la permanencia. Ambos equipos priorizarán no cometer errores antes que atacar. Se espera un trámite muy cerrado.`,
        risk: 'Bajo',
      });
    }

    // Inyectar nota de cautela en los picks restantes
    filtered.forEach(p => {
      if (!p.argument.includes('[📉 MODO DESCENSO]')) {
        p.argument = `[📉 MODO DESCENSO] ${p.argument} (Partido de alta tensión por el descenso).`;
      }
    });
  }

  // ── MODO SNIPER (ELITE FILTER) ───────────────────────────────
  // Identifica los picks que tienen el potencial de alcanzar el 90% de acierto.
  // Son selecciones donde la probabilidad matemática y el contexto coinciden plenamente.
  filtered = filtered.map(p => {
    const isBig3Dominance = isLiga1Peru && (homeEffectiveScore >= 82 || awayEffectiveScore >= 82);
    const isExtremeAltitudeWin = isLiga1Peru && altitudeRisk === 'high' && p.selection.includes('Local');
    
    // Un pick es ELITE si tiene prob >= 88% o es un caso de dominación absoluta en Liga 1
    const isElite = p.probability >= 88 || (isLiga1Peru && p.probability >= 84 && (isBig3Dominance || isExtremeAltitudeWin));
    
    if (isElite) {
      return {
        ...p,
        tier: '💎',
        argument: `[🎯 SNIPER] ${p.argument}`,
        risk: 'Bajo' // Los picks Sniper siempre se consideran de riesgo bajo por su alta probabilidad
      };
    }
    return p;
  });

  // ── Filtro de Cuota Mínima (Boring Odds Filter) ─────────────────
  // Descartamos picks con cuotas decimales < 1.20 porque no generan valor
  // real para el usuario (riesgo/recompensa desfavorable).
  const MIN_ODDS = 1.20;
  filtered = filtered.filter(p => {
    const o = parseFloat(p.odds);
    // Si la cuota no está disponible o es un string como '1.80+', dejamos pasar
    if (!o || isNaN(o)) return true;
    return o >= MIN_ODDS;
  });

  const livePicks   = filtered.filter(p => p.tier === '🔥');
  // 💎 tier SIEMPRE va a valuePicks, sin importar la categoría del pick
  const valuePicks  = filtered.filter(p => p.tier !== '🔥' && (p.tier === '💎' || p.category === 'valor'));
  const moderadas   = filtered.filter(p => p.tier !== '🔥' && p.tier !== '💎' && p.category === 'moderada');
  const seguras     = filtered.filter(p => p.tier !== '🔥' && p.tier !== '💎' && p.category === 'segura');

  // Ordenar cada grupo internamente
  // Value Bets: primero las de MAYOR cuota (más emocionante/rentable)
  const sortedValor = [...valuePicks].sort((a, b) => (parseFloat(b.odds) || 0) - (parseFloat(a.odds) || 0));
  // Seguras: primero las de mayor probabilidad
  const sortedSeguras = [...seguras].sort((a, b) => b.probability - a.probability);
  // Moderadas: primero las de mayor probabilidad
  const sortedModeradas = [...moderadas].sort((a, b) => b.probability - a.probability);

  // ── Orden de Presentación ─────────────────────────────────────────
  // 1. 💎 Value Bets (mayor ROI potencial, las más emocionantes)
  // 2. 🔵 Moderadas  (confiables, cuotas decentes)
  // 3. 🟢 Seguras    (bankers, bajo riesgo pero cuotas aburridas)
  // 4. 🔥 En Vivo    (siempre al final como bonus)
  const finalPicks = [
    ...sortedValor.slice(0, 3),
    ...sortedModeradas.slice(0, 2),
    ...sortedSeguras.slice(0, 2),
    ...livePicks.slice(0, 1)
  ];

  return {
    picks: finalPicks,
    projectedGoals,
    homeAvgGF,
    homeAvgGA,
    awayAvgGF,
    awayAvgGA,
    combinedOver25,
    combinedBTTS,
    homeFormAtHome,
    awayFormAway,
    // ── Datos Elo + Dixon-Coles (para UI y diagnóstico) ──────────
    eloCombined,   // { home, draw, away, over15, over25, over35, btts, lambdaHome, lambdaAway, _elo, _dc, _top5Scores }
    // ── Fase 1: Expectativa Pitagórica + Volatilidad ─────────────
    pythag: {
      home: homePythag,   // { pythagWinPct, actualWinPct, delta, overPerforming, underPerforming, label, adjustment }
      away: awayPythag,
    },
    volatility: {
      home: homeVolatility,  // { volatility, label, daysSinceLastGame, inconsistencyScore, trustPenalty, isHighVolatility }
      away: awayVolatility,
    },
    reason: finalPicks.length === 0 ? 'No se encontró ventaja estadística clara. No se recomienda apostar.' : null,
  };
}

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
