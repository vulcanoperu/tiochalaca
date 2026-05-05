// ─────────────────────────────────────────────────────────────────
//  analysisEngine.js
//  Motor de análisis tipster profesional
// ─────────────────────────────────────────────────────────────────

/**
 * Calcula la tendencia de forma reciente ponderada
 * matches: array de últimos partidos (el más reciente primero)
 */
export function calculateFormScore(matches, teamId) {
  if (!matches || matches.length === 0) return { score: 0, label: 'Sin datos', wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, total: 0 };

  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  const weights = [3, 3, 2, 2, 1, 1, 1, 1, 1, 1]; // más peso a partidos recientes

  let weightedScore = 0;
  let totalWeight = 0;

  matches.slice(0, 12).forEach((m, i) => {
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

  return { score, label, wins, draws, losses, goalsFor, goalsAgainst, total: Math.min(matches.length, 12) };
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
  let totalGoals = 0, btts = 0, over25 = 0;

  h2hMatches.slice(0, 12).forEach(m => {
    const hg = m.goals?.home ?? 0;
    const ag = m.goals?.away ?? 0;
    const total = hg + ag;
    totalGoals += total;

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
    over25Pct:  Math.round(over25 / n * 100),
    total: n,
  };
}

/**
 * Motor principal de generación de picks
 * Umbrales calibrados para muestras de partidos (ESPN ~12 partidos)
 */
export function generatePicks({ homeStats, awayStats, h2hData, homeForm, awayForm, homeSplitStats, awaySplitStats, isLive, liveClock, liveHomeGoals, liveAwayGoals }) {
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

  const projectedGoals = +((homeAvgGF + awayAvgGF + homeAvgGA + awayAvgGA) / 2).toFixed(2);

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
    picks.push(pick);
  };



  // ── Apuestas en Vivo (Live) ───────────────────────────────────
  if (isLive) {
    const min = parseInt(liveClock) || 0;
    const totalGoals = (liveHomeGoals || 0) + (liveAwayGoals || 0);
    const homeScoreAdv = homeForm.score - awayForm.score;

    // 1. Gol en el 1er tiempo (si hay 0 goles y se esperan muchos)
    if (min >= 15 && min <= 35 && totalGoals === 0 && projectedGoals >= 2.5) {
      addPick({
        market: 'Goles en Vivo (1T)',
        selection: 'Más de 0.5 goles en el 1er Tiempo',
        probability: 70 + min / 2, // Sube la confianza según pasa el tiempo
        tier: '🔥',
        argument: `Minuto ${min} sin goles. Ambos equipos tienen alta tendencia a anotar (${projectedGoals} goles proyectados). Cuota de valor para un gol antes del descanso.`,
        risk: 'Alto',
      });
    }

    // 2. Gol tardío (0-0 en el min 60+)
    if (min >= 60 && totalGoals === 0 && projectedGoals > 2.0 && homeAvgGF > 1 && awayAvgGF > 1) {
      addPick({
        market: 'Goles en Vivo',
        selection: 'Más de 0.5 goles',
        probability: 75,
        tier: '🔥',
        argument: `Partido cerrado en el minuto ${min}, pero ambos equipos promedian una alta cuota de goles (${projectedGoals} esperados). Alta probabilidad de que se rompa el cero.`,
        risk: 'Moderado',
      });
    }

    // 3. Under de goles en partidos cerrados
    if (min >= 75 && totalGoals > 3) {
      addPick({
        market: 'Goles en Vivo',
        selection: `Menos de ${totalGoals + 1.5} goles`,
        probability: 85,
        tier: '🔥',
        argument: `Minuto ${min} con ${totalGoals} goles. Estadísticamente el ritmo debe caer y es muy difícil ver dos goles adicionales en el tramo final.`,
        risk: 'Bajo',
      });
    }

    // 4. Remontada del favorito Local
    if (min >= 45 && homeForm.score >= 65 && awayForm.score <= 45 && homeScoreAdv >= 18) {
      if (liveHomeGoals < liveAwayGoals || liveHomeGoals === liveAwayGoals) {
        addPick({
          market: 'Resultado en Vivo',
          selection: liveHomeGoals < liveAwayGoals ? 'Local empata o gana (1X)' : 'Victoria Local',
          probability: 72,
          tier: '🔥',
          argument: `El local es estadísticamente superior (Forma: ${homeForm.score}% vs ${awayForm.score}%) y no está ganando. Gran momento para buscar la remontada o el desempate local en vivo.`,
          risk: 'Moderado',
        });
      }
    }

    // 5. Dinámica de goles sobre la marcha
    if (min > 20 && min < 65 && totalGoals > 0 && projectedGoals >= 2.8) {
      addPick({
        market: 'Goles en Vivo',
        selection: `Más de ${totalGoals + 0.5} goles`,
        probability: 78,
        tier: '🔥',
        argument: `El partido ya se abrió con ${totalGoals} goles. La tendencia pre-partido sugiere un juego abierto (${projectedGoals} esperados). Debería caer al menos uno más.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Over 2.5 ──────────────────────────────────────────────────
  const homeOver25Pct  = homeSplitStats?.over25Pct ?? 0;
  const awayOver25Pct  = awaySplitStats?.over25Pct ?? 0;
  const h2hOver25Pct   = h2hData?.over25Pct ?? 0;
  const combinedOver25 = Math.round(homeOver25Pct * teamWeight + awayOver25Pct * teamWeight + h2hOver25Pct * h2hWeight);

  if (combinedOver25 >= 60 && projectedGoals >= 2.3) {
    const prob = Math.min(combinedOver25 + 6, 88);
    addPick({
      market: 'Total de Goles',
      selection: 'Más de 2.5 goles',
      probability: prob,
      tier: prob >= 82 ? '🟢' : '🔵',
      argument: `Probabilidad de más de 2 goles: ${combinedOver25}%. Goles proyectados: ${projectedGoals}. Local promedia ${homeAvgGF} a favor. Visitante promedia ${awayAvgGF} a favor.`,
      risk: prob >= 82 ? 'Bajo' : 'Moderado',
    });
  }

  // ── Under 2.5 ─────────────────────────────────────────────────
  const under25Pct = 100 - combinedOver25;
  if (under25Pct >= 62 && projectedGoals < 2.2) {
    const prob = Math.min(under25Pct + 4, 86);
    addPick({
      market: 'Total de Goles',
      selection: 'Menos de 2.5 goles',
      probability: prob,
      tier: prob >= 82 ? '🟢' : '🔵',
      argument: `Probabilidad de pocos goles: ${under25Pct}%. Goles proyectados: ${projectedGoals}. Se espera un partido muy defensivo.`,
      risk: prob >= 82 ? 'Bajo' : 'Moderado',
    });
  }

  // ── Ambos Anotan ───────────────────────────────────────────────
  const homeBttsPct  = homeSplitStats?.bttsPct ?? 0;
  const awayBttsPct  = awaySplitStats?.bttsPct ?? 0;
  const h2hBttsPct   = h2hData?.bttsPct ?? 0;
  const combinedBTTS = Math.round(homeBttsPct * teamWeight + awayBttsPct * teamWeight + h2hBttsPct * h2hWeight);

  if (combinedBTTS >= 58) {
    const prob = Math.min(combinedBTTS + 5, 87);
    addPick({
      market: 'Ambos Marcan',
      selection: 'Sí, ambos anotan',
      probability: prob,
      tier: prob >= 82 ? '🟢' : '🔵',
      argument: `Probabilidad de que ambos marquen: ${combinedBTTS}%. Local anota frecuentemente y el visitante también tiene buen promedio de gol.`,
      risk: prob >= 82 ? 'Bajo' : 'Moderado',
    });
  }

  // ── Ganador: Local ─────────────────────────────────────────────
  const homeScoreAdv = homeForm.score - awayForm.score;

  if (homeForm.score >= 65 && awayForm.score <= 45 && homeScoreAdv >= 18) {
    const prob = Math.min(Math.round(homeForm.score * 0.6 + (h2hData?.homeWinPct ?? 50) * 0.4), 84);
    if (prob >= 62) {
      addPick({
        market: 'Ganador del Partido',
        selection: 'Victoria Local',
        probability: prob,
        tier: prob >= 78 ? '🔵' : '🟡',
        argument: `Forma local: ${homeForm.score}%. Forma visitante: ${awayForm.score}%. Ventaja: +${homeScoreAdv}pts. Historial local gana: ${h2hData?.homeWinPct ?? '?'}%.`,
        risk: 'Moderado',
        units: '3-5u',
      });
    }
  }

  // ── Ganador: Visitante ─────────────────────────────────────────
  if (awayForm.score >= 65 && homeForm.score <= 45 && -homeScoreAdv >= 18) {
    const prob = Math.min(Math.round(awayForm.score * 0.6 + (h2hData?.awayWinPct ?? 50) * 0.4), 84);
    if (prob >= 62) {
      addPick({
        market: 'Ganador del Partido',
        selection: 'Victoria Visitante',
        probability: prob,
        tier: prob >= 78 ? '🔵' : '🟡',
        argument: `Forma visitante: ${awayForm.score}%. Forma local: ${homeForm.score}%. Historial visitante gana: ${h2hData?.awayWinPct ?? '?'}%.`,
        risk: 'Moderado',
        units: '3-5u',
      });
    }
  }

  // ── Doble Oportunidad: Local o Empate (1X) ─────────────────────
  if (homeForm.score >= 55 && homeForm.score < 68) {
    const base = h2hData ? (h2hData.homeWinPct + h2hData.drawPct) : 60;
    const prob = Math.min(Math.round((homeForm.score + base) / 2), 82);
    if (prob >= 66) {
      addPick({
        market: 'Doble Oportunidad',
        selection: 'Local o Empate (1X)',
        probability: prob,
        tier: '🔵',
        argument: `Forma local sólida (${homeForm.score}%) pero no dominante. 1X asegura que ganamos si el local gana o empata.`,
        risk: 'Bajo',
        units: '3-4u',
      });
    }
  }

  // ── Doble Oportunidad: Visitante o Empate (X2) ─────────────────
  if (awayForm.score >= 55 && awayForm.score < 68) {
    const base = h2hData ? (h2hData.awayWinPct + h2hData.drawPct) : 60;
    const prob = Math.min(Math.round((awayForm.score + base) / 2), 82);
    if (prob >= 66) {
      addPick({
        market: 'Doble Oportunidad',
        selection: 'Visitante o Empate (X2)',
        probability: prob,
        tier: '🔵',
        argument: `Forma visitante sólida (${awayForm.score}%) pero no dominante. X2 asegura que ganamos si la visita gana o empata.`,
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

  // Filtro: solo picks con tier definido y probabilidad mínima
  const filtered = picks.filter(p => p.tier && p.probability >= 62);
  filtered.sort((a, b) => b.probability - a.probability);

  return {
    picks: filtered,
    projectedGoals,
    homeAvgGF,
    homeAvgGA,
    awayAvgGF,
    awayAvgGA,
    combinedOver25,
    combinedBTTS,
    reason: filtered.length === 0 ? 'No se encontró ventaja estadística clara. No se recomienda apostar.' : null,
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
