import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, BookMarked, Settings, LogOut,
  Zap, Shield, ChevronDown, Crown, Star, Activity
} from 'lucide-react';

const MAIN_NAV = [
  { to: '/',               icon: Home,       label: 'Partidos'       },
  { to: '/estadisticas',   icon: Activity,   label: 'Estadísticas' },
  { to: '/recomendaciones', icon: Star,       label: 'Recomendaciones' },
  { to: '/picks',          icon: BookMarked, label: 'Mis Apuestas'   },
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

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const roleLabel = user.role === 'admin' ? 'Admin' : user.role === 'vip' ? 'VIP' : null;
  const isActive = (to) => pathname === to || (to !== '/' && pathname.startsWith(to));

  return (
    <header className="nav-header sticky top-0 z-50 backdrop-blur-xl border-b">
      <div className="max-w-screen-2xl mx-auto px-8 h-20 flex items-center justify-between gap-4">

        {/* ── Brand ── */}
        <Link to="/" className="flex items-center gap-3 select-none group">
          <div className="nav-brand-icon w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
            <Zap size={20} strokeWidth={2.5} />
          </div>
          <div className="leading-none">
            <p className="nav-brand-text text-lg font-black tracking-tight uppercase leading-none">Tio Chalaca</p>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">Analytics</p>
          </div>
        </Link>

        {/* ── Nav Desktop ── */}
        <nav className="hidden md:flex items-center gap-1">
          {MAIN_NAV.map(({ to, icon: Icon, label }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={`nav-link ${active ? 'active' : ''} flex items-center gap-2.5 px-3 py-3 rounded-xl text-[20px] font-semibold transition-all duration-200`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* ── User Menu ── */}
        <div className="flex items-center gap-3">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className={`nav-user-btn ${menuOpen ? 'open' : ''} flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-200`}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full grayscale" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-[13px] font-bold text-white uppercase">
                  {user.username?.[0] || '?'}
                </div>
              )}
              <span className="hidden sm:block text-[14px] font-bold text-slate-200 uppercase tracking-wider">
                {user.username}
              </span>
              <ChevronDown size={16} className={`text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="nav-dropdown absolute right-0 top-[calc(100%+12px)] w-64 border rounded-2xl overflow-hidden shadow-2xl animate-in">
                <div className="nav-dropdown-header px-5 py-5 border-b">
                  <p className="text-[12px] font-black uppercase tracking-widest text-slate-500">Cuenta</p>
                  <p className="text-base font-bold nav-brand-text mt-1 truncate">{user.username}</p>
                </div>
                <div className="p-2 space-y-1">
                  <Link to="/settings" className="nav-dropdown-link flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] transition-colors">
                    <Settings size={16} /> Ajustes
                  </Link>
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] text-red-500 hover:bg-red-500/5 transition-colors">
                    <LogOut size={16} /> Salir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
