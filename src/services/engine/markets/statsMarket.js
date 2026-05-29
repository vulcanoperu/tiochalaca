// ── Markets: Stats (Córners, Tarjetas, Remates, Faltas) ───────────────
// Genera picks de mercados secundarios y props basados en promedios y contexto.

export function generateStatsPicks({ args, state, addPick }) {
  const { homeCornersData, awayCornersData, homeCardsData, awayCardsData, homeShotsData, awayShotsData, homeFoulsData, awayFoulsData, isLive, leagueName, matchStandings, refereeStats } = args;
  const { isLiga1Peru, isLaLiga, isDerby } = state;

  if (isLive) return; // Stats markets only for pre-match

  // ── Córners del partido (ambos equipos) ───────────────────────────
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
        probability: Math.min(over8Pct, 88),
        tier: over8Pct >= 75 ? '🔵' : '🟡',
        argument: `Promedio combinado de córners: ${combinedAvgCorners.toFixed(1)}/p. Local: ${homeCornersData.avg}/p · Visitante: ${awayCornersData.avg}/p. El ${over8Pct}% de sus partidos superan esta línea.`,
        risk: over8Pct >= 75 ? 'Moderado' : 'Alto',
      });
    }
    if (over10Pct >= 55 && combinedAvgCorners >= 10) {
      addPick({
        market: 'Córners Totales',
        selection: 'Más de 10.5 córners',
        probability: Math.min(over10Pct, 86),
        tier: '🟡',
        argument: `${over10Pct}% de partidos con 11+ córners combinados. Promedio: ${combinedAvgCorners.toFixed(1)}/p.`,
        risk: 'Alto',
      });
    }
  }

  // ── Tarjetas del partido (ambos equipos + Árbitro) ─────────────────
  if (homeCardsData && awayCardsData && homeCardsData.matches >= 4 && awayCardsData.matches >= 4) {
    let combinedAvgCards = parseFloat(homeCardsData.avg) + parseFloat(awayCardsData.avg);
    let overCardsPct = Math.round(
      ((homeCardsData.over2 / homeCardsData.matches) * 0.5 +
       (awayCardsData.over2 / awayCardsData.matches) * 0.5) * 100
    );

    let targetCards = 3.5;
    let minPct = 60;
    let tensionNote = '';
    let refereeNote = '';

    if (refereeStats && refereeStats.matches > 0) {
      const refAvg = refereeStats.avgYellow + refereeStats.avgRed;
      const refBias = refAvg - 5.0; // Media de liga asumida
      if (refBias >= 1.0) { // Árbitro muy tarjetero
        overCardsPct = Math.min(overCardsPct + 15, 95);
        targetCards = 4.5;
        refereeNote = `⚖️ Árbitro riguroso (${refereeStats.name}): Promedia ${refAvg.toFixed(1)} tarjetas por partido.`;
      } else if (refBias <= -1.0) { // Árbitro muy permisivo
        overCardsPct = Math.max(overCardsPct - 15, 0);
        refereeNote = `⚖️ Árbitro permisivo (${refereeStats.name}): Solo promedia ${refAvg.toFixed(1)} tarjetas.`;
      } else {
        refereeNote = `⚖️ Árbitro (${refereeStats.name}): ${refAvg.toFixed(1)} tarjetas (Promedio neutro).`;
      }
    }

    if (isLiga1Peru) {
      const isRelegationFight = matchStandings && matchStandings.total >= 10 && 
        (matchStandings.homeRank >= matchStandings.total - 4 || matchStandings.awayRank >= matchStandings.total - 4);
      
      if (isDerby || isRelegationFight) {
        overCardsPct = Math.min(overCardsPct + 20, 90);
        targetCards = 4.5;
        minPct = 55;
        tensionNote = isDerby ? '🔥 Clásico de alta fricción.' : '🔥 Partido de vida o muerte (descenso).';
      }
    }

    if (isLaLiga) {
      const isLaLigaRelegFight = matchStandings && matchStandings.total >= 18 &&
        (matchStandings.homeRank >= matchStandings.total - 4 || matchStandings.awayRank >= matchStandings.total - 4);
      if (isLaLigaRelegFight || isDerby) {
        overCardsPct = Math.min(overCardsPct + 15, 90);
        targetCards  = 4.5;
        minPct       = 58;
        tensionNote  = isLaLigaRelegFight
          ? '🇪🇸 VAR + Descenso LaLiga: nerviosismo extremo, tarjetazo seguro.'
          : '🇪🇸 Derbi LaLiga con VAR activo.';
      } else {
        overCardsPct = Math.min(overCardsPct + 6, 90);
        tensionNote  = '🇪🇸 LaLiga: VAR estricto eleva media de tarjetas.';
      }
    }

    if (overCardsPct >= minPct && combinedAvgCards >= 3) {
      addPick({
        market: 'Tarjetas Totales',
        selection: `Más de ${targetCards} tarjetas`,
        probability: Math.min(overCardsPct, 88),
        tier: overCardsPct >= 75 ? '🔵' : '🟡',
        argument: `Promedio combinado: ${combinedAvgCards.toFixed(1)}/p. ${tensionNote} ${refereeNote}`,
        risk: targetCards > 3.5 ? 'Alto' : 'Moderado',
      });
    }
  }

  // ── Remates al Arco (Shots on Target) ────────────────────────────
  if (homeShotsData && awayShotsData && homeShotsData.matches >= 4 && awayShotsData.matches >= 4) {
    const combinedAvgShots = parseFloat(homeShotsData.avg) + parseFloat(awayShotsData.avg);
    const overShotsPct = Math.round(
      ((homeShotsData.over4 / homeShotsData.matches) * 0.5 +
       (awayShotsData.over4 / awayShotsData.matches) * 0.5) * 100
    );
    if (overShotsPct >= 65 && combinedAvgShots >= 8.5) {
      addPick({
        market: 'Remates al Arco',
        selection: 'Más de 8.5 remates al arco',
        probability: Math.min(overShotsPct, 88),
        tier: '🔵',
        argument: `Promedio combinado: ${combinedAvgShots.toFixed(1)}/p. Ambos equipos generan muchas ocasiones directas a portería.`,
        risk: 'Moderado',
      });
    }
  }

  // ── Faltas Cometidas (Fouls) ─────────────────────────────────────
  if (homeFoulsData && awayFoulsData && homeFoulsData.matches >= 4 && awayFoulsData.matches >= 4) {
    const combinedAvgFouls = parseFloat(homeFoulsData.avg) + parseFloat(awayFoulsData.avg);
    const overFoulsPct = Math.round(
      ((homeFoulsData.over11 / homeFoulsData.matches) * 0.5 +
       (awayFoulsData.over11 / awayFoulsData.matches) * 0.5) * 100
    );
    if (overFoulsPct >= 65 && combinedAvgFouls >= 22.5) {
      addPick({
        market: 'Faltas Totales',
        selection: 'Más de 22.5 faltas',
        probability: Math.min(overFoulsPct, 86),
        tier: '🟡',
        argument: `Promedio combinado: ${combinedAvgFouls.toFixed(1)}/p. Historial de mucha fricción e interrupciones.`,
        risk: 'Moderado',
      });
    }
  }
}