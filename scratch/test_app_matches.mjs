import { 
  calculateFormScore, 
  calculateOverUnder, 
  analyzeH2H, 
  analyzeGoalsByTimeSlot, 
  calcMatchProbabilities,
  generatePicks 
} from '../src/services/analysisEngine.js';

const ALLOWED_LEAGUES = {
  // TIER 1
  'eng.1': 'Premier League (Inglaterra)',
  'esp.1': 'LaLiga (España)',
  'ger.1': 'Bundesliga (Alemania)',
  'ita.1': 'Serie A (Italia)',
  'uefa.champions': 'Champions League',
  'uefa.europa': 'Europa League',
  'uefa.europa.conf': 'Conference League',
  // TIER 2
  'por.1': 'Primeira Liga (Portugal)',
  'ned.1': 'Eredivisie (Holanda)',
  'bra.1': 'Brasileirão (Brasil)'
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
  return res.json();
}

async function getAppMatches(dateStr) {
  let allMatches = [];
  for (const slug of Object.keys(ALLOWED_LEAGUES)) {
    try {
      const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateStr}`);
      data.events?.forEach(ev => {
        if (ev.competitions?.[0]?.status?.type?.completed || ev.status?.type?.completed) {
          ev._leagueName = ALLOWED_LEAGUES[slug];
          allMatches.push(ev);
        }
      });
    } catch (e) {
      // Ignorar ligas sin partidos
    }
  }
  return allMatches;
}

// Emula el backend schedule fetcher (simplificado para obtener ultimos 10 completados)
async function getTeamSchedule(teamId) {
  try {
    const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${teamId}/schedule`);
    let evs = [];
    data.events?.forEach(e => {
      if (e.competitions?.[0]?.status?.type?.completed) {
        evs.push(e);
      }
    });
    return evs.sort((a,b) => new Date(b.date) - new Date(a.date));
  } catch(e) { return []; }
}

function mapEventToMatch(ev) {
  const comp = ev.competitions?.[0];
  const homeC = comp?.competitors?.find(c => c.homeAway === 'home');
  const awayC = comp?.competitors?.find(c => c.homeAway === 'away');
  const getScore = (c) => parseInt(c?.score?.value ?? c?.score ?? 0);
  const getName = (c) => c?.team?.displayName || c?.team?.name || '?';
  return {
    fixture: { id: ev.id, date: ev.date, status: { short: 'FT' } },
    league: { name: ev.league?.name || ev.season?.displayName || 'Desconocido' },
    teams: { 
      home: { id: homeC?.id, name: getName(homeC), winner: homeC?.winner }, 
      away: { id: awayC?.id, name: getName(awayC), winner: awayC?.winner } 
    },
    goals: { home: getScore(homeC), away: getScore(awayC) }
  };
}

function enrichMatch(m, teamId) {
  const isHome = String(m.teams?.home?.id) === String(teamId);
  const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
  const result = isHome
    ? winner === 'home' ? 'W' : winner === 'draw' ? 'D' : 'L'
    : winner === 'away' ? 'W' : winner === 'draw' ? 'D' : 'L';
  return { ...m, _isHome: isHome, _result: result };
}

