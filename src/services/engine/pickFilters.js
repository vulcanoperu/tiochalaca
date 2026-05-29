/**
 * Filters, contradictories, and market tier resolution
 */
export function resolveContradictoryPicks(rawPicks) {
    const toRemove = new Set();
    const removalLog = [];
    
    const findPicks = (predicate) => rawPicks.filter((p, i) => !toRemove.has(i) && predicate(p));
    const markForRemoval = (pick, reason) => {
      const idx = rawPicks.indexOf(pick);
      if (idx !== -1) {
        toRemove.add(idx);
        removalLog.push(`[CONTRADICCIÓN] Eliminado: "${pick.selection}" (${pick.probability}%) — ${reason}`);
      }
    };

    // Resolver conflicto: mantiene el de mayor probabilidad, elimina el(los) otro(s)
    const resolveConflict = (picksA, picksB, reasonLabel) => {
      if (picksA.length === 0 || picksB.length === 0) return;
      const all = [...picksA, ...picksB].sort((a, b) => b.probability - a.probability);
      const winner = all[0];
      all.slice(1).forEach(loser => {
        markForRemoval(loser, `${reasonLabel}: "${winner.selection}" (${winner.probability}%) tiene mayor prob.`);
      });
    };

    // ── Regla 1: 1X + X2 simultáneo (cubren los 3 resultados → sin valor) ──
    const home1X = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('1X') || p.selection.includes('Local')));
    const awayX2 = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('X2') || p.selection.includes('Visitante')));
    resolveConflict(home1X, awayX2, '1X vs X2');

    // ── Regla 2: Victoria Local + Victoria Visitante (imposible) ──
    const homeWin = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Local'));
    const awayWin = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Visitante'));
    resolveConflict(homeWin, awayWin, 'Victoria Local vs Visitante');

    // ── Regla 3: Victoria Local + X2 (contradicción directa) ──
    const homeWin2 = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Local'));
    const awayX2_2 = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('X2') || (p.selection.includes('Visitante') && p.selection.includes('Empate'))));
    resolveConflict(homeWin2, awayX2_2, 'Victoria Local vs X2');

    // ── Regla 4: Victoria Visitante + 1X (contradicción directa) ──
    const awayWin2 = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Visitante'));
    const home1X_2 = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('1X') || (p.selection.includes('Local') && p.selection.includes('Empate'))));
    resolveConflict(awayWin2, home1X_2, 'Victoria Visitante vs 1X');

    // ── Regla 5: Victoria Local/Visitante + Empate ──
    const anyWin = findPicks(p => p.market === 'Ganador del Partido' && (p.selection.includes('Local') || p.selection.includes('Visitante')));
    const drawPicks = findPicks(p => p.market === 'Ganador del Partido' && p.selection.includes('Empate'));
    resolveConflict(anyWin, drawPicks, 'Victoria vs Empate');

    // ── Regla 6: Over 2.5 + Under 2.5 (mutuamente excluyentes) ──
    const over25 = findPicks(p => p.selection === 'Más de 2.5 goles');
    const under25 = findPicks(p => p.selection === 'Menos de 2.5 goles');
    resolveConflict(over25, under25, 'Over 2.5 vs Under 2.5');

    // ── Regla 7: Handicap Negativo Local + X2 / Handicap Negativo Visitante + 1X ──
    const haLocalNeg = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Local') && p.selection.includes('-'));
    const x2Final = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('X2') || (p.selection.includes('Visitante') && p.selection.includes('Empate'))));
    resolveConflict(haLocalNeg, x2Final, 'Handicap -0.5 Local vs X2');

    const haAwayNeg = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Visitante') && p.selection.includes('-'));
    const x1Final = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('1X') || (p.selection.includes('Local') && p.selection.includes('Empate'))));
    resolveConflict(haAwayNeg, x1Final, 'Handicap -0.5 Visitante vs 1X');

    // ── Regla 9: Handicap Positivo (+1.5/+2.0) + Victoria del mismo lado ──
    const haLocalPos = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Local') && p.selection.includes('+'));
    const haLocalNeg2 = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Local') && p.selection.includes('-'));
    resolveConflict(haLocalPos, haLocalNeg2, 'HA + Local vs HA - Local');

    const haAwayPos = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Visitante') && p.selection.includes('+'));
    const haAwayNeg2 = findPicks(p => p.market === 'Handicap Asiático' && p.selection.includes('Visitante') && p.selection.includes('-'));
    resolveConflict(haAwayPos, haAwayNeg2, 'HA + Visitante vs HA - Visitante');

    // ── Regla 8: Doble Oportunidad duplicada del mismo lado ──
    const all1X = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('1X') || (p.selection.includes('Local') && !p.selection.includes('Visitante'))));
    if (all1X.length > 1) {
      const best1X = all1X.sort((a, b) => b.probability - a.probability)[0];
      all1X.slice(1).forEach(dup => markForRemoval(dup, `Duplicado 1X: fusionado con "${best1X.selection}" (${best1X.probability}%)`));
    }

    const allX2 = findPicks(p => p.market === 'Doble Oportunidad' && (p.selection.includes('X2') || (p.selection.includes('Visitante') && !p.selection.includes('Local'))));
    if (allX2.length > 1) {
      const bestX2 = allX2.sort((a, b) => b.probability - a.probability)[0];
      allX2.slice(1).forEach(dup => markForRemoval(dup, `Duplicado X2: fusionado con "${bestX2.selection}" (${bestX2.probability}%)`));
    }
    return findPicks(() => true);
}

