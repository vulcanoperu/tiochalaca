
const axios = require('axios');
const path  = require('path');

const BACKEND    = 'http://localhost:3001';
const DATE_RANGE = '20260401-20260512';

// ── Evaluador honesto (espeja audit_may5_final.mjs) ─────────────────────────
function evalPick(p, { gh, ga, totalCorners, totalYellow, totalRed, totalCards, plays = [] }) {
  const totalGoals = gh + ga;
  const btts = gh > 0 && ga > 0;

  // Helper: ¿hubo algún gol después del minuto X?
  const hasGoalAfter = (min) =>
    (plays || []).some(play => {
      const isGoal = play.type?.text?.toLowerCase().includes('goal') || play.type?.id === '1';
      return isGoal && (play.time?.elapsed || 0) > min;
    });

  // Helper: goles solo en 1er tiempo
  const goalsIn1T = () =>
    (plays || []).filter(play => {
      const isGoal = play.type?.text?.toLowerCase().includes('goal') || play.type?.id === '1';
      return isGoal && (play.time?.elapsed || 0) <= 45;
    }).length;

  if (p.market === 'Total de Goles') {
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
    if (!m) return null; // no mapeable
    const isOver = m[1] === 'Más', th = parseFloat(m[2]);
    return isOver ? totalGoals > th : totalGoals < th;

  } else if (p.market === 'Ambos Marcan') {
    if (p.selection.includes('Sí')) return btts;
    if (p.selection.includes('No'))  return !btts;
    return null;

  } else if (p.market === 'Combo') {
    if (p.selection === 'Ambos Marcan + Más de 2.5') return btts && totalGoals > 2.5;
    return null;

  } else if (p.market === 'Doble Oportunidad') {
    if (p.selection.includes('1X')) return gh >= ga;
    if (p.selection.includes('X2')) return ga >= gh;
    if (p.selection.includes('12')) return gh !== ga;
    return null;

  } else if (p.market === 'Ganador del Partido') {
    if (p.selection.includes('Local'))     return gh > ga;
    if (p.selection.includes('Visitante')) return ga > gh;
    if (p.selection === 'Empate')          return gh === ga;
    return null;

  } else if (p.market === 'Handicap Asiático') {
    if (p.selection.includes('Local'))     return gh > ga;
    if (p.selection.includes('Visitante')) return ga > gh;
    return null;

  } else if (p.market === 'Córners Totales') {
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
    if (!m || totalCorners === 0) return null;
    const isOver = m[1] === 'Más', th = parseFloat(m[2]);
    return isOver ? totalCorners > th : totalCorners < th;

  } else if (p.market === 'Tarjetas Totales') {
    const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
    if (!m || (totalCards === 0 && totalYellow === 0)) return null;
    const isOver = m[1] === 'Más', th = parseFloat(m[2]);
    const subject = p.selection.toLowerCase().includes('amarilla') ? totalYellow
                  : p.selection.toLowerCase().includes('roja')     ? totalRed
                  : totalCards;
    return isOver ? subject > th : subject < th;

  } else if (p.market === 'Gol por Tramo') {
    if (p.selection.includes('2do Tiempo')) return hasGoalAfter(45);
    return totalGoals > 0;

  } else if (p.market === 'Goles en Vivo (1T)') {
    if (p.selection.includes('Más de 0.5')) return goalsIn1T() > 0;
    return null;

  } else if (p.market === 'Estrategia en Vivo' || p.market === 'Goles en Vivo') {
    if (p.selection.includes('minuto 30'))  return hasGoalAfter(30);
    if (p.selection.includes('2do Tiempo')) return hasGoalAfter(45);
    const m = p.selection.match(/Más de (\d+\.?\d*)/);
    if (m) return totalGoals > parseFloat(m[1]);
    return null; // no auditable

  } else if (p.market === 'Resultado en Vivo') {
    if (p.selection.includes('1X') || p.selection.includes('Local'))     return gh >= ga;
    if (p.selection.includes('X2') || p.selection.includes('Visitante')) return ga >= gh;
    if (p.selection.includes('Empate'))                                   return gh === ga;
    return null;
  }

  return null; // mercado no mapeado → skip
}

