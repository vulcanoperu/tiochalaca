import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import Loader from '../components/Loader';
import { useApp } from '../context/AppContext';
import { saveDbPick } from '../services/backendApi';
import { useMatchData } from '../hooks/analysis/useMatchData';
import { MatchHero } from '../components/analysis/MatchHero';
import { PicksSection } from '../components/analysis/PicksSection';
import { ProDataSection } from '../components/analysis/ProDataSection';

export default function Analysis() {
  const { id: fixtureId } = useParams();
  const navigate = useNavigate();
  const { setPicks: setSavedPicks } = useApp();
  const [pickSaved, setPickSaved] = useState(false);

  const {
    fixture, homeMatches, awayMatches, h2hMatches, injuries,
    loading, loadingAnalysis, error, analysis, picksResult, livePicksResult,
    fetchAll
  } = useMatchData(fixtureId);

  const saveIndividualPick = async (pick) => {
    if (!pick || !fixture) return;
    const entry = {
      fixtureId,
      home: fixture.teams?.home?.name,
      away: fixture.teams?.away?.name,
      date: fixture.fixture?.date,
      league: fixture.league?.name,
      score: fixture.fixture?.status?.short === 'FT' || fixture.fixture?.status?.short === 'LIVE' ? {
        home: fixture.goals?.home,
        away: fixture.goals?.away
      } : null,
      picks: [pick],
      savedAt: new Date().toISOString(),
    };
    
    const res = await saveDbPick(entry);
    if (res.success) {
      entry.id = res.id;
      setSavedPicks(prev => [entry, ...prev]);
      setPickSaved(true);
      setTimeout(() => setPickSaved(false), 2000);
    } else {
      console.error('Error saving pick:', res.error);
    }
  };

  if (loading) return (
    <div className="w-full py-12">
      <Loader text="Obteniendo datos del partido…" />
    </div>
  );

  if (error) return (
    <div className="w-full py-12 text-center">
      <AlertCircle size={40} className="text-accent-red mx-auto mb-3" />
      <p className="text-accent-red font-semibold mb-4">{error}</p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => navigate(-1)} className="btn-ghost border border-surface-600">
          <ArrowLeft size={14} /> Volver
        </button>
        <button onClick={fetchAll} className="btn-primary"><RefreshCw size={14} /> Reintentar</button>
      </div>
    </div>
  );

  const kickoff = fixture?.fixture?.date
    ? new Date(fixture.fixture.date).toLocaleString('es-PE', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
    : '';

  return (
    <div className="w-full space-y-4 animate-fade-in">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2 border border-surface-600">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="section-title">Análisis del Partido</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500 mt-0.5">{fixture?.league?.name} · {kickoff}</p>
            {loadingAnalysis && (
              <span className="flex items-center gap-1 text-[10px] text-accent-green/70 font-semibold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-ping" />
                Calculando…
              </span>
            )}
          </div>
        </div>
      </div>

      <MatchHero fixture={fixture} />

      {!loadingAnalysis && (
        <PicksSection 
          picksResult={picksResult} 
          livePicksResult={livePicksResult} 
          saveIndividualPick={saveIndividualPick} 
        />
      )}

      {!loadingAnalysis && (
        <ProDataSection 
          fixture={fixture}
          homeMatches={homeMatches}
          awayMatches={awayMatches}
          h2hMatches={h2hMatches}
          injuries={injuries}
          analysis={analysis}
        />
      )}

      {pickSaved && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-accent-green text-black font-bold px-6 py-3 rounded-full shadow-[0_0_20px_rgba(0,255,136,0.5)] animate-in slide-in-from-bottom-5 duration-300 z-50">
          ¡Apuesta guardada con éxito!
        </div>
      )}
    </div>
  );
}
