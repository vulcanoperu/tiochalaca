import React from 'react';
import { Zap, Globe, MessageCircle, Mail, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative mt-40 pt-24 pb-12 px-6 text-center animate-in">
      {/* Delimitador Superior */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="max-w-screen-lg mx-auto flex flex-col items-center">
        
        {/* ── Brand & Description ── */}
        <div className="flex flex-col items-center gap-6 mb-12">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/[0.08] to-transparent border border-white/10 flex items-center justify-center text-accent-green shadow-[0_0_30px_rgba(0,255,136,0.05)]">
            <Zap size={20} strokeWidth={2.5} />
          </div>
          
          <div className="flex flex-col gap-6 w-full md:w-[40%]">
            <h2 className="text-xl font-black tracking-tighter text-white uppercase">Chalaca</h2>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
              Chalaca es tu aliado estratégico en el mundo del fútbol. Analizamos miles de variables estadísticas, desde el xG hasta el historial histórico, para entregarte información procesada y picks de alto valor. Deja de jugar al azar y empieza a tomar decisiones basadas en datos reales para maximizar tus resultados jornada tras jornada.
            </p>
            
            {/* Responsible Gambling Badge & Advice */}
            <div className="pt-4 flex flex-col items-center gap-3">
              <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                <ShieldAlert size={14} strokeWidth={2.5} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Juego Responsable +18</span>
              </div>
              <p className="text-[10px] text-slate-600 max-w-sm mx-auto leading-relaxed italic">
                El juego debe ser una forma de entretenimiento, no una necesidad. Evita caer en la ludopatía: nunca apuestes dinero destinado a tus necesidades básicas ni intentes recuperar pérdidas.
              </p>
            </div>
          </div>
        </div>

        {/* ── Main Navigation Menu (Synced with Navbar) ── */}
        <nav className="flex flex-wrap justify-center gap-x-12 gap-y-4 mb-14">
          <Link to="/" className="text-[13px] font-bold text-slate-400 hover:text-white transition-colors">Mejores Picks</Link>
          <Link to="/partidos" className="text-[13px] font-bold text-slate-400 hover:text-white transition-colors">Partidos</Link>
          <Link to="/resultados" className="text-[13px] font-bold text-slate-400 hover:text-white transition-colors">Resultados</Link>
          <Link to="/mis-apuestas" className="text-[13px] font-bold text-slate-400 hover:text-white transition-colors">Mis Apuestas</Link>
        </nav>

        {/* ── Social Contact ── */}
        <div className="flex justify-center gap-8 mb-16 opacity-50 hover:opacity-100 transition-opacity">
          <button className="text-slate-400 hover:text-accent-green transition-all"><Globe size={18} /></button>
          <button className="text-slate-400 hover:text-accent-green transition-all"><MessageCircle size={18} /></button>
          <button className="text-slate-400 hover:text-accent-green transition-all"><Mail size={18} /></button>
        </div>

        {/* ── Footer Bottom Area ── */}
        <div className="w-full pt-10 border-t border-white/[0.03] space-y-6">
          
          {/* Small Legal Links */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] font-bold text-slate-700 uppercase tracking-widest">
            <Link to="#" className="hover:text-slate-400 transition-colors">Privacidad</Link>
            <Link to="#" className="hover:text-slate-400 transition-colors">Términos y Condiciones</Link>
          </div>

          {/* Copyright */}
          <p className="text-[11px] font-bold tracking-widest uppercase">
            © {currentYear} Chalaca Analytics. Todos los derechos reservados.
          </p>
        </div>

      </div>
    </footer>
  );
}
