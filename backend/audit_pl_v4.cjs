const axios = require('axios');

async function runAudit() {
  console.log('🚀 Auditoría Premier League V4...');
  
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

  const dateRange = '20260401-20260511';
  
  try {
    const sbUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${dateRange}&limit=100`;
    const { data: scoreboard } = await axios.get(sbUrl);
    const matches = scoreboard.events.filter(e => e.status.type.state === 'post');
    console.log(`📊 Analizando ${matches.length} partidos...`);

    let stats = { t: 0, w: 0, mkt: {} };

    for (const match of matches) {
      try {
        const eventId = match.id;
        const res = await axios.get(`http://localhost:3001/api/espn/match/${eventId}/analysis`);
        const ad = res.data.data;
        if (!ad) continue;

        // Extraer datos del marcador real desde el evento de scoreboard
        const comp = match.competitions[0];
        const homeComp = comp.competitors.find(c => c.homeAway === 'home');
        const awayComp = comp.competitors.find(c => c.homeAway === 'away');
        const gh = parseInt(homeComp.score);
        const ga = parseInt(awayComp.score);
        const homeTeamName = homeComp.team.name;
        const awayTeamName = awayComp.team.name;
        const homeId = homeComp.id;
        const awayId = awayComp.id;

        // Preparación de datos
        const hm = ad.homeMatches;
        const am = ad.awayMatches;
        const homeForm = calculateFormScore(hm, homeId);
        const awayForm = calculateFormScore(am, awayId);
        const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
        const awayFormAway = calculateFormScore(am, awayId, 'away');
        const h2hData = analyzeH2H(ad.h2h, homeId, awayId);
        const homeSplit = calculateOverUnder(hm, homeId);
        const awaySplit = calculateOverUnder(am, awayId);
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
            homeTeamName, awayTeamName,
            leagueName: 'Premier League',
            isLive: false
        }).picks;

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
              won = p.selection.includes(homeTeamName) ? gh > ga : ga > gh;
          }
          
          stats.t++; if(won) stats.w++;
          const k = p.market;
          if(!stats.mkt[k]) stats.mkt[k] = { t:0, w:0 };
          stats.mkt[k].t++; if(won) stats.mkt[k].w++;
        });
        process.stdout.write('.');
      } catch (e) {
        // console.error(e.message);
      }
    }

    console.log('\n\n🏆 AUDITORÍA PREMIER LEAGUE (Últimas 6 fechas)');
    console.log('══════════════════════════════════════════════════');
    console.log(`EFICIENCIA GLOBAL: ${((stats.w/stats.t)*100).toFixed(1)}% (${stats.w}/${stats.t})`);
    console.log('══════════════════════════════════════════════════');
    Object.entries(stats.mkt).sort((a,b) => b[1].t - a[1].t).forEach(([k,v]) => {
      console.log(`- ${k.padEnd(25)}: ${((v.w/v.t)*100).toFixed(1)}% (${v.w}/${v.t})`);
    });

  } catch (e) {
    console.error('Error:', e.message);
  }
}
runAudit();
