import { useState, useEffect, useMemo } from 'react';
import { getTodayFixturesFromBackend, getMatchAnalysisFromBackend, saveValueBet, getTodayValueBets } from '../services/backendApi';
import {
  generatePicks, calculateFormScore, calculateOverUnder,
  analyzeGoalsByTimeSlot, analyzeH2H, calcMatchProbabilities
} from '../services/analysisEngine';

const ALLOWED_LEAGUES = [
  'per.1', 'ecu.1', 'ven.1', 'par.1', 'bra.1', 'arg.1', 'col.1', 'chi.1', 'uru.1',
  'conmebol.libertadores', 'conmebol.sudamericana',
  'mex.1', 'usa.1',
  'eng.1', 'esp.1', 'ger.1', 'fra.1', 'ita.1', 'por.1', 'ned.1', 'ksa.1',
  'uefa.champions', 'uefa.europa', 'uefa.europa.conf'
];

const LEAGUE_PRIORITY = {
  'uefa.champions': 1, 'uefa.europa': 2, 'uefa.europa.conf': 3,
  'eng.1': 4, 'esp.1': 5, 'ger.1': 6, 'ita.1': 7, 'fra.1': 8,
  'conmebol.libertadores': 9, 'conmebol.sudamericana': 10,
  'arg.1': 11, 'bra.1': 12, 'por.1': 13, 'ned.1': 14,
  'col.1': 15, 'chi.1': 16, 'mex.1': 17, 'usa.1': 18, 'ksa.1': 19,
  'per.1': 20, 'ecu.1': 21, 'ven.1': 22, 'par.1': 23, 'uru.1': 24,
};

const getLeaguePriority = (fixture) => {
  const id = String(fixture.league?.id || '').toLowerCase();
  for (const [slug, prio] of Object.entries(LEAGUE_PRIORITY)) {
    if (id === slug || id.includes(slug)) return prio;
  }
  return 99;
};

const getLocalDate = () => new Date().toLocaleDateString('sv-SE');

function processMatchData(match, ad) {
  const hm = ad.homeMatches || [];
  const am = ad.awayMatches || [];
  const h2h = ad.h2h || [];
  const homeId = match.teams?.home?.id;
  const awayId = match.teams?.away?.id;

  const homeForm = calculateFormScore(hm, homeId);
  const awayForm = calculateFormScore(am, awayId);
  const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
  const awayFormAway = calculateFormScore(am, awayId, 'away');
  const homeSplit = calculateOverUnder(hm, homeId);
  const awaySplit = calculateOverUnder(am, awayId);
  const h2hData = analyzeH2H(h2h, homeId, awayId);
  const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
  const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);

  const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
  const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
  const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
  const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
  const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA);

  const calcRest = (ms) => {
    if (!ms?.length) return null;
    const ld = ms[0]?.fixture?.date;
    return ld ? Math.floor((Date.now() - new Date(ld).getTime()) / 86400000) : null;
  };

  const result = generatePicks({
    homeStats: null, awayStats: null, h2hData, homeForm, awayForm,
    homeSplitStats: homeSplit, awaySplitStats: awaySplit,
    isLive: ['1H', '2H', 'HT', 'ET', 'P'].includes(match.fixture?.status?.short),
    liveClock: match.fixture?.status?.elapsed ? String(match.fixture.status.elapsed) + "'" : "0'",
    liveHomeGoals: parseInt(match.goals?.home ?? 0),
    liveAwayGoals: parseInt(match.goals?.away ?? 0),
    marketInsight: ad.marketInsight,
    homeCornersData: ad.homeCornersData, awayCornersData: ad.awayCornersData,
    homeCardsData: ad.homeCardsData, awayCardsData: ad.awayCardsData,
    homeSlots, awaySlots, homeFormAtHome, awayFormAway,
    poissonProbs: poisson, injuries: ad.injuries,
    homeTeamName: match.teams?.home?.name, awayTeamName: match.teams?.away?.name,
    leagueName: match.league?.name, homeRestDays: calcRest(hm), awayRestDays: calcRest(am),
    homeHistory: hm, awayHistory: am, city: match.city || null,
    marketOdds: ad.marketOdds, matchStandings: ad.matchStandings, advancedStats: ad.advancedStats,
  });

  if (result && result.picks) {
    const topPicks = result.picks.filter(p =>
      p.tier === '💎' || p.tier === '🔵' ||
      (p.argument && p.argument.toLowerCase().includes('value bet')) ||
      (p.probability && p.probability >= 70)
    );
    if (topPicks.length > 0) return { match, picks: topPicks, projectedGoals: result.projectedGoals };
  }
  return null;
}

