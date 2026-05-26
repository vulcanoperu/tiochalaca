/**
 * MatchesPage.jsx — /partidos
 * Lista completa de partidos del día con filtros.
 * Extraído y renombrado desde el antiguo Home.jsx.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Filter, Search, X, Trophy, ChevronDown } from 'lucide-react';
import AccessibleMatchCard from '../components/AccessibleMatchCard';
import Loader from '../components/Loader';
import { enqueuePrefetch } from '../services/prefetchQueue';
import { calculateFormScore, calculateOverUnder, analyzeH2H, analyzeGoalsByTimeSlot, calcMatchProbabilities, generatePicks } from '../services/analysisEngine';

function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const LIVE_STATUSES = ['1H', '2H', 'ET', 'HT', 'P'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];
const PERU_LIGA1_IDS = new Set(['per.1', 'per-1', '281', '670', 'peruvian-primera-division']);

function isPeruLeague(league) {
  if (!league) return false;
  const idStr = String(league.id).toLowerCase();
  const nameStr = String(league.name).toLowerCase();
  return PERU_LIGA1_IDS.has(idStr) || nameStr.includes('peru') || nameStr.includes('perú');
}

function groupAndSortLeagues(matchesArray) {
  const byL = matchesArray.reduce((acc, f) => {
    const lid = f.league?.id;
    if (!acc[lid]) acc[lid] = { league: f.league, matches: [] };
    acc[lid].matches.push(f);
    return acc;
  }, {});
  return Object.values(byL).sort((a, b) => {
    const aP = isPeruLeague(a.league) ? 1 : 0;
    const bP = isPeruLeague(b.league) ? 1 : 0;
    if (aP !== bP) return bP - aP;
    return 0;
  });
}

const LEAGUE_CONTINENT = {
  'per.1': 'Sudamérica', 'arg.1': 'Sudamérica', 'bra.1': 'Sudamérica',
  'col.1': 'Sudamérica', 'chi.1': 'Sudamérica', 'uru.1': 'Sudamérica',
  'ecu.1': 'Sudamérica', 'par.1': 'Sudamérica', 'ven.1': 'Sudamérica',
  'bol.1': 'Sudamérica',
  'conmebol.libertadores': 'Internacionales', 'conmebol.sudamericana': 'Internacionales',
  'mex.1': 'Norteamérica', 'usa.1': 'Norteamérica',
  'eng.1': 'Europa', 'esp.1': 'Europa', 'ger.1': 'Europa', 'fra.1': 'Europa',
  'ita.1': 'Europa', 'por.1': 'Europa', 'ned.1': 'Europa', 'ksa.1': 'Asia y Oceanía',
  'uefa.champions': 'Internacionales', 'uefa.europa': 'Internacionales',
  'uefa.europa.conf': 'Internacionales',
};

const groupOrder = ['Internacionales', 'Sudamérica', 'Norteamérica', 'Europa', 'Asia y Oceanía', 'África'];

function Section({ title, groups, accent, matchPicks = {} }) {
  const accentClass = accent === 'green' ? 'text-accent-green' : accent === 'blue' ? 'text-accent-blue' : 'text-slate-500';
  const dotClass = accent === 'green' ? 'bg-accent-green shadow-[0_0_10px_#00ff88]' : accent === 'blue' ? 'bg-accent-blue' : 'bg-slate-700';

  return (
    <div className={`relative ${accent === 'green' ? 'glow-soft-green' : accent === 'blue' ? 'glow-soft-blue' : ''}`}>
      <div className="flex items-center gap-6 mb-10">
        <div className={`w-2 h-2 rounded-full ${dotClass}`} />
        <h2 className={`text-2xl font-bold ${accentClass}`}>{title}</h2>
        <div className="flex-1 h-px bg-white/[0.05]" />
      </div>
      <div className="space-y-16">
        {groups.map(({ league, matches }) => (
          <div key={league?.id} className="animate-in">
            <div className="flex items-center gap-4 mb-8 opacity-80 hover:opacity-100 transition-opacity">
              {league?.logo && <img src={league.logo} alt="" className="w-6 h-6 object-contain grayscale brightness-200" />}
              <span className="text-sm font-black uppercase tracking-widest text-slate-300">{league?.name}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {matches.map(f => <AccessibleMatchCard key={f.fixture?.id} fixture={f} pick={matchPicks[f.fixture?.id]} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchesPage() {
  const today = localDay();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = localDay(tomorrowDate);

  const [selected, setSelected] = useState(today);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [matchPicks, setMatchPicks] = useState({});
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchDay = useCallback(async (dateKey, isAutoRefresh = false) => {
    let hasCache = false;
    if (!isAutoRefresh) {
      try {
        const cached = sessionStorage.getItem(`chalaca_home_${dateKey}`);
        if (cached) { setFixtures(JSON.parse(cached)); hasCache = true; }
      } catch (e) {}
      if (!hasCache) { setLoading(true); setFixtures([]); }
    }
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/fixtures/date/${dateKey}`);
      if (!res.ok) throw new Error('Error de conexión');
      const json = await res.json();
      const data = json.data || [];
      setFixtures(data);
      setLastUpdated(new Date());
      if (data.length > 0) enqueuePrefetch(data);
      try { sessionStorage.setItem(`chalaca_home_${dateKey}`, JSON.stringify(data)); } catch(e) {}
    } catch (e) {
      if (!isAutoRefresh && !hasCache) setError(e.message);
    } finally { setLoading(false); }
  }, []);

  const mergeLiveScores = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/fixtures/live`);
      if (!res.ok) return;
      const json = await res.json();
      const liveData = json.data || [];
      if (!liveData.length) return;
      const liveMap = new Map();
      liveData.forEach(f => liveMap.set(String(f.fixture?.id), f));
      setFixtures(prev => {
        if (!prev.length) return prev;
        let changed = false;
        const updated = prev.map(f => {
          const live = liveMap.get(String(f.fixture?.id));
          if (live) { changed = true; return { ...f, fixture: { ...f.fixture, status: live.fixture.status }, goals: live.goals }; }
          return f;
        });
        liveData.forEach(lf => {
          if (!updated.some(u => String(u.fixture?.id) === String(lf.fixture?.id))) {
            updated.push(lf); changed = true;
          }
        });
        return changed ? updated : prev;
      });
      setLastUpdated(new Date());
    } catch {}
  }, []);

  useEffect(() => { fetchDay(selected); }, [selected, fetchDay]);
  useEffect(() => {
    if (selected !== today) return;
    const id = setInterval(mergeLiveScores, 30_000);
    return () => clearInterval(id);
  }, [selected, today, mergeLiveScores]);

  // Date tabs
  const dateTabs = [
    { key: today, label: 'Hoy' },
    { key: tomorrow, label: 'Mañana' },
  ];

  // Build present leagues
  const presentLeagues = Array.from(
    new Map(
      (fixtures || [])
        .filter(f => f.league?.id)
        .map(f => [String(f.league.id), f.league])
    ).values()
  );

  const getLeagueGroup = (league) => {
    const slug = String(league.id || '').toLowerCase();
    const name = String(league.name || '').toLowerCase();
    if (name.includes('champions') || name.includes('europa') || name.includes('conference') ||
        name.includes('libertadores') || name.includes('sudamericana')) return 'Internacionales';
    return LEAGUE_CONTINENT[slug] || 'Otras';
  };

  const groupedLeagues = presentLeagues.reduce((acc, league) => {
    const group = getLeagueGroup(league);
    if (!acc[group]) acc[group] = [];
    acc[group].push(league);
    return acc;
  }, {});

  const sortedGroups = Object.keys(groupedLeagues)
    .filter(g => g !== 'Otras')
    .sort((a, b) => {
      const ia = groupOrder.indexOf(a), ib = groupOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  sortedGroups.forEach(g => {
    groupedLeagues[g].sort((a, b) => isPeruLeague(a) ? -1 : isPeruLeague(b) ? 1 : (a.name || '').localeCompare(b.name || ''));
  });

  const filtered = useMemo(() => fixtures.filter(f => {
    let matchDateLocal = '';
    try {
      if (!f.fixture?.date) return false;
      matchDateLocal = localDay(new Date(f.fixture.date));
    } catch(e) { return false; }
    const isLive = LIVE_STATUSES.includes(f.fixture?.status?.short);

    if (selected === today) {
      if (matchDateLocal !== selected && !isLive) return false;
    } else {
      if (matchDateLocal !== selected) return false;
    }
    const isFinished = FINISHED_STATUSES.includes(f.fixture?.status?.short);
    if (selected > today && isFinished) return false;
    const matchesLeague = leagueFilter === 'all' || String(f.league?.id) === String(leagueFilter);
    const matchesSearch = !search || [f.teams?.home?.name, f.teams?.away?.name, f.league?.name]
      .some(s => s?.toLowerCase().includes(search.toLowerCase()));
    return matchesLeague && matchesSearch;
  }), [fixtures, selected, today, leagueFilter, search]);

  useEffect(() => {
    let active = true;

    async function loadPicks() {
      const pendingIds = filtered
        .map(f => f.fixture?.id)
        .filter(id => id && !matchPicks[id]);

      if (!pendingIds.length) return;

      for (let i = 0; i < pendingIds.length; i += 20) {
        if (!active) break;
        const chunk = pendingIds.slice(i, i + 20);
        
        try {
          const batchRes = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/analysis/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventIds: chunk }),
          });
          
          if (!batchRes.ok) continue;
          
          const { data: batchData } = await batchRes.json();
          if (!batchData) continue;
          
          const newPicks = {};
          
          for (const fixture of filtered) {
            const fid = fixture.fixture?.id;
            if (!chunk.includes(fid)) continue;
            
            const ad = batchData[fid];
            if (!ad) continue;

            const homeId = fixture.teams?.home?.id;
            const awayId = fixture.teams?.away?.id;
            if (!homeId || !awayId) continue;

            const hm = ad.homeMatches || [];
            const am = ad.awayMatches || [];

            const homeForm = calculateFormScore(hm, homeId);
            const awayForm = calculateFormScore(am, awayId);
            const homeFormAtHome = calculateFormScore(hm, homeId, 'home');
            const awayFormAway = calculateFormScore(am, awayId, 'away');
            const homeSplit = calculateOverUnder(hm, homeId);
            const awaySplit = calculateOverUnder(am, awayId);
            const h2hData = analyzeH2H(ad.h2h || [], homeId, awayId);

            const hGF = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsFor / homeFormAtHome.total : homeForm.goalsFor / Math.max(homeForm.total, 1);
            const hGA = homeFormAtHome.total >= 3 ? homeFormAtHome.goalsAgainst / homeFormAtHome.total : homeForm.goalsAgainst / Math.max(homeForm.total, 1);
            const aGF = awayFormAway.total >= 3 ? awayFormAway.goalsFor / awayFormAway.total : awayForm.goalsFor / Math.max(awayForm.total, 1);
            const aGA = awayFormAway.total >= 3 ? awayFormAway.goalsAgainst / awayFormAway.total : awayForm.goalsAgainst / Math.max(awayForm.total, 1);
            const poisson = calcMatchProbabilities(hGF, hGA, aGF, aGA, fixture.league?.name || '');

            const homeSlots = analyzeGoalsByTimeSlot(ad.homeHistEvs, homeId);
            const awaySlots = analyzeGoalsByTimeSlot(ad.awayHistEvs, awayId);

            const calcRest = (matches) => {
              if (!matches?.length) return null;
              const lastDate = matches[0]?.fixture?.date;
              if (!lastDate) return null;
              return Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000);
            };

            const picksRes = generatePicks({
              homeStats: null, awayStats: null,
              h2hData, homeForm, awayForm,
              homeSplitStats: homeSplit, awaySplitStats: awaySplit,
              isLive: false, liveClock: "0'", liveHomeGoals: 0, liveAwayGoals: 0,
              marketInsight: ad.marketInsight,
              homeCornersData: ad.homeCornersData,
              awayCornersData: ad.awayCornersData,
              homeCardsData: ad.homeCardsData,
              awayCardsData: ad.awayCardsData,
              homeSlots, awaySlots,
              homeFormAtHome, awayFormAway,
              poissonProbs: poisson,
              injuries: ad.injuries,
              homeTeamName: fixture.teams.home.name,
              awayTeamName: fixture.teams.away.name,
              leagueName: fixture.league?.name || '',
              homeRestDays: calcRest(hm),
              awayRestDays: calcRest(am),
              homeHistory: hm,
              awayHistory: am,
              city: fixture.city,
              marketOdds: ad.marketOdds,
              matchStandings: ad.matchStandings,
              advancedStats: ad.advancedStats,
              refereeStats: ad.refereeStats,
            });

            const sortedMatchPicks = [...(picksRes?.picks || [])].sort((a, b) => {
              const aIsValue = a.category === 'valor' || a.tier === '💎';
              const bIsValue = b.category === 'valor' || b.tier === '💎';
              if (aIsValue && !bIsValue) return -1;
              if (!aIsValue && bIsValue) return 1;
              const scoreA = (parseFloat(a.odds) || 0) * (a.probability || 0);
              const scoreB = (parseFloat(b.odds) || 0) * (b.probability || 0);
              return scoreB - scoreA;
            });

            if (sortedMatchPicks[0]) {
              newPicks[fid] = sortedMatchPicks[0];
            }
          }
          
          if (Object.keys(newPicks).length > 0 && active) {
            setMatchPicks(prev => ({ ...prev, ...newPicks }));
          }
        } catch (err) {
          console.error("Error fetching batch picks in MatchesPage:", err);
        }
      }
    }
    
    loadPicks();
    return () => { active = false; };
  }, [filtered, matchPicks]);

  const liveMatches = filtered.filter(f => LIVE_STATUSES.includes(f.fixture?.status?.short));
  const finishedMatches = filtered.filter(f => FINISHED_STATUSES.includes(f.fixture?.status?.short));
  const upcomingMatches = filtered.filter(f => !LIVE_STATUSES.includes(f.fixture?.status?.short) && !FINISHED_STATUSES.includes(f.fixture?.status?.short));
  upcomingMatches.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
  finishedMatches.sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));

  return (
    <div className="animate-in pb-20">

      {/* ── Header ── */}
      <div className="pt-8 mb-10">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
              <span className="text-white">Todos los</span>{' '}
              <span style={{ color: '#BFF102' }}>Partidos</span>
            </h1>
            <div className="flex items-center gap-4 text-sm font-black uppercase tracking-[0.2em] text-slate-500">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-700" />
                {fixtures.length} Partidos
              </span>
              {liveMatches.length > 0 && (
                <span className="flex items-center gap-2 text-accent-green">
                  <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
                  {liveMatches.length} En Vivo
                </span>
              )}
              {lastUpdated && (
                <span className="opacity-40">Act. {lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Date Tabs */}
            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white/5">
              {dateTabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`px-4 py-2 rounded-lg text-[13px] font-black uppercase tracking-wider transition-all duration-200 ${
                    selected === key
                      ? 'bg-accent-green text-surface-950 shadow-lg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative group">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-accent-green transition-colors" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar equipo..."
                className="h-12 pl-11 pr-10 rounded-xl text-[14px] font-bold w-52 bg-white/5 backdrop-blur-md text-slate-100 placeholder-slate-600 focus:outline-none focus:bg-white/10 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white bg-white/10 p-1 rounded-full transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* League Filter */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`h-12 w-48 flex items-center justify-between px-4 rounded-xl text-[14px] font-bold transition-all duration-200 ${
                  isDropdownOpen ? 'bg-accent-green/15 text-accent-green' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Filter size={15} className="shrink-0" />
                  <span className="truncate text-[13px]">
                    {leagueFilter === 'all' ? 'Todas las ligas' : presentLeagues.find(l => l?.id === leagueFilter)?.name || 'Todas'}
                  </span>
                </div>
                <ChevronDown size={14} className={`shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute z-50 right-0 top-full mt-2 w-72 bg-surface-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Filtrar por Liga</span>
                    {leagueFilter !== 'all' && (
                      <button onClick={() => { setLeagueFilter('all'); setIsDropdownOpen(false); }}
                        className="text-[10px] bg-accent-green/10 px-2 py-0.5 rounded text-accent-green font-black uppercase tracking-widest">
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="max-h-[55vh] overflow-y-auto py-2">
                    <button onClick={() => { setLeagueFilter('all'); setIsDropdownOpen(false); }}
                      className={`w-full flex items-center px-5 py-3 text-sm transition-all ${leagueFilter === 'all' ? 'text-surface-900 font-black bg-accent-green' : 'text-slate-300 hover:text-white hover:bg-white/5 font-bold'}`}>
                      Todas las ligas
                    </button>
                    {sortedGroups.map(group => (
                      <div key={group} className="mt-4 mb-1">
                        <div className="mx-4 mb-1 pb-1 border-b border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-accent-green/70">{group}</span>
                        </div>
                        {groupedLeagues[group].map(l => (
                          <button key={l?.id} onClick={() => { setLeagueFilter(l?.id); setIsDropdownOpen(false); }}
                            className={`w-full flex items-center pl-7 pr-5 py-2 text-sm transition-all ${leagueFilter === l?.id ? 'text-surface-900 font-black bg-accent-green' : 'text-slate-400 hover:text-white hover:bg-white/5 font-semibold'}`}>
                            <span className="truncate">{l?.name}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Match Content ── */}
      {loading ? <Loader /> : (
        <div className="space-y-24">
          {liveMatches.length > 0 && (
            <Section title="En Vivo" groups={groupAndSortLeagues(liveMatches)} accent="green" matchPicks={matchPicks} />
          )}
          {upcomingMatches.length > 0 && (
            <Section title="Próximos Encuentros" groups={groupAndSortLeagues(upcomingMatches)} accent="blue" matchPicks={matchPicks} />
          )}
          {finishedMatches.length > 0 && (
            <Section title="Resultados Recientes" groups={groupAndSortLeagues(finishedMatches)} matchPicks={matchPicks} />
          )}

          {!loading && fixtures.length > 0 && filtered.length === 0 && (
            <div className="py-20 text-center opacity-40">
              <p className="text-xs font-bold uppercase tracking-widest">Sin resultados para los filtros actuales</p>
              <button onClick={() => { setLeagueFilter('all'); setSearch(''); }} className="mt-4 text-accent-green text-[10px] font-black uppercase tracking-[0.2em]">
                Limpiar Filtros
              </button>
            </div>
          )}

          {!loading && fixtures.length === 0 && (
            <div className="py-32 text-center opacity-20">
              <Trophy size={64} strokeWidth={1} className="mx-auto mb-6" />
              <p className="font-black uppercase tracking-[0.3em] text-lg">No hay datos disponibles</p>
            </div>
          )}

          {error && (
            <div className="py-20 text-center">
              <p className="text-accent-red font-bold mb-4">{error}</p>
              <button onClick={() => fetchDay(selected)} className="btn-primary flex items-center gap-2 mx-auto">
                <RefreshCw size={14} /> Reintentar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
