// ── Markets: Winner (1X2, Doble Oportunidad, Handicap) ────────────────
// Genera picks para los resultados finales del partido.

import { poissonProb } from '../poissonMath.js';

export function generateWinnerPicks({ args, state, addPick }) {
  const { h2hData, homeForm, awayForm, poissonProbs, homeTeamName, awayTeamName, marketOdds, city, isLive, marketInsight, homeFormAtHome, awayFormAway } = args;
  const { homeEffectiveScore, awayEffectiveScore, h2hWeight, teamWeight, survivalBoost1X, survivalBoostHomeWin, survivalBoostX2, survivalBoostAwayWin, isHomeHierarchy, isAwayHierarchy, isLaLiga, isSaudi, isMLS, isLiga1Peru, isDerby, altitudeRisk, homeContextNote, awayContextNote, eloCombined, homeAvgGA, awayAvgGA, lambdaHome, lambdaAway, projectedGoals, combinedOver25 } = state;
  const AFA_GIANTS = ['river plate', 'boca juniors', 'racing', 'independiente', 'san lorenzo'];
  const SAUDI_BIG4 = ['al-hilal', 'al-nassr', 'al-ahli', 'al-ittihad'];
  
  const officialHomeWinPct = marketInsight ? parseInt(marketInsight.predictions?.percent?.home) || 0 : 0;
  const officialDrawPct    = marketInsight ? parseInt(marketInsight.predictions?.percent?.draw)  || 0 : 0;
  const officialAwayWinPct = marketInsight ? parseInt(marketInsight.predictions?.percent?.away)  || 0 : 0;
  const hasOfficial        = officialHomeWinPct + officialDrawPct + officialAwayWinPct > 0;

  const officialHomeBoost = officialHomeWinPct > 55 ? 5 : 0;
  const officialAwayBoost = officialAwayWinPct > 55 ? 5 : 0;
  
  const effectiveAdv = homeEffectiveScore - awayEffectiveScore;
  const homeScoreAdv = homeForm.score - awayForm.score;
  const eloLabel = eloCombined ? `Elo Adv: ${(eloCombined._elo.eloDiff / 10).toFixed(0)}pts` : '';

  // Pick de EMPATE desde Poisson
  if (!isLive && poissonProbs && poissonProbs.draw >= 30 && (h2hData?.drawPct ?? 0) >= 25) {
    const drawProb = Math.round(poissonProbs.draw * 0.6 + (h2hData?.drawPct ?? 25) * 0.4);
    if (drawProb >= 25 && drawProb <= 55) {
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

  // ── Ganador: Local ─────────────────────────────────────────────
  if (!isLive && homeEffectiveScore >= 58 && awayEffectiveScore <= 52 && effectiveAdv >= 12) {
    let prob = Math.min(Math.round(homeEffectiveScore * 0.6 + (h2hData?.homeWinPct ?? 50) * 0.4) + officialHomeBoost + survivalBoostHomeWin, 86);
    if (prob >= 60) {
      const splitNote = homeFormAtHome?.total >= 3 ? ` (Casa: ${homeFormAtHome.wins}G/${homeFormAtHome.total}PJ)` : '';
      addPick({
        market: 'Ganador del Partido',
        selection: 'Victoria Local',
        probability: prob,
        tier: prob >= 80 ? '🔵' : prob >= 70 ? '🟡' : '💎',
        argument: `Forma local efectiva: ${homeEffectiveScore}% (Gral: ${homeForm.score}%)${splitNote}. Visitante efectivo: ${awayEffectiveScore}% (Gral: ${awayForm.score}%). Ventaja: +${effectiveAdv.toFixed(1)}pts. H2H: ${h2hData?.homeWinPct ?? '?'}%. ${eloLabel}. DC Win: ${eloCombined?.home ?? '?'}%.${hasOfficial ? ` Oficial: ${officialHomeWinPct}%.` : ''}`,
        risk: 'Moderado',
        units: '3-5u',
      });
    }
  }

  // ── Ganador: Visitante ─────────────────────────────────────────
  if (!isLive && awayEffectiveScore >= 58 && homeEffectiveScore <= 52 && -effectiveAdv >= 12) {
    let prob = Math.min(Math.round(awayEffectiveScore * 0.6 + (h2hData?.awayWinPct ?? 50) * 0.4) + officialAwayBoost + survivalBoostAwayWin, 86);
    if (prob >= 60) {
      const splitNote = awayFormAway?.total >= 3 ? ` (Fuera: ${awayFormAway.wins}G/${awayFormAway.total}PJ)` : '';
      addPick({
        market: 'Ganador del Partido',
        selection: 'Victoria Visitante',
        probability: prob,
        tier: prob >= 80 ? '🔵' : prob >= 70 ? '🟡' : '💎',
        argument: `Forma visitante efectiva: ${awayEffectiveScore}% (Gral: ${awayForm.score}%)${splitNote}. Local efectivo: ${homeEffectiveScore}% (Gral: ${homeForm.score}%). H2H: ${h2hData?.awayWinPct ?? '?'}%. ${eloLabel}. DC Win: ${eloCombined?.away ?? '?'}%.${hasOfficial ? ` Oficial: ${officialAwayWinPct}%.` : ''}`,
        risk: 'Moderado',
        units: '3-5u',
      });
    }
  }

  // ── Handicap Asiático -0.5 (Local favorito claro) ──────────────
  if (!isLive && homeForm.score >= 65 && homeScoreAdv >= 18 && (h2hData?.homeWinPct ?? 0) >= 40) {
    const prob = Math.min(Math.round(homeForm.score * 0.55 + (h2hData?.homeWinPct ?? 50) * 0.35 + officialHomeWinPct * 0.1), 85);
    if (prob >= 55) {
      addPick({
        market: 'Handicap Asiático',
        selection: 'Local -0.5 (Gana sin empate)',
        probability: prob,
        tier: prob >= 78 ? '🔵' : prob >= 65 ? '🟡' : '💎',
        argument: `Local claramente superior (Forma: ${homeForm.score}%, ventaja +${homeScoreAdv}pts). HA -0.5 elimina el riesgo de empate con mejor cuota que 1X2.`,
        risk: 'Moderado',
        units: '3-4u',
      });
    }
  }

  // ── Handicap Asiático -0.5 (Visitante favorito claro) ──────────
  if (!isLive && awayForm.score >= 65 && -homeScoreAdv >= 18 && (h2hData?.awayWinPct ?? 0) >= 40) {
    const prob = Math.min(Math.round(awayForm.score * 0.55 + (h2hData?.awayWinPct ?? 50) * 0.35 + officialAwayWinPct * 0.1), 85);
    if (prob >= 55) {
      addPick({
        market: 'Handicap Asiático',
        selection: 'Visitante -0.5 (Gana sin empate)',
        probability: prob,
        tier: prob >= 78 ? '🔵' : prob >= 65 ? '🟡' : '💎',
        argument: `Visitante claramente superior (Forma: ${awayForm.score}%, ventaja +${-homeScoreAdv}pts). HA -0.5 elimina el riesgo de empate.`,
        risk: 'Moderado',
        units: '3-4u',
      });
    }
  }

  // ── Handicap Asiático Positivo: Underdog +1.5 / +2.0 ──────────
  if (!isLive && marketOdds && lambdaHome !== undefined && lambdaAway !== undefined) {
    const homeML = marketOdds.home || 0;
    const awayML = marketOdds.away || 0;

    const homeFavMassive = homeML > 0 && homeML <= 1.25;
    const awayFavMassive = awayML > 0 && awayML <= 1.25;

    const homeMLAmerican = marketOdds.homeMoneyLine || 0;
    const awayMLAmerican = marketOdds.awayMoneyLine || 0;
    const homeFavByML = homeMLAmerican <= -400 || homeFavMassive;
    const awayFavByML = awayMLAmerican <= -400 || awayFavMassive;

    const homeFavByScore = effectiveAdv >= 25;
    const awayFavByScore = -effectiveAdv >= 25;

    const isMassiveFavorite = homeFavByML || awayFavByML || homeFavByScore || awayFavByScore;
    const favoriteIsHome = homeFavByML || homeFavByScore;

    if (isMassiveFavorite) {
      const underdogName   = favoriteIsHome ? awayTeamName : homeTeamName;
      const favoriteName   = favoriteIsHome ? homeTeamName : awayTeamName;
      const underdogAvgGA  = favoriteIsHome ? awayAvgGA : homeAvgGA;
      const underdogForm   = favoriteIsHome ? awayForm : homeForm;
      const underdogSide   = favoriteIsHome ? 'Visitante' : 'Local';
      const favoriteScore  = favoriteIsHome ? homeEffectiveScore : awayEffectiveScore;
      const underdogScore  = favoriteIsHome ? awayEffectiveScore : homeEffectiveScore;

      const defenseSolid  = underdogAvgGA <= 1.3;
      const h2hWasTight   = h2hData && h2hData.avgGoals <= 2.5;
      const underdogNotCollapsing = underdogForm.score >= 35;

      const scoreDiff = Math.abs(effectiveAdv);

      if ((defenseSolid || h2hWasTight) && underdogNotCollapsing) {
        const isExtremeFav = (homeMLAmerican <= -450 || awayMLAmerican <= -450) ||
                             (homeML > 0 && homeML <= 1.20) || (awayML > 0 && awayML <= 1.20) ||
                             scoreDiff >= 30;

        if (isExtremeFav && defenseSolid) {
          let probHA20 = 0;
          const lH = favoriteIsHome ? lambdaHome : lambdaAway;
          const lA = favoriteIsHome ? lambdaAway : lambdaHome;
          for (let f = 0; f <= 6; f++) {
            for (let u = 0; u <= 6; u++) {
              const p = poissonProb(lH, f) * poissonProb(lA, u);
              if (f - u <= 1) probHA20 += p;
            }
          }
          const prob20 = Math.min(Math.round(probHA20 * 100), 92);

          if (prob20 >= 60) {
            const h2hNote = h2hWasTight ? ` H2H cerrado (${h2hData.avgGoals} goles/p).` : '';
            addPick({
              market: 'Handicap Asiático',
              selection: `${underdogSide} +2.0 (Pierde por ≤1, empate o victoria)`,
              probability: prob20,
              tier: prob20 >= 82 ? '🟢' : prob20 >= 72 ? '🔵' : '🟡',
              argument: `${underdogName} concede solo ${underdogAvgGA} goles/p → defensa ordenada contra favorito masivo.${h2hNote} Forma efectiva: ${favoriteName} ${favoriteScore}% vs ${underdogName} ${underdogScore}%.`,
              risk: prob20 >= 78 ? 'Bajo' : 'Moderado',
              units: '3-4u',
            });
          }
        }

        if (!isExtremeFav || !defenseSolid) {
          let probHA15 = 0;
          const lH2 = favoriteIsHome ? lambdaHome : lambdaAway;
          const lA2 = favoriteIsHome ? lambdaAway : lambdaHome;
          for (let f = 0; f <= 6; f++) {
            for (let u = 0; u <= 6; u++) {
              const p = poissonProb(lH2, f) * poissonProb(lA2, u);
              if (f - u <= 1) probHA15 += p;
            }
          }
          const prob15 = Math.min(Math.round(probHA15 * 100), 90);

          if (prob15 >= 62) {
            addPick({
              market: 'Handicap Asiático',
              selection: `${underdogSide} +1.5 (Pierde por ≤1 o no pierde)`,
              probability: prob15,
              tier: prob15 >= 80 ? '🟢' : prob15 >= 70 ? '🔵' : '🟡',
              argument: `${underdogName} no se deja golear fácil (${underdogAvgGA} GA/p). Forma efectiva: ${favoriteName} ${favoriteScore}% vs ${underdogName} ${underdogScore}%.`,
              risk: prob15 >= 75 ? 'Bajo' : 'Moderado',
              units: '2-3u',
            });
          }
        }
      }
    }
  }

  // ── Doble Oportunidad: Local o Empate (1X) ────────────────────
  if (!isLive && poissonProbs) {
    const prob1X = Math.round(poissonProbs.home + poissonProbs.draw);
    const h2hBase1X = h2hData ? (h2hData.homeWinPct + h2hData.drawPct) : prob1X;
    let combined1X = Math.round(prob1X * 0.6 + h2hBase1X * 0.4) + (survivalBoost1X || 0);

    const isAFA = leagueName.toLowerCase().includes('argentina');
    let threshold1X = isLiga1Peru ? 62 : (isAFA ? 65 : 68);
    
    if (survivalBoost1X >= 30) {
      threshold1X = 45;
    } else if (survivalBoost1X >= 25) {
      threshold1X = 60; 
    } else if (survivalBoost1X > 0) {
      threshold1X = 65;
    }

    const poissonThreshold = survivalBoost1X > 0 ? 80 : 70;

    if (combined1X >= threshold1X && poissonProbs.home < poissonThreshold) {
      const afaNote = isAFA ? `[🛡️ AFA Parity] ` : '';
      const survivalNote = survivalBoost1X > 0 ? `🔥 Efecto Supervivencia (+${survivalBoost1X}%). ` : '';
      addPick({
        market: 'Doble Oportunidad',
        selection: 'Local o Empate (1X)',
        probability: Math.min(combined1X, 86),
        tier: '🔵',
        argument: `${afaNote}${survivalNote}Poisson: Local ${poissonProbs.home.toFixed(1)}% + Empate ${poissonProbs.draw.toFixed(1)}%. Protección ante jerarquía visitante relajada.`,
        risk: 'Bajo',
        units: '3-4u',
      });
    }

    // ── Doble Oportunidad: Visitante o Empate (X2) ────────────────────
    const probX2 = Math.round(poissonProbs.away + poissonProbs.draw);
    const h2hBaseX2 = h2hData ? (h2hData.awayWinPct + h2hData.drawPct) : probX2;
    let combinedX2 = Math.round(probX2 * 0.6 + h2hBaseX2 * 0.4) + (survivalBoostX2 || 0);
    const thresholdX2 = 68;
    
    const poissonX2Threshold = survivalBoostX2 > 0 ? 80 : 70;

    if (combinedX2 >= thresholdX2 && poissonProbs.away < poissonX2Threshold) {
      const afaNote = isAFA ? `[🛡️ AFA Parity] ` : '';
      const survivalNote = survivalBoostX2 > 0 ? `🔥 Efecto Supervivencia (+${survivalBoostX2}%). ` : '';
      addPick({
        market: 'Doble Oportunidad',
        selection: 'Visitante o Empate (X2)',
        probability: Math.min(combinedX2, 86),
        tier: '🔵',
        argument: `${afaNote}${survivalNote}Poisson: Visitante ${poissonProbs.away.toFixed(1)}% + Empate ${poissonProbs.draw.toFixed(1)}%. Protección ante local relajado.`,
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
        odds: '1.80',
        tier: '🔥',
        argument: `Si el partido llega al minuto 30 sin goles, la cuota de goles subirá exponencialmente. Entrar ahí.`,
        risk: 'Moderado'
      });
    } else if (homeForm.score >= 65 && awayForm.score <= 45 && homeScoreAdv >= 20) {
      addPick({
        market: 'Estrategia en Vivo',
        selection: 'Victoria Local si empieza perdiendo',
        probability: 65,
        odds: '2.50',
        tier: '🔥',
        argument: `El local es superior. Si el visitante anota primero de forma inesperada, apostar a la remontada o empate (1X) local tendrá mucho valor.`,
        risk: 'Alto'
      });
    }
  }
}