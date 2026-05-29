import { evaluateMatchState } from './matchEvaluator.js';
import { generateGoalsPicks } from './markets/goalsMarket.js';
import { generateWinnerPicks } from './markets/winnerMarket.js';
import { generateStatsPicks } from './markets/statsMarket.js';
import { generateLivePicks } from './markets/liveMarket.js';
import { resolveContradictoryPicks, filterAndSortPicks } from './pickFilters.js';
import { createAddPickHelper } from './valueBetOdds.js';

export function generatePicks(args) {
  const result = evaluateMatchState(args);
  if (result.abort) return { picks: [], reason: result.reason };
  const state = result.state;
  
  const picks = [];
  const addPick = createAddPickHelper(picks, args, state);
  
  if (args.isLive) {
    generateLivePicks({ args, state, addPick });
  } else {
    generateGoalsPicks({ args, state, addPick });
    generateWinnerPicks({ args, state, addPick });
    generateStatsPicks({ args, state, addPick });
  }

  let filtered = resolveContradictoryPicks(picks);
  
  const finalObj = filterAndSortPicks(filtered, {
    ...args,
    ...state,
    SAUDI_BIG4: ['al-hilal', 'al-nassr', 'al-ahli', 'al-ittihad'],
    AFA_GIANTS: ['river plate', 'boca juniors', 'racing', 'independiente', 'san lorenzo']
  });

  return {
    picks: finalObj.finalPicks,
    projectedGoals: state.projectedGoals,
    homeAvgGF: state.homeAvgGF,
    homeAvgGA: state.homeAvgGA,
    awayAvgGF: state.awayAvgGF,
    awayAvgGA: state.awayAvgGA,
    combinedOver25: state.combinedOver25,
    combinedBTTS: state.combinedBTTS,
    homeFormAtHome: args.homeFormAtHome,
    awayFormAway: args.awayFormAway,
    eloCombined: state.eloCombined,
    pythag: { home: state.homePythag, away: state.awayPythag },
    volatility: { home: state.homeVolatility, away: state.awayVolatility },
    reason: finalObj.finalPicks.length === 0 ? 'No se encontró ventaja estadística clara. No se recomienda apostar.' : null,
  };
}
