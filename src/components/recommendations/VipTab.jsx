import { TrendingUp, AlertCircle, ChevronRight, Target, Shield, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function VipTab({ valueBets, savedValueBets }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
            <TrendingUp size={16} className="text-accent-green" />
          </div>
          <h2 className="text-base font-black text-white uppercase tracking-widest drop-shadow-md">Apuestas VIP (Cuotas Despistadas)</h2>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {valueBets.length > 0 ? valueBets.map((pick, i) => {
          const saved = savedValueBets.find(
            s => String(s.fixture_id) === String(pick.match?.fixture?.id) && s.selection === pick.selection
          );
          const detectedAt = saved?.detected_at
            ? new Date(saved.detected_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })
            : null;
          return (
            <div key={i} className="group relative bg-surface-800 rounded-xl border border-white/5 border-l-4 border-l-accent-green p-5 hover:bg-surface-800/80 transition-all duration-300 overflow-hidden hover:shadow-[0_0_20px_rgba(191,241,2,0.05)] flex flex-col justify-between">
              <div className="absolute -right-6 -top-6 text-accent-green/5 group-hover:text-accent-green/10 transition-colors transform rotate-12 pointer-events-none">
                <TrendingUp size={100} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                    <span className="text-[9px] font-black text-accent-green uppercase tracking-widest">Cuota Despistada</span>
                  </div>
                  <span className="text-[11px] font-black text-surface-900 bg-accent-green px-2 py-0.5 rounded-md shadow-sm">Cuota {pick.odds || '1.80'}</span>
                </div>

                {detectedAt && (
                  <div className="flex items-center gap-1.5 mb-3 relative z-10">
                    <Clock size={10} className="text-slate-500" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      Detectada hoy a las {detectedAt}
                    </span>
                  </div>
                )}

                <div className="relative z-10 mb-4">
                  <h4 className="text-[11px] font-bold text-slate-400 mb-1 leading-tight">{pick.match?.teams?.home?.name} vs {pick.match?.teams?.away?.name}</h4>
                  <p className="text-lg font-black text-white mb-3">{pick.selection}</p>
                  <div className="p-3 bg-surface-900/50 rounded-lg text-[10px] text-slate-400 italic leading-relaxed border border-white/5 border-l-2 border-l-slate-600">
                    "{pick.argument ? pick.argument.substring(0, 100) : ''}..."
                  </div>
                </div>
              </div>

              <div className="relative z-10 mt-auto">
                <button
                  onClick={() => navigate(`/analysis/${pick.match?.fixture?.id || ''}`)}
                  className="w-full text-[10px] font-black text-white hover:text-surface-900 bg-surface-700 hover:bg-accent-green py-2.5 rounded-lg uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300"
                >
                  VER ANÁLISIS DETALLADO <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          );
        }) : (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 py-16 text-center bg-surface-800/50 rounded-2xl border border-dashed border-white/10">
            <AlertCircle size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Sin apuestas VIP disponibles</p>
            <p className="text-slate-500 text-xs mt-2">No se han detectado cuotas con valor extraordinario en el mercado actual.</p>

            {savedValueBets.length > 0 && (
              <div className="mt-8 text-left space-y-3 px-4 max-w-lg mx-auto">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest text-center mb-4">— Detectadas antes (cuota ya ajustada por el mercado) —</p>
                {savedValueBets.map((s, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2 p-3 bg-surface-900/30 rounded-lg border border-white/5 hover:bg-surface-800 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 truncate">{s.home_team} vs {s.away_team}</p>
                      <p className="text-sm font-black text-white mt-0.5">{s.selection}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[11px] font-black text-accent-green bg-accent-green/10 px-2 py-0.5 rounded">{s.odds_at_detection ? `@${parseFloat(s.odds_at_detection).toFixed(2)}` : ''}</p>
                      <div className="flex items-center justify-end gap-1 mt-1.5">
                        <Clock size={10} className="text-slate-500" />
                        <p className="text-[9px] font-bold text-slate-500">{new Date(s.detected_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tips Adicionales Premium */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-green/10 to-transparent border border-accent-green/20 p-6 mt-8">
        <div className="absolute -right-4 -bottom-4 text-accent-green/10 pointer-events-none">
          <Shield size={80} />
        </div>
        <div className="relative z-10 flex items-start gap-4">
          <div className="mt-1">
            <Target size={24} className="text-accent-green" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1">¿Qué son las Apuestas VIP?</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Son oportunidades donde nuestro algoritmo detecta que la casa de apuestas ha cometido un error y la cuota pagada es significativamente mayor a la probabilidad real del evento. Son volátiles y pueden desaparecer rápido.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
