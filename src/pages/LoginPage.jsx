import { useState, useEffect, useRef } from 'react';
import { Zap, Eye, EyeOff, Lock, User, Mail, ArrowRight, CheckCircle2, AlertCircle, ShieldCheck, BrainCircuit, TrendingUp, Check, X as XIcon, ChevronDown } from 'lucide-react';
import { loginUser, registerUser, loginWithGoogle } from '../services/backendApi';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';

// ── Google Button (Premium Glass) ────────────────────────────────────
function GoogleButton({ onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      id="btn-google-login"
      className="w-full flex items-center justify-center gap-4 py-4 px-6 rounded-3xl transition-all duration-300 relative overflow-hidden group"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
      }}
    >
      {/* Glow hover effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" className="relative z-10">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      <span className="text-xl font-semibold tracking-tight text-white relative z-10 group-hover:scale-105 transition-transform duration-300">
        Continuar con Google
      </span>
    </button>
  );
}

// ── Separador Premium ────────────────────────────────────────────────
function Divider() {
  return (
    <div className="flex items-center gap-4 my-10">
      <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <span className="text-sm text-white/40 font-medium tracking-wide">o usa tu correo</span>
      <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────
export default function LoginPage({ onLogin }) {
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  const formRef = useRef(null);

  // Detectar callback de Google OAuth al cargar
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        setGoogleLoading(true);
        const res = await loginWithGoogle(session.access_token);
        if (res?.success) {
          toast.success(`¡Bienvenido, ${res.user.username}!`);
          onLogin();
        } else {
          toast.error(res?.error || 'Error al iniciar sesión con Google');
        }
        setGoogleLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [onLogin]);

  // Pre-cargar datos del Home
  useEffect(() => {
    const prefetchHome = async () => {
      try {
        const BACKEND = import.meta.env.VITE_BACKEND_URL || '';
        const todayStr = new Date().toLocaleDateString('en-CA');
        const res = await fetch(`${BACKEND}/api/fixtures/date/${todayStr}`);
        if (!res.ok) return;
        const json = await res.json();
        sessionStorage.setItem(`chalaca_home_${todayStr}`, JSON.stringify(json.data || []));
      } catch (e) {}
    };
    setTimeout(prefetchHome, 1000);
  }, []);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };



  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error('No pudimos conectar con Google. Intenta de nuevo.');
      setGoogleLoading(false);
    }
  };



  return (
    <div className="min-h-screen bg-[#030508] text-white selection:bg-accent-green selection:text-black font-sans relative overflow-hidden">
      
      {/* ── AURORA BACKGROUND EFFECTS ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Glow 1 - Verde */}
        <div className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-accent-green/20 mix-blend-screen filter blur-[120px] opacity-60 animate-[pulse_10s_ease-in-out_infinite]" />
        {/* Glow 2 - Púrpura */}
        <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 mix-blend-screen filter blur-[120px] opacity-50 animate-[pulse_12s_ease-in-out_infinite_reverse]" />
        {/* Glow 3 - Azul */}
        <div className="absolute -bottom-[20%] left-[20%] w-[70%] h-[70%] rounded-full bg-blue-600/20 mix-blend-screen filter blur-[150px] opacity-40 animate-[pulse_15s_ease-in-out_infinite]" />
        {/* Noise overlay */}
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* ── HEADER GLASS ── */}
        <header className="p-8 md:px-12 flex items-center justify-between backdrop-blur-md bg-[#030508]/40 sticky top-0 z-50 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-accent-green to-teal-400 text-black shadow-[0_0_20px_rgba(0,255,136,0.3)]">
              <Zap size={24} strokeWidth={2.5} />
            </div>
            <span className="text-3xl font-bold tracking-tight">Chalaca</span>
          </div>
          <button onClick={scrollToForm} className="text-lg font-medium text-white/60 hover:text-white transition-colors">
            Ingresar
          </button>
        </header>

        {/* ── HERO SECTION ── */}
        <section className="px-6 py-24 md:py-40 max-w-5xl mx-auto text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl mb-8">
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span className="text-sm font-medium text-white/80">Análisis Matemático Deportivo</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black mb-8 tracking-tighter leading-[1.1] text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/50">
            Apuestas seguras. <br/>
            De forma <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-green via-teal-400 to-blue-500">inteligente.</span>
          </h1>
          <p className="text-2xl md:text-3xl text-white/60 mb-16 max-w-3xl mx-auto leading-relaxed font-medium">
            La tecnología más avanzada para cuidar tu dinero. Sin complicaciones, diseñado para todos.
          </p>
          <button 
            onClick={scrollToForm}
            className="group relative px-12 py-5 rounded-full text-2xl font-bold transition-all duration-300 shadow-[0_0_40px_rgba(0,255,136,0.3)] hover:shadow-[0_0_60px_rgba(0,255,136,0.5)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-accent-green to-teal-400" />
            <span className="relative z-10 text-black flex items-center gap-3">
              Empezar ahora <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </section>

        {/* ── BENEFICIOS (Premium Glass Cards) ── */}
        <section className="px-6 py-32 relative">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl z-0" />
          <div className="max-w-7xl mx-auto relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold text-center mb-24 tracking-tight">Tan simple. Tan poderoso.</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Beneficio 1 */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-12 text-center transition-transform hover:-translate-y-2 duration-500 shadow-2xl">
                <div className="mx-auto w-24 h-24 bg-gradient-to-br from-green-400/20 to-teal-600/20 rounded-[2rem] flex items-center justify-center mb-10 border border-green-500/30 shadow-[0_0_30px_rgba(74,222,128,0.2)]">
                  <BrainCircuit size={48} className="text-green-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-3xl font-bold mb-6 tracking-tight text-white">Matemática Pura</h3>
                <p className="text-xl text-white/60 leading-relaxed font-medium">
                  No adivinamos. Nuestro sistema calcula las probabilidades reales usando miles de datos.
                </p>
              </div>

              {/* Beneficio 2 */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-12 text-center transition-transform hover:-translate-y-2 duration-500 shadow-2xl">
                <div className="mx-auto w-24 h-24 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-[2rem] flex items-center justify-center mb-10 border border-blue-500/30 shadow-[0_0_30px_rgba(96,165,250,0.2)]">
                  <ShieldCheck size={48} className="text-blue-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-3xl font-bold mb-6 tracking-tight text-white">Máxima Seguridad</h3>
                <p className="text-xl text-white/60 leading-relaxed font-medium">
                  Si una apuesta es riesgosa, te lo advertimos. Cuidamos tu dinero como si fuera nuestro.
                </p>
              </div>

              {/* Beneficio 3 */}
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-12 text-center transition-transform hover:-translate-y-2 duration-500 shadow-2xl">
                <div className="mx-auto w-24 h-24 bg-gradient-to-br from-purple-400/20 to-pink-600/20 rounded-[2rem] flex items-center justify-center mb-10 border border-purple-500/30 shadow-[0_0_30px_rgba(192,132,252,0.2)]">
                  <TrendingUp size={48} className="text-purple-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-3xl font-bold mb-6 tracking-tight text-white">Fácil de Usar</h3>
                <p className="text-xl text-white/60 leading-relaxed font-medium">
                  Letras grandes, pantalla limpia. Te decimos exactamente qué apostar de manera directa.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── COMPARATIVA ── */}
        <section className="px-6 py-32 max-w-6xl mx-auto relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-24 tracking-tight">La diferencia está clara.</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Otras páginas */}
            <div className="bg-red-500/5 backdrop-blur-xl border border-red-500/20 p-10 md:p-14 rounded-[3rem]">
              <h3 className="text-3xl font-semibold text-red-400/80 mb-10 flex items-center gap-4 tracking-tight">
                <XIcon size={40} /> Otras páginas
              </h3>
              <ul className="space-y-6">
                <li className="flex items-start gap-5 text-lg text-white/60 font-medium leading-relaxed">
                  <span className="text-red-500 mt-1 font-bold">—</span> 
                  Quieren que apuestes en todos los partidos para que termines perdiendo tu dinero.
                </li>
                <li className="flex items-start gap-5 text-lg text-white/60 font-medium leading-relaxed">
                  <span className="text-red-500 mt-1 font-bold">—</span> 
                  Interfaces confusas, llenas de números diminutos y publicidad engañosa.
                </li>
                <li className="flex items-start gap-5 text-lg text-white/60 font-medium leading-relaxed">
                  <span className="text-red-500 mt-1 font-bold">—</span> 
                  Te dan pronósticos mágicos sin ninguna explicación matemática ni lógica.
                </li>
                <li className="flex items-start gap-5 text-lg text-white/60 font-medium leading-relaxed">
                  <span className="text-red-500 mt-1 font-bold">—</span> 
                  Te incitan a hacer combinadas gigantescas que son estadísticamente imposibles.
                </li>
                <li className="flex items-start gap-5 text-lg text-white/60 font-medium leading-relaxed">
                  <span className="text-red-500 mt-1 font-bold">—</span> 
                  No protegen tu capital; su modelo de negocio es que tú te quedes en cero.
                </li>
              </ul>
            </div>

            {/* Chalaca */}
            <div className="bg-gradient-to-br from-accent-green/10 to-teal-900/10 backdrop-blur-xl border border-accent-green/30 p-10 md:p-14 rounded-[3rem] relative overflow-hidden shadow-[0_0_50px_rgba(0,255,136,0.05)]">
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-accent-green/20 blur-[80px] rounded-full pointer-events-none" />
              <h3 className="text-3xl font-semibold text-white mb-10 flex items-center gap-4 tracking-tight relative z-10">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-green to-teal-400 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,255,136,0.3)]">
                  <Check size={28} className="text-black" strokeWidth={3} />
                </div>
                En Chalaca
              </h3>
              <ul className="space-y-6 relative z-10">
                <li className="flex items-start gap-5 text-lg text-white/90 font-medium leading-relaxed">
                  <span className="text-accent-green mt-1 font-bold">✓</span> 
                  Filtramos el 90% de la basura y solo te mostramos las opciones más seguras.
                </li>
                <li className="flex items-start gap-5 text-lg text-white/90 font-medium leading-relaxed">
                  <span className="text-accent-green mt-1 font-bold">✓</span> 
                  Interfaz gigante, limpia y diseñada sin distracciones visuales.
                </li>
                <li className="flex items-start gap-5 text-lg text-white/90 font-medium leading-relaxed">
                  <span className="text-accent-green mt-1 font-bold">✓</span> 
                  Te explicamos con total transparencia la matemática detrás de cada apuesta.
                </li>
                <li className="flex items-start gap-5 text-lg text-white/90 font-medium leading-relaxed">
                  <span className="text-accent-green mt-1 font-bold">✓</span> 
                  Si un día no hay partidos con buenas probabilidades, te recomendamos NO apostar.
                </li>
                <li className="flex items-start gap-5 text-lg text-white/90 font-medium leading-relaxed">
                  <span className="text-accent-green mt-1 font-bold">✓</span> 
                  Fomentamos el crecimiento seguro de tu dinero a largo plazo, sin locuras.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── FORMULARIO DE ACCESO (Más Compacto) ── */}
        <section ref={formRef} className="px-6 py-24 relative z-10">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-3xl z-0" />
          <div className="max-w-md mx-auto relative z-10">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-bold mb-4 tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60">
                {/* Header Titles */}
              Bienvenido.
            </h2>
            <p className="text-xl text-white/60 font-medium">
              Ingresa con Google para ver las mejores opciones.
            </p>
            </div>

            <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 p-8 md:p-10 rounded-[2rem] shadow-2xl">
              <GoogleButton onClick={handleGoogleLogin} loading={googleLoading} />
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="py-12 text-center text-white/40 font-medium text-lg relative z-10 border-t border-white/5 mt-auto bg-black/40 backdrop-blur-xl">
          <p>Herramienta de análisis estadístico · Uso privado</p>
        </footer>
      </div>
    </div>
  );
}

