import fs from 'fs';
import { calculateFormScore, calculateOverUnder, analyzeGoalsByTimeSlot, analyzeH2H, generatePicks, calcMatchProbabilities } from '../src/services/analysisEngine.js';

async function test() {
  const res = await fetch('http://localhost:3001/api/fixtures/date/2026-05-18');
  const d = await res.json();
  const match = d.data[0];
  const adRes = await fetch('http://localhost:3001/api/espn/match/' + match.fixture.id + '/analysis');
  const adJson = await adRes.json();
  const ad = adJson.data;

  const homeId = match.teams.home.id;
  const awayId = match.teams.away.id;
  const hm = ad.homeMatches;
  const am = ad.awayMatches;

  const homeForm = calculateFormScore(hm, homeId);
  const awayForm = calculateFormScore(am, awayId);
  const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
  const awayFormAway = calculateFormScore(am, awayId, 'away');
  const homeSplit = calculateOverUnder(hm, homeId);
  const awaySplit = calculateOverUnder(am, awayId);
  const h2hData = analyzeH2H(ad.h2h, homeId, awayId);
  const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
  const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);
  const poisson = calcMatchProbabilities(1.5, 1.0, 1.2, 1.5); // dummy

  const picksRes = generatePicks({
    homeStats: null, awayStats: null,
    h2hData, homeForm, awayForm,
    homeSplitStats: homeSplit, awaySplitStats: awaySplit,
    isLive: false, liveClock: "0'", liveHomeGoals: 0, liveAwayGoals: 0,
    marketInsight: ad.marketInsight,
    homeCornersData: ad.homeCornersData,
    awayCornersData: ad.awayCornersData,
    homeCardsData: ad.homeCardsData,
    awayCardsData: ad.awayCardsData,
    homeSlots, awaySlots,
    homeFormAtHome, awayFormAway,
    poissonProbs: poisson,
    injuries: ad.injuries,
    homeTeamName: match.teams.home.name,
    awayTeamName: match.teams.away.name,
    leagueName: match.league.name,
    homeRestDays: 7, awayRestDays: 7,
    homeHistory: hm, awayHistory: am,
    city: null, marketOdds: ad.marketOdds,
    matchStandings: ad.matchStandings,
    advancedStats: ad.advancedStats,
    refereeStats: ad.refereeStats,
  });

  console.log(JSON.stringify(picksRes, null, 2));
}
test().catch(console.error);
