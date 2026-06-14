import React, { useEffect, useState } from 'react';
import { useStore, getVehicleConfig, PARAM_CONFIGS, DEFAULT_VEHICLE_CONFIG } from './store';
import Auth from './components/Auth';
import Garage from './components/Garage';
import LogHistory from './components/LogHistory';
import ThreeCanvas from './components/ThreeCanvas';
import HUDPanel from './components/HUDPanel';
import CloudManager from './components/CloudManager';
import { Car, History, Wrench, LogOut, Info, Settings, ShieldAlert, Save, RefreshCw, Cloud, ChevronUp, ChevronDown } from 'lucide-react';

export default function App() {
  const { 
    isAuthenticated, 
    user, 
    logout, 
    activeView, 
    setActiveView, 
    currentVehicle, 
    fetchVehicles,
    isAdminMode,
    setAdminMode,
    updateVehicleScale,
    setTempModelScale,
    updateVehicleConfig,
    setTempModelOffset,
    setTempHotspotPosition,
    setTempLength,
    publishVehicle
  } = useStore();

  const isAdmin = user?.role === 'admin';

  const [adminTab, setAdminTab] = useState('scale'); // 'scale' | 'offset' | 'hotspots'
  const [calibratingHotspot, setCalibratingHotspot] = useState('pressure_fl');
  const [isSymmetric, setIsSymmetric] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [showStats, setShowStats] = useState(true);

  const handleSaveConfig = async () => {
    if (!currentVehicle) return;
    setIsSaving(true);
    setSaveStatus('saving');
    
    const successScale = await updateVehicleScale(currentVehicle.id, currentVehicle.model_scale, currentVehicle.length_m);
    const successConfig = await updateVehicleConfig(currentVehicle.id, currentVehicle.config);
    
    setIsSaving(false);
    if (successScale && successConfig) {
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(''), 3000);
    } else {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const handleResetCalibration = () => {
    if (!currentVehicle) return;
    setTempModelScale(1.0);
    setTempModelOffset(DEFAULT_VEHICLE_CONFIG.modelOffset);
    Object.entries(DEFAULT_VEHICLE_CONFIG.hotspots).forEach(([key, pos]) => {
      setTempHotspotPosition(key, pos);
    });
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchVehicles();
    }
  }, [isAuthenticated, fetchVehicles]);

  // Clean up guest data immediately on tab/window close
  useEffect(() => {
    const handleUnload = () => {
      if (user && user.email && user.email.startsWith('guest_')) {
        fetch('/api/v1/auth/guest-cleanup', {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [user]);

  if (!isAuthenticated) {
    return <Auth />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-on-background select-none overflow-hidden font-body">
      
      {/* Top Navigation Bar */}
      <header className="flex-shrink-0 z-50 border-b border-outline-variant/30 bg-background/90 backdrop-blur-md">
        <div className="flex justify-between items-center h-16 px-6 w-full">
          
          <div className="flex items-center gap-8">
            {/* Branding */}
            <div 
              onClick={() => setActiveView('tuning')}
              className="font-display text-xl font-bold text-primary tracking-tighter cursor-pointer flex items-center gap-2"
            >
              <span>Tun<span className="text-primary-container">ing log</span></span>
              <span className="text-on-surface text-sm font-semibold border-l border-outline-variant/30 pl-2">調車日誌</span>
            </div>
            
            {/* Nav Menu */}
            <nav className="hidden md:flex gap-6 items-center">
              <button 
                onClick={() => setActiveView('garage')}
                className={`flex items-center gap-1.5 font-display text-sm font-medium transition-all py-1 border-b-2 ${
                  activeView === 'garage' 
                    ? 'text-primary border-primary' 
                    : 'text-on-surface-variant border-transparent hover:text-primary'
                }`}
              >
                <Car size={15} />
                車庫管理
              </button>
              <button 
                onClick={() => setActiveView('tuning')}
                className={`flex items-center gap-1.5 font-display text-sm font-medium transition-all py-1 border-b-2 ${
                  activeView === 'tuning' 
                    ? 'text-primary border-primary' 
                    : 'text-on-surface-variant border-transparent hover:text-primary'
                }`}
              >
                <Wrench size={15} />
                底盤調校
              </button>
              <button 
                onClick={() => setActiveView('logs')}
                className={`flex items-center gap-1.5 font-display text-sm font-medium transition-all py-1 border-b-2 ${
                  activeView === 'logs' 
                    ? 'text-primary border-primary' 
                    : 'text-on-surface-variant border-transparent hover:text-primary'
                }`}
              >
                <History size={15} />
                調校日誌
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveView('cloud')}
                  className={`flex items-center gap-1.5 font-display text-sm font-medium transition-all py-1 border-b-2 ${
                    activeView === 'cloud'
                      ? 'text-secondary-container border-secondary-container'
                      : 'text-on-surface-variant border-transparent hover:text-secondary-container'
                  }`}
                >
                  <Cloud size={15} />
                  雲端車輛
                </button>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Engineering Admin Mode Toggle (admins only) */}
            {user && isAdmin && (
              <button
                onClick={() => setAdminMode(!isAdminMode)}
                className={`flex items-center gap-1.5 font-display text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-all ${
                  isAdminMode 
                    ? 'bg-secondary-container/20 border-secondary-container text-secondary-container shadow-[0_0_10px_rgba(0,227,253,0.3)]' 
                    : 'border-outline-variant/40 text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
                }`}
                title="工程管理員模式"
              >
                <ShieldAlert size={14} className={isAdminMode ? 'animate-pulse' : ''} />
                <span className="hidden sm:inline">工程管理員</span>
              </button>
            )}

            {/* User Profile and Sign Out */}
            {user && (
              <div className="flex items-center gap-2 sm:gap-3 bg-surface-container/60 border border-outline-variant/20 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-full font-mono text-xs">
                <span className="text-outline hidden sm:inline">DRV:</span>
                <span className="text-on-surface font-semibold max-w-[70px] sm:max-w-[100px] truncate" title={user.displayName}>
                  {user.displayName}
                </span>
                <button
                  onClick={logout}
                  className="text-outline/70 hover:text-error transition-colors ml-1"
                  title="登出帳號"
                >
                  <LogOut size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {activeView === 'garage' && <Garage />}
        {activeView === 'logs' && <LogHistory />}
        {activeView === 'cloud' && isAdmin && <CloudManager />}

        {activeView === 'tuning' && (
          <div className="flex-1 flex flex-col p-6 overflow-hidden h-full max-w-container-max mx-auto w-full">
            
            {/* Interactive 3D Model Schematic Window */}
            <div className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-lg relative overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              {/* Neon border highlight */}
              <div className="absolute top-0 left-0 w-full h-[1px] bg-primary-container/60 shadow-[0_0_10px_#ff5c00] z-10"></div>
              
              {currentVehicle ? (
                <>
                  <div className="absolute top-4 left-4 z-10 font-mono text-[10px] text-outline bg-background/80 px-2.5 py-1 rounded border border-outline-variant/20 uppercase">
                    模型: {currentVehicle.name}
                  </div>

                  {/* Floating Glassmorphism Stat Cards */}
                  <div 
                    className={`absolute z-30 bg-surface-container/20 backdrop-blur-lg border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] transition-all duration-500 ease-out flex items-center justify-center overflow-hidden select-none ${
                      showStats 
                        ? 'top-14 right-4 w-[calc(100%-2rem)] sm:w-[320px] md:w-[400px] h-14 md:h-16 rounded-xl p-1.5 md:top-4' 
                        : 'top-4 right-4 w-9 h-9 rounded-full p-0 cursor-pointer hover:bg-white/10 text-outline hover:text-on-surface'
                    }`}
                    onClick={() => {
                      if (!showStats) setShowStats(true);
                    }}
                    title={!showStats ? "顯示規格數據" : undefined}
                  >
                    {/* Stats Content - Fades out and scales down when collapsed */}
                    <div className={`flex items-center gap-2 w-full h-full transition-all duration-300 ${
                      showStats ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none absolute'
                    }`}>
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        {/* HP Stat */}
                        <div className="bg-background/25 border border-white/5 rounded-lg p-1.5 md:p-2 text-center relative overflow-hidden">
                          <div className="font-mono text-[7px] sm:text-[8px] md:text-[9px] text-outline uppercase truncate">馬力 / HP</div>
                          <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                            <span className="font-display text-xs sm:text-base md:text-lg font-bold text-on-surface">
                              {currentVehicle ? currentVehicle.horsepower_hp : '---'}
                            </span>
                            <span className="font-display text-[8px] sm:text-[9px] md:text-[10px] text-primary font-bold">HP</span>
                          </div>
                        </div>

                        {/* Torque Stat */}
                        <div className="bg-background/25 border border-white/5 rounded-lg p-1.5 md:p-2 text-center relative overflow-hidden">
                          <div className="font-mono text-[7px] sm:text-[8px] md:text-[9px] text-outline uppercase truncate">扭力 / TQ</div>
                          <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                            <span className="font-display text-xs sm:text-base md:text-lg font-bold text-on-surface">
                              {currentVehicle ? currentVehicle.torque_nm : '---'}
                            </span>
                            <span className="font-display text-[8px] sm:text-[9px] md:text-[10px] text-secondary font-bold">Nm</span>
                          </div>
                        </div>

                        {/* Weight Stat */}
                        <div className="bg-background/25 border border-white/5 rounded-lg p-1.5 md:p-2 text-center relative overflow-hidden">
                          <div className="font-mono text-[7px] sm:text-[8px] md:text-[9px] text-outline uppercase truncate">車重 / WT</div>
                          <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                            <span className="font-display text-xs sm:text-base md:text-lg font-bold text-on-surface">
                              {currentVehicle ? currentVehicle.weight_kg : '---'}
                            </span>
                            <span className="font-display text-[8px] sm:text-[9px] md:text-[10px] text-tertiary font-bold">kg</span>
                          </div>
                        </div>
                      </div>

                      {/* Collapse button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowStats(false);
                        }}
                        className="p-1 hover:bg-white/10 rounded-lg text-outline hover:text-on-surface transition-colors flex-shrink-0"
                        title="收合數據"
                      >
                        <ChevronUp size={15} />
                      </button>
                    </div>

                    {/* Small Icon when collapsed - Fades in and scales up when collapsed */}
                    <div className={`flex items-center justify-center w-full h-full transition-all duration-300 ${
                      !showStats ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-75 pointer-events-none absolute'
                    }`}>
                      <Info size={16} />
                    </div>
                  </div>

                  {/* Engineering Admin Control Panel */}
                  {isAdminMode && isAdmin && (
                    <div className="absolute bottom-0 left-0 right-0 w-full h-[55%] max-h-[55%] md:top-14 md:left-4 md:right-auto md:bottom-auto md:w-80 md:h-auto md:max-h-[calc(100%-8rem)] z-40 rounded-t-2xl md:rounded-lg border-t md:border border-secondary-container/60 bg-background/95 backdrop-blur-xl p-4 shadow-[0_-4px_30px_rgba(0,0,0,0.5)] md:shadow-[0_0_25px_rgba(0,227,253,0.2)] flex flex-col overflow-hidden transition-all duration-300">
                      {/* Drag handle for mobile bottom sheet */}
                      <div className="md:hidden w-12 h-1 bg-outline-variant/40 rounded-full mx-auto mb-2 flex-shrink-0"></div>
                      
                      {/* Cyan top indicator bar */}
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-secondary-container to-transparent hidden md:block"></div>
                      
                      <header className="flex justify-between items-center mb-3 pb-1.5 border-b border-outline-variant/30 flex-shrink-0">
                        <h4 className="font-display text-xs font-bold text-on-surface flex items-center gap-1.5">
                          <ShieldAlert className="text-secondary-container animate-pulse" size={14} />
                          工程管理員校準台
                        </h4>
                        <span className="font-mono text-[8px] bg-secondary-container/20 text-secondary-container px-1.5 py-0.5 rounded font-bold">
                          CALIBRATOR
                        </span>
                      </header>

                      {/* Admin Tab Selector */}
                      <div className="flex border-b border-outline-variant/20 mb-3.5 text-[10px] font-display font-bold flex-shrink-0">
                        <button
                          onClick={() => setAdminTab('scale')}
                          className={`flex-1 pb-1.5 text-center border-b ${adminTab === 'scale' ? 'text-secondary-container border-secondary-container' : 'text-outline/60 border-transparent hover:text-outline'}`}
                        >
                          比例
                        </button>
                        <button
                          onClick={() => setAdminTab('offset')}
                          className={`flex-1 pb-1.5 text-center border-b ${adminTab === 'offset' ? 'text-secondary-container border-secondary-container' : 'text-outline/60 border-transparent hover:text-outline'}`}
                        >
                          中心位移
                        </button>
                        <button
                          onClick={() => setAdminTab('hotspots')}
                          className={`flex-1 pb-1.5 text-center border-b ${adminTab === 'hotspots' ? 'text-secondary-container border-secondary-container' : 'text-outline/60 border-transparent hover:text-outline'}`}
                        >
                          熱點標定
                        </button>
                      </div>

                      {/* Tab Contents (scrolls; header/tabs above and footer below stay pinned) */}
                      <div className="space-y-3.5 flex-1 min-h-0 overflow-y-auto pr-1.5">
                        
                        {/* Tab 1: Scale */}
                        {adminTab === 'scale' && (
                          <div className="space-y-3.5">
                            {/* Real-world length → auto-scale */}
                            <div className="bg-secondary-container/5 border border-secondary-container/20 p-2.5 rounded space-y-2">
                              <p className="text-[10px] text-outline leading-relaxed">
                                輸入車輛的<span className="text-secondary-container font-bold">真實車長 (公尺)</span>，系統會自動把模型縮放到該長度。
                              </p>
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] font-mono text-outline whitespace-nowrap">車長 (m)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.3"
                                  max="30"
                                  placeholder="例如 4.56"
                                  value={currentVehicle.length_m ?? ''}
                                  onChange={(e) => setTempLength(e.target.value)}
                                  className="flex-1 bg-surface border border-outline-variant/30 px-2 py-1 rounded text-center text-[11px] text-on-surface focus:outline-none focus:border-secondary-container font-mono"
                                />
                              </div>
                            </div>

                            <p className="text-[10px] text-outline leading-relaxed">
                              比例為車長之上的微調乘數，基準 1.0x。
                            </p>
                            <div>
                              <div className="flex justify-between items-center mb-1 font-mono text-[11px]">
                                <span className="text-outline">縮放比例</span>
                                <span className="text-secondary-container font-bold">
                                  {(currentVehicle.model_scale !== undefined ? currentVehicle.model_scale : 1.0).toFixed(2)}x
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.1"
                                max="20.0"
                                step="0.05"
                                value={currentVehicle.model_scale !== undefined ? currentVehicle.model_scale : 1.0}
                                onChange={(e) => setTempModelScale(e.target.value)}
                                className="w-full accent-secondary-container bg-surface-container border border-outline-variant/20 rounded-md cursor-pointer"
                              />
                              <div className="flex justify-between mt-1 text-[8px] font-mono text-outline/50">
                                <span>0.1x (極小)</span>
                                <span>1.0x (預設)</span>
                                <span>20.0x (極大)</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Tab 2: Offset */}
                        {adminTab === 'offset' && (() => {
                          const conf = getVehicleConfig(currentVehicle);
                          const [ox, oy, oz] = conf.modelOffset;
                          return (
                            <div className="space-y-3.5">
                              <p className="text-[10px] text-outline leading-relaxed">
                                位移 3D 模型的中心位置，以對齊世界原點與底盤中心線。
                              </p>

                              {/* Reset Offset Button */}
                              <div className="flex justify-between items-center bg-secondary-container/5 border border-secondary-container/20 p-2 rounded mb-1">
                                <span className="text-[10px] text-outline font-semibold">校對基準中心線</span>
                                <button
                                  onClick={() => setTempModelOffset([0, 0, 0])}
                                  className="bg-secondary-container/20 border border-secondary-container text-secondary-container hover:bg-secondary-container/30 px-2.5 py-1 rounded text-[9px] font-bold font-mono transition-colors"
                                >
                                  一鍵計算幾何中心
                                </button>
                              </div>
                              
                              {/* Offset X */}
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center font-mono text-[10px]">
                                  <span className="text-outline">左右位移 (X 軸)</span>
                                  <span className="text-secondary-container font-bold">{ox.toFixed(3)}m</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setTempModelOffset([ox - 0.001, oy, oz])}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="減少 1mm"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="range"
                                    min="-3.0"
                                    max="3.0"
                                    step="0.001"
                                    value={ox}
                                    onChange={(e) => setTempModelOffset([parseFloat(e.target.value) || 0, oy, oz])}
                                    className="flex-1 accent-secondary-container cursor-pointer h-1"
                                  />
                                  <button
                                    onClick={() => setTempModelOffset([ox + 0.001, oy, oz])}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="增加 1mm"
                                  >
                                    +
                                  </button>
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={isNaN(ox) ? '' : Number(ox.toFixed(3))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setTempModelOffset([isNaN(val) ? 0 : val, oy, oz]);
                                    }}
                                    className="w-16 bg-surface border border-outline-variant/30 px-1 py-0.5 rounded text-center text-[10px] text-on-surface focus:outline-none focus:border-secondary-container font-mono"
                                  />
                                </div>
                              </div>

                              {/* Offset Y */}
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center font-mono text-[10px]">
                                  <span className="text-outline">高低位移 (Y 軸)</span>
                                  <span className="text-secondary-container font-bold">{oy.toFixed(3)}m</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setTempModelOffset([ox, oy - 0.001, oz])}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="減少 1mm"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="range"
                                    min="-3.0"
                                    max="3.0"
                                    step="0.001"
                                    value={oy}
                                    onChange={(e) => setTempModelOffset([ox, parseFloat(e.target.value) || 0, oz])}
                                    className="flex-1 accent-secondary-container cursor-pointer h-1"
                                  />
                                  <button
                                    onClick={() => setTempModelOffset([ox, oy + 0.001, oz])}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="增加 1mm"
                                  >
                                    +
                                  </button>
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={isNaN(oy) ? '' : Number(oy.toFixed(3))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setTempModelOffset([ox, isNaN(val) ? 0 : val, oz]);
                                    }}
                                    className="w-16 bg-surface border border-outline-variant/30 px-1 py-0.5 rounded text-center text-[10px] text-on-surface focus:outline-none focus:border-secondary-container font-mono"
                                  />
                                </div>
                              </div>

                              {/* Offset Z */}
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center font-mono text-[10px]">
                                  <span className="text-outline">前後位移 (Z 軸)</span>
                                  <span className="text-secondary-container font-bold">{oz.toFixed(3)}m</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setTempModelOffset([ox, oy, oz - 0.001])}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="減少 1mm"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="range"
                                    min="-3.5"
                                    max="3.5"
                                    step="0.001"
                                    value={oz}
                                    onChange={(e) => setTempModelOffset([ox, oy, parseFloat(e.target.value) || 0])}
                                    className="flex-1 accent-secondary-container cursor-pointer h-1"
                                  />
                                  <button
                                    onClick={() => setTempModelOffset([ox, oy, oz + 0.001])}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="增加 1mm"
                                  >
                                    +
                                  </button>
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={isNaN(oz) ? '' : Number(oz.toFixed(3))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setTempModelOffset([ox, oy, isNaN(val) ? 0 : val]);
                                    }}
                                    className="w-16 bg-surface border border-outline-variant/30 px-1 py-0.5 rounded text-center text-[10px] text-on-surface focus:outline-none focus:border-secondary-container font-mono"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })()}                          {/* Tab 3: Hotspots */}
                        {adminTab === 'hotspots' && (() => {
                          const conf = getVehicleConfig(currentVehicle);
                          
                          // Filter list of allowed parameters to show in calibrate select
                          const allowed = Object.entries(PARAM_CONFIGS)
                            .filter(([key]) => currentVehicle.allowed_params.includes(key));
                          
                          // Get active calibrating hotspot coordinate
                          const activeKey = calibratingHotspot;
                          const pos = conf.hotspots[activeKey] || [0, 0, 0];
                          const [hx, hy, hz] = pos;

                          return (
                            <div className="space-y-3.5">
                              <div>
                                <label className="block text-[9px] font-mono text-outline mb-1">選擇欲標定的熱點部位:</label>
                                <select
                                  value={activeKey}
                                  onChange={(e) => setCalibratingHotspot(e.target.value)}
                                  className="w-full bg-surface border border-outline-variant/30 p-1.5 rounded text-[11px] text-on-surface focus:outline-none"
                                >
                                  {allowed.map(([key, item]) => (
                                    <option key={key} value={key}>{item.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Symmetric Checkbox */}
                              <div className="flex items-center gap-2 py-1 bg-surface-container/30 border border-outline-variant/10 rounded px-2.5">
                                <input
                                  type="checkbox"
                                  id="symmetricEditCheckbox"
                                  checked={isSymmetric}
                                  onChange={(e) => setIsSymmetric(e.target.checked)}
                                  className="accent-secondary-container cursor-pointer w-3.5 h-3.5 rounded"
                                />
                                <label 
                                  htmlFor="symmetricEditCheckbox" 
                                  className="text-[10px] font-display font-semibold text-outline hover:text-on-surface cursor-pointer select-none"
                                >
                                  對稱編輯 (自動鏡像左右兩側)
                                </label>
                              </div>

                              {/* Hotspot X */}
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center font-mono text-[10px]">
                                  <span className="text-outline">熱點 X 軸 (左右)</span>
                                  <span className="text-secondary-container font-bold">{hx.toFixed(3)}m</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setTempHotspotPosition(activeKey, [hx - 0.001, hy, hz], isSymmetric)}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="減少 1mm"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="range"
                                    min="-2.0"
                                    max="2.0"
                                    step="0.001"
                                    value={hx}
                                    onChange={(e) => setTempHotspotPosition(activeKey, [parseFloat(e.target.value) || 0, hy, hz], isSymmetric)}
                                    className="flex-1 accent-secondary-container cursor-pointer h-1"
                                  />
                                  <button
                                    onClick={() => setTempHotspotPosition(activeKey, [hx + 0.001, hy, hz], isSymmetric)}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="增加 1mm"
                                  >
                                    +
                                  </button>
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={isNaN(hx) ? '' : Number(hx.toFixed(3))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setTempHotspotPosition(activeKey, [isNaN(val) ? 0 : val, hy, hz], isSymmetric);
                                    }}
                                    className="w-16 bg-surface border border-outline-variant/30 px-1 py-0.5 rounded text-center text-[10px] text-on-surface focus:outline-none focus:border-secondary-container font-mono"
                                  />
                                </div>
                              </div>

                              {/* Hotspot Y */}
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center font-mono text-[10px]">
                                  <span className="text-outline">熱點 Y 軸 (高低)</span>
                                  <span className="text-secondary-container font-bold">{hy.toFixed(3)}m</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setTempHotspotPosition(activeKey, [hx, hy - 0.001, hz], isSymmetric)}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="減少 1mm"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="range"
                                    min="-1.0"
                                    max="2.5"
                                    step="0.001"
                                    value={hy}
                                    onChange={(e) => setTempHotspotPosition(activeKey, [hx, parseFloat(e.target.value) || 0, hz], isSymmetric)}
                                    className="flex-1 accent-secondary-container cursor-pointer h-1"
                                  />
                                  <button
                                    onClick={() => setTempHotspotPosition(activeKey, [hx, hy + 0.001, hz], isSymmetric)}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="增加 1mm"
                                  >
                                    +
                                  </button>
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={isNaN(hy) ? '' : Number(hy.toFixed(3))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setTempHotspotPosition(activeKey, [hx, isNaN(val) ? 0 : val, hz], isSymmetric);
                                    }}
                                    className="w-16 bg-surface border border-outline-variant/30 px-1 py-0.5 rounded text-center text-[10px] text-on-surface focus:outline-none focus:border-secondary-container font-mono"
                                  />
                                </div>
                              </div>

                              {/* Hotspot Z */}
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center font-mono text-[10px]">
                                  <span className="text-outline">熱點 Z 軸 (前後)</span>
                                  <span className="text-secondary-container font-bold">{hz.toFixed(3)}m</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setTempHotspotPosition(activeKey, [hx, hy, hz - 0.001], isSymmetric)}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="減少 1mm"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="range"
                                    min="-3.5"
                                    max="3.5"
                                    step="0.001"
                                    value={hz}
                                    onChange={(e) => setTempHotspotPosition(activeKey, [hx, hy, parseFloat(e.target.value) || 0], isSymmetric)}
                                    className="flex-1 accent-secondary-container cursor-pointer h-1"
                                  />
                                  <button
                                    onClick={() => setTempHotspotPosition(activeKey, [hx, hy, hz + 0.001], isSymmetric)}
                                    className="bg-surface-container border border-outline-variant/30 hover:border-outline hover:text-on-surface text-outline/80 font-mono text-[10px] w-6 h-6 flex items-center justify-center rounded transition-colors"
                                    title="增加 1mm"
                                  >
                                    +
                                  </button>
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={isNaN(hz) ? '' : Number(hz.toFixed(3))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setTempHotspotPosition(activeKey, [hx, hy, isNaN(val) ? 0 : val], isSymmetric);
                                    }}
                                    className="w-16 bg-surface border border-outline-variant/30 px-1 py-0.5 rounded text-center text-[10px] text-on-surface focus:outline-none focus:border-secondary-container font-mono"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Footer Actions */}
                      <div className="mt-4 pt-3 border-t border-outline-variant/20 flex flex-col gap-2.5 flex-shrink-0">
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveConfig}
                            disabled={isSaving}
                            className="flex-1 bg-secondary-container text-on-secondary font-display text-[10px] font-bold py-2 px-3 rounded hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1 shadow-[0_0_10px_rgba(0,227,253,0.2)] disabled:opacity-50"
                          >
                            {isSaving ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : (
                              <Save size={11} />
                            )}
                            寫入後端資料庫
                          </button>
                          <button
                            onClick={handleResetCalibration}
                            className="bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-display text-[10px] font-semibold py-2 px-2.5 rounded transition-colors"
                            title="重設為預設配置"
                          >
                            重設
                          </button>
                        </div>

                        {/* Publish toggle — make this vehicle visible in the shared catalog */}
                        <button
                          onClick={() => publishVehicle(currentVehicle.id, !currentVehicle.is_published)}
                          className={`w-full font-display text-[10px] font-bold py-2 px-3 rounded transition-all flex items-center justify-center gap-1.5 ${
                            currentVehicle.is_published
                              ? 'bg-tertiary/15 border border-tertiary/40 text-tertiary hover:bg-tertiary/25'
                              : 'bg-primary-container text-white hover:opacity-90 shadow-[0_0_10px_rgba(255,92,0,0.25)]'
                          }`}
                          title="切換此車型是否出現在公開目錄"
                        >
                          {currentVehicle.is_published ? (
                            <>● 已發布（點擊取消發布）</>
                          ) : (
                            <>發布到公開目錄</>
                          )}
                        </button>

                        {/* Save status message */}
                        {saveStatus === 'success' && (
                          <div className="text-[10px] font-mono text-tertiary bg-tertiary/10 border border-tertiary/30 py-1.5 px-2.5 rounded flex items-center gap-1.5 animate-fadeIn">
                            <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                            已成功將校準設定寫入後端！
                          </div>
                        )}
                        {saveStatus === 'error' && (
                          <div className="text-[10px] font-mono text-error bg-error/10 border border-error/30 py-1.5 px-2.5 rounded flex items-center gap-1.5 animate-fadeIn">
                            <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                            寫入失敗，請檢查網路連線。
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* WebGL Canvas */}
                  <ThreeCanvas />
                  
                  {/* Floating HUD Panel */}
                  <HUDPanel />
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center space-y-4 text-on-surface-variant font-mono text-sm">
                  <Car size={36} className="text-outline/40 animate-bounce" />
                  <div>車庫內尚無選擇的車型</div>
                  <button
                    onClick={() => setActiveView('garage')}
                    className="bg-primary-container text-white px-4 py-2 rounded text-xs font-bold font-display"
                  >
                    前往車庫管理
                  </button>
                </div>
              )}

              {/* Floating action bar — overlays the bottom of the 3D preview so it
                  no longer takes a layout row (removes the blank area below) and
                  doesn't crowd the side HUD panels. */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-sm sm:max-w-md">
                <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-2 bg-background/80 backdrop-blur-xl border border-primary-container/40 p-1 sm:p-1.5 rounded-full shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                  <button
                    onClick={() => {
                      if (currentVehicle) setActiveView('logs');
                    }}
                    className="bg-primary-container text-white font-display text-[11px] sm:text-xs font-bold px-4 py-2 sm:px-6 sm:py-2.5 rounded-full hover:bg-primary-container/80 transition-all shadow-[0_0_15px_rgba(255,92,0,0.3)] truncate flex-1 sm:flex-none text-center"
                  >
                    儲存當前設定
                  </button>
                  <div className="w-px h-5 bg-outline-variant/30 mx-1 sm:mx-2"></div>

                  <button
                    onClick={() => setActiveView('garage')}
                    className="flex items-center justify-center gap-1 sm:gap-1.5 text-on-surface-variant font-display text-[11px] sm:text-xs font-semibold px-2.5 py-2 hover:text-primary-container transition-colors rounded-full"
                  >
                    <Car size={13} />
                    <span>車庫</span>
                  </button>

                  <button
                    onClick={() => alert('已連線 3D 底盤診斷系統: 狀態良好')}
                    className="flex items-center justify-center gap-1 sm:gap-1.5 text-on-surface-variant font-display text-[11px] sm:text-xs font-semibold px-2.5 py-2 hover:text-primary-container transition-colors rounded-full"
                  >
                    <Settings size={13} />
                    <span><span className="hidden sm:inline">底盤</span>診斷</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile view helper */}
      <footer className="md:hidden flex-shrink-0 bg-surface-container border-t border-outline-variant/30 h-16 flex items-center justify-around z-50">
        <button 
          onClick={() => setActiveView('garage')}
          className={`flex flex-col items-center justify-center gap-1 text-[10px] font-mono w-full h-full ${activeView === 'garage' ? 'text-primary' : 'text-outline'}`}
        >
          <Car size={18} />
          車庫
        </button>
        <button 
          onClick={() => setActiveView('tuning')}
          className={`flex flex-col items-center justify-center gap-1 text-[10px] font-mono w-full h-full ${activeView === 'tuning' ? 'text-primary' : 'text-outline'}`}
        >
          <Wrench size={18} />
          調校
        </button>
        <button 
          onClick={() => setActiveView('logs')}
          className={`flex flex-col items-center justify-center gap-1 text-[10px] font-mono w-full h-full ${activeView === 'logs' ? 'text-primary' : 'text-outline'}`}
        >
          <History size={18} />
          日誌
        </button>
        {isAdmin && (
          <button 
            onClick={() => setActiveView('cloud')}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-mono w-full h-full ${activeView === 'cloud' ? 'text-secondary-container' : 'text-outline'}`}
          >
            <Cloud size={18} />
            雲端
          </button>
        )}
      </footer>
    </div>
  );
}
