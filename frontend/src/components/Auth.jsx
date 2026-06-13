import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { ShieldAlert, Compass, Play } from 'lucide-react';

export default function Auth() {
  const { loginWithGoogle, loginDeveloper, authError, isLoading } = useStore();
  const [devEmail, setDevEmail] = useState('driver@tuninglog.local');
  const [devName, setDevName] = useState('Speedy Driver');
  const [showDevForm, setShowDevForm] = useState(false);

  useEffect(() => {
    // Check if Google GIS script is ready
    const initGoogleBtn = () => {
      if (window.google) {
        // Client ID comes from build-time env (VITE_GOOGLE_CLIENT_ID, fed by the
        // GOOGLE_CLIENT_ID in the root .env). Must be a real OAuth Web client whose
        // "Authorized JavaScript origins" include this app's origin (https://localhost:8443).
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id.apps.googleusercontent.com';
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            loginWithGoogle(response.credential);
          }
        });
        window.google.accounts.id.renderButton(
          document.getElementById("google-signin-btn"),
          { theme: "filled_black", size: "large", shape: "rectangular", width: "320" }
        );
      } else {
        // Retry if not yet loaded
        setTimeout(initGoogleBtn, 300);
      }
    };
    initGoogleBtn();
  }, [loginWithGoogle]);

  const handleDevSubmit = (e) => {
    e.preventDefault();
    loginDeveloper(devEmail, devName);
  };

  return (
    <div 
      className="relative flex items-center justify-center w-full h-screen bg-background"
      style={{
        backgroundImage: 'radial-gradient(circle at center, #1e2022 0%, #0c0e10 100%)'
      }}
    >
      {/* Schematic grid background */}
      <div 
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      ></div>

      <div className="z-10 w-full max-w-md p-8 rounded-lg glass-panel relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary-container to-transparent shadow-[0_0_10px_#ff5c00]"></div>
        
        {/* Neon decorative background glow */}
        <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary-container/10 blur-3xl group-hover:bg-primary-container/15 transition-all"></div>
        <div className="absolute -left-20 -bottom-20 w-40 h-40 rounded-full bg-secondary-container/5 blur-3xl"></div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold tracking-tight text-on-surface">
            Tun<span className="text-primary-container">ing log</span>
          </h1>
          <p className="mt-2 text-sm font-mono text-outline uppercase tracking-widest">[ 車輛底盤調校與日誌系統 ]</p>
        </div>

        {authError && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded bg-error-container/30 border border-error/20 text-error text-sm font-mono">
            <ShieldAlert size={20} className="flex-shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* Auth Interface */}
        <div className="space-y-6 flex flex-col items-center">
          <div className="w-full">
            <p className="text-center text-xs text-on-surface-variant font-mono mb-4">使用驗證管道登入</p>
            <div className="flex justify-center w-full min-h-[44px]">
              <div id="google-signin-btn" className="w-full max-w-[320px]"></div>
            </div>
          </div>

          <div className="relative w-full flex items-center justify-center my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant/30"></div>
            </div>
            <span className="relative px-3 bg-surface text-xs font-mono text-outline uppercase">或</span>
          </div>

          {/* Developer Mode Toggle */}
          {!showDevForm ? (
            <button
              onClick={() => setShowDevForm(true)}
              className="w-full max-w-[320px] py-3 px-6 bg-surface-container hover:bg-surface-container-high border border-outline-variant/50 text-secondary font-display font-medium text-sm rounded transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <Compass size={16} />
              測試環境訪客登入 (Bypass)
            </button>
          ) : (
            <form onSubmit={handleDevSubmit} className="w-full space-y-4 max-w-[320px]">
              <div className="text-xs text-on-surface-variant text-center font-mono">測試帳號設定</div>
              <div>
                <label className="block text-xs font-mono text-outline mb-1">駕駛員姓名</label>
                <input
                  type="text"
                  required
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  className="w-full bg-surface border border-outline-variant/50 focus:border-primary-container p-2 rounded text-sm text-on-surface focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-outline mb-1">電子信箱</label>
                <input
                  type="email"
                  required
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  className="w-full bg-surface border border-outline-variant/50 focus:border-primary-container p-2 rounded text-sm text-on-surface focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDevForm(false)}
                  className="w-1/3 py-2 border border-outline-variant/50 text-xs text-on-surface-variant hover:bg-surface-container rounded"
                >
                  返回
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-2/3 py-2 bg-primary-container text-white text-xs font-bold font-display rounded hover:bg-primary-container/80 transition-all flex items-center justify-center gap-1 shadow-[0_0_15px_rgba(255,92,0,0.3)]"
                >
                  <Play size={12} fill="white" />
                  進入工作區
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-[10px] font-mono text-outline/50">
          POWERED BY DEEPMIND ANTIGRAVITY v2.0
        </div>
      </div>
    </div>
  );
}