async function analyzeMatch(ev) {
  const id = ev.id;
  const comp = ev.competitions?.[0];
  const homeC = comp?.competitors?.find(c => c.homeAway === 'home');
  const awayC = comp?.competitors?.find(c => c.homeAway === 'away');
  
  const homeId = homeC?.team?.id;
  const awayId = awayC?.team?.id;
  
  if (!homeId || !awayId) return null;

  try {
    const summary = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${id}`);
    const [homeSchRes, awaySchRes] = await Promise.all([getTeamSchedule(homeId), getTeamSchedule(awayId)]);
    
    const hm = homeSchRes.filter(e => String(e.id) !== String(id)).map(e => enrichMatch(mapEventToMatch(e), homeId));
    const am = awaySchRes.filter(e => String(e.id) !== String(id)).map(e => enrichMatch(mapEventToMatch(e), awayId));

    const h2hEvents = summary.headToHeadGames?.[0]?.events || [];
    const h2hTeamA = summary.headToHeadGames?.[0]?.team;
    const resolveName = (obj) => obj?.displayName || obj?.name || '?';
    
    const h2h = h2hEvents.map(e => {
      const hg = parseInt(e.homeTeamScore ?? 0);
      const ag = parseInt(e.awayTeamScore ?? 0);
      const teamA_id = String(h2hTeamA?.id);
      let homeName = '', awayName = '', homeIdStr = '', awayIdStr = '';
      if (String(e.homeTeamId) === teamA_id) {
        homeName  = resolveName(h2hTeamA);
        awayName  = resolveName(e.opponent);
        homeIdStr = teamA_id;
        awayIdStr = String(e.opponent?.id);
      } else {
        homeName  = resolveName(e.opponent);
        awayName  = resolveName(h2hTeamA);
        homeIdStr = String(e.opponent?.id);
        awayIdStr = teamA_id;
      }
      return {
        fixture: { date: e.date },
        teams: {
          home: { id: homeIdStr, name: homeName, winner: hg > ag },
          away: { id: awayIdStr, name: awayName, winner: ag > hg }
        },
        goals: { home: hg, away: ag }
      };
    });

    const homeForm = calculateFormScore(hm, homeId);
    const awayForm = calculateFormScore(am, awayId);
    const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
    const awayFormAway = calculateFormScore(am, awayId, 'away');
    const homeSplit = calculateOverUnder(hm, homeId);
    const awaySplit = calculateOverUnder(am, awayId);
    const h2hData = analyzeH2H(h2h, homeId, awayId);
    
    const poisson = calcMatchProbabilities(
      (homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1)),
      (homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1)),
      (awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1)),
      (awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1))
    );

    let marketOdds = null;
    if (summary.pickcenter?.length > 0) {
      const item = summary.pickcenter[0];
      const getDec = (o) => {
        if (!o) return null;
        const val = parseFloat(o.value || o.moneyLine || 0);
        if (val > 0) return (val / 100) + 1;
        if (val < 0) return (100 / Math.abs(val)) + 1;
        return null;
      };
      marketOdds = { home: getDec(item.homeTeamOdds), away: getDec(item.awayTeamOdds), draw: getDec(item.drawOdds) };
    }

    let advancedStats = null;
    const box = summary.boxscore?.teams;
    if (box && box.length === 2) {
      const getStat = (t, name) => parseFloat(t.statistics?.find(s=>s.name === name)?.displayValue || 0);
      const homeBox = box.find(t => String(t.team?.id) === String(homeId));
      const awayBox = box.find(t => String(t.team?.id) === String(awayId));
      if (homeBox && awayBox) {
        advancedStats = {
          home: { xG: getStat(homeBox, 'expectedGoals') },
          away: { xG: getStat(awayBox, 'expectedGoals') }
        };
      }
    }

    const picksRes = generatePicks({
      homeStats: null, awayStats: null,
      h2hData, homeForm, awayForm,
      homeSplitStats: homeSplit, awaySplitStats: awaySplit,
      isLive: false, liveClock: "0'", liveHomeGoals: 0, liveAwayGoals: 0,
      homeFormAtHome, awayFormAway,
      poissonProbs: poisson,
      marketOdds, advancedStats,
      injuries: summary.injuries || [],
      homeTeamName: homeC.team.name,
      awayTeamName: awayC.team.name,
      leagueName: ev._leagueName || ''
    });

    return {
      match: `${homeC.team.name} vs ${awayC.team.name}`,
      league: ev._leagueName,
      result: `${comp.competitors.find(c=>c.homeAway==='home').score} - ${comp.competitors.find(c=>c.homeAway==='away').score}`,
      picks: picksRes.picks,
      realHG: parseInt(comp.competitors.find(c=>c.homeAway==='home').score),
      realAG: parseInt(comp.competitors.find(c=>c.homeAway==='away').score)
    };
  } catch (e) {
    return null;
  }
}

async function run() {
  console.log('Fetching matches for 20260502 strictly from ALLOWED_LEAGUES...');
  const matches = await getAppMatches('20260502');
  console.log(`Found ${matches.length} matches shown on the app.\n`);
  
  let totalPicks = 0;
  let wonPicks = 0;

  for (const m of matches) {
    const res = await analyzeMatch(m);
    if (res && res.picks.length > 0) {
      console.log(`============================`);
      console.log(`⚽ ${res.match} (${res.league}) | RESULTADO REAL: ${res.result}`);
      
      const hg = res.realHG;
      const ag = res.realAG;
      const tg = hg + ag;
      const btts = hg > 0 && ag > 0;
      const homeWin = hg > ag;
      const awayWin = ag > hg;
      const draw = hg === ag;

      res.picks.forEach(p => {
        let won = false;
        if (p.selection.includes('Más de 1.5')) won = tg > 1.5;
        else if (p.selection.includes('Más de 2.5')) won = tg > 2.5;
        else if (p.selection.includes('Más de 3.5')) won = tg > 3.5;
        else if (p.selection.includes('Menos de 2.5')) won = tg < 2.5;
        else if (p.selection.includes('Menos de 3.5')) won = tg < 3.5;
        else if (p.selection.includes('Local o Empate')) won = homeWin || draw;
        else if (p.selection.includes('Visitante o Empate')) won = awayWin || draw;
        else if (p.selection.includes('Victoria Local')) won = homeWin;
        else if (p.selection.includes('Victoria Visitante')) won = awayWin;
        else if (p.selection === 'Empate') won = draw;
        else if (p.selection.includes('Ambos Marcan')) won = btts;
        else if (p.selection.includes('Combo')) won = btts && tg > 2.5;
        else if (p.selection.includes('Local -0.5')) won = homeWin;
        else if (p.selection.includes('Visitante -0.5')) won = awayWin;

        if (p.tier !== '🔥') { // skip live strategies
          totalPicks++;
          if (won) wonPicks++;
          console.log(`  [${won ? '✅ GANADO' : '❌ PERDIDO'}] ${p.selection}`);
        }
      });
      console.log('');
    } else if (res) {
      // Partido parseado pero sin picks (ej. falta de datos o límite de 6 partidos)
      console.log(`============================`);
      console.log(`⚽ ${res.match} (${res.league}) | RESULTADO REAL: ${res.result}`);
      console.log(`  [⚠️ Sin predicciones publicadas por falta de historial suficiente]`);
      console.log('');
    }
  }

  console.log(`🏆 RESUMEN FINAL DE LA APP (2 DE MAYO DE 2026)`);
  console.log(`Partidos analizados con picks: ${totalPicks > 0 ? 'Sí' : 'No'}`);
  console.log(`Total Predicciones Publicadas: ${totalPicks}`);
  console.log(`Predicciones Ganadas: ${wonPicks}`);
  console.log(`Predicciones Perdidas: ${totalPicks - wonPicks}`);
  console.log(`Porcentaje de Aciertos: ${totalPicks > 0 ? ((wonPicks / totalPicks)*100).toFixed(1) : 0}%`);
}

run();
