import { useState, useEffect } from 'react';
import { Zap, Eye, EyeOff, Lock, User, Mail, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { loginUser, registerUser, loginWithGoogle } from '../services/backendApi';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';

// ── Indicador de fortaleza de contraseña ────────────────────────────
function PasswordStrength({ password }) {
  const checks = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Letra mayúscula',      ok: /[A-Z]/.test(password) },
    { label: 'Número',               ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['#ff4757', '#f59e0b', '#00ff88'];
  const labels = ['Débil', 'Regular', 'Fuerte'];

  if (!password) return null;

  return (
    <div className="space-y-2 mt-1">
      {/* Barra */}
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < score ? colors[score - 1] : 'rgba(255,255,255,0.08)' }}
          />
        ))}
      </div>
      {/* Label */}
      <p className="text-[10px] font-bold" style={{ color: colors[score - 1] || '#64748b' }}>
        {score > 0 ? labels[score - 1] : 'Ingresa una contraseña'}
      </p>
      {/* Checks */}
      <div className="space-y-1">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-1.5">
            <CheckCircle2
              size={10}
              className="shrink-0 transition-colors duration-200"
              style={{ color: c.ok ? '#00ff88' : '#334155' }}
            />
            <span className="text-[10px]" style={{ color: c.ok ? '#94a3b8' : '#475569' }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Google Button ────────────────────────────────────────────────────
function GoogleButton({ onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      id="btn-google-login"
      className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border transition-all duration-200 font-semibold text-sm"
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.1)',
        color: '#e2e8f0',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
      }}
    >
      {/* Google SVG icon */}
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      {loading ? 'Conectando...' : 'Continuar con Google'}
    </button>
  );
}

// ── Separador ────────────────────────────────────────────────────────
function Divider() {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">o</span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────
export default function LoginPage({ onLogin }) {
  const [mode, setMode]         = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [pass, setPass]         = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]       = useState('');
  const [shaking, setShaking]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

    return () => {
      subscription.unsubscribe();
    };
  }, [onLogin]);

  const shake = () => { setShaking(true); setTimeout(() => setShaking(false), 500); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !pass.trim()) {
      setError('Completa todos los campos'); shake(); return;
    }

    if (mode === 'register') {
      if (pass !== confirmPass) {
        setError('Las contraseñas no coinciden'); shake(); return;
      }
      if (pass.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres'); shake(); return;
      }
    }

    setLoading(true);
    if (mode === 'register') {
      const res = await registerUser(username, pass);
      if (res.success) {
        toast.success('¡Cuenta creada! Ahora inicia sesión.');
        setMode('login');
        setPass(''); setConfirmPass('');
      } else {
        setError(res.error || 'Error al registrar');
        shake();
      }
    } else {
      const res = await loginUser(username, pass);
      if (res?.success) {
        toast.success('¡Bienvenido de vuelta!');
        onLogin();
      } else {
        setError(res?.error || 'Usuario o contraseña incorrectos');
        shake();
      }
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error('Error al conectar con Google');
      setGoogleLoading(false);
    }
  };

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError(''); setPass(''); setConfirmPass('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: '#080d12' }}>

      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-[600px] h-[600px] opacity-[0.07] blur-[120px] rounded-full"
          style={{ background: 'radial-gradient(circle, #00ff88 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] opacity-[0.05] blur-[100px] rounded-full"
          style={{ background: 'radial-gradient(circle, #1e90ff 0%, transparent 70%)' }} />
      </div>

      {/* Grid background */}
      <div className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

      <div className="relative z-10 w-full max-w-sm scale-[0.75] origin-center">
        
        {/* Logo + título */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
              boxShadow: '0 0 48px rgba(0,255,136,0.35)',
            }}>
            <Zap size={28} strokeWidth={2.5} className="text-slate-900" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-white tracking-tight">Chalaca</h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              {mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta gratis'}
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          className={`rounded-2xl p-6 transition-all duration-200 ${shaking ? 'animate-shake' : ''}`}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: shaking ? '1px solid rgba(255,71,87,0.4)' : '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
          }}>

          {/* Google Button */}
          <GoogleButton onClick={handleGoogleLogin} loading={googleLoading} />

          <Divider />

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>

            {/* Username */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Usuario
              </label>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="input-username"
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(''); }}
                  placeholder="nombre de usuario"
                  autoComplete="username"
                  disabled={loading}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all duration-200 focus:border-accent-green/40 focus:bg-white/[0.06]"
                />
              </div>
            </div>

            {/* Email (solo en registro) */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Email <span className="text-slate-600 font-normal normal-case">(opcional)</span>
                </label>
                <div className="relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="input-email"
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    disabled={loading}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all duration-200 focus:border-accent-green/40 focus:bg-white/[0.06]"
                  />
                </div>
              </div>
            )}

            {/* Password */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="input-password"
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => { setPass(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  disabled={loading}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all duration-200 focus:border-accent-green/40 focus:bg-white/[0.06]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {mode === 'register' && <PasswordStrength password={pass} />}
            </div>

            {/* Confirm password (solo en registro) */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="input-confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPass}
                    onChange={e => { setConfirmPass(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={loading}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all duration-200 focus:border-accent-green/40 focus:bg-white/[0.06]"
                    style={{
                      borderColor: confirmPass && confirmPass !== pass
                        ? 'rgba(255,71,87,0.4)'
                        : confirmPass && confirmPass === pass
                        ? 'rgba(0,255,136,0.4)'
                        : undefined
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showConfirm ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {confirmPass && (
                  <p className="text-[10px] font-semibold" style={{
                    color: confirmPass === pass ? '#00ff88' : '#ff4757'
                  }}>
                    {confirmPass === pass ? '✓ Las contraseñas coinciden' : '✗ No coinciden'}
                  </p>
                )}
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)' }}>
                <AlertCircle size={12} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="btn-submit-auth"
              type="submit"
              disabled={loading || googleLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm transition-all duration-200 mt-1"
              style={{
                background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
                color: '#080d12',
                boxShadow: '0 0 24px rgba(0,255,136,0.2)',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Procesando...
                </span>
              ) : (
                <>
                  {mode === 'register' ? 'Crear Cuenta' : 'Ingresar'}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Switch mode */}
          <div className="mt-4 text-center">
            <button
              id="btn-switch-auth-mode"
              type="button"
              onClick={switchMode}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {mode === 'login'
                ? <>¿No tienes cuenta? <span className="text-accent-green font-semibold">Regístrate gratis</span></>
                : <>¿Ya tienes cuenta? <span className="text-accent-green font-semibold">Inicia sesión</span></>
              }
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-slate-700 mt-5 font-medium">
          Herramienta de análisis estadístico · Uso privado
        </p>
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-6px); }
          40%      { transform: translateX(6px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.5s ease; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