export function filterAndSortPicks(consistentPicks, {
  isDerby, isLive, advancedStats, homeAvgGF, awayAvgGF, 
  isRelegationBattle, isLiga1Peru, altitudeRisk, homeEffectiveScore, awayEffectiveScore,
  SAUDI_BIG4, homeTeamName, awayTeamName, AFA_GIANTS,
  leagueName = '', homeACL = {}, awayACL = {}, isLaLiga = false, laLigaRelegationZone = false, awayIsLaLigaGiant = false,
  isDeadRubber = false, dynamicMinProb = 75, homeAvgGA = 1.0, awayAvgGA = 1.0
}) {
    let filtered = consistentPicks.filter(p => {
    if (!p.tier) return false;
    
    // Filtro Apagón (Blackout Filter)
    const isPremier = leagueName.toLowerCase().includes('premier');
    const isGoalMarket = p.market === 'Total de Goles' || p.market === 'Ambos Marcan' || p.market === 'Combo';
    
    if (isPremier && isGoalMarket) {
      return false; // Bloqueo total
    }

    // ── MÓDULO ARABIA SAUDÍ (Saudi Pro League) ──────────────────────
    const isSaudi = leagueName.toLowerCase().includes('saudi') || leagueName.toLowerCase().includes('arabia');
    const LOCAL_SAUDI_BIG4 = ['Al-Hilal', 'Al Hilal', 'Al-Nassr', 'Al Nassr', 'Al-Ahli', 'Al Ahli', 'Al-Ittihad', 'Al Ittihad'];
    const homeIsBig4 = LOCAL_SAUDI_BIG4.some(t => homeTeamName?.includes(t));
    const awayIsBig4 = LOCAL_SAUDI_BIG4.some(t => awayTeamName?.includes(t));
    const isBig4Match = isSaudi && (homeIsBig4 || awayIsBig4);

    const isPositiveHandicap = p.market === 'Handicap Asiático' && p.selection.includes('+');
    if ((p.market === 'Ganador del Partido' || p.market === 'Handicap Asiático') && !isPositiveHandicap) {
      const favorsHome = p.selection.includes('Local') || p.selection.includes('Local');
      const favorsAway = p.selection.includes('Visitante');
      if (isSaudi) {
        if (favorsHome && homeACL?.isAtRisk) return false; 
        if (favorsAway && awayACL?.isAtRisk) return false;
      }
      const threshold = isBig4Match ? 80 : 82;
      if (p.probability < threshold) return false;
    }

    // ── MÓDULO AFA (Liga Profesional Argentina) ──────────────────────
    const isAFA = leagueName.toLowerCase().includes('argentina');
    
    if (isAFA && ['Córners Totales', 'Faltas Totales'].includes(p.market)) {
      return false;
    }

    if (isAFA && p.market === 'Ganador del Partido') {
      const LOCAL_AFA_GIANTS = ['Boca Juniors', 'River Plate'];
      const awayIsGiant = LOCAL_AFA_GIANTS.some(t => awayTeamName?.includes(t));
      if (awayIsGiant && p.selection.includes('Visitante') && advancedStats?.away?.xG < 1.2) {
        p.probability -= 10;
        p.argument = `[⚠️ MODO AFA] ${p.argument} (El gigante visitante llega en mala forma ofensiva, cuota posiblemente inflada).`;
      }
    }

    // ── MÓDULO LaLiga (España) ──────────────────────────────────────
    if (isLaLiga) {
      if (p.market === 'Faltas Totales') return false;

      if (awayIsLaLigaGiant && laLigaRelegationZone && p.market === 'Ganador del Partido' && p.selection.includes('Visitante')) {
        p.probability = Math.max(p.probability - 8, 60);
        p.argument = `[🇪🇸 LaLiga] ${p.argument} (⚠️ Rival en descenso juega cerrado ante grande — riesgo de partido tenso y a la contra).`;
      }

      if (laLigaRelegationZone && p.selection === 'Más de 2.5 goles') return false;

      if (laLigaRelegationZone && p.selection.includes('Menos de') && !p.argument.includes('[🇪🇸')) {
        p.argument = `[🇪🇸 LaLiga · Fin Temporada] ${p.argument}`;
      }
    }

    // Umbrales Inteligentes por Mercado
    const isValueCategory = p.category === 'valor';
    let requiredProb;
    if (p.market === 'Doble Oportunidad') {
      const hasSurvivalBoost = p.argument && p.argument.includes('Efecto Supervivencia');
      if (hasSurvivalBoost) {
        requiredProb = 40;
      } else {
        requiredProb = isLaLiga ? 65 : (isAFA ? 65 : (isDeadRubber ? 78 : 68));
      }
    } else if (['Córners Totales', 'Tarjetas Totales', 'Remates al Arco', 'Faltas Totales'].includes(p.market)) {
      requiredProb = isDeadRubber ? 75 : 65;
    } else if (isGoalMarket && isSaudi) {
      const involvesBig4 = homeIsBig4 || awayIsBig4;
      requiredProb = (isDeadRubber || isRelegationBattle) ? 75 : (involvesBig4 ? 65 : 72);
    } else if (isGoalMarket && isLaLiga) {
      if (p.selection.includes('Menos de')) {
        requiredProb = laLigaRelegationZone ? 68 : 72;
      } else {
        requiredProb = laLigaRelegationZone ? 80 : 75;
      }
    } else if (isAFA && p.selection === 'Menos de 2.5 goles') {
      const bothDefensesGood = homeAvgGA < 1.1 && awayAvgGA < 1.1;
      requiredProb = bothDefensesGood ? 70 : 78;
      if (bothDefensesGood && p.probability >= requiredProb && !p.argument.includes('[🛡️ MODO AFA]')) {
         p.argument = `[🛡️ MODO AFA] ${p.argument} (Liga de baja anotación y ambas defensas sólidas).`;
      }
    } else {
      requiredProb = isDeadRubber ? 82 : Math.max(72, dynamicMinProb - 8);
    }

    if (isValueCategory && p.probability >= requiredProb - 15) return true;
    
    return p.probability >= requiredProb;
  });

  // ── FILTRO ANTI-CLÁSICOS (SNIPER MODE) ────────────────────────
  const bothTeamsScoringWell = (advancedStats?.home?.xG >= 1.8 && advancedStats?.away?.xG >= 1.8) || (homeAvgGF >= 1.8 && awayAvgGF >= 1.8);

  if (isDerby && !isLive && !bothTeamsScoringWell) {
    filtered = filtered.filter(p => 
      p.selection.includes('Menos de 2.5') || 
      p.selection.includes('Menos de 3.5') ||
      p.selection === 'Empate' ||
      p.market === 'Tarjetas Totales'
    );
    
    if (filtered.length === 0) {
      filtered.push({
        market: 'Total de Goles',
        selection: 'Menos de 3.5 goles',
        probability: 85,
        tier: '🟢',
        argument: `[🚨 MODO DERBI] Partido de Altísima Tensión detectado. La estadística histórica de forma se anula en los clásicos. Se espera un partido táctico y cerrado.`,
        risk: 'Bajo',
      });
    } else {
      filtered.forEach(p => p.argument = `[🚨 MODO DERBI] ${p.argument}`);
    }
  }

  // ── MODO DESCENSO (RELEGATION BATTLE) ──────────────────────
  if (isRelegationBattle && !isLive) {
    filtered = filtered.filter(p => {
       if (p.selection.includes('Más de') || p.selection === 'Ambos Anotan: Sí') return false;
       return true;
    });

    const hasUnder35 = filtered.some(p => p.selection === 'Menos de 3.5 goles');
    if (!hasUnder35) {
      filtered.push({
        market: 'Total de Goles',
        selection: 'Menos de 3.5 goles',
        probability: 85,
        tier: '🟢',
        argument: `[📉 MODO DESCENSO] Duelo directo por la permanencia. Ambos equipos priorizarán no cometer errores antes que atacar. Se espera un trámite muy cerrado.`,
        risk: 'Bajo',
      });
    }

    filtered.forEach(p => {
      if (!p.argument.includes('[📉 MODO DESCENSO]')) {
        p.argument = `[📉 MODO DESCENSO] ${p.argument} (Partido de alta tensión por el descenso).`;
      }
    });
  }

  // ── MODO SNIPER (ELITE FILTER) ───────────────────────────────
  filtered = filtered.map(p => {
    const isBig3Dominance = isLiga1Peru && (homeEffectiveScore >= 82 || awayEffectiveScore >= 82);
    const isExtremeAltitudeWin = isLiga1Peru && altitudeRisk === 'high' && p.selection.includes('Local');
    
    const isElite = p.probability >= 88 || (isLiga1Peru && p.probability >= 84 && (isBig3Dominance || isExtremeAltitudeWin));
    
    if (isElite) {
      return {
        ...p,
        tier: '💎',
        argument: `[🎯 SNIPER] ${p.argument}`,
        risk: 'Bajo'
      };
    }
    return p;
  });

  // ── Filtro de Cuota Mínima (Boring Odds Filter) ─────────────────
  const MIN_ODDS = 1.20;
  filtered = filtered.filter(p => {
    const o = parseFloat(p.odds);
    if (!o || isNaN(o)) return true;
    return o >= MIN_ODDS;
  });

  const livePicks   = filtered.filter(p => p.tier === '🔥');
  const valuePicks  = filtered.filter(p => p.tier !== '🔥' && (p.tier === '💎' || p.category === 'valor'));
  const moderadas   = filtered.filter(p => p.tier !== '🔥' && p.tier !== '💎' && p.category === 'moderada');
  const seguras     = filtered.filter(p => p.tier !== '🔥' && p.tier !== '💎' && p.category === 'segura');

  const sortedValor = [...valuePicks].sort((a, b) => (parseFloat(b.odds) || 0) - (parseFloat(a.odds) || 0));
  const sortedSeguras = [...seguras].sort((a, b) => b.probability - a.probability);
  const sortedModeradas = [...moderadas].sort((a, b) => b.probability - a.probability);

  const finalPicks = [
    ...sortedValor.slice(0, 3),
    ...sortedModeradas.slice(0, 2),
    ...sortedSeguras.slice(0, 2),
    ...livePicks.slice(0, 1)
  ];
  return { finalPicks, valuePicks, moderadas, seguras, livePicks };
}
