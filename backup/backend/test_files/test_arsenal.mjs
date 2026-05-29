import fs from 'fs';
import { calculateFormScore, calculateOverUnder, analyzeGoalsByTimeSlot, analyzeH2H, generatePicks, calcMatchProbabilities } from '../src/services/analysisEngine.js';

async function run() {
  const res = await fetch('http://localhost:3001/api/fixtures/date/2026-05-18');
  const d = await res.json();
  const match = d.data.find(m => m.teams.home.name.toLowerCase().includes('arsenal') || m.teams.away.name.toLowerCase().includes('arsenal'));
  if (!match) {
    console.log("No se encontró el partido de Arsenal en la fecha.");
    return;
  }
  console.log("Partido:", match.teams.home.name, "vs", match.teams.away.name, "- ID:", match.fixture.id);

  const adRes = await fetch('http://localhost:3001/api/espn/match/' + match.fixture.id + '/analysis');
  const adJson = await adRes.json();
  const ad = adJson.data;

  console.log("Data availability:");
  console.log("- Lesiones:", ad.injuries?.length || 0);
  console.log("- Tarjetas Local:", !!ad.homeCardsData);
  console.log("- Corners Local:", !!ad.homeCornersData);
  console.log("- Historial Local:", ad.homeMatches?.length || 0);
  console.log("- Historial Visitante:", ad.awayMatches?.length || 0);
  console.log("- H2H:", ad.h2h?.length || 0);

  const homeId = match.teams.home.id;
  const awayId = match.teams.away.id;
  const hm = ad.homeMatches || [];
  const am = ad.awayMatches || [];

  const homeForm = calculateFormScore(hm, homeId);
  const awayForm = calculateFormScore(am, awayId);
  const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
  const awayFormAway = calculateFormScore(am, awayId, 'away');
  const homeSplit = calculateOverUnder(hm, homeId);
  const awaySplit = calculateOverUnder(am, awayId);
  const h2hData = analyzeH2H(ad.h2h || [], homeId, awayId);
  const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs || [], homeId);
  const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs || [], awayId);
  
  const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
  const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
  const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
  const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
  const realPoisson = calcMatchProbabilities(hGF, hGA, aGF, aGA);

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
    poissonProbs: realPoisson,
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

  console.log("=== CONCLUSIÓN DEL MOTOR ===");
  console.log(JSON.stringify(picksRes, null, 2));
}
run().catch(console.error);
