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
  const user = JSON.parse(sessionStorage.getItem('chalaca_user') || '{}');
  const { theme, setTheme, font, setFont, textSize, setTextSize } = useApp();

  return (
    <div className="w-full animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <p className="section-title mb-1">Configuración</p>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings size={22} className="text-accent-green" />
          Ajustes del Sistema
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
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="border-b border-white/5 pb-4">
                <h2 className="text-lg font-bold text-white">Personalización</h2>
                <p className="text-xs text-slate-400 mt-1">Adapta la interfaz visual a tus necesidades.</p>
              </div>
              <div className="space-y-5">
                {/* Selector de Tema */}
                <div className="p-4 border border-white/5 rounded-xl bg-white/[0.02]">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Layout size={16} className="text-accent-blue" />
                    Estilo Visual (Tema)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { id: 'standard', name: 'Estándar', desc: 'Negro Profundo (Actual)', color: 'bg-[#030507]' },
                      { id: 'dark', name: 'Oscuro', desc: 'Azul Pizarra Suave', color: 'bg-slate-900' },
                      { id: 'light', name: 'Claro', desc: 'Blanco y Limpio', color: 'bg-slate-100' }
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          theme === t.id 
                            ? 'border-accent-blue bg-accent-blue/10' 
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-4 h-4 rounded-full border border-black/20 shadow-inner ${t.color}`} />
                          <span className={`text-sm font-bold ${theme === t.id ? 'text-accent-blue' : 'text-slate-200'}`}>{t.name}</span>
                          {theme === t.id && <Check size={14} className="text-accent-blue ml-auto" />}
                        </div>
                        <p className="text-[10px] text-slate-400">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selector de Tipografía */}
                <div className="p-4 border border-white/5 rounded-xl bg-white/[0.02]">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <span className="text-accent-blue font-serif italic text-lg leading-none">T</span>
                    Tipografía (Fuente)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { id: 'outfit', name: 'Outfit', desc: 'Moderna y Limpia (Actual)' },
                      { id: 'jakarta', name: 'Plus Jakarta Sans', desc: 'Elegante y Dinámica' },
                      { id: 'inter', name: 'Inter', desc: 'Estilo Técnico' },
                      { id: 'roboto', name: 'Roboto', desc: 'Máxima Legibilidad' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setFont(f.id)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          font === f.id 
                            ? 'border-accent-blue bg-accent-blue/10' 
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-1">
                          <span className={`text-xl font-bold ${font === f.id ? 'text-accent-blue' : 'text-slate-200'}`} style={{ fontFamily: f.name }}>Aa</span>
                          {font === f.id && <Check size={14} className="text-accent-blue ml-auto" />}
                        </div>
                        <p className="text-sm font-bold text-white mt-1" style={{ fontFamily: f.name }}>{f.name}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{f.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selector de Tamaño de Texto */}
                <div className="p-4 border border-white/5 rounded-xl bg-white/[0.02]">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <span className="text-accent-blue font-serif italic text-lg leading-none">A</span>
                    Tamaño de Texto
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { id: 'small', name: 'Pequeño', desc: 'Más densidad de datos' },
                      { id: 'medium', name: 'Mediano', desc: 'Equilibrado (Actual)' },
                      { id: 'large', name: 'Grande', desc: 'Máxima legibilidad' },
                      { id: 'xlarge', name: 'Extra', desc: 'Accesibilidad Total' }
                    ].map(ts => (
                      <button
                        key={ts.id}
                        onClick={() => setTextSize(ts.id)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          textSize === ts.id 
                            ? 'border-accent-blue bg-accent-blue/10' 
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-1">
                          <span className={`font-bold ${textSize === ts.id ? 'text-accent-blue' : 'text-slate-200'} ${ts.id === 'small' ? 'text-sm' : ts.id === 'medium' ? 'text-base' : ts.id === 'large' ? 'text-lg' : 'text-xl'}`}>Aa</span>
                          {textSize === ts.id && <Check size={14} className="text-accent-blue ml-auto" />}
                        </div>
                        <p className="text-sm font-bold text-white mt-1">{ts.name}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{ts.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Selector de Ligas Favoritas Pinceladas]
                </div>
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Ajuste de Zona Horaria Manual / Automática]
                </div>
                <div className="p-4 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                  [Toggle para ocultar/mostrar Stats Avanzadas]
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
