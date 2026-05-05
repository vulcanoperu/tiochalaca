import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Analysis from './pages/Analysis';
import LivePage from './pages/LivePage';
import PicksPage from './pages/PicksPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import AdminPage from './admin/AdminPage';
import { useRoleSync } from './hooks/useRoleSync';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!sessionStorage.getItem('chalaca_token')
  );
  // roleVersion es un contador que fuerza re-render cuando el rol cambia
  const [roleVersion, setRoleVersion] = useState(0);

  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  // Re-leer el user SIEMPRE fresco (se actualiza con roleVersion)
  const user = JSON.parse(sessionStorage.getItem('chalaca_user') || '{}');

  const handleRoleChange = useCallback((newRole) => {
    setRoleVersion(v => v + 1); // fuerza re-render de toda la app
    if (newRole === 'vip') {
      toast.success('🎉 ¡Tu cuenta fue activada! Bienvenido a VIP.', { duration: 5000 });
    } else if (newRole === 'pending') {
      toast('Tu suscripción ha vencido.', { icon: '⏳', duration: 5000 });
    }
  }, []);

  // Polling cada 10s para detectar cambios de rol hechos por el admin
  useRoleSync(isAuthenticated ? handleRoleChange : null);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <Toaster position="top-right" />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-grid noise-overlay relative">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 opacity-10 blur-3xl rounded-full"
          style={{ background: 'radial-gradient(circle, #00ff88 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 opacity-6 blur-3xl rounded-full"
          style={{ background: 'radial-gradient(circle, #1e90ff 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10">
        {!isAdminRoute && <Navbar />}
        <main className={isAdminRoute ? 'pb-6' : 'pb-20 md:pb-6'}>
          <Routes>
            <Route path="/"               element={<Home />} />
            <Route path="/analysis/:id"   element={<Analysis />} />
            <Route path="/live"           element={<LivePage />} />
            <Route path="/picks"          element={<PicksPage />} />
            <Route path="/settings"       element={<SettingsPage />} />
            <Route path="/admin"          element={user.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />} />
            <Route path="*"               element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#111d2c',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '13px',
            fontFamily: 'Inter,sans-serif',
          },
          success: { iconTheme: { primary: '#00ff88', secondary: '#080d12' } },
          error:   { iconTheme: { primary: '#ff4757', secondary: '#080d12' } },
        }}
      />
    </div>
  );
}
