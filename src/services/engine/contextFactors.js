/**
 * Contextual factors, penalties, and modifiers (Altitude, Derby, Hangover)
 */
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

export const PERU_BIG3_NAMES = ['alianza lima', 'universitario', 'sporting cristal'];

export const HIERARCHY_TEAMS = [
  // Argentina
  'river plate', 'boca juniors', 'racing', 'independiente', 'san lorenzo', 'estudiantes', 'velez',
  // Brasil
  'flamengo', 'palmeiras', 'sao paulo', 'são paulo', 'corinthians', 'atletico mg', 'atlético mg', 
  'gremio', 'grêmio', 'internacional', 'fluminense', 'botafogo', 'cruzeiro'
];

// Nuevos Filtros Élite Conmebol
export const BRAZILIAN_TOP_TEAMS = [
  'flamengo', 'palmeiras', 'atletico mg', 'atlético mg', 'atletico mineiro',
  'sao paulo', 'são paulo', 'fluminense', 'botafogo', 'cruzeiro', 'internacional', 'gremio', 'grêmio'
];

const TROPICAL_OVEN_CITIES = [
  'barranquilla', 'maracaibo', 'guayaquil', 'fortaleza', 'cuiaba', 'cuiabá',
  'manaus', 'belem', 'belém', 'sullana', 'piura', 'tarapoto'
];

export const SOUTH_COLD_TEAMS = [
  'river plate', 'boca juniors', 'racing', 'independiente', 'san lorenzo', 'estudiantes', 'velez', 'vélez',
  'peñarol', 'nacional montevideo', 'colo colo', 'universidad de chile', 'universidad católica'
];

const NORTH_CITIES = [
  'caracas', 'san cristobal', 'san cristóbal', 'barranquilla', 'medellin', 'medellín', 'bogota', 'bogotá',
  'cali', 'guayaquil', 'quito'
];

const SOUTH_CITIES = [
  'buenos aires', 'montevideo', 'santiago', 'porto alegre', 'curitiba', 'rosario', 'mendoza', 'cordoba', 'córdoba'
];

export function checkConmebolTravelAndClimateRisk(awayTeamName, homeCity) {
  if (!homeCity || !awayTeamName) return null;
  const cityLow = homeCity.toLowerCase();
  const awayLow = awayTeamName.toLowerCase();
  
  // 1. Horno Tropical
  const isTropicalOven = TROPICAL_OVEN_CITIES.some(c => cityLow.includes(c));
  const isSouthColdTeam = SOUTH_COLD_TEAMS.some(t => awayLow.includes(t));
  
  if (isTropicalOven && isSouthColdTeam) {
    return 'climate_heat';
  }

  // 2. Fatiga de Viaje Extremo
  const isHomeNorth = NORTH_CITIES.some(c => cityLow.includes(c));
  const isHomeSouth = SOUTH_CITIES.some(c => cityLow.includes(c));
  
  if (isHomeNorth && isSouthColdTeam) {
    return 'travel_fatigue';
  }
  
  const NORTH_TEAMS = ['millonarios', 'santa fe', 'nacional', 'junior', 'caracas', 'tachira', 'táchira', 'emelec', 'barcelona', 'ldu'];
  const isAwayNorth = NORTH_TEAMS.some(t => awayLow.includes(t));
  if (isHomeSouth && isAwayNorth) {
    return 'travel_fatigue';
  }

  return null;
}

export function checkCalendarFatigue(history) {
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
export function checkInternationalHangover(teamName, history) {
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

export function checkACLCongestion(teamName, history) {
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
export function checkSniperCleanSheetGuard(homeFormAtHome, homeTeamId, homeHistory) {
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
export function checkAltitudeRisk(teamName, city, homeTeamName = '') {
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