import { translateToPeruvian, buildNarrativeArgument } from './narrativeBuilder.js';

export function createAddPickHelper(picks, args, state) {
  const { marketOdds, isLiga1Peru } = args;
  const { projectedGoals, homeEffectiveScore, awayEffectiveScore, homeAvgGF, awayAvgGF } = state;
  
  return function addPick(pick) {
    pick.argument = translateToPeruvian(pick.argument);
    pick.narrative = buildNarrativeArgument(pick.market, pick.selection);
    
    // 1. Calcular cuota teórica base
    let theoreticalOdds = null;
    if (pick.probability) {
      let fairOdds = 100 / pick.probability;
      theoreticalOdds = +(fairOdds * 0.95).toFixed(2);
      
      if (pick.selection === 'Más de 1.5 goles' && theoreticalOdds < 1.20) theoreticalOdds = 1.22;
      if (pick.selection === 'Más de 2.5 goles' && theoreticalOdds < 1.50) theoreticalOdds = 1.55;
      if (pick.selection === 'Menos de 2.5 goles' && theoreticalOdds < 1.40) theoreticalOdds = 1.45;
      if (pick.selection === 'Menos de 3.5 goles' && theoreticalOdds < 1.15) theoreticalOdds = 1.18;
      if (pick.selection.includes('empata o gana') && theoreticalOdds < 1.15) theoreticalOdds = 1.18;
      if (pick.market === 'Ganador del Partido' && theoreticalOdds < 1.30) theoreticalOdds = 1.35;
      
      if (theoreticalOdds < 1.05) theoreticalOdds = 1.05;
    }
    
    let finalOdds = theoreticalOdds;
    let isValueBet = false;
    let realMOdds = null;

    // 2. Cuotas reales de ESPN
    if (marketOdds && pick.probability) {
      const isPreMatchMarket = ['Total de Goles', 'Ganador del Partido', 'Handicap Asiático', 'Doble Oportunidad'].includes(pick.market);
      
      if (isPreMatchMarket) {
        let mOdds = null;
      
        if (pick.selection === 'Victoria Local' || pick.selection === 'Local -0.5 (Gana sin empate)') mOdds = marketOdds.home;
        if (pick.selection === 'Victoria Visitante' || pick.selection === 'Visitante -0.5 (Gana sin empate)') mOdds = marketOdds.away;
        if (pick.selection === 'Empate') mOdds = marketOdds.draw;
        
        if (marketOdds.overUnder === 2.5) {
          if (pick.selection === 'Más de 2.5 goles') mOdds = marketOdds.overOdds;
          if (pick.selection === 'Menos de 2.5 goles') mOdds = marketOdds.underOdds;
          
          if (pick.selection === 'Más de 1.5 goles' && marketOdds.overOdds) {
             mOdds = 1 + ((marketOdds.overOdds - 1) * 0.35);
             if (mOdds < 1.1) mOdds = 1.15;
          }
          if (pick.selection === 'Más de 3.5 goles' && marketOdds.overOdds) {
             mOdds = 1 + ((marketOdds.overOdds - 1) * 2.8);
          }
        }

        if (pick.selection === 'Local o Empate (1X)' && marketOdds.home && marketOdds.draw) {
          mOdds = (marketOdds.home * marketOdds.draw) / (marketOdds.home + marketOdds.draw);
        }
        if (pick.selection === 'Visitante o Empate (X2)' && marketOdds.away && marketOdds.draw) {
          mOdds = (marketOdds.away * marketOdds.draw) / (marketOdds.away + marketOdds.draw);
        }

        if (pick.selection.includes('+1.5') && marketOdds.spreadOddsAway) {
          mOdds = marketOdds.spreadOddsAway;
        }
        if (pick.selection.includes('+2.0') && marketOdds.spreadOddsAway) {
          mOdds = 1 + ((marketOdds.spreadOddsAway - 1) * 0.65);
          if (mOdds < 1.20) mOdds = 1.25;
        }

        if (mOdds && mOdds > 1.01) {
          realMOdds = mOdds;
          finalOdds = mOdds;
          
          const impliedProb = 100 / mOdds;
          if (pick.probability >= impliedProb + 5) {
             isValueBet = true;
             pick.tier = '💎';
             pick.argument = `¡VALUE BET! El mercado paga ${mOdds.toFixed(2)} (implica ${Math.round(impliedProb)}%). Nosotros proyectamos ${pick.probability}%. ` + pick.argument;
          }
        }
      }
    }

    if (!pick.odds) {
      pick.odds = finalOdds ? finalOdds.toFixed(2) : '1.80';
    }

    // 3. Kelly Criterion
    if (finalOdds && finalOdds > 1.0 && pick.probability) {
      const p = pick.probability / 100;
      const o = finalOdds;
      const fullKelly = (p * o - 1) / (o - 1);
      
      if (fullKelly > 0) {
        const quarterKelly = Math.min(fullKelly * 0.25, 0.05); 
        pick.suggestedStake = +(quarterKelly * 100).toFixed(1);
      } else {
        pick.suggestedStake = 0;
      }
    }

    // 4. Clasificación
    const oddsFinal = finalOdds || 1.80;
    if (pick.probability >= 78 && oddsFinal <= 1.55) {
      pick.category = 'segura';
      if (!pick.tier || pick.tier === '🟡') pick.tier = '🟢';
      if (!pick.risk || pick.risk === 'Alto') pick.risk = 'Bajo';
    } else if (isValueBet || (pick.probability >= 45 && pick.probability < 72 && oddsFinal >= 2.00)) {
      pick.category = 'valor';
      if (!isValueBet) pick.tier = '💎';
    } else {
      pick.category = 'moderada';
    }

    picks.push(pick);
  };
}
