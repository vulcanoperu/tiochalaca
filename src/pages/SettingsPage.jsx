import { useState } from 'react';
import { Settings, Key, ExternalLink, Check, Eye, EyeOff, Info, RefreshCw, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { checkApiStatus } from '../services/footballApi';
import toast from 'react-hot-toast';

const STEPS = [
  { n: 1, t: 'Registrarse gratis', d: 'Ve a api-football.com y crea una cuenta gratuita.' },
  { n: 2, t: 'Obtener API Key',    d: 'En el dashboard encontrarás tu API Key única.' },
  { n: 3, t: 'Pegar aquí',         d: 'Pega una o varias keys (separadas por coma).' },
  { n: 4, t: 'Verificar quota',    d: 'Presiona "Verificar" para confirmar que funciona.' },
];

export default function SettingsPage() {
  const { apiKey, saveApiKey, apiQuota, setApiQuota } = useApp();
  const [inputKey, setInputKey]     = useState(apiKey);
  const [showKey, setShowKey]       = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved]           = useState(false);

  const handleSave = () => {
    if (!inputKey.trim()) return;
    saveApiKey(inputKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('API Key guardada correctamente');
  };

  const handleTest = async () => {
    if (!inputKey.trim()) { toast.error('Ingresa una API Key primero'); return; }
    // Temporarily save to allow api call
    saveApiKey(inputKey.trim());
    setTesting(true);
    setTestResult(null);
    try {
      const statusData = await checkApiStatus();
      const status = statusData[0];
      if (status) {
        const quota = {
          limit:     status.requests?.limit_day  ?? 100,
          remaining: status.requests?.remaining  ?? 0,
          used:      status.requests?.current    ?? 0,
        };
        setApiQuota(quota);
        setTestResult({ ok: true, quota });
        toast.success(`✅ API activa · ${quota.remaining} requests restantes`);
      } else {
        setTestResult({ ok: false, msg: 'Respuesta vacía. Verifica la key.' });
        toast.error('API Key inválida o sin acceso');
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
      toast.error('Error al conectar con la API');
    } finally {
      setTesting(false);
    }
  };

  const usagePct = apiQuota ? Math.round((apiQuota.used / apiQuota.limit) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 animate-fade-in space-y-4">
      {/* Header */}
      <div>
        <p className="section-title mb-1">Configuración</p>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings size={22} className="text-accent-green" />
          Ajustes
        </h1>
      </div>

      {/* API Setup guide */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Info size={15} className="text-accent-green" />
          Cómo obtener tu API Key gratuita
        </h2>
        <div className="space-y-3">
          {STEPS.map(s => (
            <div key={s.n} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}>
                {s.n}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{s.t}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
        <a href="https://dashboard.api-football.com/register"
          target="_blank" rel="noreferrer"
          className="btn-primary mt-5 inline-flex text-xs">
          <ExternalLink size={13} /> Registrarme en API-Football
        </a>
        <div className="mt-4 p-3 rounded-lg text-xs space-y-1"
          style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)' }}>
          <p className="text-amber-400 font-semibold flex items-center gap-1.5">
            <AlertTriangle size={12} /> Plan Gratuito
          </p>
          <p className="text-slate-400">100 requests/día por cada cuenta · Usa múltiples cuentas separadas por coma para multiplicar tu límite.</p>
        </div>
      </div>

      {/* Input */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Key size={15} className="text-accent-green" />
          API Key
        </h2>
        <div className="space-y-3">
          <div className="relative">
            <input
              id="api-key-input"
              type={showKey ? 'text' : 'password'}
              value={inputKey}
              onChange={e => setInputKey(e.target.value)}
              placeholder="Pega tu(s) API Key(s) separadas por coma…"
              className="input-field pr-10 font-mono"
            />
            <button onClick={() => setShowKey(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!inputKey.trim() || saved}
              className="btn-primary flex-1 justify-center">
              {saved ? <><Check size={14} /> Guardado</> : <>Guardar</>}
            </button>
            <button onClick={handleTest} disabled={testing || !inputKey.trim()}
              className="btn-ghost border border-surface-600 flex-1 justify-center text-slate-300">
              {testing ? <><RefreshCw size={13} className="animate-spin" /> Verificando…</> : <><RefreshCw size={13} /> Verificar</>}
            </button>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`rounded-lg p-3 text-xs ${testResult.ok ? 'badge-green' : 'badge-red'}`}
              style={{
                background: testResult.ok ? 'rgba(0,255,136,0.08)' : 'rgba(255,71,87,0.08)',
                border: `1px solid ${testResult.ok ? 'rgba(0,255,136,0.25)' : 'rgba(255,71,87,0.25)'}`,
                color: testResult.ok ? '#00ff88' : '#ff4757',
                display: 'block',
                borderRadius: '8px',
                padding: '10px 12px',
              }}>
              {testResult.ok
                ? `✅ Conexión exitosa · ${testResult.quota.remaining}/${testResult.quota.limit} requests disponibles`
                : `❌ ${testResult.msg}`}
            </div>
          )}
        </div>
      </div>

      {/* Quota stats */}
      {apiQuota && (
        <div className="glass-card p-5">
          <h2 className="text-sm font-bold text-white mb-4">Uso de API</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Usados', value: apiQuota.used,      color: '#ff4757' },
              { label: 'Restantes', value: apiQuota.remaining, color: '#00ff88' },
              { label: 'Límite/día', value: apiQuota.limit,  color: '#1e90ff' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center rounded-lg p-3"
                style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xl font-bold font-mono" style={{ color }}>{value}</p>
                <p className="text-[10px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="stat-bar h-2.5">
            <div className="stat-bar-fill"
              style={{ width: `${usagePct}%`, background: usagePct > 80 ? 'linear-gradient(90deg,#ff4757,#ff6b6b)' : undefined }} />
          </div>
          <p className="text-xs text-slate-600 text-right mt-1">{usagePct}% usado hoy</p>
        </div>
      )}

      {/* Ligas disponibles */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-bold text-white mb-3">Ligas monitoreadas</h2>
        <div className="space-y-2">
          {[
            { flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', name:'Premier League', country:'England' },
            { flag:'🇪🇸', name:'La Liga', country:'Spain' },
            { flag:'🇩🇪', name:'Bundesliga', country:'Germany' },
            { flag:'🇮🇹', name:'Serie A', country:'Italy' },
            { flag:'🇫🇷', name:'Ligue 1', country:'France' },
            { flag:'🇪🇺', name:'UEFA Champions League', country:'Europe' },
            { flag:'🇪🇺', name:'UEFA Europa League', country:'Europe' },
          ].map(l => (
            <div key={l.name} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
              <span className="text-lg">{l.flag}</span>
              <div>
                <p className="text-xs font-semibold text-slate-200">{l.name}</p>
                <p className="text-[10px] text-slate-600">{l.country}</p>
              </div>
              <span className="ml-auto badge-green text-[9px]">Activa</span>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl p-4 text-xs text-slate-500 space-y-1 leading-relaxed"
        style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-slate-400 font-semibold">⚠️ Aviso legal</p>
        <p>Esta aplicación es únicamente una herramienta de análisis estadístico. No garantiza resultados ni constituye asesoramiento financiero. Las apuestas deportivas implican riesgo de pérdida. Apuesta con responsabilidad y dentro de tus posibilidades.</p>
      </div>
    </div>
  );
}
