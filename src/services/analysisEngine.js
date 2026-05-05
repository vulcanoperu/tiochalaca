// ─────────────────────────────────────────────────────────────────
//  analysisEngine.js
//  Motor de análisis tipster profesional
// ─────────────────────────────────────────────────────────────────

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
  const weights = [3, 3, 2, 2, 1, 1, 1, 1, 1, 1];

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

/**
 * Motor principal de generación de picks
 * v2 — Mercados extendidos + integración de predicción oficial
 * @param {object} officialPrediction - Predicción de API-Football (opcional)
 * @param {object} homeCornersData    - { avg, over3, over4, over5, matches }
 * @param {object} awayCornersData    - { avg, over3, over4, over5, matches }
 * @param {object} homeCardsData      - { avg, over1, over2, over3, matches }
 * @param {object} awayCardsData      - { avg, over1, over2, over3, matches }
 * @param {object} homeSlots          - Goles por tramo (analyzeGoalsByTimeSlot)
 * @param {object} awaySlots          - Goles por tramo
 * @param {Array}  injuries           - Lista de bajas del partido [{team:{name}, player:{name}}]
 * @param {string} homeTeamName       - Nombre del equipo local (para filtrar lesiones)
 * @param {number} homeRestDays       - Días desde el último partido del local
 * @param {number} awayRestDays       - Días desde el último partido del visitante
 */
