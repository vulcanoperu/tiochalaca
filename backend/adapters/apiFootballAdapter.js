const axios = require('axios');
const logger = require('../utils/logger');
const stringSimilarity = require('string-similarity'); // Asumiendo que pueden haber diferencias de nombres

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = 'https://v3.football.api-sports.io';

const headers = {
  'x-apisports-key': API_KEY,
  'x-rapidapi-host': 'v3.football.api-sports.io'
};

/**
 * Busca el ID de un fixture en API-Football buscando por fecha y equipos.
 */
async function findFixtureId(homeTeam, awayTeam, dateStr) {
  try {
    const res = await axios.get(`${API_URL}/fixtures?date=${dateStr}`, { headers, timeout: 10000 });
    const fixtures = res.data.response;
    if (!fixtures || fixtures.length === 0) return null;

    let bestMatch = null;
    let highestScore = 0;

    for (const f of fixtures) {
      const apiHome = f.teams.home.name;
      const apiAway = f.teams.away.name;

      const scoreHome = stringSimilarity.compareTwoStrings(homeTeam.toLowerCase(), apiHome.toLowerCase());
      const scoreAway = stringSimilarity.compareTwoStrings(awayTeam.toLowerCase(), apiAway.toLowerCase());

      const avgScore = (scoreHome + scoreAway) / 2;

      // Buscar coincidencias bastante altas (> 0.6)
      if (avgScore > highestScore && avgScore > 0.6) {
        highestScore = avgScore;
        bestMatch = f.fixture.id;
      }
    }

    return bestMatch;
  } catch (error) {
    logger.error(`[API-Football] Error buscando fixture ${homeTeam} vs ${awayTeam}: ${error.message}`);
    return null;
  }
}

/**
 * Obtiene las cuotas de un partido y las formatea para el motor
 */
async function getMatchOdds(homeTeam, awayTeam, dateStr) {
  if (!API_KEY) {
    logger.warn('[API-Football] API_FOOTBALL_KEY no está definida en el entorno (.env). Saltando respaldo.');
    return null;
  }

  try {
    const fixtureId = await findFixtureId(homeTeam, awayTeam, dateStr);
    if (!fixtureId) {
      logger.info(`[API-Football] No se encontró fixture para ${homeTeam} vs ${awayTeam} el ${dateStr}`);
      return null;
    }

    const res = await axios.get(`${API_URL}/odds?fixture=${fixtureId}`, { headers, timeout: 10000 });
    const responseData = res.data.response;

    if (!responseData || responseData.length === 0) {
      logger.info(`[API-Football] No hay cuotas publicadas para fixture ${fixtureId}`);
      return null;
    }

    // Tomar el primer bookmaker disponible (preferiblemente bet365 si existe, sino el primero)
    const bookmakers = responseData[0].bookmakers;
    let targetBookmaker = bookmakers.find(b => b.id === 8 || b.name.toLowerCase() === 'bet365');
    if (!targetBookmaker) targetBookmaker = bookmakers[0];

    let home, draw, away, overOdds, underOdds;

    // Extraer Match Winner (id: 1)
    const winnerMarket = targetBookmaker.bets.find(b => b.id === 1 || b.name === 'Match Winner');
    if (winnerMarket) {
      const vHome = winnerMarket.values.find(v => v.value === 'Home');
      const vDraw = winnerMarket.values.find(v => v.value === 'Draw');
      const vAway = winnerMarket.values.find(v => v.value === 'Away');
      if (vHome) home = parseFloat(vHome.odd);
      if (vDraw) draw = parseFloat(vDraw.odd);
      if (vAway) away = parseFloat(vAway.odd);
    }

    // Extraer Goals Over/Under (id: 5)
    const ouMarket = targetBookmaker.bets.find(b => b.id === 5 || b.name === 'Goals Over/Under');
    if (ouMarket) {
      const vOver = ouMarket.values.find(v => v.value === 'Over 2.5');
      const vUnder = ouMarket.values.find(v => v.value === 'Under 2.5');
      if (vOver) overOdds = parseFloat(vOver.odd);
      if (vUnder) underOdds = parseFloat(vUnder.odd);
    }

    if (!home || !away) return null; // Si no pudimos armar el 1X2 al menos, fallar.

    logger.info(`[API-Football] Cuotas extraídas exitosamente para ${homeTeam} vs ${awayTeam}`);
    return {
      home,
      draw,
      away,
      overUnder: 2.5,
      overOdds: overOdds || null,
      underOdds: underOdds || null
    };
  } catch (error) {
    logger.error(`[API-Football] Error obteniendo cuotas: ${error.message}`);
    return null;
  }
}

module.exports = {
  getMatchOdds,
  findFixtureId
};
