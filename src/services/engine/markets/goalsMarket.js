// ── Markets: Goals (Over/Under, BTTS, Combo, Goal por Tramo) ──────────
// Genera picks de mercados de goles a partir del estado global del partido.

export function generateGoalsPicks({ args, state, addPick }) {
  const { isLive, h2hData, homeForm, awayForm, poissonProbs, homeSlots, awaySlots, marketInsight, homeSplitStats, awaySplitStats, leagueName } = args;
  const { projectedGoals, homeAvgGF, awayAvgGF, homeAvgGA, awayAvgGA, h2hWeight, teamWeight, isLaLiga, isSaudi, isMLS, isSudamericana, laLigaRelegationZone, eloCombined, homeContextNote, awayContextNote, altitudeRisk, isLiga1Peru, relaxationGoalsPenalty, combinedOver25: stateCombinedOver25 } = state;
  const isDefensiveLeague = /serie a|primeira liga|portugal|italia/i.test(leagueName);
  const isLiga1PeruLocal = /liga 1|liga1|peru|perú/i.test(leagueName);

  // ── Boost de confianza desde datos de cuotas (ESPN PickCenter) ──
  const officialHomeWinPct = marketInsight ? parseInt(marketInsight.predictions?.percent?.home) || 0 : 0;
  const officialDrawPct    = marketInsight ? parseInt(marketInsight.predictions?.percent?.draw)  || 0 : 0;
  const officialAwayWinPct = marketInsight ? parseInt(marketInsight.predictions?.percent?.away)  || 0 : 0;
  const officialWinner     = marketInsight?.predictions?.winner?.comment || '';
  const hasOfficial        = officialHomeWinPct + officialDrawPct + officialAwayWinPct > 0;

  // ── Over 2.5 ──────────────────────────────────────────────────
  const homeOver25Pct  = homeSplitStats?.over25Pct ?? 0;
  const awayOver25Pct  = awaySplitStats?.over25Pct ?? 0;
  const h2hOver25Pct   = h2hData?.over25Pct ?? 0;
  let combinedOver25 = Math.round(homeOver25Pct * teamWeight + awayOver25Pct * teamWeight + h2hOver25Pct * h2hWeight);

  // ── Over 1.5 ──────────────────────────────────────────────────
  const homeOver15Pct  = homeSplitStats?.over15Pct ?? 0;
  const awayOver15Pct  = awaySplitStats?.over15Pct ?? 0;
  const h2hOver15Pct   = h2hData?.over15Pct ?? (h2hData ? Math.min(Math.round(h2hData.over25Pct * 1.2), 100) : 0);
  let combinedOver15 = Math.round(homeOver15Pct * teamWeight + awayOver15Pct * teamWeight + h2hOver15Pct * h2hWeight);

  // Penalización directa a los Over por desmotivación/partidos trabados
  if (relaxationGoalsPenalty > 0) {
    combinedOver15 = Math.max(combinedOver15 - 18, 0);
    combinedOver25 = Math.max(combinedOver25 - 25, 0);
  }
  
  const isDeepDefensiveLeague = /arg|uru|sudamericana/i.test(leagueName);
  const over15Threshold = isDeepDefensiveLeague ? 2.5 : (isDefensiveLeague ? 2.3 : 1.8);
  const requiredCombinedOver15 = isDeepDefensiveLeague ? 85 : 78;
  
  if (combinedOver15 >= requiredCombinedOver15 && projectedGoals >= over15Threshold) {
    const dcBoost15 = parseFloat(eloCombined.over15) >= combinedOver15 + 7 ? 3 : 0;
    const prob = Math.min(combinedOver15 + dcBoost15, 91);
    if (prob >= 68) {
      addPick({
        market: 'Total de Goles',
        selection: 'Más de 1.5 goles',
        probability: prob,
        tier: prob >= 85 ? '🟢' : prob >= 75 ? '🔵' : '🟡',
        argument: `${combinedOver15}% de partidos con 2+ goles (DC: ${eloCombined.over15}%). Proyección: ${projectedGoals} goles.${dcBoost15 > 0 ? ' ✅ Dixon-Coles confirma.' : ''}`,
        risk: prob >= 85 ? 'Bajo' : 'Moderado',
      });
    }
  }

  // ── Over 2.5 ──────────────────────────────────────────────────
  const over25Threshold = isLiga1PeruLocal ? 3.2 : isDefensiveLeague ? 2.7 : 2.5;
  const over25MinCombined = isLiga1PeruLocal ? 78 : 70;
  if (combinedOver25 >= over25MinCombined && projectedGoals >= over25Threshold) {
    const officialBoost = hasOfficial && officialWinner?.toLowerCase().includes('goals') ? 4 : 0;
    const dcBoost25 = parseFloat(eloCombined.over25) >= over25MinCombined ? 3 : 0;
    const prob = Math.min(combinedOver25 + officialBoost + dcBoost25, 88);
    if (prob >= 62) {
      const ctxNote = [homeContextNote, awayContextNote].filter(Boolean).join(' · ');
      addPick({
        market: 'Total de Goles',
        selection: 'Más de 2.5 goles',
        probability: prob,
        tier: prob >= 82 ? '🟢' : prob >= 72 ? '🔵' : '🟡',
        argument: `${combinedOver25}% histórico con 3+ goles · DC: ${eloCombined.over25}% · λ ${eloCombined.lambdaHome}+${eloCombined.lambdaAway}. Proyección: ${projectedGoals} goles.${dcBoost25 > 0 ? ' ✅ Doble confirmación.' : ''}${ctxNote ? ` Contexto: ${ctxNote}.` : ''}`,
        risk: prob >= 82 ? 'Bajo' : 'Moderado',
      });
    }
  }

  // ── Over 3.5 ──────────────────────────────────────────────────
  const homeOver35Pct  = homeSplitStats?.over35Pct ?? 0;
  const awayOver35Pct  = awaySplitStats?.over35Pct ?? 0;
  const h2hOver35Pct   = h2hData ? Math.round(h2hData.over25Pct * 0.6) : 0;
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
  const under25GoalsThreshold = isLaLiga ? 2.3 : 2.0;
  const under25MinCombined    = isLaLiga ? 68  : 72;
  if (under25Pct >= under25MinCombined && projectedGoals <= under25GoalsThreshold) {
    const laLigaUnderBoost = (isLaLiga && laLigaRelegationZone) ? 8 : (isLaLiga ? 4 : 0);
    const prob = Math.min(under25Pct + laLigaUnderBoost, 87);
    if (prob >= 65) {
      const laLigaNote = isLaLiga
        ? (laLigaRelegationZone
            ? ' [🇪🇸 LaLiga · Zona Descenso] Partido de máxima tensión táctica al final de temporada.'
            : ' [🇪🇸 LaLiga] Liga de baja anotación — proyección ajustada al modelo español.')
        : '';
      addPick({
        market: 'Total de Goles',
        selection: 'Menos de 2.5 goles',
        probability: prob,
        tier: prob >= 82 ? '🟢' : '🔵',
        argument: `${under25Pct}% de probabilidad de partido cerrado. Proyección: ${projectedGoals} goles. Defensa sólida de ambos equipos.${laLigaNote}`,
        risk: prob >= 82 ? 'Bajo' : 'Moderado',
      });
    }
  }

  // ── Ambos Anotan ───────────────────────────────────────────────
  const homeBttsPct  = homeSplitStats?.bttsPct ?? 0;
  const awayBttsPct  = awaySplitStats?.bttsPct ?? 0;
  const h2hBttsPct   = h2hData?.bttsPct ?? 0;
  const combinedBTTS = Math.round(homeBttsPct * teamWeight + awayBttsPct * teamWeight + h2hBttsPct * h2hWeight);

  let bttsThreshold = 2.5;
  let bttsMinCombined = 70;
  if (isLiga1PeruLocal) {
    if (altitudeRisk) {
      bttsThreshold = 3.2;
      bttsMinCombined = 82;
    } else {
      bttsThreshold = 2.4;
      bttsMinCombined = 68;
    }
  }

  if (combinedBTTS >= bttsMinCombined && projectedGoals >= bttsThreshold) {
    const prob = Math.min(combinedBTTS, 87);
    if (prob >= 62) {
      addPick({
        market: 'Ambos Marcan',
        selection: 'Sí, ambos anotan',
        probability: prob,
        tier: prob >= 82 ? '🟢' : prob >= 72 ? '🔵' : '🟡',
        argument: `${combinedBTTS}% de partidos con gol de ambos equipos. Local anota ${homeAvgGF}/p, Visitante ${awayAvgGF}/p. ${isLiga1PeruLocal && altitudeRisk ? '(A pesar de la altura)' : ''}`,
        risk: prob >= 82 ? 'Bajo' : 'Moderado',
      });
    }
  }

  // ── BTTS + Over 2.5 (Combo) ────────────────────────────────────
  if (combinedBTTS >= 68 && combinedOver25 >= 65 && projectedGoals >= 2.6 && awayAvgGF > 1.1) {
    const prob = Math.min(Math.round((combinedBTTS + combinedOver25) / 2) - 5, 80);
    if (prob >= 52) {
      addPick({
        market: 'Combo',
        selection: 'Ambos Marcan + Más de 2.5',
        probability: prob,
        tier: prob >= 65 ? '🔵' : '🟡',
        argument: `BTTS: ${combinedBTTS}% · Over 2.5: ${combinedOver25}%. Alta probabilidad de partido abierto con gol de ambos y 3+ goles en total.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Gol en el 2do Tiempo (datos de tramos) ────────────────────
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

  // Exportar combinedOver25 para uso en otros mercados (winnerMarket necesita)
  state.combinedOver25 = combinedOver25;
  state.combinedBTTS = combinedBTTS;
}
