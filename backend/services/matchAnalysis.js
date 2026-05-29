const axios = require('axios');
const supabase = require('../database');
const logger = require('../utils/logger');
const cache = require('../cache/cacheManager');
const { getMatchSummary } = require('../adapters/espnAdapter');
const fotmobAdapter = require('../adapters/fotmobAdapter');

const cacheGet = cache.get;
const cacheSet = cache.set;
const supabaseCacheGet = cache.supabaseGet;
const supabaseCacheSet = cache.supabaseSet;

async function computeMatchAnalysis(eventId, refresh = false) {
  const cacheKey = `match_analysis_${eventId}`;

  if (!refresh) {
    const inMemory = cacheGet(cacheKey);
    if (inMemory) return { data: inMemory, fromCache: 'memory' };

    const fromSupabase = await supabaseCacheGet(eventId);
    if (fromSupabase) {
      cacheSet(cacheKey, fromSupabase, 240);
      return { data: fromSupabase, fromCache: 'supabase' };
    }
  }

  // 3. Scraping ESPN (frío — sin caché)
  try {
    const summary = await getMatchSummary(eventId, refresh);
    if (!summary?.header) return { data: null, fromCache: false };

    const comp     = summary.header.competitions[0];
    const homeComp = comp.competitors.find(c => c.homeAway === 'home');
    const awayComp = comp.competitors.find(c => c.homeAway === 'away');
    const homeId   = homeComp.id;
    const awayId   = awayComp.id;
    const leagueSlug = summary.header.league?.slug || 'all';

    // 2. Schedules de ambos equipos en paralelo (igual que el endpoint individual)
    const filterCompleted = (events) => (events || [])
      .filter(e => {
        const state = e.competitions?.[0]?.status?.type?.state;
        if (state !== 'post') return false;
        const name = (e.season?.slug || e.name || '').toLowerCase();
        return !name.includes('friendly') && !name.includes('amistoso');
      })
      .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);

    const fetchSchedule = async (teamId) => {
      const slugs = new Set(leagueSlug !== 'all' ? [leagueSlug] : []);
      try {
        const tr = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${teamId}`);
        const dl = tr.data?.team?.defaultLeague?.slug;
        if (dl && dl !== 'all') slugs.add(dl);
      } catch (_) {}
      if (!slugs.size) slugs.add('all');
      const results = await Promise.all(Array.from(slugs).map(s =>
        axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/teams/${teamId}/schedule`)
          .then(r => r.data?.events || []).catch(() => [])
      ));
      return filterCompleted(results.flat());
    };

    const [homeRaw, awayRaw] = await Promise.all([fetchSchedule(homeId), fetchSchedule(awayId)]);

    // 3. Mapear eventos al formato del motor de análisis
    const mapEvent = (ev) => {
      const c     = ev.competitions?.[0];
      const homeC = c?.competitors?.find(x => x.homeAway === 'home');
      const awayC = c?.competitors?.find(x => x.homeAway === 'away');
      const getScore = t => parseInt(t?.score?.value ?? t?.score ?? 0);
      const getName  = t => t?.team?.displayName || t?.team?.name || t?.team?.shortDisplayName || '?';
      return {
        fixture: { id: ev.id, date: ev.date, status: { short: 'FT' } },
        league:  { name: ev.league?.name || ev.season?.displayName || 'Desconocido' },
        teams:   { home: { id: homeC?.id, name: getName(homeC), winner: homeC?.winner },
                   away: { id: awayC?.id, name: getName(awayC), winner: awayC?.winner } },
        goals:   { home: getScore(homeC), away: getScore(awayC) },
      };
    };

    const enrichMatch = (m, teamId) => {
      const isHome = String(m.teams?.home?.id) === String(teamId);
      const winner = m.teams?.home?.winner ? 'home' : m.teams?.away?.winner ? 'away' : 'draw';
      const result = isHome ? (winner === 'home' ? 'W' : winner === 'draw' ? 'D' : 'L')
                            : (winner === 'away' ? 'W' : winner === 'draw' ? 'D' : 'L');
      const dateStr = m.fixture?.date
        ? new Date(m.fixture.date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })
        : '';
      return { ...m, _isHome: isHome, _opponent: isHome ? m.teams?.away?.name : m.teams?.home?.name,
               _result: result, _date: dateStr, _league: m.league?.name || '' };
    };

    const hm = homeRaw.filter(e => String(e.id) !== String(eventId)).map(e => enrichMatch(mapEvent(e), homeId));
    const am = awayRaw.filter(e => String(e.id) !== String(eventId)).map(e => enrichMatch(mapEvent(e), awayId));

    // 4. Summaries históricos en paralelo (máx 12 por equipo = hasta 24 llamadas)
    //    El caché de getMatchSummary (24h para partidos terminados) hace esto muy rápido
    const fetchHistSummaries = async (matches) => {
      const ids     = matches.slice(0, 12).map(m => m.fixture.id);
      const results = await Promise.allSettled(ids.map(id => getMatchSummary(id)));
      return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    };

    const [homeHist, awayHist] = await Promise.all([fetchHistSummaries(hm), fetchHistSummaries(am)]);

    // 5. Extraer eventos (goles/tarjetas) de los summaries históricos
    const extractEvs = (s) => (s.keyEvents || []).map(e => {
      const t = e.type?.text || '';
      return {
        type:   (t.includes('Goal') || t.includes('Penalty - Scored')) ? 'Goal' : t.includes('Card') ? 'Card' : 'subst',
        detail: t,
        time:   { elapsed: e.clock?.value ? Math.floor(e.clock.value / 60) : parseInt(e.clock?.displayValue) || 0 },
        team:   { id: String(e.team?.id) },
        player: { name: e.participants?.[0]?.athlete?.displayName },
      };
    });

    // 6. Análisis Estadístico Avanzado (Corners, Remates, Faltas, Fueras de Juego)
    const getTeamStat = (s, tid, statName) => {
      const teams = s?.boxscore?.teams || [];
      if (!teams[0]?.statistics) return null;
      const t = teams.find(t => String(t.team?.id) === String(tid));
      const stat = t?.statistics?.find(s => s.name === statName)?.displayValue;
      return stat != null ? parseFloat(stat) : null;
    };
    const analyzeStat = (hist, tid, statName, thresholds) => {
      const arr = hist.map(s => getTeamStat(s, tid, statName)).filter(c => c !== null && !isNaN(c));
      if (!arr.length) return null;
      const total = arr.reduce((a, b) => a + b, 0);
      const res = { 
        avg: +(total / arr.length).toFixed(1), total, max: Math.max(...arr), matches: arr.length 
      };
      if (thresholds) {
        thresholds.forEach(th => {
          res[`over${th}`] = arr.filter(c => c > th).length;
        });
      }
      return res;
    };

    // 7. Análisis de Tarjetas — retorna null si no hay keyEvents (ej. Venezuela)
    const analyzeCards = (hist, tid) => {
      const yArr = [], rArr = [];
      hist.forEach(s => {
        let y = 0, r = 0;
        (s.keyEvents || []).forEach(e => {
          if (e.type?.text?.includes('Card') && String(e.team?.id) === String(tid)) {
            e.type.text.toLowerCase().includes('red') ? r++ : y++;
          }
        });
        yArr.push(y); rArr.push(r);
      });
      if (!yArr.length) return null; // null = "sin datos" → motor omite mercado tarjetas
      const n = yArr.length;
      const totalY = yArr.reduce((a, b) => a + b, 0);
      const totalR = rArr.reduce((a, b) => a + b, 0);
      const total  = totalY + totalR;
      const combined = yArr.map((y, i) => y + rArr[i]);
      return {
        avg: (total / n).toFixed(1), total, max: Math.max(...combined), matches: n,
        over1: combined.filter(c => c > 1).length, over2: combined.filter(c => c > 2).length,
        over3: combined.filter(c => c > 3).length,
        yellow: totalY, avgYellow: (totalY / n).toFixed(2),
        over1Y: yArr.filter(c => c > 1).length, over2Y: yArr.filter(c => c > 2).length,
        over3Y: yArr.filter(c => c > 3).length, maxYellow: Math.max(...yArr),
        red: totalR, avgRed: (totalR / n).toFixed(2),
        over0R: rArr.filter(c => c > 0).length, maxRed: Math.max(...rArr),
      };
    };

    // 8. H2H desde summary
    const h2hTeamA  = summary.headToHeadGames?.[0]?.team;
    const resolve   = o => o?.displayName || o?.name || o?.shortName || o?.abbreviation || '?';
    const h2h = (summary.headToHeadGames?.[0]?.events || []).map(e => {
      const hg = parseInt(e.homeTeamScore ?? 0), ag = parseInt(e.awayTeamScore ?? 0);
      const aId = String(h2hTeamA?.id), bId = String(e.opponent?.id);
      const isAHome = String(e.homeTeamId) === aId;
      return {
        fixture: { date: e.gameDate, status: { short: 'FT' } },
        teams: {
          home: { id: isAHome ? aId : bId,   name: isAHome ? resolve(h2hTeamA) : resolve(e.opponent), winner: hg > ag },
          away: { id: isAHome ? bId : aId,   name: isAHome ? resolve(e.opponent) : resolve(h2hTeamA), winner: ag > hg },
        },
        goals: { home: hg, away: ag },
      };
    });

    // 9. Lesiones desde rosters
    const injuries = [];
    (summary.rosters || []).forEach(r =>
      (r.roster || []).forEach(p => {
        if (p.injured || p.status === 'out')
          injuries.push({ player: { name: p.athlete?.displayName, reason: p.status || 'Lesión',
                          photo: p.athlete?.headshot?.href }, team: { name: r.team?.displayName } });
      })
    );

    // 10. Cuotas de mercado (PickCenter de ESPN)
    let marketInsight = null, marketOdds = null;
    try {
      const pc = summary.pickcenter;
      if (Array.isArray(pc) && pc.length > 0) {
        const item = pc[0];
        const getDec = o => {
          if (!o) return null;
          const v = parseFloat(o.value || o.moneyLine || 0);
          return v > 0 ? (v / 100) + 1 : v < 0 ? (100 / Math.abs(v)) + 1 : null;
        };
        marketInsight = {
          predictions: {
            percent: {
              home: item.homeTeamOdds?.winPercentage ? `${Math.round(item.homeTeamOdds.winPercentage)}` : null,
              draw: item.drawOdds?.winPercentage     ? `${Math.round(item.drawOdds.winPercentage)}`     : null,
              away: item.awayTeamOdds?.winPercentage ? `${Math.round(item.awayTeamOdds.winPercentage)}` : null,
            },
            winner: { comment: item.provider?.name || '' },
          },
        };
        marketOdds = { home: getDec(item.homeTeamOdds), away: getDec(item.awayTeamOdds), draw: getDec(item.drawOdds) };
      }
    } catch (_) {}

    // 11. Posiciones en tabla (motivación)
    let matchStandings = null;
    try {
      const st = summary.standings?.groups?.[0]?.standings?.entries;
      if (st?.length > 0) {
        const hSt = st.find(s => String(s.id) === String(homeId));
        const aSt = st.find(s => String(s.id) === String(awayId));
        if (hSt && aSt) matchStandings = {
          homeRank: hSt.stats?.find(s => s.name === 'rank')?.value,
          awayRank: aSt.stats?.find(s => s.name === 'rank')?.value,
          total: st.length,
        };
      }
    } catch (_) {}

    // 11b. Fallback
    if (!matchStandings && leagueSlug && leagueSlug !== 'all') {
      try {
        const stRes = await axios.get(`https://site.api.espn.com/apis/v2/sports/soccer/${leagueSlug}/standings`, { timeout: 4000 });
        const entries = stRes.data?.standings?.entries || stRes.data?.children?.[0]?.standings?.entries || [];
        if (entries.length > 0) {
          const findEntry = (e, id) => String(e.team?.id) === String(id) || String(e.id) === String(id);
          const hSt = entries.find(e => findEntry(e, homeId));
          const aSt = entries.find(e => findEntry(e, awayId));
          if (hSt && aSt) {
            const getRank = (e) => e.stats?.find(s => s.name === 'rank')?.value || e.stats?.find(s => s.abbreviation === 'RK')?.value || entries.indexOf(e) + 1;
            matchStandings = { homeRank: getRank(hSt), awayRank: getRank(aSt), total: entries.length };
          }
        }
      } catch (_) {}
    }

    // 12. Stats avanzadas (xG, posesión)
    let advancedStats = null;
    try {
      const box = summary.boxscore?.teams;
      if (box?.length === 2) {
        const getStat = (t, name) => { const v = parseFloat(t.statistics?.find(s => s.name === name)?.displayValue); return isNaN(v) ? null : v; };
        const hBox = box.find(t => String(t.team?.id) === String(homeId));
        const aBox = box.find(t => String(t.team?.id) === String(awayId));
        if (hBox && aBox) advancedStats = {
          home: { xG: getStat(hBox, 'expectedGoals'), possession: getStat(hBox, 'possessionPct') },
          away: { xG: getStat(aBox, 'expectedGoals'), possession: getStat(aBox, 'possessionPct') },
        };
      }
    } catch (_) {}

    // 12b. FOTMOB FALLBACK
    try {
      if ((!advancedStats || !marketOdds) && summary.header) {
        const d = summary.header.competitions?.[0]?.date;
        if (d) {
          const dateStr = new Date(d).toISOString().split('T')[0].replace(/-/g, '');
          const hmName = homeComp.team?.name || homeComp.team?.displayName || '';
          const awName = awayComp.team?.name || awayComp.team?.displayName || '';
          
          const fotmobId = await fotmobAdapter.findFotmobMatchId(dateStr, hmName, awName);
          if (fotmobId) {
            const fotmobData = await fotmobAdapter.getMatchDetail(fotmobId);
            if (fotmobData) {
              if (!advancedStats && fotmobData.stats && fotmobData.stats.length > 0) {
                 const xGStat = fotmobData.stats.find(s => s.title?.toLowerCase().includes('expected goals') || s.key === 'expected_goals');
                 if (xGStat) {
                    advancedStats = {
                      home: { xG: parseFloat(xGStat.stats[0]), possession: null },
                      away: { xG: parseFloat(xGStat.stats[1]), possession: null }
                    };
                 }
              }
              const matchState = summary.header?.competitions?.[0]?.status?.type?.state;
              if (!marketOdds && fotmobData.odds && matchState !== 'post') {
                 if (fotmobData.odds) marketOdds = { fotmob: true };
              }
            }
          }
        }
      }
    } catch (err) {
      logger.warn('fotmobFallback', 'Error en fallback de FotMob:', err.message);
    }
    
    // 13. Datos del Árbitro
    let refereeStats = null;
    try {
      const refereeName = summary.gameInfo?.officials?.[0]?.fullName || 
                          summary.header?.competitions?.[0]?.officials?.[0]?.fullName || 
                          summary.officials?.[0]?.fullName ||
                          summary.boxscore?.officials?.[0]?.fullName;
      if (refereeName) {
        const { data: refCache } = await supabase.from('analysis_cache').select('data').eq('event_id', `referee_${refereeName}`).single();
        if (refCache && refCache.data) {
          refereeStats = refCache.data;
        } else {
          refereeStats = { name: refereeName, matches: 0, yellow: 0, red: 0, avgYellow: 0, avgRed: 0 };
        }
      }
    } catch (_) {}

    const result = {
      homeMatches:    hm,
      awayMatches:    am,
      h2h,
      currentEvents:  extractEvs(summary),
      homeHistEvs:    homeHist.flatMap(s => extractEvs(s)),
      awayHistEvs:    awayHist.flatMap(s => extractEvs(s)),
      homeCornersData: analyzeStat(homeHist, homeId, 'wonCorners', [3, 4, 5]),
      awayCornersData: analyzeStat(awayHist, awayId, 'wonCorners', [3, 4, 5]),
      homeShotsData:   analyzeStat(homeHist, homeId, 'shotsOnTarget', [3, 4, 5, 6]),
      awayShotsData:   analyzeStat(awayHist, awayId, 'shotsOnTarget', [3, 4, 5, 6]),
      homeFoulsData:   analyzeStat(homeHist, homeId, 'foulsCommitted', [9, 11, 13]),
      awayFoulsData:   analyzeStat(awayHist, awayId, 'foulsCommitted', [9, 11, 13]),
      homeCardsData:   analyzeCards(homeHist, homeId),
      awayCardsData:   analyzeCards(awayHist, awayId),
      injuries, marketInsight, marketOdds, matchStandings, advancedStats,
      refereeStats,
      rosters: summary.rosters || null,
    };

    // Caché en memoria: 4h para terminados, 5 min para live/upcoming
    const matchState = summary.header?.competitions?.[0]?.status?.type?.state;

    // FASE AUDITORÍA: Si el partido ya terminó, inyectamos el resultado real de mercados secundarios
    if (matchState === 'post') {
      const getS = (tid, name) => parseInt(summary.boxscore?.teams?.find(t => String(t.team?.id) === String(tid))?.statistics?.find(st => st.name === name)?.displayValue || 0);
      result.matchResult = {
        corners: getS(homeId, 'wonCorners') + getS(awayId, 'wonCorners'),
        cards: result.currentEvents.filter(e => e.type === 'Card').length,
        shotsOnTarget: getS(homeId, 'shotsOnTarget') + getS(awayId, 'shotsOnTarget'),
        fouls: getS(homeId, 'foulsCommitted') + getS(awayId, 'foulsCommitted')
      };
      logger.audit('audit', `Match ${eventId} Result: Corners=${result.matchResult.corners}, Cards=${result.matchResult.cards}`);
    }

    const ttl = matchState === 'post' ? 240 : 5;
    cacheSet(cacheKey, result, ttl);

    // Persistencia en Supabase
    if (matchState === 'post' || matchState === 'pre') {
      supabaseCacheSet(eventId, result, matchState === 'post' ? 720 : 2);
    }

    // Recuperar cuotas pre-match si estamos en vivo y ESPN ya las ocultó
    if (matchState === 'in' && (!result.marketOdds || !result.marketInsight)) {
      try {
        const { data: cached } = await supabase.from('analysis_cache').select('data').eq('fixture_id', eventId).single();
        if (cached && cached.data) {
          if (!result.marketOdds && cached.data.marketOdds) result.marketOdds = cached.data.marketOdds;
          if (!result.marketInsight && cached.data.marketInsight) result.marketInsight = cached.data.marketInsight;
        }
      } catch (err) { /* silent fallback */ }
    }

    return { data: result, fromCache: false };

  } catch (err) {
    logger.error('computeMatchAnalysis', err.message);
    return { data: null, fromCache: false, error: err.message };
  }
}

module.exports = {
  computeMatchAnalysis
};
