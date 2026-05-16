import React, { useState, useEffect } from 'react';
import { Zap, RefreshCw, Clock } from 'lucide-react';
import { getAuthHeaders } from '../services/backendApi';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export default function LiveAlertsDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/live-alerts`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setAlerts(data.alerts);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-5 border border-white/10 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2 mb-2">
            <Zap className="text-yellow-400" size={20} />
            Auditoría de Alertas en Vivo
          </h2>
          <p className="text-xs text-slate-400">
            Registro de los pronósticos generados minuto a minuto durante partidos en curso.
          </p>
        </div>
        <button onClick={fetchAlerts} className="btn-ghost text-slate-300">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] uppercase bg-surface-900/50 text-slate-500 tracking-widest">
            <tr>
              <th className="px-5 py-3">Fecha/Hora</th>
              <th className="px-5 py-3">Partido</th>
              <th className="px-5 py-3 text-center">Minuto</th>
              <th className="px-5 py-3 text-center">Marcador</th>
              <th className="px-5 py-3">Pronóstico (Alerta)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {alerts.map((a, i) => (
              <tr key={a.id || i} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-400">
                  {new Date(a.created_at).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                </td>
                <td className="px-5 py-3">
                  <p className="font-bold text-white text-xs">{a.home_team} vs {a.away_team}</p>
                  <p className="text-[10px] text-slate-500">{a.league}</p>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className="text-xs font-numbers text-accent-red font-bold flex items-center justify-center gap-1">
                    <Clock size={12} /> {a.minute}'
                  </span>
                </td>
                <td className="px-5 py-3 text-center font-numbers text-white font-bold">
                  {a.score}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider text-yellow-400 border-yellow-400/30 bg-yellow-400/5">
                      {a.market}
                    </span>
                    <span className="text-xs font-bold text-white">{a.selection}</span>
                  </div>
                </td>
              </tr>
            ))}
            {alerts.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-5 py-8 text-center text-slate-500">
                  No hay alertas registradas aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
