import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Analysis from './pages/Analysis';
import LivePage from './pages/LivePage';
import PicksPage from './pages/PicksPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
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
        <Navbar />
        <main className="pb-20 md:pb-6">
          <Routes>
            <Route path="/"                    element={<Home />} />
            <Route path="/analysis/:id"        element={<Analysis />} />
            <Route path="/live"                element={<LivePage />} />
            <Route path="/picks"               element={<PicksPage />} />
            <Route path="/settings"            element={<SettingsPage />} />
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
