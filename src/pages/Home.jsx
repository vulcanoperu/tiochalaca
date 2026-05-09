import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Filter, Search, AlertCircle, Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
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

function buildDayStrip(centerDate) {
  const days = [];
  const isMay2026 = centerDate.getMonth() === 4 && centerDate.getFullYear() === 2026;

  if (isMay2026) {
    for (let i = 1; i <= 31; i++) {
      const d = new Date(2026, 4, i);
      days.push({
        key:     localDay(d),
        dayNum:  d.getDate(),
        dayName: d.toLocaleDateString('es-PE', { weekday: 'short' }).slice(0, 2).toUpperCase(),
        month:   d.toLocaleDateString('es-PE', { month: 'short' }),
        isToday: localDay(d) === localDay(),
      });
    }
  } else {
    for (let i = -7; i <= 7; i++) {
      const d = new Date(centerDate);
      d.setDate(d.getDate() + i);
      days.push({
        key:     localDay(d),
        dayNum:  d.getDate(),
        dayName: d.toLocaleDateString('es-PE', { weekday: 'short' }).slice(0, 2).toUpperCase(),
        month:   d.toLocaleDateString('es-PE', { month: 'short' }),
        isToday: localDay(d) === localDay(),
      });
    }
  }
  return days;
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
  const [days] = useState(() => buildDayStrip(new Date()));
  const [selected, setSelected] = useState(today);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const stripRef = useRef(null);

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

  // ── Drag to scroll logic ──
  useEffect(() => {
    const slider = stripRef.current;
    if (!slider) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    const onMouseDown = (e) => {
      isDown = true;
      slider.classList.add('active');
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;
    };
    const onMouseLeave = () => {
      isDown = false;
      slider.classList.remove('active');
    };
    const onMouseUp = () => {
      isDown = false;
      slider.classList.remove('active');
    };
    const onMouseMove = (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 2; // scroll-fast
      slider.scrollLeft = scrollLeft - walk;
    };

    slider.addEventListener('mousedown', onMouseDown);
    slider.addEventListener('mouseleave', onMouseLeave);
    slider.addEventListener('mouseup', onMouseUp);
    slider.addEventListener('mousemove', onMouseMove);

    return () => {
      slider.removeEventListener('mousedown', onMouseDown);
      slider.removeEventListener('mouseleave', onMouseLeave);
      slider.removeEventListener('mouseup', onMouseUp);
      slider.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  const filtered = fixtures.filter(f => {
    // Filtro simplificado y seguro
    let matchDateLocal = '';
    try {
      if (!f.fixture?.date) return false;
      const d = new Date(f.fixture.date);
      matchDateLocal = localDay(d);
    } catch(e) { return false; }

    const isLive = LIVE_STATUSES.includes(f.fixture?.status?.short);
    const matchesDate = (selected === today) ? (matchDateLocal === selected || isLive) : (matchDateLocal === selected);
    if (!matchesDate) return false;

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

  const presentLeagues = [...new Map((fixtures || []).map(f => [f.league?.id, f.league])).values()];
  
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
      <div className="relative mb-16 pt-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="relative z-10">
            <h1 className="text-4xl font-black tracking-tighter text-gradient-white mb-3">
              {selectedLabel}
            </h1>
            <div className="flex items-center gap-6 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
              <span className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                {fixtures.length} Partidos
              </span>
              {liveMatches.length > 0 && (
                <span className="flex items-center gap-2 text-accent-green">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                  {liveMatches.length} En Vivo
                </span>
              )}
              {lastUpdated && <span className="opacity-40">Act. {lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          </div>
          <button 
            onClick={() => fetchDay(selected)} 
            disabled={loading} 
            className="group/refresh flex items-center gap-3 px-4 py-2 rounded-full bg-white text-black hover:bg-slate-200 hover:scale-105 transition-all duration-300 relative z-10 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
          >
            <div className={`flex items-center justify-center w-7 h-7 rounded-full bg-black/10 ${loading ? 'animate-spin' : 'group-hover/refresh:bg-black/20 group-hover/refresh:rotate-180 transition-all duration-500'}`}>
              <RefreshCw size={12} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest pr-2">Actualizar</span>
          </button>
        </div>
      </div>

      {/* ── Days Strip ── */}
      <div className="relative mb-12 group">
        <div 
          ref={stripRef} 
          className="flex gap-4 overflow-x-auto scrollbar-hide py-8 px-4 -my-8 -mx-4 cursor-grab active:cursor-grabbing select-none"
        >
          {days.map(({ key, dayNum, dayName, month, isToday }) => {
            const isSelected = key === selected;
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`flex flex-col items-center min-w-[72px] py-5 rounded-lg border transition-all duration-300 ${
                  isSelected 
                    ? 'bg-white border-white text-black scale-105 shadow-2xl' 
                    : isToday 
                      ? 'bg-accent-green/5 border-accent-green/20 text-accent-green hover:bg-accent-green/10'
                      : 'bg-white/[0.02] border-white/10 text-slate-500 hover:border-white/25 hover:text-white'
                }`}
              >
                <span className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isSelected ? 'opacity-60' : ''}`}>{dayName}</span>
                <span className="text-xl font-black leading-none">{dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Filters & Search ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-16 items-center">
        <div className="lg:col-span-7 relative">
          <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" />
          <input 
            type="text" 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="BUSCAR EQUIPO O LIGA..." 
            className="input-field pl-14 py-4 uppercase font-bold tracking-widest text-xs border-white/10 bg-white/[0.02]" 
          />
        </div>
        <div className="lg:col-span-5 flex gap-4">
          <select 
            value={leagueFilter} 
            onChange={e => setLeagueFilter(e.target.value)} 
            className="input-field flex-1 py-4 font-bold uppercase tracking-widest text-xs cursor-pointer border-white/10 bg-white/[0.02]"
          >
            <option value="all">TODAS LAS LIGAS</option>
            {presentLeagues.map(l => <option key={l?.id} value={l?.id}>{l?.name?.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-8 mb-16 border-b border-white/[0.05] overflow-x-auto scrollbar-hide">
        {[
          { id: 'all', label: 'Dashboard' },
          { id: 'live', label: 'En Vivo', count: liveMatches.length, color: 'text-accent-green' },
          { id: 'upcoming', label: 'Próximos', count: upcomingMatches.length, color: 'text-accent-blue' },
          { id: 'finished', label: 'Finalizados', count: finishedMatches.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group relative pb-5 text-xs font-black uppercase tracking-[0.2em] transition-all ${
              activeTab === tab.id ? (tab.color || 'text-white') : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {tab.count > 0 && <span className="text-[10px] opacity-40 group-hover:opacity-100">[{tab.count}]</span>}
            </span>
            {activeTab === tab.id && (
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${tab.id === 'live' ? 'bg-accent-green' : tab.id === 'upcoming' ? 'bg-accent-blue' : 'bg-white'}`} />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading ? <Loader /> : (
        <div className="space-y-24">
          {activeTab === 'all' ? (
            allMatchesSorted.length > 0 && (
              <Section title="Todos los Partidos" groups={groupAndSortLeagues(allMatchesSorted)} />
            )
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

function Section({ title, groups, accent }) {
  const accentClass = accent === 'green' ? 'text-accent-green' : accent === 'blue' ? 'text-accent-blue' : 'text-slate-500';
  const dotClass = accent === 'green' ? 'bg-accent-green shadow-[0_0_10px_#00ff88]' : accent === 'blue' ? 'bg-accent-blue' : 'bg-slate-700';

  return (
    <div className={`relative ${accent === 'green' ? 'glow-soft-green' : accent === 'blue' ? 'glow-soft-blue' : ''}`}>
      <div className="flex items-center gap-6 mb-10">
        <div className={`w-2 h-2 rounded-full ${dotClass}`} />
        <h2 className={`text-sm font-black uppercase tracking-[0.4em] ${accentClass}`}>{title}</h2>
        <div className="flex-1 h-px bg-white/[0.05]" />
      </div>
      <div className="space-y-16">
        {groups.map(({ league, matches }) => (
          <div key={league?.id} className="animate-in">
            <div className="flex items-center gap-3 mb-6 opacity-60 hover:opacity-100 transition-opacity">
              {league?.logo && <img src={league.logo} alt="" className="w-4 h-4 object-contain grayscale brightness-200" />}
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{league?.name}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {matches.map(f => <MatchCard key={f.fixture?.id} fixture={f} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
