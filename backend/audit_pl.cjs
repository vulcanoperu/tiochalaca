const axios = require('axios');

async function runAudit() {
  console.log('🚀 Iniciando Auditoría de la Premier League (Últimas 6 jornadas)...');
  
  // Importamos dinámicamente el motor de picks (ESM)
  const { generatePicks } = await import('../src/services/analysisEngine.js');

  const endDate = '20260511';
  const startDate = '20260320'; 
  
  const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${startDate}-${endDate}&limit=100`;
  const { data: scoreboard } = await axios.get(scoreboardUrl);
  
  const matches = scoreboard.events.filter(e => e.status.type.state === 'post');
  console.log(`📊 Encontrados ${matches.length} partidos finalizados.`);

  let stats = {
    totalPicks: 0,
    wonPicks: 0,
    byMarket: {}
  };

  for (const match of matches) {
    try {
      const eventId = match.id;
      // Llamamos al API local para obtener el análisis (así evitamos problemas de importación de server.js)
      const res = await axios.get(`http://localhost:3001/api/espn/match/${eventId}/analysis`);
      const analysis = res.data.data;
      
      if (!analysis) continue;

      const picks = generatePicks(analysis, analysis.refereeStats);
      const homeScore = analysis.goals.home;
      const awayScore = analysis.goals.away;
      const totalGoals = homeScore + awayScore;
      
      picks.forEach(pick => {
        let won = false;
        if (pick.market.includes('Más de 2.5')) won = totalGoals > 2.5;
        else if (pick.market.includes('Más de 1.5')) won = totalGoals > 1.5;
        else if (pick.market.includes('Ambos Anotan')) won = homeScore > 0 && awayScore > 0;
        else if (pick.market.includes('Gana')) {
            const isHome = pick.market.includes(analysis.teams.home.name);
            won = isHome ? homeScore > awayScore : awayScore > homeScore;
        } else if (pick.market.includes('Doble Oportunidad')) {
            const is1X = pick.market.includes('1X') || (pick.market.includes(analysis.teams.home.name) && pick.market.includes('Empate'));
            const isX2 = pick.market.includes('X2') || (pick.market.includes(analysis.teams.away.name) && pick.market.includes('Empate'));
            const is12 = pick.market.includes('12') || (pick.market.includes(analysis.teams.home.name) && pick.market.includes(analysis.teams.away.name));
            
            if (is1X) won = homeScore >= awayScore;
            else if (isX2) won = awayScore >= homeScore;
            else if (is12) won = homeScore !== awayScore;
        }

        stats.totalPicks++;
        if (won) stats.wonPicks++;
        
        const mKey = pick.market.split('(')[0].trim();
        if (!stats.byMarket[mKey]) stats.byMarket[mKey] = { t: 0, w: 0 };
        stats.byMarket[mKey].t++;
        if (won) stats.byMarket[mKey].w++;
      });
      process.stdout.write('.');
    } catch (e) {
       // console.error(e.message);
    }
  }

  console.log('\n\n✅ Auditoría Finalizada.');
  console.log('══════════════════════════════════════════════════');
  console.log(`EFICIENCIA GLOBAL: ${((stats.wonPicks / stats.totalPicks) * 100).toFixed(2)}% (${stats.wonPicks}/${stats.totalPicks})`);
  console.log('══════════════════════════════════════════════════');
  
  Object.entries(stats.byMarket).forEach(([m, s]) => {
    console.log(`- ${m.padEnd(25)}: ${((s.w/s.t)*100).toFixed(2)}% (${s.w}/${s.t})`);
  });
}

runAudit();
