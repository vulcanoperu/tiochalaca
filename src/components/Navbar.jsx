import { Link, useLocation } from 'react-router-dom';
import { Activity, BarChart2, Home, Settings, Zap, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';

const NAV_LINKS = [
  { to: '/',         icon: Home,       label: 'Hoy'        },
  { to: '/live',     icon: Activity,   label: 'En Vivo'    },
  { to: '/picks',    icon: TrendingUp, label: 'Mis Picks'  },
  { to: '/settings', icon: Settings,   label: 'Config'     },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const { apiKey, apiQuota } = useApp();

  return (
    <header className="sticky top-0 z-50 border-b border-surface-600"
      style={{ background: 'linear-gradient(180deg,rgba(8,13,18,0.98) 0%,rgba(13,21,32,0.95) 100%)', backdropFilter: 'blur(20px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 select-none shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#00ff88,#00cc6a)', boxShadow: '0 0 16px rgba(0,255,136,0.4)' }}>
            <Zap size={16} strokeWidth={2.5} className="text-surface-900" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none tracking-tight">TipsterPro</p>
            <p className="text-[10px] text-slate-500 leading-none mt-0.5">AI Football Analysis</p>
          </div>
        </Link>

        {/* Nav — desktop */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ to, icon: Icon, label }) => {
            const active = pathname === to;
            return (
              <Link key={to} to={to}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
                style={active ? {
                  background: 'rgba(0,255,136,0.12)',
                  color: '#00ff88',
                  boxShadow: 'inset 0 0 0 1px rgba(0,255,136,0.2)',
                } : {}}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Status badges */}
        <div className="flex items-center gap-2 shrink-0">
          {apiQuota && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className={`w-1.5 h-1.5 rounded-full ${apiQuota.remaining > 10 ? 'bg-accent-green' : 'bg-accent-red'}`}
                style={{ boxShadow: apiQuota.remaining > 10 ? '0 0 6px #00ff88' : '0 0 6px #ff4757' }} />
              <span className="text-slate-400">
                <span className="text-white font-mono font-semibold">{apiQuota.remaining}</span>/{apiQuota.limit} req
              </span>
            </div>
          )}

          {!apiKey && (
            <Link to="/settings"
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(255,71,87,0.15)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)' }}>
              ⚠ Config API
            </Link>
          )}

          {apiKey && (
            <span className="text-xs px-2.5 py-1.5 rounded-lg font-semibold badge-green">
              ● API Activa
            </span>
          )}
        </div>
      </div>

      {/* Nav — mobile */}
      <nav className="md:hidden flex items-stretch border-t border-surface-600" style={{ background: 'rgba(8,13,18,0.98)' }}>
        {NAV_LINKS.map(({ to, icon: Icon, label }) => {
          const active = pathname === to;
          return (
            <Link key={to} to={to}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                active ? 'text-accent-green' : 'text-slate-500'
              }`}>
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
