import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Filter, Search, AlertCircle, Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import MatchCard from '../components/MatchCard';
import Loader from '../components/Loader';
import { TOP_LEAGUES } from '../services/footballApi';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' en zona local */
function localDay(d = new Date()) {
  return d.toLocaleDateString('en-CA');
}

/** Genera N días alrededor de hoy */
function buildDayStrip(centerDate, past = 3, future = 7) {
  const days = [];
  for (let i = -past; i <= future; i++) {
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
  return days;
}

const LIVE_STATUSES = ['1H', '2H', 'ET', 'HT', 'P'];

// IDs que ESPN usa para Liga 1 Perú
const PERU_LIGA1_IDS = new Set(['per.1', 'per-1', '281', '670', 'peruvian-primera-division']);

function isPeruLeague(league) {
  if (!league) return false;
  const idStr = String(league.id).toLowerCase();
  const nameStr = String(league.name).toLowerCase();
  return PERU_LIGA1_IDS.has(idStr) || nameStr.includes('peru') || nameStr.includes('perú');
}

/** Agrupa un array de partidos por liga y ordena priorizando Perú */
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const today = localDay();
  const [days]       = useState(() => buildDayStrip(new Date(), 3, 10));
  const [selected, setSelected]   = useState(today);
  const [fixtures, setFixtures]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [activeTab, setActiveTab]       = useState('all');
  const [lastUpdated, setLastUpdated]   = useState(null);
  const stripRef = useRef(null);

  /* ── Fetch COMPLETO del día (carga inicial y manual) ── */
  const fetchDay = useCallback(async (dateKey, isAutoRefresh = false) => {
    if (!isAutoRefresh) {
      setLoading(true);
      setFixtures([]);
    }
    setError(null);
    try {
      const res = await fetch(`http://localhost:3001/api/fixtures/date/${dateKey}`);
      if (!res.ok) throw new Error('Error al consultar el servidor');
      const json = await res.json();
      setFixtures(json.data || []);
      setLastUpdated(new Date());
    } catch (e) {
      if (!isAutoRefresh) {
        setError(e.message || 'No se pudo conectar con el backend.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Fetch RÁPIDO solo de partidos en vivo (sin caché, 30s) ── */
  const mergeLiveScores = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3001/api/fixtures/live');
      if (!res.ok) return;
      const json = await res.json();
      const liveData = json.data || [];
      if (liveData.length === 0) return;

      // Crear mapa de ID → datos en vivo actualizados
      const liveMap = new Map();
      liveData.forEach(f => liveMap.set(String(f.fixture?.id), f));

      setFixtures(prev => {
        if (prev.length === 0) return prev;
        let changed = false;
        const updated = prev.map(f => {
          const live = liveMap.get(String(f.fixture?.id));
          if (live) {
            changed = true;
            // Fusionar: mantener datos originales pero actualizar score, status y minuto
            return {
              ...f,
              fixture: { ...f.fixture, status: live.fixture.status },
              goals: live.goals,
            };
          }
          return f;
        });

        // Agregar partidos en vivo que no estaban en la lista original
        // (pueden ser partidos que empezaron después de la carga inicial)
        liveData.forEach(lf => {
          const exists = updated.some(u => String(u.fixture?.id) === String(lf.fixture?.id));
          if (!exists) {
            updated.push(lf);
            changed = true;
          }
        });

        if (changed) return updated;
        return prev;
      });
      setLastUpdated(new Date());
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { fetchDay(selected); }, [selected, fetchDay]);

  /* ── Auto-refresh RÁPIDO cada 30s: solo merge de datos en vivo ── */
  useEffect(() => {
    if (selected !== today) return;
    const id = setInterval(mergeLiveScores, 30_000);
    return () => clearInterval(id);
  }, [selected, today, mergeLiveScores]);

  /* ── Re-fetch COMPLETO cada 3 min para captar nuevos partidos ── */
  useEffect(() => {
    if (selected !== today) return;
    const id = setInterval(() => fetchDay(selected, true), 180_000);
    return () => clearInterval(id);
  }, [selected, today, fetchDay]);

  /* ── Auto-scroll al día de hoy al montar ── */
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-today="true"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, []);

  /* ── Filtros locales ── */
  const filtered = fixtures.filter(f => {
    const matchesLeague = leagueFilter === 'all'
      ? true
      : String(f.league?.id) === String(leagueFilter);
    const matchesSearch = !search
      ? true
      : [f.teams?.home?.name, f.teams?.away?.name, f.league?.name]
          .some(s => s?.toLowerCase().includes(search.toLowerCase()));
    return matchesLeague && matchesSearch;
  });

  /* ── Separar por estado y agrupar por liga ── */
  const liveMatches = filtered.filter(f => LIVE_STATUSES.includes(f.fixture?.status?.short));
  const finishedMatches = filtered.filter(f => FINISHED_STATUSES.includes(f.fixture?.status?.short));
  const upcomingMatches = filtered.filter(f => !LIVE_STATUSES.includes(f.fixture?.status?.short) && !FINISHED_STATUSES.includes(f.fixture?.status?.short));

  // Ordenar "Por jugar" para que salgan primero los más prontos
  upcomingMatches.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
  // Ordenar "Finalizados" para que salgan primero los más recientes
  finishedMatches.sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));

  const liveGroups = groupAndSortLeagues(liveMatches);
  const upcomingGroups = groupAndSortLeagues(upcomingMatches);
  const finishedGroups = groupAndSortLeagues(finishedMatches);

  const presentLeagues = [...new Map(fixtures.map(f => [f.league?.id, f.league])).values()];
  const liveCount = filtered.filter(f => LIVE_STATUSES.includes(f.fixture?.status?.short)).length;

  /* ── Label del día seleccionado ── */
  const selectedLabel = new Date(selected + 'T12:00:00').toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  /* ── Scroll strip ── */
  const scrollStrip = (dir) => {
    if (stripRef.current) stripRef.current.scrollBy({ left: dir * 200, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="section-title mb-0.5">Partidos</p>
            <h1 className="text-xl font-bold text-white capitalize">{selectedLabel}</h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {liveCount > 0 && (
                <span className="badge-red flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" />
                  {liveCount} en vivo
                </span>
              )}
              <span className="text-xs text-slate-500">{filtered.length} partidos</span>
              {lastUpdated && (
                <span className="text-xs text-slate-600">
                  · {lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  {selected === today && ' · Auto-refresh 30s'}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => fetchDay(selected)} disabled={loading}
            className="btn-ghost border border-surface-600 text-slate-300 shrink-0">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Strip horizontal de días ── */}
      <div className="relative mb-5">
        {/* Botón izq */}
        <button onClick={() => scrollStrip(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center
                     bg-surface-800 border border-surface-600 text-slate-400 hover:text-white transition-colors shadow-lg">
          <ChevronLeft size={14} />
        </button>

        {/* Strip */}
        <div ref={stripRef}
          className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-9 py-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {days.map(({ key, dayNum, dayName, month, isToday }) => {
            const isSelected = key === selected;
            return (
              <button
                key={key}
                data-today={isToday}
                onClick={() => { setSelected(key); setLeagueFilter('all'); setSearch(''); }}
                className={`
                  flex flex-col items-center shrink-0 w-14 py-2 rounded-xl border transition-all duration-200 select-none
                  ${isSelected
                    ? 'text-surface-900 border-transparent'
                    : isToday
                    ? 'text-accent-green border-accent-green/30 bg-accent-green/5 hover:bg-accent-green/10'
                    : 'text-slate-400 border-surface-600 hover:border-slate-500 hover:text-slate-200 hover:bg-white/4'}
                `}
                style={isSelected ? {
                  background: 'linear-gradient(145deg,#00ff88,#00cc6a)',
                  boxShadow: '0 0 16px rgba(0,255,136,0.35)',
                } : {}}
              >
                <span className={`text-[10px] font-semibold uppercase leading-none ${isSelected ? 'text-surface-900/70' : 'text-slate-600'}`}>
                  {dayName}
                </span>
                <span className={`text-xl font-black leading-tight ${isSelected ? 'text-surface-900' : ''}`}>
                  {dayNum}
                </span>
                <span className={`text-[9px] leading-none ${isSelected ? 'text-surface-900/60' : 'text-slate-700'}`}>
                  {month}
                </span>
              </button>
            );
          })}
        </div>

        {/* Botón der */}
        <button onClick={() => scrollStrip(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center
                     bg-surface-800 border border-surface-600 text-slate-400 hover:text-white transition-colors shadow-lg">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Filtros y Tabs ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar equipo o liga…" className="input-field pl-9" id="search-match" />
        </div>
        <div className="relative">
          <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select value={leagueFilter} onChange={e => setLeagueFilter(e.target.value)}
            className="input-field pl-9 pr-8 appearance-none min-w-[180px] cursor-pointer" id="league-filter">
            <option value="all">Todas las ligas ({fixtures.length})</option>
            {presentLeagues.map(l => (
              <option key={l?.id} value={l?.id}>{l?.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide pb-1">
        {[
          { id: 'all', label: 'Todos' },
          { id: 'live', label: `En Vivo (${liveMatches.length})`, isLive: true },
          { id: 'upcoming', label: `Por Jugar (${upcomingMatches.length})` },
          { id: 'finished', label: `Finalizados (${finishedMatches.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-accent-green text-surface-900 shadow-[0_0_12px_rgba(0,255,136,0.4)]'
                : 'bg-surface-800 text-slate-400 hover:text-white border border-surface-600 hover:border-slate-500'
            }`}
          >
            {tab.isLive && liveMatches.length > 0 && (
              <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse mr-1.5 ${activeTab === tab.id ? 'bg-surface-900' : 'bg-accent-red'}`} />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Estados ── */}
      {loading && <Loader text={`Consultando partidos del ${selected}…`} />}

      {!loading && error && (
        <div className="glass-card p-5 text-center" style={{ borderColor: 'rgba(255,71,87,0.15)' }}>
          <AlertCircle size={28} className="text-accent-red mx-auto mb-2" />
          <p className="text-accent-red text-sm font-semibold mb-3">{error}</p>
          <button onClick={() => fetchDay(selected)} className="btn-primary mx-auto text-xs">
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-20">
          <Trophy size={40} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-semibold">Sin partidos para este día</p>
          <p className="text-slate-600 text-sm mt-1">Prueba con otro día o liga</p>
        </div>
      )}

      {/* ── Secciones separadas ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-10 animate-fade-in mt-4">
          
          {(activeTab === 'all' || activeTab === 'live') && liveGroups.length > 0 && (
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-white">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-red animate-pulse" />
                En Vivo
              </h2>
              <div className="space-y-6">
                {liveGroups.map(({ league, matches }) => (
                  <LeagueGroup key={league?.id} league={league} matches={matches} />
                ))}
              </div>
            </div>
          )}

          {(activeTab === 'all' || activeTab === 'upcoming') && upcomingGroups.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-4 text-white">Por Jugar</h2>
              <div className="space-y-6">
                {upcomingGroups.map(({ league, matches }) => (
                  <LeagueGroup key={league?.id} league={league} matches={matches} />
                ))}
              </div>
            </div>
          )}

          {(activeTab === 'all' || activeTab === 'finished') && finishedGroups.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-4 text-slate-400">Finalizados</h2>
              <div className="space-y-6">
                {finishedGroups.map(({ league, matches }) => (
                  <LeagueGroup key={league?.id} league={league} matches={matches} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LeagueGroup({ league, matches }) {
  return (
    <div>
      {/* Cabecera liga */}
      <div className="flex items-center gap-2 mb-3">
        {league?.logo && (
          <img src={league.logo} alt={league.name} className="w-5 h-5 object-contain opacity-90" />
        )}
        <span className="text-xs font-bold text-slate-200">{league?.name}</span>
        {league?.country && <span className="text-[10px] text-slate-600">· {league.country}</span>}
        <div className="flex-1 h-px bg-surface-700 ml-1" />
        <span className="text-[10px] text-slate-600 shrink-0">
          {matches.length} {matches.length === 1 ? 'partido' : 'partidos'}
        </span>
      </div>
      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {matches.map(f => (
          <MatchCard key={f.fixture?.id} fixture={f} />
        ))}
      </div>
    </div>
  );
}

