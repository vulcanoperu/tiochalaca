import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, Radio, BookMarked, Settings, LogOut,
  Zap, Shield, ChevronDown, Crown
} from 'lucide-react';

// ── Menú Principal ──────────────────────────────────────────────────────────
const MAIN_NAV = [
  { to: '/',      icon: Home,       label: 'Partidos'  },
  { to: '/live',  icon: Radio,      label: 'En Vivo'   },
  { to: '/picks', icon: BookMarked, label: 'Mis Picks' },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const user = JSON.parse(sessionStorage.getItem('chalaca_user') || '{}');

  const handleLogout = async () => {
    const { logoutUser } = await import('../services/backendApi');
    await logoutUser();
    window.location.href = '/';
  };

  // Cerrar menú al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cerrar menú al cambiar de ruta
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const roleLabel = user.role === 'admin' ? 'Admin' : user.role === 'vip' ? 'VIP' : null;
  const roleBadgeStyle = user.role === 'admin'
    ? { bg: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
    : { bg: 'rgba(250,204,21,0.15)', color: '#fbbf24', border: '1px solid rgba(250,204,21,0.25)' };

  return (
    <header
      className="sticky top-0 z-50 border-b border-surface-600"
      style={{
        background: 'linear-gradient(180deg,rgba(8,13,18,0.98) 0%,rgba(13,21,32,0.95) 100%)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between gap-4">

        {/* ── Brand ── */}
        <Link to="/" className="flex items-center gap-2.5 select-none shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg,#00ff88,#00cc6a)',
              boxShadow: '0 0 16px rgba(0,255,136,0.4)',
            }}
          >
            <Zap size={16} strokeWidth={2.5} className="text-surface-900" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none tracking-tight">TioChalaca</p>
            <p className="text-[10px] text-slate-500 leading-none mt-0.5">AI Football Analysis</p>
          </div>
        </Link>

        {/* ── Menú Principal — Desktop ── */}
        <nav className="hidden md:flex items-center gap-1">
          {MAIN_NAV.map(({ to, icon: Icon, label }) => {
            const active = pathname === to || (to === '/live' && pathname.startsWith('/live'));
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'text-accent-green'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
                style={active ? {
                  background: 'rgba(0,255,136,0.10)',
                  boxShadow: 'inset 0 0 0 1px rgba(0,255,136,0.18)',
                } : {}}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* ── Derecha: Avatar + Submenú desplegable ── */}
        <div className="flex items-center gap-3 shrink-0">

          {/* Avatar / Botón del submenú */}
          <div className="relative" ref={menuRef}>
            <button
              id="user-menu-btn"
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all duration-200 select-none"
              style={{
                background: menuOpen ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {/* Avatar círculo */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                  user.role === 'admin' ? 'text-purple-300' : 'text-accent-green'
                }`}
                style={{
                  background: user.role === 'admin'
                    ? 'rgba(139,92,246,0.25)'
                    : 'rgba(0,255,136,0.15)',
                }}
              >
                {user.role === 'admin' ? <Shield size={12} /> : (user.username?.[0]?.toUpperCase() || '?')}
              </div>

              {/* Nombre — solo desktop */}
              <span className="hidden sm:block text-xs text-slate-300 font-medium max-w-[100px] truncate">
                {user.username || 'Usuario'}
              </span>

              {/* Badge de rol */}
              {roleLabel && (
                <span
                  className="hidden sm:block text-[9px] font-black uppercase px-1.5 py-0.5 rounded"
                  style={{ background: roleBadgeStyle.bg, color: roleBadgeStyle.color, border: roleBadgeStyle.border }}
                >
                  {user.role === 'admin' ? <span className="flex items-center gap-0.5"><Shield size={8} /> Admin</span> : <span className="flex items-center gap-0.5"><Crown size={8} /> VIP</span>}
                </span>
              )}

              <ChevronDown
                size={13}
                className={`text-slate-500 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* ── Submenú Desplegable ── */}
            {menuOpen && (
              <div
                id="user-submenu"
                className="absolute right-0 top-[calc(100%+8px)] w-52 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
                style={{
                  background: 'rgba(13,21,32,0.98)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
                  backdropFilter: 'blur(24px)',
                }}
              >
                {/* Cabecera del menú */}
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-xs font-bold text-white truncate">{user.username}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {user.role === 'admin' ? '👑 Administrador'
                      : user.role === 'vip' ? '⭐ Suscriptor VIP'
                      : '⏳ Cuenta Pendiente'}
                  </p>
                </div>

                {/* Opciones */}
                <div className="p-1.5 space-y-0.5">

                  {/* Admin — solo para admins */}
                  {user.role === 'admin' && (
                    <Link
                      to="/admin"
                      className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/15">
                        <Shield size={13} className="text-purple-400" />
                      </div>
                      <span>Panel Admin</span>
                    </Link>
                  )}

                  {/* Configuración */}
                  <Link
                    to="/settings"
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-700/50">
                      <Settings size={13} className="text-slate-400" />
                    </div>
                    <span>Configuración</span>
                  </Link>

                  {/* Separador */}
                  <div className="h-px bg-white/5 mx-1 my-1" />

                  {/* Cerrar sesión */}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-500/10">
                      <LogOut size={13} className="text-red-400" />
                    </div>
                    <span>Cerrar sesión</span>
                  </button>

                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Menú Principal — Mobile (barra inferior) ── */}
      <nav
        className="md:hidden flex items-stretch border-t border-surface-600"
        style={{ background: 'rgba(8,13,18,0.98)' }}
      >
        {MAIN_NAV.map(({ to, icon: Icon, label }) => {
          const active = pathname === to || (to === '/live' && pathname.startsWith('/live'));
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                active ? 'text-accent-green' : 'text-slate-500'
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
