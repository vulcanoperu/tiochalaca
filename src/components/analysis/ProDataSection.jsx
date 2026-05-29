import { useState } from 'react';
import { BarChart2, Target, Users, Shield, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { FormPills, GoalTimeline, H2HTable } from '../AnalysisComponents';

const SECTION = ({ icon: Icon, title, children, id }) => (
  <section id={id} className="glass-card p-5 animate-slide-up">
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.2)' }}>
        <Icon size={14} className="text-accent-green" />
      </div>
      <h2 className="text-sm font-bold text-white">{title}</h2>
    </div>
    {children}
  </section>
);

export function ProDataSection({ fixture, homeMatches, awayMatches, h2hMatches, injuries, analysis }) {
  const [showPro, setShowPro] = useState(false);

  const { homeForm, awayForm, homeSplit, awaySplit } = analysis || {};
  const homeId = fixture?.teams?.home?.id;
  const awayId = fixture?.teams?.away?.id;

  return (
    <>
      <button
        onClick={() => setShowPro(!showPro)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300 group"
      >
        <BarChart2 size={16} className="text-slate-500 group-hover:text-accent-green transition-colors" />
        <span className="text-sm font-bold text-slate-400 group-hover:text-white transition-colors">
          {showPro ? 'Ocultar Datos Profesionales' : 'Ver Datos Profesionales'}
        </span>
        {showPro ? (
          <ChevronUp size={16} className="text-slate-500 group-hover:text-white transition-colors" />
        ) : (
          <ChevronDown size={16} className="text-slate-500 group-hover:text-white transition-colors" />
        )}
      </button>

      {showPro && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-3 duration-400 mt-4">
          
          <div className="text-center py-2 px-4 rounded-lg bg-black/40 border border-white/5 mb-4">
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              Fuentes de datos activas: <span className="text-slate-300">ESPN Analytics</span> (Estadísticas, Eventos) y <span className="text-slate-300">BSD Consensus</span> (Cuotas).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { team: fixture?.teams?.home, form: homeForm, matches: homeMatches, split: homeSplit, teamId: homeId },
              { team: fixture?.teams?.away, form: awayForm, matches: awayMatches, split: awaySplit, teamId: awayId },
            ].map(({ team, form, matches, split, teamId }) => (
              <SECTION key={`form-${teamId}`} icon={BarChart2} title={`Forma · ${team?.name}`} id={`form-${teamId}`}>
                <div className="space-y-3">
                  <div className="mb-4">
                    <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">Últimos {Math.min(matches?.length ?? 0, 12)} partidos</p>
                    <FormPills matches={matches} teamId={teamId} />
                  </div>
                </div>
              </SECTION>
            ))}
          </div>

          {(homeSplit || awaySplit) && (
            <SECTION icon={Target} title="Mercado de Goles (Tendencia)" id="goals-market">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: fixture?.teams?.home?.name, split: homeSplit, form: homeForm },
                  { label: fixture?.teams?.away?.name, split: awaySplit, form: awayForm },
                ].map(({ label, split, form }) => split && (
                  <div key={`goals-${label}`} className="p-4 border border-white/5 bg-black/20 rounded-xl">
                    <p className="text-sm font-bold text-white mb-3 text-center">{label}</p>
                    
                    <div className="flex justify-between items-center bg-white/5 p-2 rounded mb-2">
                      <span className="text-xs text-slate-400">Promedio Goles / Partido</span>
                      <span className="text-sm font-bold text-accent-green">
                        {form?.total > 0 ? ((form.goalsFor + form.goalsAgainst) / form.total).toFixed(1) : '-'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-white/5 p-2 rounded mb-3">
                      <span className="text-xs text-slate-400">Ambos Anotan (BTTS)</span>
                      <span className="text-sm font-bold" style={{ color: (split.bttsPct >= 60) ? '#00ff88' : '#f59e0b' }}>
                        {split.bttsPct ?? 0}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col items-center bg-white/5 p-2 rounded">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">+1.5 Goles</span>
                        <span className="text-base font-bold text-white">{split.over15Pct ?? 0}%</span>
                      </div>
                      <div className="flex flex-col items-center bg-white/5 p-2 rounded">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">+2.5 Goles</span>
                        <span className="text-base font-bold" style={{ color: (split.over25Pct >= 60) ? '#00ff88' : '#f59e0b' }}>
                          {split.over25Pct ?? 0}%
                        </span>
                      </div>
                      <div className="flex flex-col items-center bg-white/5 p-2 rounded">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">+3.5 Goles</span>
                        <span className="text-base font-bold text-slate-300">{split.over35Pct ?? 0}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SECTION>
          )}

          <SECTION icon={Users} title="H2H · Historial" id="h2h">
            <H2HTable matches={h2hMatches} homeId={homeId} awayId={awayId} />
          </SECTION>

          {(analysis?.homeCardsAnalysis || analysis?.awayCardsAnalysis) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: fixture?.teams?.home?.name, cards: analysis.homeCardsAnalysis },
                { label: fixture?.teams?.away?.name, cards: analysis.awayCardsAnalysis },
              ].map(({ label, cards }) => cards && (
                <SECTION key={`cards-${label}`} icon={Shield} title={`Tarjetas · ${label}`} id={`cards-${label}`}>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded mb-1">
                    <span className="text-xs text-slate-400">Media por partido</span>
                    <span className="text-sm font-bold text-amber-500">{cards?.avg}</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded">
                    <span className="text-xs text-slate-400">Partidos con +3 tarjetas</span>
                    <span className="text-sm font-bold text-red-400">{cards?.over3 ?? '-'}</span>
                  </div>
                </SECTION>
              ))}
            </div>
          )}

          {(analysis?.homeCornersAnalysis || analysis?.awayCornersAnalysis) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: fixture?.teams?.home?.name, corners: analysis.homeCornersAnalysis },
                { label: fixture?.teams?.away?.name, corners: analysis.awayCornersAnalysis },
              ].map(({ label, corners }) => corners && (
                <SECTION key={`corners-${label}`} icon={Target} title={`Córners a favor · ${label}`} id={`corners-${label}`}>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded mb-1">
                    <span className="text-xs text-slate-400">Media por partido</span>
                    <span className="text-sm font-bold text-accent-green">{corners?.avg}</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded">
                    <span className="text-xs text-slate-400">Partidos con +4 córners</span>
                    <span className="text-sm font-bold text-white">{corners?.over4 ?? '-'}</span>
                  </div>
                </SECTION>
              ))}
            </div>
          )}

          {(analysis?.homeSlots?.some(s => s.goals > 0) || analysis?.awaySlots?.some(s => s.goals > 0)) && (
            <SECTION icon={Clock} title="Goles por tiempo" id="goals-time">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <GoalTimeline slots={analysis.homeSlots} teamName={fixture?.teams?.home?.name} />
                <GoalTimeline slots={analysis.awaySlots} teamName={fixture?.teams?.away?.name} />
              </div>
            </SECTION>
          )}

          {injuries?.length > 0 && (
            <SECTION icon={Shield} title="🚑 Lesiones y bajas" id="injuries">
              <div className="grid grid-cols-1 gap-2">
                {injuries.slice(0, 10).map((inj, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      {inj.player?.photo && (
                        <img src={inj.player.photo} alt="" className="w-6 h-6 rounded-full object-cover" />
                      )}
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{inj.player?.name}</p>
                        <p className="text-[10px] text-slate-600">{inj.team?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="badge-red text-[9px]">{inj.player?.reason || '–'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SECTION>
          )}

        </div>
      )}
    </>
  );
}
