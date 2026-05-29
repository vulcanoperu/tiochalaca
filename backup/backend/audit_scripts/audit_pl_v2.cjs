const axios = require('axios');

async function runAudit() {
  console.log('🚀 Auditoría V2...');
  
  let generatePicks;
  try {
    const engine = await import('../src/services/analysisEngine.js');
    generatePicks = engine.generatePicks;
    console.log('✅ Motor de análisis cargado.');
  } catch (err) {
    console.error('❌ Error al cargar el motor:', err.message);
    return;
  }

  const startDate = '20260401'; 
  const endDate = '20260511';
  
  try {
    const { data: scoreboard } = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${startDate}-${endDate}&limit=100`);
    const matches = scoreboard.events.filter(e => e.status.type.state === 'post').slice(0, 50);
    console.log(`📊 Procesando ${matches.length} partidos...`);

    let stats = { t: 0, w: 0, markets: {} };

    for (const match of matches) {
      try {
        const res = await axios.get(`http://localhost:3001/api/espn/match/${match.id}/analysis`);
        const ad = res.data.data;
        if (!ad) continue;

        const picks = generatePicks(ad, ad.refereeStats);
        const gh = ad.goals.home;
        const ga = ad.goals.away;
        
        picks.forEach(p => {
          let won = false;
          if (p.market.includes('2.5')) won = (gh+ga) > 2.5;
          else if (p.market.includes('1.5')) won = (gh+ga) > 1.5;
          else if (p.market.includes('Ambos')) won = gh > 0 && ga > 0;
          else if (p.market.includes('Gana')) {
              won = p.market.includes(ad.teams.home.name) ? gh > ga : ga > gh;
          }
          
          stats.t++;
          if (won) stats.w++;
          const m = p.market.split('(')[0].trim();
          if(!stats.markets[m]) stats.markets[m] = { t:0, w:0 };
          stats.markets[m].t++; if(won) stats.markets[m].w++;
        });
        console.log(`- ${match.name}: ${picks.length} picks analyzed.`);
      } catch (e) {
        console.log(`- ${match.name}: Error (${e.message})`);
      }
    }

    console.log('\n🏆 RESULTADOS FINALES:');
    console.log(`Total: ${stats.t} | Ganados: ${stats.w} | Ratio: ${((stats.w/stats.t)*100).toFixed(1)}%`);
    Object.entries(stats.markets).forEach(([k,v]) => {
      console.log(`${k}: ${((v.w/v.t)*100).toFixed(1)}% (${v.w}/${v.t})`);
    });

  } catch (e) {
    console.error('Error general:', e.message);
  }
}

runAudit();
