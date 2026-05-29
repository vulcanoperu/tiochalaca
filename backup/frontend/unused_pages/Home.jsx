import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Filter, Search, X, AlertCircle, Trophy, ChevronLeft, ChevronRight, ChevronDown, Calendar } from 'lucide-react';
import AccessibleMatchCard from '../components/AccessibleMatchCard';
import MatchCard from '../components/MatchCard';
import Loader from '../components/Loader';
import PendingWall from '../components/PendingWall';
import { enqueuePrefetch } from '../services/prefetchQueue';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function localDay(d = new Date()) { 
  try {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
}

const LIVE_STATUSES = ['1H', '2H', 'ET', 'HT', 'P'];
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

const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];

export default function Home() {
  const user = JSON.parse(sessionStorage.getItem('chalaca_user') || '{}');
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
  const dropdownRef = useRef(null);
  const stripRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
      try { sessionStorage.setItem(`chalaca_home_${dateKey}`, JSON.stringify(data)); } catch(e){}
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
      if (liveData.length === 0) return;
      const liveMap = new Map();
      liveData.forEach(f => liveMap.set(String(f.fixture?.id), f));
      setFixtures(prev => {
        if (prev.length === 0) return prev;
        let changed = false;
        const updated = prev.map(f => {
          const live = liveMap.get(String(f.fixture?.id));
          if (live) {
            changed = true;
            return { ...f, fixture: { ...f.fixture, status: live.fixture.status }, goals: live.goals };
          }
          return f;
        });
        liveData.forEach(lf => {
          if (!updated.some(u => String(u.fixture?.id) === String(lf.fixture?.id))) {
            updated.push(lf);
            changed = true;
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

  const filtered = fixtures.filter(f => {
    // 1. Calcular fecha local del partido
    let matchDateLocal = '';
    try {
      if (!f.fixture?.date) return false;
      const d = new Date(f.fixture.date);
      matchDateLocal = localDay(d);
    } catch(e) { return false; }

    // 2. Determinar si está en vivo
    const isLive = LIVE_STATUSES.includes(f.fixture?.status?.short);

    // 3. Lógica de filtrado por fecha estricta
    const isTodaySelected = (selected === today);
    if (isTodaySelected) {
      if (matchDateLocal !== selected && !isLive) return false;
    } else {
      if (matchDateLocal !== selected) return false;
    }

    // Parche lógico para datos corruptos del proveedor (ESPN):
    // Es imposible que un partido programado para un día FUTURO ya esté "FINALIZADO".
    // Si ESPN envía un partido ya jugado con una fecha de mañana, lo bloqueamos.
    const isFinished = FINISHED_STATUSES.includes(f.fixture?.status?.short);
    if (selected > today && isFinished) return false;

    // 4. Filtros de búsqueda y liga
    const matchesLeague = leagueFilter === 'all' || String(f.league?.id) === String(leagueFilter);
    const matchesSearch = !search || [f.teams?.home?.name, f.teams?.away?.name, f.league?.name]
          .some(s => s?.toLowerCase().includes(search.toLowerCase()));
    
    return matchesLeague && matchesSearch;
  });

  const liveMatches = filtered.filter(f => LIVE_STATUSES.includes(f.fixture?.status?.short));
  const finishedMatches = filtered.filter(f => FINISHED_STATUSES.includes(f.fixture?.status?.short));
  const upcomingMatches = filtered.filter(f => !LIVE_STATUSES.includes(f.fixture?.status?.short) && !FINISHED_STATUSES.includes(f.fixture?.status?.short));

  // Sort individually for their specific tabs
  upcomingMatches.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
  finishedMatches.sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));
  
  // Sort ALL matches chronologically for the "All" tab
  const allMatchesSorted = [...filtered].sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

  const presentLeagues = Array.from(
    new Map(
      (fixtures || [])
        .filter(f => f.league?.id)
        .map(f => [String(f.league.id), f.league])
    ).values()
  );

  const LEAGUE_CONTINENT = {
    // ★ Sudamérica
    'per.1':                  'Sudamérica',
    'arg.1':                  'Sudamérica',
    'bra.1':                  'Sudamérica',
    'bra.2':                  'Sudamérica',
    'col.1':                  'Sudamérica',
    'chi.1':                  'Sudamérica',
    'uru.1':                  'Sudamérica',
    'ecu.1':                  'Sudamérica',
    'par.1':                  'Sudamérica',
    'ven.1':                  'Sudamérica',
    'bol.1':                  'Sudamérica',
    'conmebol.libertadores':  'Internacionales',
    'conmebol.sudamericana':  'Internacionales',
    // ★ Norteamérica
    'mex.1':                  'Norteamérica',
    'usa.1':                  'Norteamérica',
    'usa.open':               'Norteamérica',
    'can.1':                  'Norteamérica',
    // ★ Europa — Ligas
    'eng.1':                  'Europa',
    'eng.2':                  'Europa',
    'esp.1':                  'Europa',
    'esp.2':                  'Europa',
    'ger.1':                  'Europa',
    'ger.2':                  'Europa',
    'fra.1':                  'Europa',
    'fra.2':                  'Europa',
    'ita.1':                  'Europa',
    'ita.2':                  'Europa',
    'por.1':                  'Europa',
    'ned.1':                  'Europa',
    'sco.1':                  'Europa',
    'tur.1':                  'Europa',
    'gre.1':                  'Europa',
    'bel.1':                  'Europa',
    'aut.1':                  'Europa',
    'sui.1':                  'Europa',
    'den.1':                  'Europa',
    'nor.1':                  'Europa',
    'swe.1':                  'Europa',
    'pol.1':                  'Europa',
    'rus.1':                  'Europa',
    'ukr.1':                  'Europa',
    'cro.1':                  'Europa',
    'srb.1':                  'Europa',
    'cze.1':                  'Europa',
    // ★ Europa — Competiciones UEFA
    'uefa.champions':         'Internacionales',
    'uefa.europa':            'Internacionales',
    'uefa.europa.conf':       'Internacionales',
    '2':                      'Internacionales',
    '3':                      'Internacionales',
    '848':                    'Internacionales',
    '13':                     'Internacionales',
    '11':                     'Internacionales',
    // ★ Asia y Oceanía
    'ksa.1':                  'Asia y Oceanía',
    'jpn.1':                  'Asia y Oceanía',
    'kor.1':                  'Asia y Oceanía',
    'chn.1':                  'Asia y Oceanía',
    'qat.1':                  'Asia y Oceanía',
    'uae.1':                  'Asia y Oceanía',
    'aus.1':                  'Asia y Oceanía',
    'ind.1':                  'Asia y Oceanía',
    // ★ África
    'egy.1':                  'África',
    'mar.1':                  'África',
    'tun.1':                  'África',
    'alg.1':                  'África',
    'rsa.1':                  'África',
    'ngr.1':                  'África',
    'sen.1':                  'África',
  };

  const getLeagueGroup = (league) => {
    const slug = String(league.id || '').toLowerCase();
    const name = String(league.name || '').toLowerCase();
    
    if (name.includes('champions') || 
        name.includes('europa') || 
        name.includes('conference') || 
        name.includes('libertadores') || 
        name.includes('sudamericana')) {
      return 'Internacionales';
    }

    return LEAGUE_CONTINENT[slug] || 'Otras Regiones';
  };

  const groupedLeagues = presentLeagues.reduce((acc, league) => {
    const group = getLeagueGroup(league);
    if (!acc[group]) acc[group] = [];
    acc[group].push(league);
    return acc;
  }, {});

  const groupOrder = ['Internacionales', 'Sudamérica', 'Norteamérica', 'Europa', 'Asia y Oceanía', 'África'];
  const sortedGroups = Object.keys(groupedLeagues)
    .filter(g => g !== 'Otras Regiones')
    .sort((a, b) => {
    const idxA = groupOrder.indexOf(a);
    const idxB = groupOrder.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });
  
  sortedGroups.forEach(group => {
    groupedLeagues[group].sort((a, b) => {
      if (isPeruLeague(a)) return -1;
      if (isPeruLeague(b)) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  });
  
  let selectedLabel = selected;
  try {
    const d = new Date(selected + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      const labelRaw = d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
      selectedLabel = labelRaw.split(' ').map(word => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word)).join(' ');
    }
  } catch(e) {}

  return (
    <div className="animate-in pb-20">
      
      {/* ── Hero / Header ── */}
      {/* ── Hero / Header Simplificado ── */}
      <div className="relative mb-12 pt-8">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          
          <div className="relative z-10 flex-1">
            <div className="flex items-center gap-6 text-sm font-black uppercase tracking-[0.2em] text-slate-500 mb-6">
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
              {lastUpdated && <span className="opacity-40">Act. {lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>

            {/* (Selector Hoy/Mañana ha sido eliminado) */}
          </div>

          {/* Buscador y Filtros */}
          <div className="flex flex-col sm:flex-row items-center gap-4 relative z-20 shrink-0">

            {/* ── Search ── */}
            <div className="relative group w-full sm:w-auto">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#BFF102] transition-all duration-300"
              />
              <input
                 value={search}
                 onChange={e => setSearch(e.target.value)}
                 placeholder="Buscar equipo o liga..."
                 className="
                  h-14 pl-12 pr-4 rounded-2xl text-[15px] font-bold w-full sm:w-56
                  bg-white/5 backdrop-blur-md
                  border border-white/8
                  text-slate-100 placeholder-slate-500
                  focus:outline-none focus:bg-white/10
                  focus:border-[#72BF01]/50
                  focus:shadow-[0_0_0_4px_rgba(114,191,1,0.12)]
                  transition-all duration-400 ease-in-out
                "
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors bg-white/10 p-1 rounded-full"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* ── League Dropdown ── */}
            <div className="relative w-full sm:w-auto" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`
                  h-14 w-full sm:w-56 flex items-center justify-between px-5 rounded-2xl text-[15px] font-bold
                  border transition-all duration-300 cursor-pointer shadow-lg
                  ${isDropdownOpen
                    ? 'bg-[#72BF01]/15 border-[#72BF01]/40 text-[#BFF102]'
                    : 'bg-white/5 border-white/8 text-slate-300 hover:bg-white/8 hover:border-white/15 hover:text-white'}
                `}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Filter size={18} className="shrink-0" />
                  <span className="truncate uppercase tracking-wider">
                  {leagueFilter === 'all'
                    ? 'Ligas: Todas'
                    : presentLeagues.find(l => l?.id === leagueFilter)?.name || 'Todas'}
                </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {leagueFilter !== 'all' && (
                    <span className="w-2 h-2 rounded-full bg-[#BFF102]" />
                  )}
                <ChevronDown
                  size={16}
                  className={`shrink-0 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`}
                />
                </div>
              </button>

              {/* Panel Dropdown Ligas */}
              {isDropdownOpen && (
                <div className="
                  absolute z-50 right-0 top-full mt-3 w-[320px]
                  bg-surface-950 border border-white/10 rounded-2xl
                  shadow-[0_30px_80px_rgba(0,0,0,0.8)]
                  overflow-hidden
                  animate-in fade-in slide-in-from-top-2 duration-200
                ">
                  <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <span className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">Filtrar por Liga</span>
                    {leagueFilter !== 'all' && (
                      <button
                        onClick={() => { setLeagueFilter('all'); setIsDropdownOpen(false); }}
                        className="text-[11px] bg-accent-green/10 px-2 py-1 rounded text-[#BFF102] hover:bg-accent-green/20 font-bold uppercase tracking-widest transition-colors"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  <div className="max-h-[60vh] overflow-y-auto py-2">
                    <button
                      onClick={() => { setLeagueFilter('all'); setIsDropdownOpen(false); }}
                      className={`w-full flex items-center justify-between px-6 py-3.5 text-base transition-all duration-150 ${
                        leagueFilter === 'all'
                          ? 'text-surface-900 font-black bg-accent-green'
                          : 'text-slate-300 hover:text-white hover:bg-white/5 font-bold'
                      }`}
                    >
                      <span className="uppercase tracking-wider">TODAS LAS LIGAS</span>
                    </button>

                    {sortedGroups.map(group => (
                      <div key={group} className="mt-6 mb-2">
                        <div className="mx-4 mb-2 px-3 py-1.5 flex items-center gap-2 border-b border-white/5">
                          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#72BF01]/80">{group}</span>
                        </div>
                        {groupedLeagues[group].map(l => (
                          <button
                            key={l?.id}
                            onClick={() => { setLeagueFilter(l?.id); setIsDropdownOpen(false); }}
                            className={`w-full flex items-center justify-between pl-8 pr-6 py-2 text-base transition-all duration-150 ${
                              leagueFilter === l?.id
                                ? 'text-surface-900 font-black bg-accent-green'
                                : 'text-slate-400 hover:text-white hover:bg-white/5 font-semibold'
                            }`}
                          >
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

      {/* ── Tabs Removidos ── */}

      {/* ── Content ── */}
      {loading ? <Loader /> : (
        <div className="space-y-24">
          {activeTab === 'all' ? (
            <>
              {/* En Vivo primero — si hay partidos en curso */}
              {liveMatches.length > 0 && (
                <Section title="En Vivo" groups={groupAndSortLeagues(liveMatches)} accent="green" />
              )}

              {/* Próximos — siempre presentes si existen */}
              {upcomingMatches.length > 0 && (
                <Section
                  title="Próximos Encuentros"
                  groups={groupAndSortLeagues(upcomingMatches)}
                  accent="blue"
                />
              )}

              {/* Finalizados al final */}
              {finishedMatches.length > 0 && (
                <Section title="Resultados Recientes" groups={groupAndSortLeagues(finishedMatches)} />
              )}

              {/* Sin partidos en absoluto */}
              {liveMatches.length === 0 && upcomingMatches.length === 0 && finishedMatches.length === 0 && filtered.length > 0 && (
                <Section title="Todos los Partidos" groups={groupAndSortLeagues(filtered)} />
              )}
            </>
          ) : (
            <>
              {activeTab === 'live' && liveMatches.length > 0 && (
                <Section title="En Vivo" groups={groupAndSortLeagues(liveMatches)} accent="green" />
              )}
              {activeTab === 'upcoming' && upcomingMatches.length > 0 && (
                <Section title="Próximos Encuentros" groups={groupAndSortLeagues(upcomingMatches)} accent="blue" />
              )}
              {activeTab === 'finished' && finishedMatches.length > 0 && (
                <Section title="Resultados Recientes" groups={groupAndSortLeagues(finishedMatches)} />
              )}
            </>
          )}
          
          {!loading && fixtures.length > 0 && filtered.length === 0 && (
            <div className="py-20 text-center opacity-40">
              <p className="text-xs font-bold uppercase tracking-widest">Los filtros actuales no coinciden con los {fixtures.length} partidos cargados</p>
              <button onClick={() => { setLeagueFilter('all'); setSearch(''); }} className="mt-4 text-accent-green text-[10px] font-black uppercase tracking-[0.2em]">Limpiar Filtros</button>
            </div>
          )}

          {!loading && fixtures.length === 0 && (
            <div className="py-32 text-center opacity-20">
              <Trophy size={64} strokeWidth={1} className="mx-auto mb-6" />
              <p className="font-black uppercase tracking-[0.3em] text-lg">No hay datos disponibles</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ... in the file, we only need to replace the usage in the Section component

function Section({ title, groups, accent }) {
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 md:gap-12">
              {matches.map(f => <AccessibleMatchCard key={f.fixture?.id} fixture={f} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
