const axios = require('axios');

// Copy of the analysis engine logic
function calculateFormScore(matches, teamId) {
  if (!matches || matches.length === 0) return { score: 0, label: 'Sin datos', wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, total: 0 };
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  const weights = [3, 3, 2, 2, 1, 1, 1, 1, 1, 1];
  let weightedScore = 0, totalWeight = 0;
  matches.slice(0, 10).forEach((m, i) => {
    const w = weights[i] || 1;
    const isHome = m.teams?.home?.id === teamId;
    const homeGoals = m.goals?.home ?? 0;
    const awayGoals = m.goals?.away ?? 0;
    const gf = isHome ? homeGoals : awayGoals;
    const ga = isHome ? awayGoals : homeGoals;
    goalsFor += gf; goalsAgainst += ga;
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
  return { score, label, wins, draws, losses, goalsFor, goalsAgainst, total: matches.length };
}

function calculateOverUnder(matches, teamId) {
  const result = { over15: 0, over25: 0, over35: 0, btts: 0, total: 0 };
  if (!matches || matches.length === 0) return result;
  matches.slice(0, 10).forEach(m => {
    const hg = m.goals?.home ?? 0; const ag = m.goals?.away ?? 0;
    const total = hg + ag;
    const isHome = m.teams?.home?.id === teamId;
    const gf = isHome ? hg : ag; const ga = isHome ? ag : hg;
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

async function test() {
  const fixtureId = '401857469';
  const summaryRes = await axios.get(`http://localhost:3001/api/espn/summary/${fixtureId}`);
  const summary = summaryRes.data;
  const homeComp = summary.header.competitions[0].competitors.find(c => c.homeAway === 'home');
  const awayComp = summary.header.competitions[0].competitors.find(c => c.homeAway === 'away');
  const homeId = homeComp.id;
  const awayId = awayComp.id;

  const [homeSchRes, awaySchRes] = await Promise.all([
    axios.get(`http://localhost:3001/api/espn/team/${homeId}/schedule`),
    axios.get(`http://localhost:3001/api/espn/team/${awayId}/schedule`)
  ]);
  const homeSch = homeSchRes.data;
  const awaySch = awaySchRes.data;

  const mapEventToMatch = (ev) => {
    const comp = ev.competitions?.[0];
    const homeC = comp?.competitors?.find(c => c.homeAway === 'home');
    const awayC = comp?.competitors?.find(c => c.homeAway === 'away');
    const getScore = (c) => { const v = c?.score?.value ?? c?.score ?? 0; return parseInt(v); };
    return {
      fixture: { id: ev.id, date: ev.date, status: { short: 'FT' } },
      teams: { 
        home: { id: homeC?.id, name: homeC?.team?.shortDisplayName, winner: homeC?.winner }, 
        away: { id: awayC?.id, name: awayC?.team?.shortDisplayName, winner: awayC?.winner } 
      },
      goals: { home: getScore(homeC), away: getScore(awayC) }
    };
  };

  const hm = (homeSch.events || []).filter(e => e.competitions?.[0]?.status?.type?.state === 'post').map(e => mapEventToMatch(e)).reverse().slice(0, 10);
  const am = (awaySch.events || []).filter(e => e.competitions?.[0]?.status?.type?.state === 'post').map(e => mapEventToMatch(e)).reverse().slice(0, 10);

  console.log('\n=== HOME RECENT MATCHES ===');
  hm.forEach(m => console.log(`  ${m.teams.home.name} ${m.goals.home} - ${m.goals.away} ${m.teams.away.name} | home_winner:${m.teams.home.winner}`));

  console.log('\n=== AWAY RECENT MATCHES ===');
  am.forEach(m => console.log(`  ${m.teams.home.name} ${m.goals.home} - ${m.goals.away} ${m.teams.away.name} | away_winner:${m.teams.away.winner}`));

  const homeForm = calculateFormScore(hm, homeId);
  const awayForm = calculateFormScore(am, awayId);
  const homeSplit = calculateOverUnder(hm, homeId);
  const awaySplit = calculateOverUnder(am, awayId);

  console.log('\n=== FORM SCORES ===');
  console.log('Home form:', homeForm);
  console.log('Away form:', awayForm);
  console.log('Home over/under:', homeSplit);
  console.log('Away over/under:', awaySplit);
}

test().catch(console.error);