export function useRecommendations() {
  const [fixtures, setFixtures] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzingCount, setAnalyzingCount] = useState(0);
  const [scannedCount, setScannedCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState(getLocalDate());
  const [selectedMarket, setSelectedMarket] = useState('all');
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [activeTab, setActiveTab] = useState('vip');
  const [savedValueBets, setSavedValueBets] = useState([]);

  // Cargar Value Bets guardadas para la fecha seleccionada
  useEffect(() => {
    getTodayValueBets(selectedDate).then(res => {
      if (res.success) setSavedValueBets(res.data);
    });
  }, [selectedDate]);

  useEffect(() => {
    let isActive = true;
    async function loadData() {
      setLoading(true);
      setRecommendations([]);
      setScannedCount(0);
      const res = await getTodayFixturesFromBackend(selectedDate);
      if (!isActive) return;

      if (res.ok && res.data) {
        const matchesData = Array.isArray(res.data) ? res.data : [];
        const isToday = selectedDate === getLocalDate();

        const filtered = matchesData.filter(m => {
          const leagueId = m.league?.id ? String(m.league.id).toLowerCase() : '';
          const isAllowed = ALLOWED_LEAGUES.some(slug => leagueId === slug || leagueId.includes(slug));
          if (isToday) {
            return isAllowed && !['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO'].includes(m.fixture?.status?.short);
          }
          return isAllowed;
        });

        setFixtures(filtered);
        if (filtered.length > 0) {
          const sorted = [...filtered].sort((a, b) => getLeaguePriority(a) - getLeaguePriority(b));
          analyzeMatches(sorted, () => isActive);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    }
    loadData();
    return () => { isActive = false; };
  }, [selectedDate]);

  async function analyzeMatches(matches, isActiveCheck) {
    setAnalyzingCount(0);
    setScannedCount(0);
    setRecommendations([]);

    const limited = matches.slice(0, 40);
    const totalToAnalyze = limited.length;
    let index = 0;
    let finishedCount = 0;
    let validCount = 0;

    const worker = async () => {
      while (index < totalToAnalyze) {
        if (!isActiveCheck()) return;
        const currentIdx = index++;
        const match = limited[currentIdx];

        try {
          const res = await getMatchAnalysisFromBackend(match.fixture?.id);
          if (!isActiveCheck()) return;

          if (res.ok && res.data) {
            validCount++;
            const rec = processMatchData(match, res.data);
            if (rec && isActiveCheck()) {
              setRecommendations(prev => [...prev, rec]);
              rec.picks.forEach(pick => {
                if (pick.argument && pick.argument.toLowerCase().includes('value bet')) {
                  saveValueBet({
                    fixture_id: match.fixture?.id, home_team: match.teams?.home?.name,
                    away_team: match.teams?.away?.name, league: match.league?.name,
                    market: pick.market, selection: pick.selection, probability: pick.probability,
                    odds_at_detection: parseFloat(pick.odds) || null, argument: pick.argument,
                    match_date: selectedDate,
                  }).then(saved => {
                    if (saved.isNew) {
                      getTodayValueBets(selectedDate).then(r => {
                        if (r.success) setSavedValueBets(r.data);
                      });
                    }
                  });
                }
              });
            }
          }
        } catch (err) {
          console.error("Error analizando match:", match.fixture?.id, err);
        } finally {
          if (isActiveCheck()) {
            finishedCount++;
            setAnalyzingCount(finishedCount);
            setScannedCount(validCount);
          }
        }
      }
    };

    const workers = Array(8).fill(null).map(() => worker());
    await Promise.all(workers);

    if (isActiveCheck()) {
      setScannedCount(validCount);
      setLoading(false);
    }
  }

  const vipPicks = useMemo(() => {
    const list = [];
    if (!recommendations) return list;
    recommendations.forEach(rec => {
      if (rec.picks) {
        rec.picks.forEach(p => {
          const isVip = p.tier === '💎' || (p.probability && p.probability >= 78);
          const isValueBet = p.category === 'valor' || (p.argument && p.argument.toLowerCase().includes('value bet'));
          if (isVip || isValueBet) list.push({ ...p, match: rec.match });
        });
      }
    });
    return list.sort((a, b) => (b.probability || 0) - (a.probability || 0));
  }, [recommendations]);

  const valueBets = useMemo(() => {
    const list = [];
    if (!recommendations) return list;
    recommendations.forEach(rec => {
      if (rec.picks) {
        rec.picks.forEach(p => {
          if (p.category === 'valor' || (p.argument && p.argument.toLowerCase().includes('value bet'))) {
            list.push({ ...p, match: rec.match });
          }
        });
      }
    });
    return list;
  }, [recommendations]);

  const availableMarkets = useMemo(() => {
    const m = new Set();
    vipPicks.forEach(p => p.market && m.add(p.market));
    return Array.from(m).sort();
  }, [vipPicks]);

  const availableLeagues = useMemo(() => {
    const l = new Set();
    vipPicks.forEach(p => p.match?.league?.name && l.add(p.match.league.name));
    return Array.from(l).sort();
  }, [vipPicks]);

  const filteredVipPicks = useMemo(() => {
    return vipPicks.filter(p => {
      const matchMarket = selectedMarket === 'all' || p.market === selectedMarket;
      const matchLeague = selectedLeague === 'all' || (p.match?.league?.name === selectedLeague);
      return matchMarket && matchLeague;
    });
  }, [vipPicks, selectedMarket, selectedLeague]);

  return {
    fixtures, recommendations, loading, analyzingCount, scannedCount,
    selectedDate, setSelectedDate, selectedMarket, setSelectedMarket,
    selectedLeague, setSelectedLeague, activeTab, setActiveTab,
    savedValueBets, vipPicks, valueBets, availableMarkets, availableLeagues, filteredVipPicks,
    getLocalDate, parseLocalDate: (str) => new Date(`${str}T12:00:00`),
  };
}
