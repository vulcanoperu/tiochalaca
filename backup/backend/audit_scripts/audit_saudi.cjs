
const axios = require('axios');
const { 
  getMatchSummary, ALLOWED_LEAGUES 
} = require('./espnAdapter');

async function runSaudiAudit() {
  console.log('🇸🇦 Auditoría de Elite: Saudi Pro League (Últimas 5 jornadas)...');
  
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

  // Rango para las últimas 5-6 semanas
  const dateRange = '20260201-20260512';
  
  try {
    const sbUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/ksa.1/scoreboard?dates=${dateRange}&limit=100`;
    const { data: scoreboard } = await axios.get(sbUrl);
    
    // Filtrar partidos terminados
    const matches = (scoreboard.events || []).filter(e => e.status.type.state === 'post');
    console.log(`📊 Procesando ${matches.length} partidos de la Saudi Pro League...`);

    let stats = { t: 0, w: 0, mkt: {} };

    for (const match of matches) {
      try {
        // Pedimos al backend el análisis (forzamos refresh para asegurar stats de córners/tarjetas)
        const res = await axios.get(`http://localhost:3001/api/espn/match/${match.id}/analysis?refresh=true`);
        const ad = res.data.data;
        if (!ad) continue;

        const comp = match.competitions[0];
        const hC = comp.competitors.find(c => c.homeAway === 'home');
        const aC = comp.competitors.find(c => c.homeAway === 'away');
        const gh = parseInt(hC.score);
        const ga = parseInt(aC.score);

        const homeId = hC.id; const awayId = aC.id;
        const hm = ad.homeMatches; const am = ad.awayMatches;
        
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
        const leagueName = 'Saudi Pro League';
        const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA, leagueName);

        const picksRes = generatePicks({
            ...ad,
            homeForm, awayForm, homeFormAtHome, awayFormAway,
            homeSplitStats: homeSplit, awaySplitStats: awaySplit,
            h2hData, homeSlots, awaySlots, poissonProbs: poisson,
            homeTeamName: hC.team.name,
            awayTeamName: aC.team.name,
            leagueName: 'Saudi Pro League',
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
          else if (m.includes('remates') && ad.matchResult) {
              const target = parseFloat(s.match(/[\d.]+/)[0]);
              won = ad.matchResult.shotsOnTarget > target;
          }
          else if (m.includes('faltas') && ad.matchResult) {
              const target = parseFloat(s.match(/[\d.]+/)[0]);
              won = ad.matchResult.fouls > target;
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

    console.log('\n\n🏆 INFORME AUDITORÍA: SAUDI PRO LEAGUE');
    console.log('══════════════════════════════════════════════════');
    console.log(`EFICIENCIA GLOBAL: ${stats.t > 0 ? ((stats.w/stats.t)*100).toFixed(1) : 0}% (${stats.w}/${stats.t} picks)`);
    console.log('══════════════════════════════════════════════════');
    
    const marketsToReport = ['Doble Oportunidad', 'Córners Totales', 'Tarjetas Totales', 'Remates al Arco', 'Faltas Totales', 'Ganador del Partido', 'Total de Goles'];
    marketsToReport.forEach(m => {
      const s = stats.mkt[m] || { t: 0, w: 0 };
      const rate = s.t > 0 ? ((s.w/s.t)*100).toFixed(1) : '0.0';
      let icon = s.t === 0 ? '⚪' : (parseFloat(rate) >= 75 ? '✅' : '🟡');
      console.log(`${icon} ${m.padEnd(25)}: ${rate}% (${s.w}/${s.t})`);
    });

  } catch (e) {
    console.error('Error:', e.message);
  }
}
runSaudiAudit();
