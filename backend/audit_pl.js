import 'dotenv/config';
import { computeMatchAnalysis } from './server.js';
import { generatePicks } from '../src/services/analysisEngine.js';
import axios from 'axios';

async function runAudit() {
  console.log('🚀 Iniciando Auditoría de la Premier League (Últimas 6 jornadas)...');
  
  // 1. Obtener partidos de las últimas 6 semanas
  // Usamos un rango de fechas aproximado para cubrir las últimas 6 jornadas
  const endDate = '20260511';
  const startDate = '20260325'; 
  
  const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${startDate}-${endDate}&limit=100`;
  const { data: scoreboard } = await axios.get(scoreboardUrl);
  
  const matches = scoreboard.events.filter(e => e.status.type.state === 'post');
  console.log(`📊 Encontrados ${matches.length} partidos finalizados.`);

  let totalPicks = 0;
  let wonPicks = 0;
  let resultsByMarket = {};

  for (const match of matches) {
    try {
      const eventId = match.id;
      const { data: analysis } = await computeMatchAnalysis(eventId);
      if (!analysis) continue;

      // Generar picks como si fuera el momento del partido
      const picks = generatePicks(analysis, analysis.refereeStats);
      
      const homeScore = analysis.goals.home;
      const awayScore = analysis.goals.away;
      const totalGoals = homeScore + awayScore;
      const btts = homeScore > 0 && awayScore > 0;
      
      // Evaluar cada pick
      picks.forEach(pick => {
        let won = false;
        const market = pick.market;
        
        if (market.includes('Más de 2.5')) {
          won = totalGoals > 2.5;
        } else if (market.includes('Más de 1.5')) {
          won = totalGoals > 1.5;
        } else if (market.includes('Ambos Anotan')) {
          won = btts;
        } else if (market.includes('Gana')) {
          const expectedWinner = market.includes(analysis.teams.home.name) ? 'home' : 'away';
          const actualWinner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';
          won = expectedWinner === actualWinner;
        } else if (market.includes('Doble Oportunidad')) {
          const isHome = market.includes(analysis.teams.home.name);
          const isAway = market.includes(analysis.teams.away.name);
          const actualWinner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';
          if (isHome && isAway) won = actualWinner !== 'draw'; // 12
          else if (isHome) won = actualWinner === 'home' || actualWinner === 'draw'; // 1X
          else if (isAway) won = actualWinner === 'away' || actualWinner === 'draw'; // X2
        }

        totalPicks++;
        if (won) wonPicks++;

        if (!resultsByMarket[market]) resultsByMarket[market] = { total: 0, won: 0 };
        resultsByMarket[market].total++;
        if (won) resultsByMarket[market].won++;
      });

      process.stdout.write('.');
    } catch (err) {
      console.error(`\nError en partido ${match.name}:`, err.message);
    }
  }

  console.log('\n\n✅ Auditoría Finalizada.');
  console.log('══════════════════════════════════════════════════');
  console.log(`EFICIENCIA GLOBAL: ${((wonPicks / totalPicks) * 100).toFixed(2)}% (${wonPicks}/${totalPicks})`);
  console.log('══════════════════════════════════════════════════');
  
  console.log('\nDesglose por Mercado:');
  Object.entries(resultsByMarket).forEach(([market, stats]) => {
    const rate = ((stats.won / stats.total) * 100).toFixed(2);
    console.log(`- ${market.padEnd(35)}: ${rate}% (${stats.won}/${stats.total})`);
  });
  
  process.exit(0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
