import React, { useState } from 'react';
import {
  generatePicks,
  calculateFormScore,
  calculateOverUnder,
  analyzeH2H,
  analyzeGoalsByTimeSlot,
  calcMatchProbabilities,
} from '../services/analysisEngine';
import { Play, Activity, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export default function AuditDashboard() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, text: '' });
  const [results, setResults] = useState(null);
  const [expandedMatch, setExpandedMatch] = useState(null);

  const runAudit = async () => {
    setLoading(true);
    setResults(null);
    setProgress({ current: 0, total: 0, text: 'Obteniendo calendario...' });

    try {
      // Intentar obtener los partidos (forzamos revalidar caché si se puede)
      const res = await fetch(`${BACKEND_URL}/api/fixtures/date/${date}?force=1`);
      const data = await res.json();
      const fixtures = data.data || [];
      
      const finishedFixtures = fixtures.filter(f => f.fixture.status.short === 'FT' || f.fixture.status.short === 'AET' || f.fixture.status.short === 'PEN');
      
      setProgress({ current: 0, total: finishedFixtures.length, text: 'Iniciando análisis paralelo...' });

      let totalPicks = 0;
      let hits = 0;
      let misses = 0;
      let skippedMatches = 0;
      let matchReports = [];
      let completed = 0;

      // ── Helper: procesar un partido completo ──────────────────────────────
      const processMatch = async (f) => {
        try {
          const eventId = f.fixture.id;

        // Fetch analysis + summary EN PARALELO (ahorra ~50% del tiempo por partido)
        const [analysisRes, sumRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/espn/match/${eventId}/analysis`).then(r => r.json()),
          fetch(`${BACKEND_URL}/api/espn/summary/${eventId}`).then(r => r.json()),
        ]);

        const analysisData = analysisRes.data;
        if (!analysisData) return null;

        const homeScore = parseInt(f.goals.home);
        const awayScore = parseInt(f.goals.away);
        if (isNaN(homeScore) || isNaN(awayScore)) return null;
        const totalGoals = homeScore + awayScore;

        const homeId = f.teams.home.id;
        const awayId = f.teams.away.id;
        const hm  = analysisData.homeMatches;
        const am  = analysisData.awayMatches;
        const h2h = analysisData.h2h;

        const homeForm        = calculateFormScore(hm, homeId);
        const awayForm        = calculateFormScore(am, awayId);
        const homeFormAtHome  = calculateFormScore(hm, homeId, 'home');
        const awayFormAway    = calculateFormScore(am, awayId, 'away');
        const homeSplit       = calculateOverUnder(hm, homeId);
        const awaySplit       = calculateOverUnder(am, awayId);
        const h2hData         = analyzeH2H(h2h, homeId, awayId);
        const homeSlots       = analyzeGoalsByTimeSlot(analysisData.homeHistEvs, homeId);
        const awaySlots       = analyzeGoalsByTimeSlot(analysisData.awayHistEvs, awayId);

        const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor     / homeFormAtHome.total : homeForm.goalsFor   / Math.max(homeForm.total, 1);
        const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
        const aGF = awayFormAway.total   >= 3 ? awayFormAway.goalsFor       / awayFormAway.total   : awayForm.goalsFor   / Math.max(awayForm.total, 1);
        const aGA = awayFormAway.total   >= 3 ? awayFormAway.goalsAgainst   / awayFormAway.total   : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
        const poissonProbs = calcMatchProbabilities(hGF, hGA, aGF, aGA);

        const city = sumRes?.gameInfo?.venue?.address?.city || '';

        const getTeamStat = (homeAway, statName) => {
          const team = sumRes?.boxscore?.teams?.find(t => t.homeAway === homeAway);
          if (!team) return '-';
          const stat = team.statistics?.find(s => s.name === statName);
          return stat ? stat.displayValue : '-';
        };
        const matchStats = {
          possession:    { home: getTeamStat('home', 'possessionPct'),  away: getTeamStat('away', 'possessionPct') },
          shots:         { home: getTeamStat('home', 'totalShots'),      away: getTeamStat('away', 'totalShots') },
          shotsOnTarget: { home: getTeamStat('home', 'shotsOnTarget'),   away: getTeamStat('away', 'shotsOnTarget') },
          corners:       { home: getTeamStat('home', 'wonCorners'),      away: getTeamStat('away', 'wonCorners') },
          yellowCards:   { home: getTeamStat('home', 'yellowCards'),     away: getTeamStat('away', 'yellowCards') },
          redCards:      { home: getTeamStat('home', 'redCards'),        away: getTeamStat('away', 'redCards') },
        };

        const calcRest = (matches) => {
          if (!matches?.length) return null;
          const lastDate = matches[0]?.fixture?.date;
          if (!lastDate) return null;
          const matchDate = new Date(f.fixture.date);
          return Math.floor((matchDate - new Date(lastDate)) / (1000 * 60 * 60 * 24));
        };

        // ── generatePicks con los mismos parámetros que Analysis.jsx ──
        const picksResult = generatePicks({
          homeStats:       null,
          awayStats:       null,
          homeForm,        awayForm,
          homeFormAtHome,  awayFormAway,
          homeSplitStats:  homeSplit,
          awaySplitStats:  awaySplit,
          h2hData,
          homeSlots,       awaySlots,
          poissonProbs,
          isLive:          false,
          liveClock:       "0'",
          liveHomeGoals:   0,
          liveAwayGoals:   0,
          marketInsight:   analysisData.marketInsight,
          homeCornersData: analysisData.homeCornersData,
          awayCornersData: analysisData.awayCornersData,
          homeCardsData:   analysisData.homeCardsData,
          awayCardsData:   analysisData.awayCardsData,
          injuries:        analysisData.injuries || [],
          marketOdds:      analysisData.marketOdds,
          matchStandings:  analysisData.matchStandings,
          advancedStats:   analysisData.advancedStats,
          leagueName:      f.league.name,
          homeTeamName:    f.teams.home.name,
          awayTeamName:    f.teams.away.name,
          city,
          homeRestDays:    calcRest(hm),
          awayRestDays:    calcRest(am),
          homeHistory:     hm,
          awayHistory:     am,
        });

        const picks = Array.isArray(picksResult) ? picksResult : (picksResult?.picks || []);
        if (picks.length === 0) return null;

        totalPicks += picks.length;
        let matchHits = 0;
        let matchMisses = 0;
        let pickDetails = [];

        const totalCorners = (parseInt(matchStats.corners.home) || 0) + (parseInt(matchStats.corners.away) || 0);
        const totalYellow  = (parseInt(matchStats.yellowCards.home) || 0) + (parseInt(matchStats.yellowCards.away) || 0);
        const totalRed     = (parseInt(matchStats.redCards.home) || 0) + (parseInt(matchStats.redCards.away) || 0);
        const totalCards   = totalYellow + totalRed;


          picks.forEach(p => {
            let win = false;
            
            if (p.market === 'Ganador del Partido') {
              if ((p.selection === 'Victoria Local' || p.selection.includes('Local -0.5')) && homeScore > awayScore) win = true;
              if ((p.selection === 'Victoria Visitante' || p.selection.includes('Visitante -0.5')) && awayScore > homeScore) win = true;
              if (p.selection === 'Empate' && homeScore === awayScore) win = true;
            } else if (p.market === 'Handicap Asiático') {
              // Local -0.5 gana si el local gana el partido. Visitante -0.5 gana si el visitante gana.
              if (p.selection.includes('Local') && homeScore > awayScore) win = true;
              if (p.selection.includes('Visitante') && awayScore > homeScore) win = true;
            } else if (p.market === 'Total de Goles') {
              const threshold = parseFloat(p.selection.split(' ')[2]);
              if (p.selection.includes('Más') && totalGoals > threshold) win = true;
              if (p.selection.includes('Menos') && totalGoals < threshold) win = true;
            } else if (p.market === 'Ambos Marcan') {
              const btts = homeScore > 0 && awayScore > 0;
              if (p.selection.includes('Sí') && btts) win = true;
              if (p.selection.includes('No') && !btts) win = true;
            } else if (p.market === 'Doble Oportunidad') {
              if (p.selection.includes('1X') && homeScore >= awayScore) win = true;
              if (p.selection.includes('X2') && awayScore >= homeScore) win = true;
              if (p.selection.includes('12') && homeScore !== awayScore) win = true;
            } else if (p.market === 'Combo') {
              const btts = homeScore > 0 && awayScore > 0;
              if (p.selection === 'Ambos Marcan + Más de 2.5') win = btts && totalGoals > 2.5;
              else win = false; 
            } else if (p.market === 'Córners Totales') {
              // Evaluar con córners reales del partido (de ESPN boxscore)
              if (totalCorners === 0) {
                win = false; // Sin datos de córners — no podemos evaluar
              } else {
                const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
                if (m) {
                  const isOver = m[1] === 'Más', th = parseFloat(m[2]);
                  if (isOver && totalCorners > th) win = true;
                  else if (!isOver && totalCorners < th) win = true;
                }
              }
            } else if (p.market === 'Tarjetas Totales') {
              // Evaluar con tarjetas reales del partido
              if (totalCards === 0 && totalYellow === 0) {
                win = false; // Sin datos — no evaluamos
              } else {
                const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*)/);
                if (m) {
                  const isOver = m[1] === 'Más', th = parseFloat(m[2]);
                  const subject = p.selection.toLowerCase().includes('amarilla') ? totalYellow :
                                  p.selection.toLowerCase().includes('roja')     ? totalRed   : totalCards;
                  if (isOver && subject > th) win = true;
                  else if (!isOver && subject < th) win = true;
                }
              }
            } else if (p.market === 'Gol por Tramo') {
              // Si el partido terminó 0-0, no hubo gol en ningún tramo.
              win = totalGoals > 0;
            } else if (p.market === 'Goles en Vivo (1T)') {
              // Goles en el primer tiempo — aproximación: si hubo goles en el partido
              // (no tenemos marcador parcial en la auditoría)
              const m = p.selection.match(/(Más|Menos) de (\d+\.?\d*) goles/);
              if (m) {
                const isOver = m[1] === 'Más', th = parseFloat(m[2]);
                // Estimación conservadora: si el umbral es bajo (0.5) y hay goles, probablemente sí
                if (isOver && th <= 0.5 && totalGoals > 0) win = true;
                else if (!isOver && th >= 2.5 && totalGoals <= 1) win = true;
                else win = false; // No podemos saber con certeza sin marcador parcial
              } else { win = false; }
            } else if (p.market === 'Estrategia en Vivo' || p.market === 'Goles en Vivo') {
               // Evaluación flexible (Opción B)
               if (p.selection.includes('Más') || p.selection.includes('Menos')) {
                  // Pick de tipo Over/Under — evaluar contra el marcador final
                  const match = p.selection.match(/(Más|Menos) de (\d+\.?\d*) goles/);
                  if (match) {
                     const isOver = match[1] === 'Más';
                     const threshold = parseFloat(match[2]);
                     if (isOver && totalGoals > threshold) win = true;
                     else if (!isOver && totalGoals < threshold) win = true;
                  } else { win = totalGoals > 0; }
               } else if (p.selection.includes('2do Tiempo') || p.selection.includes('Segundo Tiempo')) {
                  // "Gol en el 2do Tiempo" — hay gol si el marcador final > 0
                  win = totalGoals > 0;
               } else if (p.selection.includes('1er Tiempo') || p.selection.includes('Primer Tiempo')) {
                  // "Gol en el 1er Tiempo" — suponemos que si hubo goles, algunos cayeron en el 1T
                  win = totalGoals > 0;
               } else if (p.selection.includes('Local') && homeScore > awayScore) {
                  win = true;
               } else if (p.selection.includes('Visitante') && awayScore > homeScore) {
                  win = true;
               } else if ((p.selection.includes('1X') || p.selection.includes('Remontada Local')) && homeScore >= awayScore) {
                  win = true;
               } else if ((p.selection.includes('X2') || p.selection.includes('Remontada Visitante')) && awayScore >= homeScore) {
                  win = true;
               } else {
                  // Fallback conservador: no podemos evaluar, marcamos como fallo
                  win = false;
               }
            } else if (p.market === 'Resultado en Vivo') {
               if ((p.selection.includes('Local') || p.selection.includes('1X')) && homeScore >= awayScore) win = true;
               else if ((p.selection.includes('Visitante') || p.selection.includes('X2')) && awayScore >= homeScore) win = true;
               else if (p.selection.includes('Empate') && homeScore === awayScore) win = true;
               else win = false;
            } else {
              // Mercados no mapeables
              win = false;
            }

            if (win) { hits++; matchHits++; } else { misses++; matchMisses++; }
            pickDetails.push({ selection: p.selection, isHit: win, market: p.market, argument: p.argument });
          });

          // Si después de filtrar los live picks este partido no tiene picks evaluables, lo omitimos del reporte
          if (pickDetails.length === 0) {
            skippedMatches++;
            return;
          }

          matchReports.push({
            id: eventId,
            matchStr: `${f.teams.home.name} ${homeScore} - ${awayScore} ${f.teams.away.name}`,
            league: f.league.name,
            totalPicks: picks.length,
            hits: matchHits,
            misses: matchMisses,
            details: pickDetails,
            stats: matchStats
          });

        } catch (e) {
          console.error(`Error en partido ${f?.fixture?.id}:`, e);
          skippedMatches++;
        }
      };

      // ── Ejecutar el pool con concurrencia de 4 ─────────────────────────
      const CONCURRENCY = 4;
      for (let i = 0; i < finishedFixtures.length; i += CONCURRENCY) {
        const batch = finishedFixtures.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(f => processMatch(f).finally(() => {
          completed++;
          setProgress(prev => ({ ...prev, current: completed, text: `Analizados ${completed} de ${finishedFixtures.length}...` }));
        })));
      }

      setResults({
        totalMatches: matchReports.length,
        skippedMatches,
        rawFixturesCount: finishedFixtures.length,
        totalPicks,
        hits,
        misses,
        winRate: totalPicks > 0 ? ((hits / totalPicks) * 100).toFixed(1) : 0,
        reports: matchReports.sort((a,b) => b.misses - a.misses) // ordenar por fallos primero
      });

    } catch (err) {
      alert('Error en auditoría: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-5 border border-white/10">
        <h2 className="text-lg font-black text-white flex items-center gap-2 mb-4">
          <Activity className="text-accent-green" size={20} />
          Auditor de Rendimiento (Laboratorio)
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Simula el análisis del Motor Predictivo sobre partidos pasados y cruza los pronósticos con los resultados reales para calcular el Win Rate exacto.
        </p>
        
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)}
            className="input-field text-sm w-auto"
            max={new Date().toISOString().split('T')[0]}
            disabled={loading}
          />
          <button 
            onClick={runAudit}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? <Activity size={16} className="animate-pulse" /> : <Play size={16} />}
            {loading ? 'Analizando...' : 'Ejecutar Auditoría'}
          </button>
        </div>

        {loading && (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-400">
              <span>{progress.text}</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-surface-900 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-accent-green h-full transition-all duration-300"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {results && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-5 text-center border-l-4 border-l-purple-500 relative group">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Partidos Analizados</p>
              <p className="text-3xl font-black text-white">{results.totalMatches}</p>
              <div className="absolute top-2 right-2 text-[10px] text-slate-500 cursor-help" title={`${results.skippedMatches} partidos descartados por el filtro estricto`}>
                De {results.rawFixturesCount}
              </div>
            </div>
            <div className="glass-card p-5 text-center border-l-4 border-l-blue-500">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Picks Generados</p>
              <p className="text-3xl font-black text-white">{results.totalPicks}</p>
            </div>
            <div className="glass-card p-5 text-center border-l-4 border-l-accent-green">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Aciertos (Hits)</p>
              <p className="text-3xl font-black text-accent-green">{results.hits}</p>
            </div>
            <div className="glass-card p-5 text-center border-l-4 border-l-red-500">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Efectividad</p>
              <p className="text-3xl font-black text-white">{results.winRate}%</p>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-white/5 bg-surface-800/30">
              <h3 className="font-bold text-white">Desglose de Partidos</h3>
              <p className="text-[10px] text-slate-500">Ordenado por cantidad de fallos (para estudio)</p>
            </div>
            <div className="divide-y divide-white/5">
              {results.reports.map(report => (
                <div key={report.id} className="p-0">
                  <div 
                    onClick={() => setExpandedMatch(expandedMatch === report.id ? null : report.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    <div>
                      <p className="text-sm font-bold text-white">{report.matchStr}</p>
                      <p className="text-[10px] text-slate-400">{report.league}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {report.misses > 0 ? (
                        <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded">
                          {report.misses} Fallos
                        </span>
                      ) : report.hits > 0 ? (
                        <span className="text-xs font-bold text-accent-green bg-accent-green/10 px-2 py-1 rounded flex items-center gap-1">
                          <CheckCircle size={12} /> Pleno
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded flex items-center gap-1">
                          <Activity size={12} /> Solo en Vivo
                        </span>
                      )}
                      {expandedMatch === report.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </div>
                  </div>
                  
                  {expandedMatch === report.id && (
                    <div className="p-4 pt-0 pb-4 bg-surface-900/30">
                      
                      {/* STATS DEL PARTIDO */}
                      <div className="flex gap-4 mb-4 bg-surface-800/50 p-3 rounded-lg border border-white/5">
                        <div className="flex-1 text-center">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Posesión</p>
                          <p className="text-xs font-black text-white mt-1">{report.stats.possession.home}% - {report.stats.possession.away}%</p>
                        </div>
                        <div className="flex-1 text-center border-l border-r border-white/5">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tiros (A Puerta)</p>
                          <p className="text-xs font-black text-white mt-1">
                            {report.stats.shots.home} <span className="text-slate-500">({report.stats.shotsOnTarget.home})</span> - {report.stats.shots.away} <span className="text-slate-500">({report.stats.shotsOnTarget.away})</span>
                          </p>
                        </div>
                        <div className="flex-1 text-center">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Córners</p>
                          <p className="text-xs font-black text-white mt-1">{report.stats.corners.home} - {report.stats.corners.away}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {report.details.map((pick, idx) => (
                          <div key={idx} className={`p-3 rounded-lg border flex gap-3 ${
                            pick.isHit === 'conditional' ? 'bg-yellow-400/5 border-yellow-400/10' :
                            pick.isHit ? 'bg-accent-green/5 border-accent-green/10' : 'bg-red-500/5 border-red-500/10'
                          }`}>
                            <div className="mt-0.5">
                              {pick.isHit === 'conditional' ? <Activity size={14} className="text-yellow-400" /> :
                               pick.isHit ? <CheckCircle size={14} className="text-accent-green" /> : <XCircle size={14} className="text-red-400" />}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white flex items-center flex-wrap gap-1.5">
                                {pick.selection}
                                {/* Badge de market — clave para distinguir picks con mismo nombre */}
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                  pick.isHit === 'conditional' ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5' :
                                  pick.isHit ? 'text-accent-green/70 border-accent-green/20 bg-accent-green/5' :
                                  'text-slate-500 border-white/10 bg-white/3'
                                }`}>
                                  {pick.market}
                                </span>
                              </p>
                              <p className="text-[10px] text-slate-500 mt-1">{pick.argument}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {results.reports.length === 0 && (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No se encontraron partidos finalizados para esta fecha.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
