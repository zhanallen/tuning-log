import React from 'react';
import { useStore, PARAM_CONFIGS } from '../store';
import { X, ShieldAlert, Wind, Sun, SlidersHorizontal } from 'lucide-react';

export default function HUDPanel() {
  const { activePartKey, setActivePartKey, currentParams, updateParam, currentVehicle } = useStore();

  if (!activePartKey || !currentVehicle) return null;

  // Determine category based on active part key
  const activeConfig = PARAM_CONFIGS[activePartKey];
  if (!activeConfig) return null;
  
  const category = activeConfig.category;

  // Gather parameters in the same category that are allowed for this vehicle
  const categoryParams = Object.entries(PARAM_CONFIGS)
    .filter(([key, config]) => config.category === category && currentVehicle.allowed_params.includes(key))
    .map(([key, config]) => ({ key, ...config }));

  // Headers and icons based on category
  const categoryMeta = {
    tire: {
      title: '輪胎壓力設定',
      subtitle: 'SYS: PRESSURE',
      icon: <Sun className="text-secondary" size={18} />
    },
    aero: {
      title: '空氣動力學設定',
      subtitle: 'SYS: AERODYNAMICS',
      icon: <Wind className="text-tertiary" size={18} />
    },
    suspension: {
      title: '避震懸吊系統',
      subtitle: 'SYS: SUSPENSION',
      icon: <SlidersHorizontal className="text-primary-container" size={18} />
    }
  };

  const meta = categoryMeta[category] || {
    title: '參數微調',
    subtitle: 'SYS: CONFIG',
    icon: <SlidersHorizontal className="text-primary-container" size={18} />
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 w-full h-[55%] max-h-[55%] md:top-4 md:right-4 md:left-auto md:bottom-auto md:w-80 md:h-auto md:max-h-[calc(100%-6rem)] z-45 rounded-t-2xl md:rounded-lg border-t md:border border-white/10 bg-surface-container/20 backdrop-blur-lg p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] md:shadow-[0_0_30px_rgba(255,92,0,0.25)] flex flex-col group overflow-hidden">
      
      {/* Drag handle for mobile bottom sheet */}
      <div className="md:hidden w-12 h-1 bg-white/20 rounded-full mx-auto mb-2 flex-shrink-0"></div>

      {/* Red top border glow */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary-container to-transparent hidden md:block"></div>

      {/* Close button */}
      <button 
        onClick={() => setActivePartKey(null)}
        className="absolute top-4 right-4 md:top-3 md:right-3 text-on-surface-variant hover:text-primary-container transition-colors p-1 rounded hover:bg-white/10"
      >
        <X size={14} />
      </button>

      {/* Header */}
      <header className="flex justify-between items-center mb-5 pb-2 border-b border-white/10 pr-6 flex-shrink-0">
        <h3 className="font-display text-sm font-bold text-on-surface flex items-center gap-1.5">
          {meta.icon}
          {meta.title}
        </h3>
        <span className="font-mono text-[9px] text-primary-container font-semibold tracking-wider">{meta.subtitle}</span>
      </header>

      {/* Sliders / Inputs (scrollable body; header & footer stay pinned) */}
      <div className="space-y-5 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
        {categoryParams.map((param) => {
          const isSelected = activePartKey === param.key;
          const value = currentParams[param.key] !== undefined ? currentParams[param.key] : param.default;
          
          return (
            <div 
              key={param.key} 
              className={`p-2.5 rounded border transition-all ${
                isSelected 
                  ? 'border-primary-container/50 bg-primary-container/10 shadow-[0_0_8px_rgba(255,92,0,0.15)]' 
                  : 'border-white/5 bg-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex justify-between items-center mb-2 font-mono text-xs">
                <span className={`font-semibold ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {param.name}
                </span>
                <span className="text-secondary font-bold">
                  {value}{param.unit}
                </span>
              </div>

              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={value}
                onChange={(e) => updateParam(param.key, e.target.value)}
                className="w-full"
              />

              <div className="flex justify-between mt-1 text-[9px] font-mono text-outline/50">
                <span>{param.min} {param.unit}</span>
                <span>{param.max} {param.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Panel Footer */}
      <div className="mt-6 pt-3 border-t border-white/10 flex justify-between text-[10px] font-mono text-outline/40 flex-shrink-0">
        <span>TUNING LOG AUTO-LINK</span>
        <span>READY</span>
      </div>
    </div>
  );
}
