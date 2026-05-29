import { generatePicks } from '../src/services/analysisEngine.js';

// Simulamos un partido donde Manchester City (local) es un favorito masivo 
// contra Sheffield United (visitante), pero Sheffield tiene una defensa decente.
const mockData = {
  homeTeamName: "Manchester City",
  awayTeamName: "Sheffield United",
  homeForm: { total: 10, wins: 8, draws: 1, losses: 1, goalsFor: 25, goalsAgainst: 8, score: 85 },
  awayForm: { total: 10, wins: 2, draws: 4, losses: 4, goalsFor: 8, goalsAgainst: 12, score: 35 }, // avgGA: 1.2 -> solid defense
  h2hData: { matches: 5, homeWinPct: 80, drawPct: 20, awayWinPct: 0, avgGoals: 2.4, bttsPct: 20, over25Pct: 40, over15Pct: 80 },
  poissonProbs: { home: 85, draw: 10, away: 5 },
  projectedGoals: 2.8,
  homeSplitStats: { over25Pct: 80, over15Pct: 100, over35Pct: 40, bttsPct: 40 },
  awaySplitStats: { over25Pct: 30, over15Pct: 60, over35Pct: 10, bttsPct: 40 },
  homeFormAtHome: { total: 5, wins: 5, draws: 0, losses: 0, goalsFor: 15, goalsAgainst: 2, score: 95 },
  awayFormAway: { total: 5, wins: 1, draws: 2, losses: 2, goalsFor: 3, goalsAgainst: 5, score: 40 },
  marketInsight: {
    predictions: { percent: { home: 88, draw: 8, away: 4 } }
  },
  marketOdds: {
    home: 1.15, // Favorito masivo (<= 1.25)
    draw: 7.50,
    away: 15.00,
    homeMoneyLine: -666, // -450 o menos -> favorito masivo
    awayMoneyLine: 1400
  },
  isLive: false,
  leagueName: "Premier League",
  matchStandings: { total: 20, homeRank: 1, awayRank: 18 }
};

const result = generatePicks(
  mockData.homeForm, mockData.awayForm, mockData.h2hData, mockData.poissonProbs, mockData.projectedGoals,
  mockData.homeSplitStats, mockData.awaySplitStats, mockData.homeTeamName, mockData.awayTeamName,
  mockData.marketInsight, mockData.homeFormAtHome, mockData.awayFormAway,
  mockData.isLive, 0, 0, 0, // liveClock, liveHomeGoals, liveAwayGoals
  null, null, null, null, null, // liveInsights, matchStandings, homeHistory, awayHistory, refereeStats
  null, null, null, null, null, null, // homeCornersData, awayCornersData, homeCardsData, awayCardsData, homeShotsData, awayShotsData
  null, // advancedStats
  mockData.marketOdds, // marketOdds (AÑADIDO PARA HA)
  mockData.leagueName
);

console.log(JSON.stringify(result.picks.filter(p => p.market === 'Handicap Asiático'), null, 2));
