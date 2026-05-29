import { checkCalendarFatigue, checkInternationalHangover, checkACLCongestion, checkAltitudeRisk, checkConmebolTravelAndClimateRisk, checkSniperCleanSheetGuard, isDerbyMatch, PERU_BIG3_NAMES, HIERARCHY_TEAMS, BRAZILIAN_TOP_TEAMS, SOUTH_COLD_TEAMS } from './contextFactors.js';


export function evaluateMatchState(args) {
  const {
    homeForm, awayForm, isLive, matchStandings, injuries,
    homeTeamName, awayTeamName, leagueName, city, 
    advancedStats, rosters, homeRestDays, awayRestDays,
    homeHistory, awayHistory, homeFormAtHome, awayFormAway,
    h2hData
  } = args;

  const minMatches = 6;
  const homeTotal = homeForm.total || 0;
  const awayTotal = awayForm.total || 0;
  
  const isDerby = isDerbyMatch(homeTeamName, awayTeamName);
  const isCupMatch = /cup|copa|taça|pokal|coppa|friendl|libertadores|sudamericana|conmebol/i.test(leagueName);
  const isConmebolCup = /libertadores|sudamericana|conmebol/i.test(leagueName);
  const isSudamericana = /sudamericana/i.test(leagueName);
  
  if (!isLive && (homeTotal < minMatches || awayTotal < minMatches)) {
    const minTeam = homeTotal < awayTotal ? `Local (${homeTotal} PJ)` : `Visitante (${awayTotal} PJ)`;
    return { abort: true, reason: `El equipo ${minTeam} registra muy pocos partidos en el año actual. No es recomendable apostar sin datos suficientes.` };
  }

  const isLiga1Peru = /liga 1|liga1|peru|perú/i.test(leagueName);
  const isLaLiga = /laliga|la liga|spain|españa|esp\.1|primera.*división/i.test(leagueName);
  const isSaudi = /saudi|arabia/i.test(leagueName);
  const isMLS = /mls|major league soccer|usa\.1/i.test(leagueName);

  let laLigaRelegationZone = false;
  if (isLaLiga && matchStandings && matchStandings.total >= 18) {
    const tot = matchStandings.total;
    laLigaRelegationZone = matchStandings.homeRank >= tot - 2 || matchStandings.awayRank >= tot - 2;
  }
  const LALIGA_GIANTS = ['real madrid', 'barcelona', 'atlético madrid', 'atletico madrid', 'sevilla', 'real sociedad', 'villarreal', 'athletic'];
  const homeIsLaLigaGiant = isLaLiga && LALIGA_GIANTS.some(t => homeTeamName.toLowerCase().includes(t));
  const awayIsLaLigaGiant = isLaLiga && LALIGA_GIANTS.some(t => awayTeamName.toLowerCase().includes(t));

  const homeFatigue = checkCalendarFatigue(homeHistory);
  const awayFatigue = checkCalendarFatigue(awayHistory);
  const altitudeRisk = checkAltitudeRisk(awayTeamName, city, homeTeamName, isCupMatch);
  const conmebolTravelClimate = isConmebolCup ? checkConmebolTravelAndClimateRisk(awayTeamName, city) : null;

  const homeHangover = checkInternationalHangover(homeTeamName, homeHistory);
  const awayHangover = checkInternationalHangover(awayTeamName, awayHistory);

  const homeACL = checkACLCongestion(homeTeamName, homeHistory);
  const awayACL = checkACLCongestion(awayTeamName, awayHistory);
  const homeACLPenalty = homeACL.isAtRisk ? 18 : 0;
  const awayACLPenalty = awayACL.isAtRisk ? 18 : 0;

  let homeFatiguePenalty = homeFatigue ? 12 : 0;
  let awayFatiguePenalty = awayFatigue ? 12 : 0;
  homeFatiguePenalty = Math.max(homeFatiguePenalty, homeHangover.penalty) + homeACLPenalty;
  awayFatiguePenalty = Math.max(awayFatiguePenalty, awayHangover.penalty) + awayACLPenalty;

  const isAwayBig3Visitor = PERU_BIG3_NAMES.some(t => awayTeamName.toLowerCase().includes(t));
  const awayAvgPossession = advancedStats?.away?.possession ?? null;
  let altitudeSofteningNote = '';
  let altitudeSoftening = 0;
  if (isLiga1Peru && isAwayBig3Visitor && altitudeRisk === 'high' && awayAvgPossession !== null && awayAvgPossession > 60) {
    altitudeSoftening = 8; 
    altitudeSofteningNote = `Posesión visitante alta (${awayAvgPossession}%) modera el impacto de la altura.`;
  }

  let altitudePenalty = altitudeRisk === 'high' ? (28 - altitudeSoftening) 
                      : altitudeRisk === 'medium' ? 18 
                      : altitudeRisk === 'extreme' ? 45 
                      : 0;

  const homeAvgGF = homeForm.total > 0 ? +(homeForm.goalsFor  / homeForm.total).toFixed(2) : 0;
  const homeAvgGA = homeForm.total > 0 ? +(homeForm.goalsAgainst / homeForm.total).toFixed(2) : 0;
  const awayAvgGF = awayForm.total > 0 ? +(awayForm.goalsFor  / awayForm.total).toFixed(2) : 0;
  const awayAvgGA = awayForm.total > 0 ? +(awayForm.goalsAgainst / awayForm.total).toFixed(2) : 0;

  const minSample = Math.min(homeTotal, awayTotal);
  const dynamicMinProb = minSample >= 12 ? 75 : minSample >= 10 ? 76 : minSample >= 8  ? 78 : 80;

  const homeInjuries = injuries.filter(inj => inj.team?.name && homeTeamName && inj.team.name.toLowerCase().includes(homeTeamName.toLowerCase().split(' ')[0])).length;
  const awayInjuries = injuries.filter(inj => inj.team?.name && homeTeamName && !inj.team.name.toLowerCase().includes(homeTeamName.toLowerCase().split(' ')[0])).length;

  const homeInjPenalty  = Math.min(homeInjuries * 0.08, 0.40);
  const awayInjPenalty  = Math.min(awayInjuries  * 0.08, 0.40);
  const homeFormPenalty = Math.min(homeInjuries * 3, 12);
  const awayFormPenalty = Math.min(awayInjuries  * 3, 12);

  let homeLineupNote = '', awayLineupNote = '', homeRosterGoalsPenalty = 0, awayRosterGoalsPenalty = 0;
  if (rosters && rosters.length === 2) {
    const analyzeRoster = (rosterEntry) => {
      const starters = (rosterEntry.roster || []).filter(p => p.starter);
      const getGoals = (p) => {
        const stat = (p.stats || []).find(s => s.name === 'totalGoals');
        return stat ? parseFloat(stat.value || 0) : 0;
      };
      const attackers = (rosterEntry.roster || []).filter(p => {
        const pos = p.position?.abbreviation?.toUpperCase();
        return pos === 'F' || pos === 'FW' || pos === 'MF' || pos === 'M';
      });
      if (!attackers.length) return null;
      const topScorer = attackers.reduce((best, p) => getGoals(p) > getGoals(best) ? p : best, attackers[0]);
      const topGoals  = getGoals(topScorer);
      if (topGoals < 2) return null; 
      const name = topScorer.athlete?.displayName || 'Goleador clave';
      const isStarting = starters.some(p => p.athlete?.id === topScorer.athlete?.id);
      if (!isStarting) return { name, goals: topGoals, note: `[📋 ALINEACIÓN] ${name} (${topGoals} goles) no figura en el XI titular.` };
      return null;
    };
    const homeRosterEntry = rosters.find(r => r.homeAway === 'home') || rosters[0];
    const awayRosterEntry = rosters.find(r => r.homeAway === 'away') || rosters[1];
    const homeAbsent = analyzeRoster(homeRosterEntry);
    const awayAbsent = analyzeRoster(awayRosterEntry);
    if (homeAbsent) { homeRosterGoalsPenalty = 0.15; homeLineupNote = homeAbsent.note; }
    if (awayAbsent) { awayRosterGoalsPenalty = 0.15; awayLineupNote = awayAbsent.note; }
  }

  const calcRestPenalty = (days) => {
    if (days === null || days === undefined) return { goalsPenalty: 0, formPenalty: 0, label: '' };
    if (days <= 2)  return { goalsPenalty: 0.15, formPenalty: 8,  label: `⚠️ Cansancio crítico (${days}d)` };
    if (days <= 4)  return { goalsPenalty: 0.06, formPenalty: 3,  label: `⚠️ Poco descanso (${days}d)` };
    return { goalsPenalty: 0, formPenalty: 0, label: '' };
  };
  const homeRest = calcRestPenalty(homeRestDays);
  const awayRest = calcRestPenalty(awayRestDays);

  let xGBoostHome = 0, xGBoostAway = 0;
  if (advancedStats?.home?.xG) xGBoostHome = (advancedStats.home.xG - homeAvgGF) * 0.25; 
  if (advancedStats?.away?.xG) xGBoostAway = (advancedStats.away.xG - awayAvgGF) * 0.25;

  let homeMotivPenalty = 0, awayMotivPenalty = 0, homeMotivNote = '', awayMotivNote = '', relaxationGoalsPenalty = 0;
  let survivalBoost1X = 0, survivalBoostHomeWin = 0, survivalBoostX2 = 0, survivalBoostAwayWin = 0;

  const calcFightIndex = (history, teamId) => {
    if (!history || history.length === 0) return 0.5;
    const recent = history.slice(0, 8);
    let unbeaten = 0, wins = 0;
    recent.forEach(m => {
      const isHome = String(m.teams?.home?.id) === String(teamId);
      const hw = m.teams?.home?.winner, aw = m.teams?.away?.winner;
      const winner = hw ? 'home' : aw ? 'away' : 'draw';
      const result = isHome ? (winner === 'home' ? 'W' : winner === 'draw' ? 'D' : 'L') : (winner === 'away' ? 'W' : winner === 'draw' ? 'D' : 'L');
      if (result === 'W' || result === 'D') unbeaten++;
      if (result === 'W') wins++;
    });
    return Math.min((unbeaten / recent.length) * 0.8 + (wins / recent.length) * 0.2, 1);
  };

  const hasRelegationSystem = !isMLS;
  if (hasRelegationSystem && matchStandings && matchStandings.total >= 10) {
    const tot = matchStandings.total, hr = matchStandings.homeRank, ar = matchStandings.awayRank;
    const isRelegation = (r) => r >= tot - 5, isTop = (r) => r <= 4, isClinched = (r) => r <= 1, isMidTable = (r) => r > 4 && r < tot - 5;

    const homeFightIndex = isRelegation(hr) ? calcFightIndex(homeHistory, homeHistory?.[0]?.teams?.home?.id || homeHistory?.[0]?.teams?.away?.id) : 1.0;
    const awayFightIndex = isRelegation(ar) ? calcFightIndex(awayHistory, awayHistory?.[0]?.teams?.home?.id || awayHistory?.[0]?.teams?.away?.id) : 1.0;
    const awayObjective = isTop(ar) ? (isClinched(ar) ? 'vacation' : 'fighting') : 'neutral';
    const homeObjective = isTop(hr) ? (isClinched(hr) ? 'vacation' : 'fighting') : 'neutral';

    if (isRelegation(hr) && (isTop(ar) || isMidTable(ar))) {
      if (awayObjective === 'vacation' || isMidTable(ar)) {
        homeMotivPenalty = -Math.round(homeFightIndex * 25);
        if (homeFightIndex >= 0.6) {
          relaxationGoalsPenalty = awayObjective === 'vacation' ? 0.55 : 0.35;
          homeMotivNote = `🔥 Supervivencia (FightIdx: ${(homeFightIndex * 100).toFixed(0)}%) vs Grande Relajado`;
          survivalBoost1X = Math.round(homeFightIndex * 50);
          survivalBoostHomeWin = Math.round(homeFightIndex * 30);
        } else {
          relaxationGoalsPenalty = 0.25;
          homeMotivNote = `💀 Colero Rendido`;
          survivalBoost1X = 10;
        }
        awayMotivNote = awayObjective === 'vacation' ? '😴 Grande de vacaciones' : '🧘 Visitante cómodo';
      } else if (awayObjective === 'fighting') {
        homeMotivPenalty = -Math.round(homeFightIndex * 12);
        homeMotivNote = `⚔️ Supervivencia Local vs Grande con Objetivos`;
        awayMotivNote = '🎯 Visitante motivado';
        survivalBoost1X = Math.round(homeFightIndex * 40);
        survivalBoostHomeWin = Math.round(homeFightIndex * 20);
      }
    } else if (isRelegation(ar) && (isTop(hr) || isMidTable(hr))) {
      if (homeObjective === 'vacation' || isMidTable(hr)) {
        awayMotivPenalty = -Math.round(awayFightIndex * 20);
        relaxationGoalsPenalty = homeObjective === 'vacation' ? 0.40 : 0.25;
        if (awayFightIndex >= 0.6) {
          awayMotivNote = `🔥 Visitante se juega la vida vs Local Relajado`;
          survivalBoostX2 = Math.round(awayFightIndex * 35);
          survivalBoostAwayWin = Math.round(awayFightIndex * 18);
        } else {
          awayMotivNote = `💀 Visitante casi rendido`;
          survivalBoostX2 = 8;
        }
        homeMotivNote = homeObjective === 'vacation' ? '😴 Local de vacaciones' : '🧘 Local cómodo';
      } else if (homeObjective === 'fighting') {
        awayMotivPenalty = -Math.round(awayFightIndex * 8);
        awayMotivNote = `⚔️ Visitante lucha pero el local tiene objetivos`;
        survivalBoostX2 = Math.round(awayFightIndex * 30);
        survivalBoostAwayWin = Math.round(awayFightIndex * 15);
      }
    }
  }

  const adjHomeAvgGF = Math.max(homeAvgGF - homeInjPenalty - homeRest.goalsPenalty + xGBoostHome - homeRosterGoalsPenalty, 0.3);
  const adjAwayAvgGF = Math.max(awayAvgGF - awayInjPenalty  - awayRest.goalsPenalty + xGBoostAway - awayRosterGoalsPenalty, 0.3);
  const adjHomeAvgGA = homeAvgGA, adjAwayAvgGA = awayAvgGA;

  const leagueAvg = isSaudi ? 1.48 : isLaLiga ? 1.18 : 1.3;
  const lambdaHome = (adjHomeAvgGF * adjAwayAvgGA) / leagueAvg;
  const lambdaAway = (adjAwayAvgGF * adjHomeAvgGA) / leagueAvg;
  const projectedGoals = Math.max(+(lambdaHome + lambdaAway - relaxationGoalsPenalty).toFixed(2), 0.5);

  const homeContextNote = [
    homeInjuries > 0 ? `${homeInjuries} baja(s)` : '', homeRest.label, homeHangover.note,
    advancedStats?.home?.xG ? `xG: ${advancedStats.home.xG}` : '', homeMotivNote,
  ].filter(Boolean).join(', ');
  const awayContextNote = [
    awayInjuries > 0 ? `${awayInjuries} baja(s)` : '', awayRest.label, awayHangover.note,
    advancedStats?.away?.xG ? `xG: ${advancedStats.away.xG}` : '', awayMotivNote, altitudeSofteningNote,
  ].filter(Boolean).join(', ');

  const homePythag = typeof calcPythagoreanExpectation !== 'undefined' ? calcPythagoreanExpectation(homeHistory, homeHistory?.[0]?.teams?.home?.id || null) : { adjustment: 0 };
  const awayPythag = typeof calcPythagoreanExpectation !== 'undefined' ? calcPythagoreanExpectation(awayHistory, awayHistory?.[0]?.teams?.home?.id || null) : { adjustment: 0 };
  const homeVolatility = typeof calcVolatilityIndex !== 'undefined' ? calcVolatilityIndex(homeHistory, homeHistory?.[0]?.teams?.home?.id || null) : { trustPenalty: 0 };
  const awayVolatility = typeof calcVolatilityIndex !== 'undefined' ? calcVolatilityIndex(awayHistory, awayHistory?.[0]?.teams?.home?.id || null) : { trustPenalty: 0 };

  const isHomeFortress = homeFormAtHome?.total >= 4 && homeFormAtHome?.losses === 0;
  let liga1HomeBonus = isLiga1Peru ? 18 : 0;
  const isSullanaHome = homeTeamName.toLowerCase().includes('alianza atletico');
  const isAwayUorAlianza = awayTeamName.toLowerCase().includes('universitario') || awayTeamName.toLowerCase().includes('alianza lima');
  if (isLiga1Peru && isSullanaHome && isAwayUorAlianza) liga1HomeBonus = 0;

  const isSyntheticHome = ['unión comercio', 'union comercio', 'chankas', 'los chankas'].some(t => homeTeamName.toLowerCase().includes(t));
  let syntheticPenalty = 0;
  if (isLiga1Peru && isSyntheticHome) {
    const isSyntheticAway = ['unión comercio', 'union comercio', 'chankas', 'los chankas'].some(t => awayTeamName.toLowerCase().includes(t));
    if (!isSyntheticAway) syntheticPenalty = 8;
  }

  let eloAdj = 0; // Simplified for now since we rely on the full engine implementation
  const eloCombined = calcCombinedProbs ? calcCombinedProbs({ homeTeamName, awayTeamName, homeAvgGF: adjHomeAvgGF, homeAvgGA: adjHomeAvgGA, awayAvgGF: adjAwayAvgGF, awayAvgGA: adjAwayAvgGA, homeHistory, awayHistory, isCupMatch, leagueName }) : null;
  if (eloCombined) {
    eloAdj = Math.min(Math.max(Math.round(eloCombined._elo.eloDiff / 50), -10), 10);
  }

  let homeEffectiveScore = Math.max(
    (homeFormAtHome?.total >= 3 ? homeFormAtHome.score : homeForm.score)
    - homeFormPenalty - homeRest.formPenalty - homeMotivPenalty - homeFatiguePenalty
    + (isHomeFortress && liga1HomeBonus > 0 ? 15 : 0) + liga1HomeBonus + eloAdj
    + homePythag.adjustment - homeVolatility.trustPenalty, 0
  );
  let awayEffectiveScore = Math.max(
    (awayFormAway?.total >= 3 ? awayFormAway.score : awayForm.score)
    - awayFormPenalty - awayRest.formPenalty - awayMotivPenalty - awayFatiguePenalty
    - altitudePenalty - syntheticPenalty - eloAdj
    + awayPythag.adjustment - awayVolatility.trustPenalty, 0
  );

  const isHomeHierarchy = HIERARCHY_TEAMS.some(t => homeTeamName.toLowerCase().includes(t)) || (isLiga1Peru && ['universitario', 'alianza lima', 'sporting cristal'].some(t => homeTeamName.toLowerCase().includes(t)));
  const isAwayHierarchy = HIERARCHY_TEAMS.some(t => awayTeamName.toLowerCase().includes(t)) || (isLiga1Peru && ['universitario', 'alianza lima', 'sporting cristal'].some(t => awayTeamName.toLowerCase().includes(t)));

  const sniperGuardOk = checkSniperCleanSheetGuard(homeFormAtHome, homeHistory?.[0]?.teams?.home?.id || null, homeHistory);
  if (isHomeHierarchy) homeEffectiveScore = Math.max(homeEffectiveScore, sniperGuardOk ? 65 : 58);
  if (isAwayHierarchy && altitudeRisk !== 'high' && altitudeRisk !== 'extreme') awayEffectiveScore = Math.max(awayEffectiveScore, 60);
  if (isSudamericana) awayEffectiveScore *= 0.85;
  if (isCupMatch) {
    if (homeEffectiveScore > awayEffectiveScore) homeEffectiveScore -= 25;
    else if (awayEffectiveScore > homeEffectiveScore) awayEffectiveScore -= 25;
  }

  const h2hWeight = h2hData ? 0.10 : 0, teamWeight = h2hData ? 0.45 : 0.5;

  return {
    abort: false,
    state: {
      isDerby, isCupMatch, isConmebolCup, isSudamericana, isLiga1Peru, isLaLiga, isSaudi, isMLS,
      laLigaRelegationZone, homeIsLaLigaGiant, awayIsLaLigaGiant, altitudeRisk,
      homeAvgGF, homeAvgGA, awayAvgGF, awayAvgGA, adjHomeAvgGF, adjHomeAvgGA, adjAwayAvgGF, adjAwayAvgGA,
      projectedGoals, dynamicMinProb, homeContextNote, awayContextNote,
      homeEffectiveScore, awayEffectiveScore, isHomeHierarchy, isAwayHierarchy,
      h2hWeight, teamWeight, homeTotal, awayTotal, 
      survivalBoost1X, survivalBoostHomeWin, survivalBoostX2, survivalBoostAwayWin,
      eloCombined, homePythag, awayPythag, homeVolatility, awayVolatility
    }
  };
}
