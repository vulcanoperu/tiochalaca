import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Settings, ShieldCheck, Check, AlertTriangle, 
  User, Sliders, Layout, Bell, Database, Crown, ChevronRight 
} from 'lucide-react';

const TABS = [
  { id: 'account', icon: User, label: 'Perfil y Cuenta' },
  { id: 'preferences', icon: Sliders, label: 'Análisis y Preferencias' },
  { id: 'interface', icon: Layout, label: 'Personalización' },
  { id: 'notifications', icon: Bell, label: 'Notificaciones' },
  { id: 'data', icon: Database, label: 'Datos y Sistema' },
  { id: 'about', icon: ShieldCheck, label: 'Acerca de Chalaca' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('account');
  let user = {};
  try {
    const stored = sessionStorage.getItem('chalaca_user');
    user = stored && stored !== 'undefined' ? JSON.parse(stored) : {};
  } catch(e){}
  const { theme, setTheme, font, setFont, textSize, setTextSize } = useApp();

  return (
    <div className="w-full animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <p className="section-title mb-1">Configuración</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4 flex items-center gap-4">
          <Settings className="text-[#BFF102]" size={40} />
          <div>
            <span className="text-white">Ajustes y</span>{' '}
            <span style={{ color: '#BFF102' }}>Configuración</span>
          </div>
        </h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Sidebar Menu */}
        <div className="w-full md:w-64 flex-shrink-0 space-y-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`settings-menu-item ${activeTab === tab.id ? 'active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <tab.icon size={16} className={activeTab === tab.id ? 'text-accent-green' : 'opacity-70'} />
                {tab.label}
              </span>
              <ChevronRight size={14} className={`transition-transform ${activeTab === tab.id ? 'opacity-100 translate-x-1' : 'opacity-0'}`} />
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 glass-card p-6 min-h-[400px]">
          
          {/* TAB: PERFIL Y CUENTA */}
          {activeTab === 'account' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Perfil y Cuenta</h2>
                  <p className="text-xs text-slate-400 mt-1">Gestiona tu información personal y membresía.</p>
                </div>
                {user.role === 'vip' && (
                  <span className="badge-yellow"><Crown size={10}/> VIP</span>
                )}
              </div>
              
              <div className="space-y-4">
                {/* Placeholder para formulario de cuenta */}
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Formulario de Avatar, Usuario y Contraseña]
                </div>
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Gestión de Membresía / Upgrade a VIP]
                </div>
              </div>
            </div>
          )}

          {/* TAB: ANÁLISIS Y PREFERENCIAS */}
          {activeTab === 'preferences' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="border-b border-white/5 pb-4">
                <h2 className="text-lg font-bold text-white">Análisis y Preferencias</h2>
                <p className="text-xs text-slate-400 mt-1">Ajusta cómo el motor de Chalaca calcula y muestra las oportunidades.</p>
              </div>
              <div className="space-y-4">
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Selector de Formato de Cuotas: Decimal, Fraccional, Americano]
                </div>
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Perfil de Riesgo: Conservador, Moderado, Agresivo]
                </div>
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Configuración de Unidad de Stake Default]
                </div>
              </div>
            </div>
          )}

          {/* TAB: PERSONALIZACIÓN */}
          {activeTab === 'interface' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="border-b border-white/5 pb-4">
                <h2 className="text-lg font-bold text-white">Personalización</h2>
                <p className="text-xs text-slate-400 mt-1">Adapta la interfaz visual a tus preferencias.</p>
              </div>

              {/* ── Selector de Tema ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <Layout size={14} className="text-[#BFF102]" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Estilo Visual</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'standard',
                      name: 'Clásico',
                      desc: 'Verde Estadio',
                      preview: [
                        { bg: '#00312D', label: 'Base' },
                        { bg: '#3A7817', label: 'Surface' },
                        { bg: '#72BF01', label: 'Acento' },
                        { bg: '#BFF102', label: 'Highlight' },
                      ]
                    },
                    {
                      id: 'dark',
                      name: 'Oscuro',
                      desc: 'Negro Profundo',
                      preview: [
                        { bg: '#030507', label: 'Base' },
                        { bg: '#0d1117', label: 'Surface' },
                        { bg: '#1e2a3a', label: 'Acento' },
                        { bg: '#4a9eff', label: 'Highlight' },
                      ]
                    },
                    {
                      id: 'light',
                      name: 'Claro',
                      desc: 'Blanco Limpio',
                      preview: [
                        { bg: '#ffffff', label: 'Base' },
                        { bg: '#f1f5f9', label: 'Surface' },
                        { bg: '#e2e8f0', label: 'Acento' },
                        { bg: '#3b82f6', label: 'Highlight' },
                      ]
                    },
                  ].map(t => {
                    const isActive = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={`relative p-4 rounded-xl border text-left transition-all duration-200 overflow-hidden group ${
                          isActive
                            ? 'border-[#BFF102]/60 bg-[#BFF102]/5'
                            : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                        }`}
                      >
                        {/* Color palette preview strip */}
                        <div className="flex gap-1 mb-3 rounded-md overflow-hidden h-8">
                          {t.preview.map(swatch => (
                            <div
                              key={swatch.label}
                              className="flex-1 rounded"
                              style={{ backgroundColor: swatch.bg }}
                              title={swatch.label}
                            />
                          ))}
                        </div>

                        <div className="flex items-start justify-between">
                          <div>
                            <p className={`text-sm font-bold ${isActive ? 'text-[#BFF102]' : 'text-slate-200'}`}>
                              {t.name}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                          </div>
                          {isActive && (
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#BFF102] shrink-0">
                              <Check size={11} className="text-[#00312D]" strokeWidth={3} />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Selector de Tipografía ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[#BFF102] font-serif italic text-base leading-none">T</span>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Tipografía</h3>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { id: 'outfit',  name: 'Outfit',           desc: 'Moderna' },
                    { id: 'jakarta', name: 'Plus Jakarta Sans', desc: 'Elegante' },
                    { id: 'inter',   name: 'Inter',            desc: 'Técnica' },
                    { id: 'roboto',  name: 'Roboto',           desc: 'Legible' },
                  ].map(f => {
                    const isActive = font === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFont(f.id)}
                        className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                          isActive
                            ? 'border-[#BFF102]/60 bg-[#BFF102]/5'
                            : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`text-2xl font-bold leading-none ${isActive ? 'text-[#BFF102]' : 'text-slate-300'}`}
                            style={{ fontFamily: f.name }}
                          >Aa</span>
                          {isActive && (
                            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#BFF102] shrink-0">
                              <Check size={9} className="text-[#00312D]" strokeWidth={3} />
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-200 mt-1 truncate" style={{ fontFamily: f.name }}>{f.name}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{f.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Tamaño de Texto ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[#BFF102] font-bold text-base leading-none">A</span>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Tamaño de Texto</h3>
                </div>
                <div className="flex gap-3">
                  {[
                    { id: 'small',  label: 'A',  name: 'Pequeño',  size: 'text-sm'  },
                    { id: 'medium', label: 'A',  name: 'Mediano',  size: 'text-base' },
                    { id: 'large',  label: 'A',  name: 'Grande',   size: 'text-xl'  },
                    { id: 'xlarge', label: 'A',  name: 'Extra',    size: 'text-2xl' },
                  ].map(ts => {
                    const isActive = textSize === ts.id;
                    return (
                      <button
                        key={ts.id}
                        onClick={() => setTextSize(ts.id)}
                        className={`flex-1 py-4 px-2 rounded-xl border text-center transition-all duration-200 ${
                          isActive
                            ? 'border-[#BFF102]/60 bg-[#BFF102]/5'
                            : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className={`block font-bold ${ts.size} ${isActive ? 'text-[#BFF102]' : 'text-slate-400'} leading-none mb-2`}>
                          {ts.label}
                        </span>
                        <span className="text-[10px] text-slate-600">{ts.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* TAB: NOTIFICACIONES */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="border-b border-white/5 pb-4">
                <h2 className="text-lg font-bold text-white">Notificaciones</h2>
                <p className="text-xs text-slate-400 mt-1">Controla las alertas y avisos del sistema.</p>
              </div>
              <div className="space-y-4">
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Toggles de Alertas VIP 💎]
                </div>
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Recordatorios de inicio de partidos guardados]
                </div>
              </div>
            </div>
          )}

          {/* TAB: DATOS Y SISTEMA */}
          {activeTab === 'data' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="border-b border-white/5 pb-4">
                <h2 className="text-lg font-bold text-white">Datos y Sistema</h2>
                <p className="text-xs text-slate-400 mt-1">Administra tu información y el estado de la aplicación.</p>
              </div>
              <div className="space-y-4">
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm text-red-500/50">
                  [Botón: Borrar Historial de Picks Guardados]
                </div>
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Botón: Limpiar Caché Local de Partidos]
                </div>
              </div>
            </div>
          )}

          {/* TAB: ACERCA DE CHALACA (El contenido original) */}
          {activeTab === 'about' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="border-b border-white/5 pb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck size={18} className="text-accent-green" />
                  Sistema de Datos Autónomo
                </h2>
                <p className="text-xs text-slate-400 mt-1">Información sobre el motor de Chalaca Analytics.</p>
              </div>
              
              <div className="space-y-5">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Chalaca Analytics opera con un motor de datos <strong>100% independiente</strong>. 
                  Extraemos, normalizamos y calculamos métricas avanzadas (córners, tarjetas, xG) 
                  en tiempo real sin depender de proveedores de terceros con límites restrictivos.
                </p>
                <div className="p-3 rounded-lg text-xs space-y-1"
                  style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)' }}>
                  <p className="text-accent-green font-semibold flex items-center gap-1.5">
                    <Check size={12} /> Estado del Servidor Local
                  </p>
                  <p className="text-slate-400">Conexión a base de datos de historial y estadísticas operando al 100%.</p>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Ligas Monitoreadas</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', name:'Premier League' },
                      { flag:'🇪🇸', name:'La Liga' },
                      { flag:'🇩🇪', name:'Bundesliga' },
                      { flag:'🇮🇹', name:'Serie A' },
                      { flag:'🇫🇷', name:'Ligue 1' },
                      { flag:'🇪🇺', name:'Champions League' },
                      { flag:'🌎', name:'Libertadores' },
                    ].map(l => (
                      <div key={l.name} className="flex items-center gap-2 py-1 px-2 bg-white/5 rounded-md border border-white/5">
                        <span className="text-sm">{l.flag}</span>
                        <span className="text-xs font-semibold text-slate-300">{l.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl p-4 text-xs text-slate-500 space-y-1 leading-relaxed mt-6"
                  style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-slate-400 font-semibold flex items-center gap-1.5"><AlertTriangle size={12}/> Aviso legal</p>
                  <p>Esta aplicación es únicamente una herramienta de análisis estadístico. No garantiza resultados ni constituye asesoramiento financiero. Apuesta con responsabilidad y dentro de tus posibilidades.</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
