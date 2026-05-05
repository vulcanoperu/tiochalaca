import { calculateFormScore, calculateOverUnder, analyzeH2H, generatePicks } from '../src/services/analysisEngine.js';

const BACKEND_URL = 'https://tiochalaca.vercel.app';

async function run() {
  console.log("Obteniendo partidos de hoy...");
  const date = '2026-05-02';
  const res = await fetch(`${BACKEND_URL}/api/fixtures/date/${date}`);
  const json = await res.json();
  const matches = (json.data || []).filter(m => m.fixture.status.short === 'FT');

  console.log(`Encontrados ${matches.length} partidos terminados.`);

  let totalHits = 0;
  let totalMisses = 0;

  for (const m of matches) {
    console.log(`\n-----------------------------------`);
    console.log(`Partido: ${m.teams.home.name} ${m.goals.home} - ${m.goals.away} ${m.teams.away.name}`);
    
    const homeId = m.teams.home.id;
    const awayId = m.teams.away.id;
    const leagueSlug = m.league.id;

    try {
      const homeSchRes = await fetch(`${BACKEND_URL}/api/espn/team/${homeId}/schedule?league=${leagueSlug}`);
      const awaySchRes = await fetch(`${BACKEND_URL}/api/espn/team/${awayId}/schedule?league=${leagueSlug}`);
      const homeSch = await homeSchRes.json();
      const awaySch = await awaySchRes.json();

      const mapEventToMatch = (ev) => {
        const comp = ev.competitions?.[0];
        const homeC = comp?.competitors?.find(c => c.homeAway === 'home');
        const awayC = comp?.competitors?.find(c => c.homeAway === 'away');
        const getScore = (c) => parseInt(c?.score?.value ?? c?.score ?? 0);
        return {
          fixture: { id: ev.id, date: ev.date, status: { short: 'FT' } },
          teams: { 
            home: { id: homeC?.id, winner: homeC?.winner }, 
            away: { id: awayC?.id, winner: awayC?.winner } 
          },
          goals: { home: getScore(homeC), away: getScore(awayC) }
        };
      };

      const hm = (homeSch.events || []).filter(e => String(e.id) !== String(m.fixture.id)).map(mapEventToMatch);
      const am = (awaySch.events || []).filter(e => String(e.id) !== String(m.fixture.id)).map(mapEventToMatch);

      const homeForm = calculateFormScore(hm, homeId);
      const awayForm = calculateFormScore(am, awayId);
      const homeSplit = calculateOverUnder(hm, homeId);
      const awaySplit = calculateOverUnder(am, awayId);

      // H2H from summary
      const summaryRes = await fetch(`${BACKEND_URL}/api/espn/summary/${m.fixture.id}`);
      const summary = await summaryRes.json();
      const h2hEvents = summary.headToHeadGames?.[0]?.events || [];
      const h2hTeamA = summary.headToHeadGames?.[0]?.team;
      const h2h = h2hEvents.map(e => {
        const hg = parseInt(e.homeTeamScore ?? 0);
        const ag = parseInt(e.awayTeamScore ?? 0);
        const teamA_id = String(h2hTeamA?.id);
        const teamB_id = String(e.opponent?.id);
        let homeIdStr, awayIdStr;
        if (String(e.homeTeamId) === teamA_id) { homeIdStr = teamA_id; awayIdStr = teamB_id; } 
        else { homeIdStr = teamB_id; awayIdStr = teamA_id; }
        return {
          fixture: { status: { short: 'FT' } },
          teams: { 
            home: { id: homeIdStr, winner: hg > ag }, 
            away: { id: awayIdStr, winner: ag > hg } 
          },
          goals: { home: hg, away: ag }
        };
      });
      const h2hData = analyzeH2H(h2h, homeId, awayId);

      const picksRes = generatePicks({ 
        homeStats: null, awayStats: null, 
        h2hData, homeForm, awayForm, 
        homeSplitStats: homeSplit, awaySplitStats: awaySplit,
        isLive: false
      });

      if (picksRes.picks.length === 0) {
         console.log("No hubo picks pre-partido recomendados.");
         continue;
      }

      console.log(`Picks Recomendados:`);
      for (const p of picksRes.picks) {
         if (p.market === 'Estrategia en Vivo') continue; // Ignorar estrategias en vivo
         
         console.log(`- ${p.selection} (${p.probability}%)`);
         
         // Verificar acierto
         let isHit = false;
         const hg = m.goals.home;
         const ag = m.goals.away;
         const total = hg + ag;

         if (p.selection === 'Más de 2.5 goles' && total > 2.5) isHit = true;
         if (p.selection === 'Menos de 2.5 goles' && total < 2.5) isHit = true;
         if (p.selection === 'Sí, ambos anotan' && hg > 0 && ag > 0) isHit = true;
         if (p.selection === 'Victoria Local' && hg > ag) isHit = true;
         if (p.selection === 'Victoria Visitante' && ag > hg) isHit = true;
         if (p.selection === 'Local o Empate (1X)' && hg >= ag) isHit = true;
         if (p.selection === 'Visitante o Empate (X2)' && ag >= hg) isHit = true;

         if (isHit) {
            console.log(`  ✅ ACIERTO!`);
            totalHits++;
         } else {
            console.log(`  ❌ FALLO.`);
            totalMisses++;
         }
      }
    } catch(e) {
       console.log("Error procesando partido:", e.message);
    }
  }

  console.log(`\n================================`);
  console.log(`RESULTADO FINAL DE HOY (${date})`);
  console.log(`Aciertos Totales: ${totalHits}`);
  console.log(`Fallos Totales: ${totalMisses}`);
  console.log(`Tasa de Acierto (Win Rate): ${totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses) * 100).toFixed(1) : 0}%`);
  console.log(`================================`);
}

run();
