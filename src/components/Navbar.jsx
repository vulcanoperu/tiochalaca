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
      <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between gap-4">

        {/* ── Brand ── */}
        <Link to="/" className="flex items-center gap-3 select-none group">
          <div className="nav-brand-icon w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
            <Zap size={15} strokeWidth={2.5} />
          </div>
          <div className="leading-none">
            <p className="nav-brand-text text-sm font-black tracking-tight uppercase leading-none">Tio Chalaca</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Analytics</p>
          </div>
        </Link>

        {/* ── Nav Desktop ── */}
        <nav className="hidden md:flex items-center gap-2">
          {MAIN_NAV.map(({ to, icon: Icon, label }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={`nav-link ${active ? 'active' : ''} flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200`}
              >
                <Icon size={14} strokeWidth={active ? 2.5 : 2} />
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
              className={`nav-user-btn ${menuOpen ? 'open' : ''} flex items-center gap-3 px-3 py-2 rounded-xl border transition-all duration-200`}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full grayscale" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                  {user.username?.[0] || '?'}
                </div>
              )}
              <span className="hidden sm:block text-[12px] font-bold text-slate-200 uppercase tracking-wider">
                {user.username}
              </span>
              <ChevronDown size={12} className={`text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="nav-dropdown absolute right-0 top-[calc(100%+12px)] w-56 border rounded-2xl overflow-hidden shadow-2xl animate-in">
                <div className="nav-dropdown-header px-4 py-4 border-b">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Cuenta</p>
                  <p className="text-sm font-bold nav-brand-text mt-1 truncate">{user.username}</p>
                </div>
                <div className="p-2 space-y-1">
                  <Link to="/settings" className="nav-dropdown-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors">
                    <Settings size={14} /> Ajustes
                  </Link>
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-red-500 hover:bg-red-500/5 transition-colors">
                    <LogOut size={14} /> Salir
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
