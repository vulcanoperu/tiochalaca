/**
 * Form calculators for match statistics
 */
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