export function generatePicks({
  homeStats, awayStats, h2hData, homeForm, awayForm,
  homeSplitStats, awaySplitStats,
  isLive, liveClock, liveHomeGoals, liveAwayGoals,
  officialPrediction,
  homeCornersData, awayCornersData,
  homeCardsData, awayCardsData,
  homeSlots, awaySlots,
  homeFormAtHome, awayFormAway,
  poissonProbs,
  injuries = [],
  homeTeamName = '',
  homeRestDays = null,
  awayRestDays = null,
  marketOdds = null,
  matchStandings = null,
  advancedStats = null,
}) {
  const picks = [];

  const minMatches = 6;
  const homeTotal = homeForm.total || 0;
  const awayTotal = awayForm.total || 0;
  
  if (!isLive && (homeTotal < minMatches || awayTotal < minMatches)) {
    const minTeam = homeTotal < awayTotal ? `Local (${homeTotal} PJ)` : `Visitante (${awayTotal} PJ)`;
    return { 
      picks: [], 
      reason: `El equipo ${minTeam} registra muy pocos partidos en el año actual. No es recomendable apostar sin datos suficientes.`
    };
  }

  const homeAvgGF = homeForm.total > 0 ? +(homeForm.goalsFor  / homeForm.total).toFixed(2) : 0;
  const homeAvgGA = homeForm.total > 0 ? +(homeForm.goalsAgainst / homeForm.total).toFixed(2) : 0;
  const awayAvgGF = awayForm.total > 0 ? +(awayForm.goalsFor  / awayForm.total).toFixed(2) : 0;
  const awayAvgGA = awayForm.total > 0 ? +(awayForm.goalsAgainst / awayForm.total).toFixed(2) : 0;

  // ── #1: Escala de confianza por tamaño de muestra ─────────────────
  // Con pocos partidos exigimos mayor umbral de probabilidad para reducir falsos positivos
  const minSample = Math.min(homeTotal, awayTotal);
  // Umbral dinámico: con 6 PJ exigimos 70%, con 12 PJ exigimos 62%
  const dynamicMinProb = minSample >= 12 ? 62
    : minSample >= 10 ? 64
    : minSample >= 8  ? 66
    : minSample >= 6  ? 68
    : 70; // < 6 PJ nunca llega aquí (bloqueado arriba)

  // ── #2: Penalización por lesiones ──────────────────────────────
  // Contamos bajas por equipo. Cada baja resta pequeña parte de la proyección de goles
  const homeInjuries = injuries.filter(inj =>
    inj.team?.name && homeTeamName &&
    inj.team.name.toLowerCase().includes(homeTeamName.toLowerCase().split(' ')[0])
  ).length;
  const awayInjuries = injuries.filter(inj =>
    inj.team?.name && homeTeamName &&
    !inj.team.name.toLowerCase().includes(homeTeamName.toLowerCase().split(' ')[0])
  ).length;

  // Cada baja descuenta 0.08 goles esperados (cap en 0.4 = 5 bajas)
  const homeInjPenalty  = Math.min(homeInjuries * 0.08, 0.40);
  const awayInjPenalty  = Math.min(awayInjuries  * 0.08, 0.40);
  // Penaliza el score de forma en 3 puntos por cada baja (cap 12pts)
  const homeFormPenalty = Math.min(homeInjuries * 3, 12);
  const awayFormPenalty = Math.min(awayInjuries  * 3, 12);

  // ── #3: Penalización por cansancio (días de descanso) ─────────────
  // < 3 días = alta fatiga, 3-4 días = leve, ≥5 días = descansado
  const calcRestPenalty = (days) => {
    if (days === null || days === undefined) return { goalsPenalty: 0, formPenalty: 0, label: '' };
    if (days <= 2)  return { goalsPenalty: 0.15, formPenalty: 8,  label: `⚠️ Cansancio crítico (${days}d)` };
    if (days <= 4)  return { goalsPenalty: 0.06, formPenalty: 3,  label: `⚠️ Poco descanso (${days}d)` };
    return { goalsPenalty: 0, formPenalty: 0, label: '' };
  };
  const homeRest = calcRestPenalty(homeRestDays);
  const awayRest = calcRestPenalty(awayRestDays);

  // ── #4: Ajuste por xG (Expected Goals) ─────────────────────────
  let xGBoostHome = 0, xGBoostAway = 0;
  if (advancedStats?.home?.xG) {
    // Si genera más xG que goles reales, recibe un ligero boost (crea peligro). Si no, penaliza levemente.
    xGBoostHome = (advancedStats.home.xG - homeAvgGF) * 0.25; 
  }
  if (advancedStats?.away?.xG) {
    xGBoostAway = (advancedStats.away.xG - awayAvgGF) * 0.25;
  }

  // ── #5: Factor Motivación (Posición en Tabla) ───────────────────
  let homeMotivPenalty = 0, awayMotivPenalty = 0;
  let homeMotivNote = '', awayMotivNote = '';
  if (matchStandings && matchStandings.total >= 10) {
    const tot = matchStandings.total;
    const isClutch = (r) => r <= 4 || r >= tot - 3; // Peleando título/copas o descenso
    const isChill = (r) => r > 5 && r < tot - 4; // Mitad de tabla

    if (isClutch(matchStandings.homeRank) && isChill(matchStandings.awayRank)) {
       homeMotivPenalty = -6; // Boost (restamos penalización) de 6 puntos en forma efectiva
       homeMotivNote = 'Alta motivación (pelea tabla)';
    } else if (isChill(matchStandings.homeRank) && isClutch(matchStandings.awayRank)) {
       awayMotivPenalty = -6;
       awayMotivNote = 'Alta motivación (pelea tabla)';
    }
  }

  // Aplicamos todos los ajustes a los promedios de gol y scores de forma
  const adjHomeAvgGF = Math.max(homeAvgGF - homeInjPenalty - homeRest.goalsPenalty + xGBoostHome, 0.3);
  const adjAwayAvgGF = Math.max(awayAvgGF - awayInjPenalty  - awayRest.goalsPenalty + xGBoostAway, 0.3);
  const adjHomeAvgGA = homeAvgGA; // Las defensas no se ven tan afectadas
  const adjAwayAvgGA = awayAvgGA;

  const projectedGoals = +((adjHomeAvgGF + adjAwayAvgGF + adjHomeAvgGA + adjAwayAvgGA) / 2).toFixed(2);

  // Notas de contexto que se inyectarán en los argumentos de los picks
  const homeContextNote = [
    homeInjuries > 0 ? `${homeInjuries} baja(s)` : '',
    homeRest.label,
    advancedStats?.home?.xG ? `xG: ${advancedStats.home.xG}` : '',
    homeMotivNote,
  ].filter(Boolean).join(', ');
  const awayContextNote = [
    awayInjuries > 0 ? `${awayInjuries} baja(s)` : '',
    awayRest.label,
    advancedStats?.away?.xG ? `xG: ${advancedStats.away.xG}` : '',
    awayMotivNote,
  ].filter(Boolean).join(', ');


  // Si no hay H2H, redistribuir el peso entre los dos equipos
  const h2hWeight  = h2hData ? 0.25 : 0;
  const teamWeight = h2hData ? 0.375 : 0.5;

  // Helper to add a pick with calculated fair odds
  const addPick = (pick) => {
    if (!pick.odds && pick.probability) {
      // Calculamos cuota justa aproximada y restamos margen simulado del 5%
      let fairOdds = 100 / pick.probability;
      let realOdds = (fairOdds * 0.95).toFixed(2);
      // Evitar cuotas menores a 1.01
      if (realOdds < 1.01) realOdds = '1.01';
      pick.odds = realOdds;
    }

    // ── #6: Detección de Value Bets (EV+) ─────────────────────────
    if (marketOdds && !isLive && pick.probability) {
      let mOdds = null;
      if (pick.selection === 'Victoria Local' || pick.selection === 'Local -0.5 (Gana sin empate)') mOdds = marketOdds.home;
      if (pick.selection === 'Victoria Visitante' || pick.selection === 'Visitante -0.5 (Gana sin empate)') mOdds = marketOdds.away;
      if (pick.selection === 'Empate') mOdds = marketOdds.draw;

      if (mOdds && mOdds > 1.01) {
        const impliedProb = 100 / mOdds;
        // Si nuestra probabilidad es mayor a la implícita de la cuota por +5%, es VALUE BET
        if (pick.probability >= impliedProb + 5) {
           pick.tier = '💎';
           pick.argument = `¡VALUE BET! Cuota real paga ${mOdds.toFixed(2)} (implica ${Math.round(impliedProb)}%). Nuestra predicción: ${pick.probability}%. ` + pick.argument;
           pick.odds = mOdds.toFixed(2); // Mostrar cuota real
        }
      }
    }

    picks.push(pick);
  };



  // ── Apuestas en Vivo (Live) ───────────────────────────────────
  if (isLive) {
    const min = parseInt(liveClock) || 0;
    const totalGoals = (liveHomeGoals || 0) + (liveAwayGoals || 0);
    const liveHomeAdv = homeEffectiveScore - awayEffectiveScore; // usa split+penalizado

    // Goles restantes esperados (ajustado por tiempo transcurrido)
    const pctTimeLeft = Math.max(0, (90 - min) / 90);
    const goalsExpectedRemaining = +(projectedGoals * pctTimeLeft).toFixed(2);

    // 1. Gol en el 1er tiempo (0-0 y queda tiempo)
    if (min >= 15 && min <= 35 && totalGoals === 0 && projectedGoals >= 2.5) {
      // Prob basada en goles esperados en el tiempo restante del 1T
      const pctLeft1T = Math.max(0, (45 - min) / 45);
      const goalsLeft1T = +(projectedGoals * 0.45 * (1 - pctLeft1T * 0.3)).toFixed(2);
      // P(al menos 1 gol) = 1 - P(0 goles) usando Poisson
      const p0 = Math.pow(Math.E, -goalsLeft1T);
      const prob1T = Math.min(Math.round((1 - p0) * 100), 88);
      addPick({
        market: 'Goles en Vivo (1T)',
        selection: 'Más de 0.5 goles en el 1er Tiempo',
        probability: prob1T,
        tier: '🔥',
        argument: `Min ${min}' sin goles. Goles esperados 1T restante: ~${goalsLeft1T}. Proyección total: ${projectedGoals}.`,
        risk: prob1T >= 78 ? 'Moderado' : 'Alto',
      });
    }

    // 2. Gol tardio (0-0 en el min 60+)
    if (min >= 60 && totalGoals === 0 && projectedGoals > 2.0) {
      const goalsLeft = +(projectedGoals * pctTimeLeft).toFixed(2);
      const p0 = Math.pow(Math.E, -goalsLeft);
      const prob = Math.min(Math.round((1 - p0) * 100), 90);
      addPick({
        market: 'Goles en Vivo',
        selection: 'Más de 0.5 goles',
        probability: prob,
        tier: '🔥',
        argument: `Min ${min}' sin goles. Goles esperados restantes: ~${goalsLeft} (de ${projectedGoals} proyectados). Alta presión para romper el cero.`,
        risk: prob >= 78 ? 'Moderado' : 'Alto',
      });
    }

    // 3. Under de goles en partidos muy goleados (min 75+, ya hay 4+)
    if (min >= 75 && totalGoals > 3) {
      const goalsLeft = +(projectedGoals * pctTimeLeft).toFixed(2);
      // P(0 o 1 gol más) = P(0) + P(1) con Poisson
      const p0 = Math.pow(Math.E, -goalsLeft);
      const p1 = goalsLeft * p0;
      const probUnder = Math.min(Math.round((p0 + p1) * 100), 88);
      addPick({
        market: 'Goles en Vivo',
        selection: `Menos de ${totalGoals + 1.5} goles`,
        probability: probUnder,
        tier: '🔥',
        argument: `Min ${min}' con ${totalGoals} goles. Goles restantes esperados: ~${goalsLeft}. Baja probabilidad de 2+ goles adicionales.`,
        risk: 'Bajo',
      });
    }

    // 4. Remontada del favorito Local (usa scores efectivos penalizados)
    if (min >= 45 && liveHomeAdv >= 18 && homeEffectiveScore >= 65) {
      if (liveHomeGoals < liveAwayGoals || liveHomeGoals === liveAwayGoals) {
        addPick({
          market: 'Resultado en Vivo',
          selection: liveHomeGoals < liveAwayGoals ? 'Local empata o gana (1X)' : 'Victoria Local',
          probability: Math.min(Math.round(homeEffectiveScore * 0.7 + (h2hData?.homeWinPct ?? 50) * 0.3), 80),
          tier: '🔥',
          argument: `Local superior (Forma efectiva: ${homeEffectiveScore}% vs ${awayEffectiveScore}%). No está ganando en el min ${min}. Momento de remontada.`,
          risk: 'Moderado',
        });
      }
    }

    // 5. Goles sobre la marcha (partido ya abierto)
    if (min > 20 && min < 65 && totalGoals > 0 && goalsExpectedRemaining >= 1.0) {
      const p0 = Math.pow(Math.E, -goalsExpectedRemaining);
      const probMore = Math.min(Math.round((1 - p0) * 100), 87);
      addPick({
        market: 'Goles en Vivo',
        selection: `Más de ${totalGoals + 0.5} goles`,
        probability: probMore,
        tier: '🔥',
        argument: `Min ${min}' con ${totalGoals} gol(es). Quedan ~${goalsExpectedRemaining} goles esperados. Alta probabilidad de más goles.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Boost de confianza desde predicción oficial (API-Football) ──
  // Suma hasta +8 puntos si la predicción oficial coincide con nuestro análisis
  const officialHomeWinPct = officialPrediction ? parseInt(officialPrediction.predictions?.percent?.home) || 0 : 0;
  const officialDrawPct    = officialPrediction ? parseInt(officialPrediction.predictions?.percent?.draw)  || 0 : 0;
  const officialAwayWinPct = officialPrediction ? parseInt(officialPrediction.predictions?.percent?.away)  || 0 : 0;
  const officialWinner     = officialPrediction?.predictions?.winner?.comment || '';
  const hasOfficial        = officialHomeWinPct + officialDrawPct + officialAwayWinPct > 0;

  // ── Over 2.5 ──────────────────────────────────────────────────
  const homeOver25Pct  = homeSplitStats?.over25Pct ?? 0;
  const awayOver25Pct  = awaySplitStats?.over25Pct ?? 0;
  const h2hOver25Pct   = h2hData?.over25Pct ?? 0;
  const combinedOver25 = Math.round(homeOver25Pct * teamWeight + awayOver25Pct * teamWeight + h2hOver25Pct * h2hWeight);

  // ── Over 1.5 ──────────────────────────────────────────────────
  const homeOver15Pct  = homeSplitStats?.over15Pct ?? 0;
  const awayOver15Pct  = awaySplitStats?.over15Pct ?? 0;
  // Ahora usamos el dato real del H2H en lugar del proxy *1.2
  const h2hOver15Pct   = h2hData?.over15Pct ?? (h2hData ? Math.min(Math.round(h2hData.over25Pct * 1.2), 100) : 0);
  const combinedOver15 = Math.round(homeOver15Pct * teamWeight + awayOver15Pct * teamWeight + h2hOver15Pct * h2hWeight);
  if (combinedOver15 >= 70 && projectedGoals >= 1.6) {
    const prob = Math.min(combinedOver15, 91);
    addPick({
      market: 'Total de Goles',
      selection: 'Más de 1.5 goles',
      probability: prob,
      tier: prob >= 85 ? '🟢' : '🔵',
      argument: `${combinedOver15}% de partidos con 2+ goles. Proyección: ${projectedGoals} goles. Mercado de menor riesgo.`,
      risk: prob >= 85 ? 'Bajo' : 'Moderado',
    });
  }

  // ── Over 2.5 ──────────────────────────────────────────────────
  if (combinedOver25 >= 60 && projectedGoals >= 2.3) {
    const officialBoost = hasOfficial && officialWinner?.toLowerCase().includes('goals') ? 4 : 0;
    const prob = Math.min(combinedOver25 + officialBoost, 88);
    const ctxNote = [homeContextNote, awayContextNote].filter(Boolean).join(' · ');
    addPick({
      market: 'Total de Goles',
      selection: 'Más de 2.5 goles',
      probability: prob,
      tier: prob >= 82 ? '🟢' : '🔵',
      argument: `${combinedOver25}% de partidos con 3+ goles. Proyección ajustada: ${projectedGoals} goles.${ctxNote ? ` Contexto: ${ctxNote}.` : ''}`,
      risk: prob >= 82 ? 'Bajo' : 'Moderado',
    });
  }

  // ── Over 3.5 ──────────────────────────────────────────────────
  const homeOver35Pct  = homeSplitStats?.over35Pct ?? 0;
  const awayOver35Pct  = awaySplitStats?.over35Pct ?? 0;
  const h2hOver35Pct   = h2hData ? Math.round(h2hData.over25Pct * 0.6) : 0; // proxy conservador
  const combinedOver35 = Math.round(homeOver35Pct * teamWeight + awayOver35Pct * teamWeight + h2hOver35Pct * h2hWeight);
  if (combinedOver35 >= 55 && projectedGoals >= 3.0) {
    const prob = Math.min(combinedOver35, 84);
    addPick({
      market: 'Total de Goles',
      selection: 'Más de 3.5 goles',
      probability: prob,
      tier: prob >= 75 ? '🔵' : '🟡',
      argument: `${combinedOver35}% de partidos con 4+ goles. Proyección: ${projectedGoals} goles. Partido con alto potencial ofensivo.`,
      risk: 'Alto',
    });
  }

  // ── Under 2.5 ─────────────────────────────────────────────────
  const under25Pct = 100 - combinedOver25;
  if (under25Pct >= 62 && projectedGoals < 2.2) {
    const prob = Math.min(under25Pct, 86);
    addPick({
      market: 'Total de Goles',
      selection: 'Menos de 2.5 goles',
      probability: prob,
      tier: prob >= 82 ? '🟢' : '🔵',
      argument: `${under25Pct}% de probabilidad de partido cerrado. Proyección: ${projectedGoals} goles. Defensa sólida de ambos equipos.`,
      risk: prob >= 82 ? 'Bajo' : 'Moderado',
    });
  }

  // ── Ambos Anotan ───────────────────────────────────────────────
  const homeBttsPct  = homeSplitStats?.bttsPct ?? 0;
  const awayBttsPct  = awaySplitStats?.bttsPct ?? 0;
  const h2hBttsPct   = h2hData?.bttsPct ?? 0;
  const combinedBTTS = Math.round(homeBttsPct * teamWeight + awayBttsPct * teamWeight + h2hBttsPct * h2hWeight);

  if (combinedBTTS >= 58) {
    const prob = Math.min(combinedBTTS, 87);
    addPick({
      market: 'Ambos Marcan',
      selection: 'Sí, ambos anotan',
      probability: prob,
      tier: prob >= 82 ? '🟢' : '🔵',
      argument: `${combinedBTTS}% de partidos con gol de ambos equipos. Local anota ${homeAvgGF}/p, Visitante ${awayAvgGF}/p.`,
      risk: prob >= 82 ? 'Bajo' : 'Moderado',
    });
  }

  // ── BTTS + Over 2.5 (Combo) ────────────────────────────────────
  if (combinedBTTS >= 62 && combinedOver25 >= 60 && projectedGoals >= 2.5) {
    const prob = Math.min(Math.round((combinedBTTS + combinedOver25) / 2) - 5, 80);
    if (prob >= 62) {
      addPick({
        market: 'Combo',
        selection: 'Ambos Marcan + Más de 2.5',
        probability: prob,
        tier: '🔵',
        argument: `BTTS: ${combinedBTTS}% · Over 2.5: ${combinedOver25}%. Alta probabilidad de partido abierto con gol de ambos y 3+ goles en total.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Ganador: Local ─────────────────────────────────────────────
  const homeScoreAdv = homeForm.score - awayForm.score;
  // Usa forma en casa del local con penalizaciones de lesión, cansancio y motivación aplicadas
  const homeEffectiveScore = Math.max(
    (homeFormAtHome?.total >= 3 ? homeFormAtHome.score : homeForm.score) - homeFormPenalty - homeRest.formPenalty - homeMotivPenalty, 0
  );
  const awayEffectiveScore = Math.max(
    (awayFormAway?.total >= 3 ? awayFormAway.score : awayForm.score) - awayFormPenalty - awayRest.formPenalty - awayMotivPenalty, 0
  );
  const effectiveAdv = homeEffectiveScore - awayEffectiveScore;

  const officialHomeBoost = hasOfficial && officialHomeWinPct >= 55 ? Math.round((officialHomeWinPct - 50) * 0.2) : 0;
  const officialAwayBoost = hasOfficial && officialAwayWinPct >= 55 ? Math.round((officialAwayWinPct - 50) * 0.2) : 0;

  // Pick de EMPATE desde Poisson (dato real, no inventado)
  if (!isLive && poissonProbs && poissonProbs.draw >= 30 && (h2hData?.drawPct ?? 0) >= 25) {
    const drawProb = Math.round(poissonProbs.draw * 0.6 + (h2hData?.drawPct ?? 25) * 0.4);
    if (drawProb >= 28 && drawProb <= 50) { // solo si es genuinamente probable
      addPick({
        market: 'Ganador del Partido',
        selection: 'Empate',
        probability: drawProb,
        tier: drawProb >= 38 ? '🟡' : '🟡',
        argument: `Poisson indica ${poissonProbs.draw.toFixed(1)}% de empate. H2H: ${h2hData?.drawPct ?? '?'}% de empates históricos. Cuota de valor en mercados equilibrados.`,
        risk: 'Alto',
        units: '1-2u',
      });
    }
  }

  if (homeEffectiveScore >= 65 && awayEffectiveScore <= 45 && effectiveAdv >= 18) {
    const prob = Math.min(Math.round(homeEffectiveScore * 0.6 + (h2hData?.homeWinPct ?? 50) * 0.4) + officialHomeBoost, 86);
    if (prob >= 62) {
      const splitNote = homeFormAtHome?.total >= 3 ? ` (Casa: ${homeFormAtHome.wins}G/${homeFormAtHome.total}PJ)` : '';
      addPick({
        market: 'Ganador del Partido',
        selection: 'Victoria Local',
        probability: prob,
        tier: prob >= 78 ? '🔵' : '🟡',
        argument: `Forma local en casa: ${homeEffectiveScore}%${splitNote}. Visitante fuera: ${awayEffectiveScore}%. Ventaja: +${effectiveAdv}pts. H2H: ${h2hData?.homeWinPct ?? '?'}%.${hasOfficial ? ` Oficial: ${officialHomeWinPct}%.` : ''}`,
        risk: 'Moderado',
        units: '3-5u',
      });
    }
  }

  // ── Ganador: Visitante ─────────────────────────────────────────
  if (awayEffectiveScore >= 65 && homeEffectiveScore <= 45 && -effectiveAdv >= 18) {
    const prob = Math.min(Math.round(awayEffectiveScore * 0.6 + (h2hData?.awayWinPct ?? 50) * 0.4) + officialAwayBoost, 86);
    if (prob >= 62) {
      const splitNote = awayFormAway?.total >= 3 ? ` (Fuera: ${awayFormAway.wins}G/${awayFormAway.total}PJ)` : '';
      addPick({
        market: 'Ganador del Partido',
        selection: 'Victoria Visitante',
        probability: prob,
        tier: prob >= 78 ? '🔵' : '🟡',
        argument: `Forma visitante fuera: ${awayEffectiveScore}%${splitNote}. Local en casa: ${homeEffectiveScore}%. H2H: ${h2hData?.awayWinPct ?? '?'}%.${hasOffic  // ── Doble Oportunidad: Local o Empate (1X) ────────────────────
  // Usamos Poisson: prob 1X = P(local gana) + P(empate)
  if (!isLive && poissonProbs) {
    const prob1X = Math.round(poissonProbs.home + poissonProbs.draw);
    const h2hBase1X = h2hData ? (h2hData.homeWinPct + h2hData.drawPct) : prob1X;
    const combined1X = Math.round(prob1X * 0.6 + h2hBase1X * 0.4);
    // Solo si el local es moderadamente favorito (no dominante, que ya tiene Victoria Local)
    if (combined1X >= 60 && combined1X < 80 && poissonProbs.home < 55) {
      addPick({
        market: 'Doble Oportunidad',
        selection: 'Local o Empate (1X)',
        probability: Math.min(combined1X, 82),
        tier: '🔵',
        argument: `Poisson: Local ${poissonProbs.home.toFixed(1)}% + Empate ${poissonProbs.draw.toFixed(1)}% = ${prob1X}% de 1X. H2H 1X: ${h2hBase1X}%. Protección ante el empate.`,
        risk: 'Bajo',
        units: '3-4u',
      });
    }

    const probX2 = Math.round(poissonProbs.away + poissonProbs.draw);
    const h2hBaseX2 = h2hData ? (h2hData.awayWinPct + h2hData.drawPct) : probX2;
    const combinedX2 = Math.round(probX2 * 0.6 + h2hBaseX2 * 0.4);
    if (combinedX2 >= 60 && combinedX2 < 80 && poissonProbs.away < 55) {
      addPick({
        market: 'Doble Oportunidad',
        selection: 'Visitante o Empate (X2)',
        probability: Math.min(combinedX2, 82),
        tier: '🔵',
        argument: `Poisson: Visitante ${poissonProbs.away.toFixed(1)}% + Empate ${poissonProbs.draw.toFixed(1)}% = ${probX2}% de X2. H2H X2: ${h2hBaseX2}%. Protección ante el empate.`,
        risk: 'Bajo',
        units: '3-4u',
      });
    }
  }

  // ── Estrategia en Vivo (Pre-match) ────────────────────────────
  if (!isLive) {
    if (projectedGoals >= 2.5 && combinedOver25 >= 60) {
      addPick({
        market: 'Estrategia en Vivo',
        selection: 'Apostar "Más de 1.5 goles" si llegan 0-0 al minuto 30',
        probability: 70,
        odds: '1.80+',
        tier: '🔥',
        argument: `Si el partido llega al minuto 30 sin goles, la cuota de goles subirá exponencialmente. Entrar ahí.`,
        risk: 'Moderado'
      });
    } else if (homeForm.score >= 65 && awayForm.score <= 45 && homeScoreAdv >= 20) {
      addPick({
        market: 'Estrategia en Vivo',
        selection: 'Victoria Local si empieza perdiendo',
        probability: 65,
        odds: '2.50+',
        tier: '🔥',
        argument: `El local es superior. Si el visitante anota primero de forma inesperada, apostar a la remontada o empate (1X) local tendrá mucho valor.`,
        risk: 'Alto'
      });
    } else {
       addPick({
        market: 'Estrategia en Vivo',
        selection: 'Gol en el 2do Tiempo',
        probability: 75,
        odds: '1.50+',
        tier: '🔥',
        argument: `Si el partido llega empatado al descanso (especialmente 0-0), apostar a que habrá más de 0.5 goles en el segundo tiempo.`,
        risk: 'Moderado'
      });
    }
  }

  // ── Corners del partido (ambos equipos) ────────────────────────
  if (homeCornersData && awayCornersData && homeCornersData.matches >= 4 && awayCornersData.matches >= 4) {
    const combinedAvgCorners = parseFloat(homeCornersData.avg) + parseFloat(awayCornersData.avg);
    const over8Pct = Math.round(
      ((homeCornersData.over4 / homeCornersData.matches) * 0.5 +
       (awayCornersData.over4 / awayCornersData.matches) * 0.5) * 100
    );
    const over10Pct = Math.round(
      ((homeCornersData.over5 / homeCornersData.matches) * 0.5 +
       (awayCornersData.over5 / awayCornersData.matches) * 0.5) * 100
    );
    if (over8Pct >= 60 && combinedAvgCorners >= 8) {
      addPick({
        market: 'Córners Totales',
        selection: 'Más de 8.5 córners',
        probability: Math.min(over8Pct, 84),
        tier: over8Pct >= 75 ? '🔵' : '🟡',
        argument: `Promedio combinado de córners: ${combinedAvgCorners.toFixed(1)}/p. Local: ${homeCornersData.avg}/p · Visitante: ${awayCornersData.avg}/p. El ${over8Pct}% de sus partidos superan esta línea.`,
        risk: over8Pct >= 75 ? 'Moderado' : 'Alto',
      });
    }
    if (over10Pct >= 55 && combinedAvgCorners >= 10) {
      addPick({
        market: 'Córners Totales',
        selection: 'Más de 10.5 córners',
        probability: Math.min(over10Pct, 80),
        tier: '🟡',
        argument: `${over10Pct}% de partidos con 11+ córners combinados. Promedio: ${combinedAvgCorners.toFixed(1)}/p.`,
        risk: 'Alto',
      });
    }
  }

  // ── Tarjetas del partido (ambos equipos) ────────────────────────
  if (homeCardsData && awayCardsData && homeCardsData.matches >= 4 && awayCardsData.matches >= 4) {
    const combinedAvgCards = parseFloat(homeCardsData.avg) + parseFloat(awayCardsData.avg);
    const over3CardsPct = Math.round(
      ((homeCardsData.over2 / homeCardsData.matches) * 0.5 +
       (awayCardsData.over2 / awayCardsData.matches) * 0.5) * 100
    );
    if (over3CardsPct >= 60 && combinedAvgCards >= 3) {
      addPick({
        market: 'Tarjetas Totales',
        selection: 'Más de 3.5 tarjetas',
        probability: Math.min(over3CardsPct, 82),
        tier: over3CardsPct >= 72 ? '🔵' : '🟡',
        argument: `Promedio combinado de tarjetas: ${combinedAvgCards.toFixed(1)}/p. El ${over3CardsPct}% de sus partidos registran 4+ tarjetas.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Gol en el 2do Tiempo (datos de tramos) ──────────────────────
  if (!isLive && homeSlots && awaySlots) {
    const home2T = (homeSlots[3]?.goals || 0) + (homeSlots[4]?.goals || 0) + (homeSlots[5]?.goals || 0);
    const away2T = (awaySlots[3]?.goals || 0) + (awaySlots[4]?.goals || 0) + (awaySlots[5]?.goals || 0);
    const total2T = home2T + away2T;
    const total1T = (homeSlots[0]?.goals||0)+(homeSlots[1]?.goals||0)+(homeSlots[2]?.goals||0)
                  + (awaySlots[0]?.goals||0)+(awaySlots[1]?.goals||0)+(awaySlots[2]?.goals||0);
    if (total2T > 0 && total1T > 0) {
      const pct2T = Math.round(total2T / (total2T + total1T) * 100);
      if (pct2T >= 58 && projectedGoals >= 2.0) {
        addPick({
          market: 'Gol por Tramo',
          selection: 'Gol en el 2do Tiempo',
          probability: Math.min(pct2T + 10, 85),
          tier: '🔵',
          argument: `El ${pct2T}% de los goles de estos equipos caen en la 2ª mitad. Alta probabilidad de actividad goleadora en el tramo 46'–90'.`,
          risk: 'Moderado',
        });
      }
    }
  }

  // Filtro: picks con tier definido y probabilidad >= umbral dinámico por muestra
  const filtered = picks.filter(p => p.tier && p.probability >= dynamicMinProb);
  filtered.sort((a, b) => b.probability - a.probability);

  // ── Límite: máximo 5 picks para no saturar al usuario ─────────
  // Se separan picks de estrategia en vivo (🔥) para siempre incluirlos
  const livePicks   = filtered.filter(p => p.tier === '🔥');
  const staticPicks = filtered.filter(p => p.tier !== '🔥');
  const topStatic   = staticPicks.slice(0, 4);
  const finalPicks  = [...topStatic, ...livePicks.slice(0, 1)];

  return {
    picks: finalPicks,
    projectedGoals,
    homeAvgGF,
    homeAvgGA,
    awayAvgGF,
    awayAvgGA,
    combinedOver25,
    combinedBTTS,
    homeFormAtHome,
    awayFormAway,
    reason: finalPicks.length === 0 ? 'No se encontró ventaja estadística clara. No se recomienda apostar.' : null,
  };
}

/**
 * Descripción del descanso entre partidos
 */
export function getRestDays(lastMatch) {
  if (!lastMatch?.fixture?.date) return null;
  const last = new Date(lastMatch.fixture.date);
  const now  = new Date();
  const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  return diff;
}

/**
 * Calcula probabilidades de resultado con el método Poisson simplificado
 */
export function poissonProb(lambda, k) {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return Math.pow(Math.E, -lambda) * Math.pow(lambda, k) / factorial;
}

export function calcMatchProbabilities(homeAvgGF, homeAvgGA, awayAvgGF, awayAvgGA) {
  const lambdaHome = (homeAvgGF + awayAvgGA) / 2;
  const lambdaAway = (awayAvgGF + homeAvgGA) / 2;

  let homeWin = 0, draw = 0, awayWin = 0;
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const p = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  const total = homeWin + draw + awayWin;
  return {
    home: +(homeWin / total * 100).toFixed(1),
    draw: +(draw    / total * 100).toFixed(1),
    away: +(awayWin / total * 100).toFixed(1),
    lambdaHome: +lambdaHome.toFixed(2),
    lambdaAway: +lambdaAway.toFixed(2),
  };
}
