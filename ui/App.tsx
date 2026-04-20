
import React from 'react';
import AdvancedGenerator from './components/AdvancedGenerator';
import { Wand2 } from 'lucide-react';

const App: React.FC = () => {
  return (
    <div style={{
      height: '100vh',
      background: 'linear-gradient(135deg, #05050f 0%, #080812 50%, #05050f 100%)',
      color: '#d4d4f0',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Inter', 'Outfit', system-ui, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0,
        borderBottom: '1px solid rgba(139,92,246,0.12)',
        background: 'rgba(5,5,18,0.8)',
        backdropFilter: 'blur(12px)',
        zIndex: 50,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 14px rgba(124,58,237,0.5)',
          }}>
            <Wand2 size={15} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 13, fontWeight: 700, color: '#e2e2fa', margin: 0, lineHeight: 1 }}>
              ReImagine AI
            </h1>
            <p style={{ fontSize: 10, color: '#4a4a6a', margin: 0, marginTop: 2, letterSpacing: '0.04em' }}>
              Qwen prompt generation · FLUX image output
            </p>
          </div>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#4a4a6a' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
              animation: 'headerPulse 2s ease-in-out infinite',
              display: 'inline-block',
            }} />
            Backend · port 8100
          </div>
          <div style={{
            padding: '3px 10px', borderRadius: 20,
            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
            fontSize: 10, color: '#7c3aed', fontWeight: 600, letterSpacing: '0.08em',
          }}>
            FLUX · QWEN
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative', padding: '12px' }}>
        <AdvancedGenerator />
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;600;700&display=swap');
        @keyframes headerPulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.25); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.45); }
      `}</style>
    </div>
  );
};

export default App;
