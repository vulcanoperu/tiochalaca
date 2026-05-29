// ── Markets: Live (Apuestas en Vivo) ──────────────────────────────────
// Genera picks específicos para partidos que están en curso.

const HIERARCHY_TEAMS = [
  'river plate', 'boca juniors', 'racing', 'independiente', 'san lorenzo', 'estudiantes', 'velez',
  'flamengo', 'palmeiras', 'sao paulo', 'são paulo', 'corinthians', 'atletico mg', 'atlético mg',
  'gremio', 'grêmio', 'internacional', 'fluminense', 'botafogo', 'cruzeiro'
];

export function generateLivePicks({ args, state, addPick }) {
  const { isLive, liveClock, liveHomeGoals, liveAwayGoals, homeTeamName, awayTeamName, h2hData, homeForm, awayForm } = args;
  const { homeEffectiveScore, awayEffectiveScore, projectedGoals } = state;

  const min = parseInt(liveClock) || 0;
  const totalGoals = (liveHomeGoals || 0) + (liveAwayGoals || 0);
  const liveHomeAdv = homeEffectiveScore - awayEffectiveScore;

  // Goles restantes esperados (ajustado por tiempo transcurrido)
  const pctTimeLeft = Math.max(0, (90 - min) / 90);
  const goalsExpectedRemaining = +(projectedGoals * pctTimeLeft).toFixed(2);

  // 1. Gol en el 1er tiempo (0-0 y queda tiempo)
  if (min >= 15 && min <= 35 && totalGoals === 0 && projectedGoals >= 2.5) {
    const pctLeft1T = Math.max(0, (45 - min) / 45);
    const goalsLeft1T = +(projectedGoals * 0.45 * (1 - pctLeft1T * 0.3)).toFixed(2);
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

  // 2. Gol tardío (0-0 en el min 60+)
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

  // 4. Presión del favorito Local (usa scores efectivos penalizados)
  const isAwayHierarchy = HIERARCHY_TEAMS.some(t => awayTeamName.toLowerCase().includes(t));
  const requiredAdv = isAwayHierarchy ? 30 : 18;
  const requiredHomeScore = isAwayHierarchy ? 72 : 65;

  if (min >= 45 && liveHomeAdv >= requiredAdv && homeEffectiveScore >= requiredHomeScore) {
    if (liveHomeGoals < liveAwayGoals || liveHomeGoals === liveAwayGoals) {
      const isLosing = liveHomeGoals < liveAwayGoals;
      const situationLabel = isLosing
        ? `Va perdiendo ${liveHomeGoals}-${liveAwayGoals}. Momento de remontada.`
        : `Marcador igualado ${liveHomeGoals}-${liveAwayGoals}. Presión final: el local domina sin convertir.`;

      const liveProbability = Math.min(
        Math.round(homeEffectiveScore * 0.7 + (h2hData?.homeWinPct ?? 50) * 0.3),
        isAwayHierarchy ? 74 : 80
      );

      if (liveProbability >= 70) {
        addPick({
          market: 'Resultado en Vivo',
          selection: isLosing ? 'Local empata o gana (1X)' : 'Victoria Local',
          probability: liveProbability,
          tier: '🔥',
          argument: `Local superior en forma efectiva: ${homeEffectiveScore}% (Gral: ${homeForm.score}%) vs Visitante: ${awayEffectiveScore}% (Gral: ${awayForm.score}%). Min ${min}'. ${situationLabel}`,
          risk: isAwayHierarchy ? 'Alto' : 'Moderado',
        });
      }
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
