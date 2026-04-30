import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Activity, AlertCircle } from 'lucide-react';
import MatchCard from '../components/MatchCard';
import Loader from '../components/Loader';

const PERU_LIGA1_IDS = new Set(['per.1', 'per-1', '281', '670', 'peruvian-primera-division']);

function isPeruLeague(league) {
  if (!league) return false;
  const idStr = String(league.id).toLowerCase();
  const nameStr = String(league.name).toLowerCase();
  return PERU_LIGA1_IDS.has(idStr) || nameStr.includes('peru') || nameStr.includes('perú');
}

function sortLeagues(groups) {
  return [...groups].sort((a, b) => {
    const aP = isPeruLeague(a.league) ? 1 : 0;
    const bP = isPeruLeague(b.league) ? 1 : 0;
    return bP - aP;
  });
}

export default function LivePage() {
  const [fixtures, setFixtures]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const isFirstLoad = useRef(true);
  const fetchLive = useCallback(async () => {
    // Solo mostrar loader en la primera carga
    if (isFirstLoad.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:3001/api/fixtures/live');
      if (!res.ok) throw new Error('Error al obtener partidos en vivo');
      const json = await res.json();
      // Filtrar solo partidos realmente en vivo (no finalizados)
      const liveOnly = (json.data || []).filter(f => {
        const st = f.fixture?.status?.short;
        return ['1H', '2H', 'HT', 'ET', 'P'].includes(st);
      });
      setFixtures(liveOnly);
      setLastUpdated(new Date());
    } catch (e) {
      if (isFirstLoad.current) setError(e.message || 'Error al obtener partidos en vivo.');
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  }, []);

  useEffect(() => { fetchLive(); }, [fetchLive]);

  // Auto-refresh cada 20s para datos en vivo casi en tiempo real
  useEffect(() => {
    const id = setInterval(fetchLive, 20_000);
    return () => clearInterval(id);
  }, [fetchLive]);

  // Agrupar por liga y poner Perú primero
  const byLeague = fixtures.reduce((acc, f) => {
    const lid = f.league?.id;
    if (!acc[lid]) acc[lid] = { league: f.league, matches: [] };
    acc[lid].matches.push(f);
    return acc;
  }, {});
  const leagueGroups = sortLeagues(Object.values(byLeague));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="section-title mb-1">En Vivo</p>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-red animate-pulse" />
            En Vivo Ahora
          </h1>
          {lastUpdated && (
            <p className="text-xs text-slate-600 mt-1">
              Actualizado {lastUpdated.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
              {' '}· Auto-refresh 20s
            </p>
          )}
        </div>
        <button onClick={fetchLive} disabled={loading}
          className="btn-ghost border border-surface-600 text-slate-300">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {loading && <Loader text="Consultando partidos en vivo…" />}

      {!loading && error && (
        <div className="glass-card p-5 text-center" style={{ borderColor: 'rgba(255,71,87,0.15)' }}>
          <AlertCircle size={28} className="text-accent-red mx-auto mb-2" />
          <p className="text-accent-red text-sm font-semibold mb-3">{error}</p>
          <button onClick={fetchLive} className="btn-primary mx-auto text-xs">
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      )}

      {!loading && !error && fixtures.length === 0 && (
        <div className="text-center py-24">
          <Activity size={52} className="text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold text-lg">No hay partidos en vivo</p>
          <p className="text-slate-600 text-sm mt-2">
            Esta pantalla se actualiza automáticamente cada 30 segundos
          </p>
        </div>
      )}

      {!loading && fixtures.length > 0 && (
        <div className="space-y-6">
          {/* Badge conteo */}
          <div className="flex items-center gap-2">
            <span className="badge-red flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" />
              {fixtures.length} en vivo
            </span>
          </div>

          {/* Grupos por liga */}
          {leagueGroups.map(({ league, matches }) => (
            <div key={league?.id}>
              {/* Cabecera liga */}
              <div className="flex items-center gap-2 mb-3">
                {league?.logo && (
                  <img src={league.logo} alt={league.name} className="w-5 h-5 object-contain opacity-90" />
                )}
                <span className="text-xs font-semibold text-slate-300">{league?.name}</span>
                {league?.country && <span className="text-[10px] text-slate-600">· {league.country}</span>}
                <div className="flex-1 h-px bg-surface-700 ml-1" />
                <span className="text-[10px] text-slate-600 shrink-0">
                  {matches.length} {matches.length === 1 ? 'partido' : 'partidos'}
                </span>
              </div>
              {/* Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {matches.map(f => <MatchCard key={f.fixture?.id} fixture={f} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
