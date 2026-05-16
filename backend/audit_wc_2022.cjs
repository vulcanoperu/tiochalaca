
const axios = require('axios');
async function runWC2022Audit() {
  console.log('🌍 Simulacro Mundialista: Qatar 2022 (Fase de Grupos)...');
  
  let engine;
  try {
    engine = await import('../src/services/analysisEngine.js');
  } catch (err) {
    console.error('❌ Error Motor:', err.message);
    return;
  }

  const { 
    calculateFormScore, calculateOverUnder, analyzeH2H, 
    analyzeGoalsByTimeSlot, calcMatchProbabilities, generatePicks 
  } = engine;
  
  // Rango de la primera semana de Qatar 2022
  const dateRange = '20221120-20221127';
  
  try {
    const sbUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateRange}&limit=100`;
    const { data: scoreboard } = await axios.get(sbUrl);
    const matches = scoreboard.events.filter(e => e.status.type.state === 'post').slice(0, 2);
    console.log(`📊 Analizando ${matches.length} partidos del Mundial...`);

    let stats = { t: 0, w: 0, mkt: {} };

    for (const match of matches) {
      try {
        // Obtenemos análisis profundo (con xG, corners, etc. si hay en el boxscore)
        const res = await axios.get(`http://localhost:3001/api/espn/match/${match.id}/analysis`);
        const ad = res.data.data;
        if (!ad) continue;

        // Marcador Real
        const comp = match.competitions[0];
        const hC = comp.competitors.find(c => c.homeAway === 'home');
        const aC = comp.competitors.find(c => c.homeAway === 'away');
        const gh = parseInt(hC.score);
        const ga = parseInt(aC.score);

        const homeId = hC.id; const awayId = aC.id;
        const hm = ad.homeMatches || []; 
        const am = ad.awayMatches || [];
        
        if (hm.length === 0 || am.length === 0) {
           console.log(`⚠️ Falta data histórica para ${hC.team.name} o ${aC.team.name} (${hm.length}/${am.length} partidos encontrados)`);
        }
        
        const homeForm = calculateFormScore(hm, homeId);
        const awayForm = calculateFormScore(am, awayId);
        const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
        const awayFormAway = calculateFormScore(am, awayId, 'away');
        const h2hData = analyzeH2H(ad.h2h, homeId, awayId);
        const homeSplit = calculateOverUnder(hm, homeId);
        const awaySplit = calculateOverUnder(am, awayId);
        const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
        const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);

        // Poisson puro si no hay xG
        const poisson = calcMatchProbabilities(homeSplit, awaySplit, h2hData, homeForm, awayForm);

        const picksRes = generatePicks({
            ...ad,
            homeForm, awayForm, homeFormAtHome, awayFormAway,
            homeSplitStats: homeSplit, awaySplitStats: awaySplit,
            h2hData, homeSlots, awaySlots, poissonProbs: poisson,
            homeTeamName: hC.team.name,
            awayTeamName: aC.team.name,
            leagueName: 'Copa del Mundo',
            isLive: false
        });

        const picks = picksRes.picks || [];

        picks.forEach(p => {
          let won = false;
          const s = p.selection.toLowerCase();
          const m = p.market.toLowerCase();

          if (s.includes('2.5')) won = (gh+ga) > 2.5;
          else if (s.includes('1.5')) won = (gh+ga) > 1.5;
          else if (s.includes('ambos anotan') || s.includes('ambos marcan')) won = gh > 0 && ga > 0;
          else if (m.includes('doble')) {
              if (s.includes('1x')) won = gh >= ga;
              else if (s.includes('x2')) won = ga >= gh;
              else if (s.includes('12')) won = gh !== ga;
          }
          else if (m.includes('ganador')) {
              if (s.includes('local')) won = gh > ga;
              else if (s.includes('visitante')) won = ga > gh;
          }
          else if (m.includes('córners') && ad.matchResult) {
              const target = parseFloat(s.match(/[\d.]+/)[0]);
              won = ad.matchResult.corners > target;
          }
          else if (m.includes('tarjetas') && ad.matchResult) {
              const target = parseFloat(s.match(/[\d.]+/)[0]);
              won = ad.matchResult.cards > target;
          }
          else { return; }

          stats.t++; if(won) stats.w++;
          const k = p.market;
          if(!stats.mkt[k]) stats.mkt[k] = { t:0, w:0 };
          stats.mkt[k].t++; if(won) stats.mkt[k].w++;
        });
        process.stdout.write('.');
      } catch (e) { }
    }

    console.log('\n\n🏆 INFORME SIMULACRO: QATAR 2022');
    console.log('══════════════════════════════════════════════════');
    console.log(`EFICIENCIA GLOBAL: ${stats.t > 0 ? ((stats.w/stats.t)*100).toFixed(1) : 0}% (${stats.w}/${stats.t} picks)`);
    console.log('══════════════════════════════════════════════════');
    
    const marketsToReport = ['Doble Oportunidad', 'Córners Totales', 'Tarjetas Totales', 'Ganador del Partido', 'Total de Goles'];
    marketsToReport.forEach(m => {
      const s = stats.mkt[m] || { t: 0, w: 0 };
      const rate = s.t > 0 ? ((s.w/s.t)*100).toFixed(1) : '0.0';
      let icon = s.t === 0 ? '⚪' : (parseFloat(rate) >= 70 ? '✅' : '🟡');
      console.log(`${icon} ${m.padEnd(25)}: ${rate}% (${s.w}/${s.t})`);
    });

  } catch (e) {
    console.error('Error:', e.message);
  }
}
runWC2022Audit();
