const axios = require('axios');

async function runAudit() {
  console.log('🚀 Auditoría Premier League (Últimas 6 jornadas)...');
  
  let engine;
  try {
    engine = await import('../src/services/analysisEngine.js');
    console.log('✅ Motor cargado.');
  } catch (err) {
    console.error('❌ Error Motor:', err.message);
    return;
  }

  const { 
    calculateFormScore, calculateOverUnder, analyzeH2H, 
    analyzeGoalsByTimeSlot, calcMatchProbabilities, generatePicks 
  } = engine;

  const startDate = '20240401'; // Cambiar a 2024 para tener datos reales de una temporada cerrada si es necesario, 
  // pero el usuario pidió las últimas 6 fechas de 2026.
  const dateRange = '20260401-20260511';
  
  try {
    const sbUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${dateRange}&limit=100`;
    const { data: scoreboard } = await axios.get(sbUrl);
    const matches = scoreboard.events.filter(e => e.status.type.state === 'post').slice(0, 60);
    console.log(`📊 Analizando ${matches.length} partidos...`);

    let stats = { t: 0, w: 0, mkt: {} };

    for (const match of matches) {
      try {
        const res = await axios.get(`http://localhost:3001/api/espn/match/${match.id}/analysis`);
        const ad = res.data.data;
        if (!ad) continue;

        const homeId = ad.teams.home.id;
        const awayId = ad.teams.away.id;
        const hm = ad.homeMatches;
        const am = ad.awayMatches;

        // ── Preparar datos exactamente como en el frontend ──
        const homeForm = calculateFormScore(hm, homeId);
        const awayForm = calculateFormScore(am, awayId);
        const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
        const awayFormAway = calculateFormScore(am, awayId, 'away');
        const homeSplit = calculateOverUnder(hm, homeId);
        const awaySplit = calculateOverUnder(am, awayId);
        const h2hData = analyzeH2H(ad.h2h, homeId, awayId);
        const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
        const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);

        const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
        const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
        const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
        const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
        const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA);

        const picks = generatePicks({
            ...ad,
            homeForm, awayForm, homeFormAtHome, awayFormAway,
            homeSplitStats: homeSplit, awaySplitStats: awaySplit,
            h2hData, homeSlots, awaySlots, poissonProbs: poisson,
            homeTeamName: ad.teams.home.name,
            awayTeamName: ad.teams.away.name,
            leagueName: 'Premier League',
            isLive: false
        }).picks;

        const gh = ad.goals.home;
        const ga = ad.goals.away;
        
        picks.forEach(p => {
          let won = false;
          if (p.market.includes('2.5')) won = (gh+ga) > 2.5;
          else if (p.market.includes('1.5')) won = (gh+ga) > 1.5;
          else if (p.market.includes('Ambos')) won = gh > 0 && ga > 0;
          else if (p.market.includes('Doble')) {
              if (p.selection.includes('1X')) won = gh >= ga;
              else if (p.selection.includes('X2')) won = ga >= gh;
              else won = gh !== ga;
          }
          else if (p.market.includes('Gana')) {
              won = p.selection.includes(ad.teams.home.name) ? gh > ga : ga > gh;
          }
          
          stats.t++; if(won) stats.w++;
          const k = p.market;
          if(!stats.mkt[k]) stats.mkt[k] = { t:0, w:0 };
          stats.mkt[k].t++; if(won) stats.mkt[k].w++;
        });
        console.log(`✓ ${match.name}: ${picks.length} picks.`);
      } catch (e) {
        console.log(`✕ ${match.name}: ${e.message}`);
      }
    }

    console.log('\n🏆 BALANCE FINAL:');
    console.log(`Efectividad: ${((stats.w/stats.t)*100).toFixed(1)}% (${stats.w}/${stats.t})`);
    Object.entries(stats.mkt).forEach(([k,v]) => {
      console.log(`- ${k.padEnd(20)}: ${((v.w/v.t)*100).toFixed(1)}% (${v.w}/${v.t})`);
    });

  } catch (e) {
    console.error('Error:', e.message);
  }
}
runAudit();
