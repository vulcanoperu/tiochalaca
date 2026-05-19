/**
 * StatsPage.jsx — /resultados
 * Resumen público de resultados y efectividad de los picks de Chalaca.
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, Target, TrendingUp, BarChart3, PieChart,
  Calendar, ChevronRight, ShieldCheck, Activity, Zap
} from 'lucide-react';
import Loader from '../components/Loader';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

export default function StatsPage() {
  const [statsData, setStatsData] = useState({ leagues: [], markets: [], summary: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        // Fetch 30-day global stats or all-time stats
        const res = await fetch(`${BACKEND}/api/stats/global`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (json.success && json.data) {
          setStatsData({
            leagues: json.data.leagues || [],
            markets: json.data.markets || [],
            summary: json.data.summary || null
          });
        }
      } catch (e) {
        console.error('Error fetching global stats:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return <div className="py-20"><Loader text="Cargando estadísticas globales..." /></div>;
  }

  const { leagues, markets, summary } = statsData;

  const totalHits = summary?.won || 0;
  const totalMisses = summary?.lost || 0;
  const totalResolved = totalHits + totalMisses;
  const winRate = totalResolved > 0 ? Math.round((totalHits / totalResolved) * 100) : 0;

  return (
    <div className="animate-in space-y-12 pb-20">
      
      {/* ── Header ── */}
      <div className="pt-8">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
          <span className="text-white">Nuestros</span>{' '}
          <span style={{ color: '#BFF102' }}>Resultados</span>
        </h1>
        <p className="text-slate-500 uppercase tracking-widest text-sm font-bold">
          Transparencia total. Auditoría de nuestro motor predictivo.
        </p>
      </div>

      {/* ── Resumen General ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-8 rounded-3xl border border-white/5 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
            <Target size={120} strokeWidth={1} />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Precisión Global</p>
          <h3 className="text-5xl font-black text-accent-green mb-2 font-mono">{winRate}%</h3>
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Aciertos validados</p>
        </div>
        
        <div className="glass-card p-8 rounded-3xl border border-white/5 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
            <Trophy size={120} strokeWidth={1} />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Total Aciertos</p>
          <h3 className="text-5xl font-black text-white mb-2 font-mono">{totalHits}</h3>
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Pronósticos ganados</p>
        </div>

        <div className="glass-card p-8 rounded-3xl border border-white/5 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
            <Activity size={120} strokeWidth={1} />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Picks Analizados</p>
          <h3 className="text-5xl font-black text-slate-300 mb-2 font-mono">{totalResolved}</h3>
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Muestra histórica</p>
        </div>
      </div>

      {/* ── Link a Historial Cronológico ── */}
      <Link to="/resultados/historial" className="block glass-card p-6 rounded-2xl border border-white/5 hover:border-white/15 hover:bg-white/[0.04] transition-all group">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
              <Calendar size={20} className="text-accent-green" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white mb-1">Ver Historial Día por Día</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Revisa cada partido, cada cuota y su resultado real.</p>
            </div>
          </div>
          <ChevronRight size={24} className="text-slate-600 group-hover:text-accent-green group-hover:translate-x-1 transition-all" />
        </div>
      </Link>

      {/* ── Desglose ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Por Tipo de Apuesta */}
        <div className="glass-card p-8 rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Por Tipo de Apuesta</h2>
            <PieChart size={18} className="text-slate-500" />
          </div>
          {markets.length === 0 ? (
            <p className="text-slate-500 text-sm italic">Sin datos suficientes.</p>
          ) : (
            <div className="space-y-6">
              {markets.slice(0, 6).map((m, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">{m.name}</span>
                    <span className="text-xs font-black text-white font-mono">{m.winRate}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-green transition-all duration-1000" style={{ width: `${m.winRate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Por Liga */}
        <div className="glass-card p-8 rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Por Liga Principal</h2>
            <BarChart3 size={18} className="text-slate-500" />
          </div>
          {leagues.length === 0 ? (
            <p className="text-slate-500 text-sm italic">Sin datos suficientes.</p>
          ) : (
            <div className="space-y-6">
              {leagues.slice(0, 6).map((l, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 truncate pr-4">{l.name}</span>
                    <span className="text-xs font-black text-white font-mono">{l.winRate}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-blue transition-all duration-1000" style={{ width: `${l.winRate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <div className="py-12 text-center">
        <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-accent-green/10 border border-accent-green/20 text-accent-green text-[10px] font-black uppercase tracking-widest mb-6">
          <ShieldCheck size={14} /> Sistema Auditado por IA
        </div>
        <p className="text-slate-600 text-[11px] font-bold max-w-xl mx-auto leading-relaxed uppercase tracking-widest">
          Todas las estadísticas mostradas incluyen partidos cerrados (Finalizados). Las apuestas pendientes no alteran estos números hasta concluir.
        </p>
      </div>

    </div>
  );
}
