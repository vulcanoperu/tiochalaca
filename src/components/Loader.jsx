import { useEffect, useState } from 'react';

const TIPS = [
  'ANALIZANDO FORMA RECIENTE...',
  'CALCULANDO PROBABILIDADES...',
  'REVISANDO HISTORIAL H2H...',
  'EVALUANDO LESIONES...',
  'CRUZANDO CUOTAS DE MERCADO...',
  'DETECTANDO PATRONES DE GOLES...',
  'VERIFICANDO FATIGA...',
];

export default function Loader({ text = 'CARGANDO...', progress = null, subtext = null, showTips = false }) {
  const [tip, setTip] = useState(0);

  useEffect(() => {
    if (!showTips) return;
    const id = setInterval(() => setTip(t => (t + 1) % TIPS.length), 2800);
    return () => clearInterval(id);
  }, [showTips]);

  return (
    <div className="flex flex-col items-center justify-center py-32 gap-8 animate-in">
      <div className="relative flex items-center justify-center">
        {/* Simple thin ring */}
        <div className="w-12 h-12 rounded-full border border-white/5" />
        {/* Spinning segment */}
        <div className="absolute inset-0 border-t border-white rounded-full animate-spin" />
      </div>

      <div className="text-center space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white">{text}</p>
        {subtext && <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{subtext}</p>}
        {showTips && (
          <p key={tip} className="text-[9px] font-bold text-slate-700 uppercase tracking-[0.2em] animate-in">
            {TIPS[tip]}
          </p>
        )}
      </div>

      {progress != null && (
        <div className="w-32">
          <div className="h-[2px] w-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
