import { MessageCircle, Shield, Clock, Star, Zap, CheckCircle } from 'lucide-react';

export default function PendingWall() {
  const WHATSAPP_NUMBER = '51999999999'; // REEMPLAZAR CON TU NÚMERO
  const message = 'Hola, acabo de registrarme en Chalaca y me gustaría activar mi cuenta VIP 🏆';
  const wpLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  const perks = [
    { icon: <Zap size={15} className="text-yellow-400" />, text: 'Pronósticos IA diarios' },
    { icon: <Star size={15} className="text-yellow-400" />, text: 'Análisis estadístico avanzado' },
    { icon: <Shield size={15} className="text-yellow-400" />, text: 'Picks pre-partido y en vivo' },
    { icon: <CheckCircle size={15} className="text-yellow-400" />, text: 'Historial de apuestas' },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center animate-fade-in">

      {/* Icono animado */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(234,179,8,0.15), rgba(249,115,22,0.1))',
            border: '1px solid rgba(234,179,8,0.25)',
            boxShadow: '0 0 40px rgba(234,179,8,0.12)',
          }}>
          <Clock size={40} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 8px rgba(234,179,8,0.5))' }} />
        </div>
        {/* Pulso exterior */}
        <div className="absolute inset-0 rounded-2xl animate-ping opacity-20"
          style={{ background: 'rgba(234,179,8,0.3)' }} />
      </div>

      {/* Título */}
      <div className="mb-2">
        <span className="text-[10px] uppercase tracking-widest font-bold text-yellow-500/80">Acceso Restringido</span>
      </div>
      <h2 className="text-3xl font-black text-white mb-3">
        Cuenta en Revisión
      </h2>
      <p className="text-slate-400 max-w-xs mb-8 text-sm leading-relaxed">
        Tu cuenta fue creada exitosamente. Para desbloquear todos los pronósticos VIP, activa tu suscripción.
      </p>

      {/* Perks */}
      <div className="w-full max-w-xs mb-8 space-y-2.5">
        {perks.map((p, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left"
            style={{
              background: 'rgba(234,179,8,0.05)',
              border: '1px solid rgba(234,179,8,0.1)',
            }}>
            {p.icon}
            <span className="text-sm text-slate-300">{p.text}</span>
          </div>
        ))}
      </div>

      {/* CTA WhatsApp */}
      <a
        href={wpLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-7 py-4 rounded-2xl font-bold text-white text-sm transition-all duration-200 hover:scale-105 hover:shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #25D366, #1aab55)',
          boxShadow: '0 8px 32px rgba(37,211,102,0.35)',
        }}
      >
        <MessageCircle size={20} />
        Activar mi cuenta VIP
      </a>

      <p className="text-[11px] text-slate-600 mt-4">
        Respuesta en minutos · Activación inmediata
      </p>
    </div>
  );
}