// ────────────────────────────────────────────────────────────────────────────
async function runArgentinaAudit() {
  console.log('🇦🇷 Auditoría Honesta: Liga Profesional Argentina');
  console.log(`   Rango: ${DATE_RANGE}`);
  console.log('═'.repeat(60));

  let engine;
  try {
    const enginePath = path.resolve(__dirname, '../src/services/analysisEngine.js');
    engine = await import('file:///' + enginePath.replace(/\\/g, '/'));
  } catch (err) {
    console.error('❌ Error cargando motor:', err.message);
    return;
  }

  const { calculateFormScore, calculateOverUnder, analyzeH2H, analyzeGoalsByTimeSlot, generatePicks } = engine;
  // calcMatchProbabilities puede no estar exportado; usamos calcCombinedProbs como fallback
  const calcProbs = engine.calcMatchProbabilities || engine.calcCombinedProbs;

  let sbData;
  try {
    const sbUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?dates=${DATE_RANGE}&limit=200`;
    sbData = (await axios.get(sbUrl, { timeout: 15000 })).data;
  } catch (err) {
    console.error('❌ Error obteniendo scoreboard ESPN:', err.message);
    return;
  }

  // Solo partidos finalizados
  const matches = (sbData.events || []).filter(e => e.status?.type?.state === 'post');
  console.log(`📊 Partidos finalizados encontrados: ${matches.length}\n`);

  let total = 0, hits = 0, skipped = 0;
  const byMarket = {};
  const reports  = [];

  for (const match of matches) {
    process.stdout.write('.');
    try {
      const comp = match.competitions?.[0];
      if (!comp) { skipped++; continue; }
      const hC = comp.competitors.find(c => c.homeAway === 'home');
      const aC = comp.competitors.find(c => c.homeAway === 'away');
      if (!hC || !aC) { skipped++; continue; }

      const homeId = hC.id, awayId = aC.id;
      const gh = parseInt(hC.score ?? 0);
      const ga = parseInt(aC.score ?? 0);
      if (isNaN(gh) || isNaN(ga)) { skipped++; continue; }

      // Análisis del motor
      const adRes = await axios.get(`${BACKEND}/api/espn/match/${match.id}/analysis?refresh=false`, { timeout: 12000 });
      const ad = adRes.data.data;
      if (!ad) { skipped++; continue; }

      // Estadísticas del partido (boxscore)
      const sumRes = await axios.get(`${BACKEND}/api/espn/summary/${match.id}`, { timeout: 12000 }).catch(() => null);
      const sumRaw = sumRes?.data;
      const plays  = sumRaw?.plays || [];

      const getStat = (side, name) => {
        const team = sumRaw?.boxscore?.teams?.find(t => t.homeAway === side);
        const stat = team?.statistics?.find(s => s.name === name || s.label?.toLowerCase().includes(name));
        return stat ? parseInt(stat.displayValue ?? stat.value ?? 0) : 0;
      };

      const totalCorners = getStat('home', 'cornerKicks') + getStat('away', 'cornerKicks');
      const totalYellow  = getStat('home', 'yellowCards')  + getStat('away', 'yellowCards');
      const totalRed     = getStat('home', 'redCards')     + getStat('away', 'redCards');
      const totalCards   = totalYellow + totalRed;

      // Forma y Poisson
      const hm = ad.homeMatches || [], am = ad.awayMatches || [];
      const homeForm      = calculateFormScore(hm, homeId);
      const awayForm      = calculateFormScore(am, awayId);
      const homeFormHome  = calculateFormScore(hm, homeId, 'home');
      const awayFormAway  = calculateFormScore(am, awayId, 'away');
      const h2hData       = analyzeH2H(ad.h2h || [], homeId, awayId);
      const homeSplit     = calculateOverUnder(hm, homeId);
      const awaySplit     = calculateOverUnder(am, awayId);
      const homeSlots     = analyzeGoalsByTimeSlot(ad.homeHistEvs || [], homeId);
      const awaySlots     = analyzeGoalsByTimeSlot(ad.awayHistEvs || [], awayId);

      const hGF = homeFormHome.total >= 3 ? homeFormHome.goalsFor    / homeFormHome.total : homeForm.goalsFor    / Math.max(homeForm.total, 1);
      const hGA = homeFormHome.total >= 3 ? homeFormHome.goalsAgainst / homeFormHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
      const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor    / awayFormAway.total : awayForm.goalsFor    / Math.max(awayForm.total, 1);
      const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);

      const poissonProbs = calcProbs ? calcProbs(hGF, hGA, aGF, aGA, 'Liga Profesional Argentina') : null;

      const picksRes = generatePicks({
        ...ad,
        homeForm, awayForm, homeFormAtHome: homeFormHome, awayFormAway,
        homeSplitStats: homeSplit, awaySplitStats: awaySplit,
        h2hData, homeSlots, awaySlots, poissonProbs,
        homeTeamName: hC.team?.displayName || hC.team?.name || '',
        awayTeamName: aC.team?.displayName || aC.team?.name || '',
        leagueName: 'Liga Profesional Argentina',
        homeHistory: hm, awayHistory: am,
        isLive: false,
      });

      const picks = picksRes?.picks || [];
      if (!picks.length) { skipped++; continue; }

      const matchReport = {
        label:   `${hC.team?.displayName ?? '?'} ${gh}-${ga} ${aC.team?.displayName ?? '?'}`,
        picks:   [],
        mHits:   0,
        mMiss:   0,
        mSkip:   0,
      };

      picks.forEach(p => {
        const result = evalPick(p, { gh, ga, totalCorners, totalYellow, totalRed, totalCards, plays });
        if (result === null) { matchReport.mSkip++; return; } // no auditable

        total++;
        if (!byMarket[p.market]) byMarket[p.market] = { total: 0, hits: 0 };
        byMarket[p.market].total++;

        if (result) {
          hits++;
          matchReport.mHits++;
          byMarket[p.market].hits++;
          matchReport.picks.push({ ok: true,  label: `[${p.market}] ${p.selection}` });
        } else {
          matchReport.mMiss++;
          matchReport.picks.push({ ok: false, label: `[${p.market}] ${p.selection}` });
        }
      });

      reports.push(matchReport);

    } catch (e) {
      skipped++;
    }
  }

  // ── RESUMEN ──────────────────────────────────────────────────────────────
  const wr = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0';
  console.log('\n\n' + '═'.repeat(60));
  console.log('🏆 INFORME AUDITORÍA: LIGA PROFESIONAL ARGENTINA');
  console.log('═'.repeat(60));
  console.log(`📅 Partidos procesados : ${reports.length}  (${skipped} sin datos/picks)`);
  console.log(`🎯 Picks evaluados     : ${total}`);
  console.log(`✅ Aciertos            : ${hits}`);
  console.log(`❌ Fallos              : ${total - hits}`);
  console.log(`🏆 WIN RATE REAL       : ${wr}%`);
  console.log('─'.repeat(60));
  console.log('DESGLOSE POR MERCADO:');
  Object.keys(byMarket).sort().forEach(mkt => {
    const { total: mt, hits: mh } = byMarket[mkt];
    const rate = mt > 0 ? ((mh / mt) * 100).toFixed(1) : '0.0';
    const icon = parseFloat(rate) >= 80 ? '✅' : parseFloat(rate) >= 70 ? '🟡' : '⚪';
    console.log(`  ${icon} ${mkt.padEnd(28)}: ${rate}%  (${mh}/${mt})`);
  });
  console.log('─'.repeat(60));
  console.log('DETALLE POR PARTIDO (peores primero):');
  reports.sort((a, b) => b.mMiss - a.mMiss).forEach(r => {
    const badge = r.mMiss === 0 ? '✅ PLENO' : r.mHits === 0 ? '❌ CERO' : `⚡ ${r.mHits}/${r.mHits + r.mMiss}`;
    if (r.mMiss > 0 || reports.length <= 20) {
      console.log(`\n  ${badge}  ${r.label}`);
      r.picks.forEach(p => console.log(`    ${p.ok ? '✅' : '❌'} ${p.label}`));
    }
  });
  console.log('\n' + '═'.repeat(60));
}

runArgentinaAudit().catch(console.error);
