import fs from 'fs';

// Read the engine file
let engineCode = fs.readFileSync('../src/services/analysisEngine.js', 'utf8');

// Fix relative imports
engineCode = engineCode.replace(/from\s+['"]\.\/([^'"]+)['"]/g, "from '../src/services/$1'");

// Inject a logger for allPicks before finalPicks filtering
const target = 'const finalPicks  = [';
if (engineCode.includes(target)) {
  engineCode = engineCode.replace(
    target,
    'console.log("=== FILTERED PICKS ===", JSON.stringify(filtered, null, 2));\nconst finalPicks  = ['
  );
} else {
  console.error("Target not found!");
}

// Inject a logger for raw picks before filtering
const filterTarget = 'let filtered = picks.filter(';
if (engineCode.includes(filterTarget)) {
  engineCode = engineCode.replace(
    filterTarget,
    'console.log("=== RAW PICKS ===", JSON.stringify(picks, null, 2));\nlet filtered = picks.filter('
  );
} else {
  console.error("Filter target not found!");
}

// Save modified engine as a temp file
fs.writeFileSync('./tempEngine.mjs', engineCode);

// Create the runner
const runnerCode = `
import { calculateFormScore, calculateOverUnder, analyzeGoalsByTimeSlot, analyzeH2H, generatePicks, calcMatchProbabilities } from './tempEngine.mjs';

async function run() {
  const res = await fetch('http://localhost:3001/api/fixtures/date/2026-05-18');
  const d = await res.json();
  const match = d.data.find(m => m.teams.home.name.toLowerCase().includes('arsenal') || m.teams.away.name.toLowerCase().includes('arsenal'));
  if (!match) return;

  const adRes = await fetch('http://localhost:3001/api/espn/match/' + match.fixture.id + '/analysis');
  const adJson = await adRes.json();
  const ad = adJson.data;

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

  generatePicks({
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
}
run().catch(console.error);
`;

fs.writeFileSync('./tempRunner.mjs', runnerCode);
console.log("Ready to run tempRunner.mjs");
