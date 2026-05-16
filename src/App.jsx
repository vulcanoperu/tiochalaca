import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Analysis from './pages/Analysis';
import RecommendationsPage from './pages/RecommendationsPage';
import PicksPage from './pages/PicksPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import StatsPage from './pages/StatsPage';
import AdminPage from './admin/AdminPage';
import { useRoleSync } from './hooks/useRoleSync';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!sessionStorage.getItem('chalaca_token')
  );
  const [roleVersion, setRoleVersion] = useState(0);

  const location = useLocation();

  // Scroll to top on every route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const isAdminRoute = location.pathname.startsWith('/admin');
  const user = JSON.parse(sessionStorage.getItem('chalaca_user') || '{}');

  const handleRoleChange = useCallback((newRole) => {
    setRoleVersion(v => v + 1);
    if (newRole === 'vip') {
      toast.success('🎉 VIP activado', { duration: 4000 });
    }
  }, []);

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
    <div className="min-h-screen bg-grid-subtle text-slate-200 relative overflow-hidden">
      {/* ── Ambient Background Glows ── */}
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full opacity-30 mix-blend-screen pointer-events-none z-0" style={{ background: 'radial-gradient(circle, #72BF01 0%, transparent 70%)', filter: 'blur(100px)' }} />
      <div className="fixed bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full opacity-20 mix-blend-screen pointer-events-none z-0" style={{ background: 'radial-gradient(circle, #3A7817 0%, transparent 70%)', filter: 'blur(120px)' }} />
      <div className="fixed top-[40%] right-[10%] w-[30vw] h-[30vw] rounded-full opacity-[0.05] mix-blend-screen pointer-events-none z-0" style={{ background: 'radial-gradient(circle, #BFF102 0%, transparent 70%)', filter: 'blur(80px)' }} />
      
      <div className="relative z-10">
        {!isAdminRoute && <Navbar />}
        <main className={isAdminRoute ? '' : 'max-w-screen-2xl mx-auto px-6 py-8'}>
          <Routes>
            <Route path="/"               element={<Home />} />
            <Route path="/analysis/:id"   element={<Analysis />} />
            <Route path="/recomendaciones" element={<RecommendationsPage />} />
            <Route path="/picks"          element={<PicksPage />} />
            <Route path="/estadisticas"   element={<StatsPage />} />
            <Route path="/settings"       element={<SettingsPage />} />
            <Route path="/admin"          element={user.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />} />
            <Route path="*"               element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {!isAdminRoute && <Footer />}
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0a0f14',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
        }}
      />
    </div>
  );
}
