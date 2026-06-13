import React, { useState, useRef } from 'react';
import { useStore, PARAM_CONFIGS } from '../store';
import { History, FileDown, FileUp, Play, Trash2, Calendar, Clipboard, CheckCircle, AlertCircle, X } from 'lucide-react';
import { TRACKS_PRESET } from '../constants/tracksPreset';

export default function LogHistory() {
  const { currentVehicle, logs, saveLog, deleteLog, applySetup, exportBackup, importBackup } = useStore();
  
  // Log creation states
  const [lapTime, setLapTime] = useState('');
  const [notes, setNotes] = useState('');
  const [trackName, setTrackName] = useState('');
  const [trackLayout, setTrackLayout] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [validationError, setValidationError] = useState(false);
  const fileInputRef = useRef(null);

  // Filtering states
  const [selectedTrack, setSelectedTrack] = useState('all');
  const [selectedLayout, setSelectedLayout] = useState('all');

  // Preset Modal states
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [activePresetCountry, setActivePresetCountry] = useState('台灣 🇹🇼');

  // Parse and normalize flexible input format (e.g., 1:23.493 or 23.49 -> 01:23.493 or 00:23.490)
  const parseAndNormalizeLapTime = (timeStr) => {
    if (!timeStr) return null;
    const trimmed = timeStr.trim();
    const regex = /^(?:(\d+):)?(\d+)(?:\.(\d+))?$/;
    const match = trimmed.match(regex);
    if (!match) return null;

    let mins = match[1] ? parseInt(match[1], 10) : 0;
    let secs = parseInt(match[2], 10);
    let msStr = match[3] || '000';

    if (secs >= 60) {
      mins += Math.floor(secs / 60);
      secs = secs % 60;
    }

    if (mins > 59) return null;

    const minsFormatted = String(mins).padStart(2, '0');
    const secsFormatted = String(secs).padStart(2, '0');
    const msFormatted = msStr.padEnd(3, '0').slice(0, 3);

    return `${minsFormatted}:${secsFormatted}.${msFormatted}`;
  };

  const validateLapTime = (timeStr) => {
    return parseAndNormalizeLapTime(timeStr) !== null;
  };

  const handleLapTimeChange = (e) => {
    const val = e.target.value;
    setLapTime(val);
    if (val && !validateLapTime(val)) {
      setValidationError(true);
    } else {
      setValidationError(false);
    }
  };

  const handleLapTimeBlur = () => {
    const normalized = parseAndNormalizeLapTime(lapTime);
    if (normalized) {
      setLapTime(normalized);
      setValidationError(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const normalized = parseAndNormalizeLapTime(lapTime);
    if (!normalized) {
      setErrorMsg('單圈時間格式不正確！可輸入 分:秒.毫秒 (例如: 1:23.493 或 01:23.493)');
      return;
    }

    try {
      const success = await saveLog(normalized, notes, trackName, trackLayout);
      if (success) {
        setSuccessMsg('日誌儲存成功！');
        setLapTime('');
        setNotes('');
        setTrackName('');
        setTrackLayout('');
        setValidationError(false);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      setErrorMsg(err.message || '儲存失敗，請重試。');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setErrorMsg('');
    setSuccessMsg('');
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        const success = await importBackup(json);
        if (success) {
          setSuccessMsg('備份設定匯入並合併成功！');
          if (fileInputRef.current) fileInputRef.current.value = '';
          setTimeout(() => setSuccessMsg(''), 3000);
        }
      } catch (err) {
        setErrorMsg('匯入失敗：' + (err.message || '檔案格式不正確'));
      }
    };
    reader.readAsText(file);
  };

  const handleTrackFilterChange = (track) => {
    setSelectedTrack(track);
    setSelectedLayout('all');
  };

  if (!currentVehicle) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 text-on-surface-variant font-mono text-sm">
        請先在「車庫管理」中建立並選擇車輛。
      </div>
    );
  }

  // Auto-suggestions list
  const existingTracks = Array.from(new Set(logs.map(l => l.track_name || '未分類')));
  const existingLayouts = trackName 
    ? Array.from(new Set(logs.filter(l => (l.track_name || '未分類') === trackName).map(l => l.track_layout).filter(Boolean)))
    : [];

  // Tracks for filtering (sorted)
  const filterTracks = Array.from(new Set(logs.map(l => l.track_name || '未分類'))).sort();

  // Layouts for filtering (sorted)
  const filterLayouts = selectedTrack !== 'all'
    ? Array.from(new Set(logs.filter(l => (l.track_name || '未分類') === selectedTrack).map(l => l.track_layout).filter(Boolean))).sort()
    : [];

  // Filtered logs
  const filteredLogs = logs.filter(log => {
    const logTrack = log.track_name || '未分類';
    const matchTrack = selectedTrack === 'all' || logTrack === selectedTrack;
    const matchLayout = selectedLayout === 'all' || log.track_layout === selectedLayout;
    return matchTrack && matchLayout;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
      
      {/* Messages */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 rounded bg-tertiary-container/30 border border-tertiary/20 text-tertiary text-sm font-mono animate-pulse">
          <CheckCircle size={20} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 rounded bg-error-container/30 border border-error/20 text-error text-sm font-mono">
          <AlertCircle size={20} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Header controls */}
      <header className="flex justify-between items-center pb-4 border-b border-outline-variant/30 flex-wrap gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-on-surface">調校與單圈日誌</h2>
          <p className="text-xs font-mono text-outline uppercase mt-1">
            [ 當前車輛: {currentVehicle.name} ]
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportBackup}
            className="flex items-center gap-1.5 border border-outline-variant hover:border-primary text-xs font-display px-3 py-2 rounded hover:bg-surface-container text-on-surface transition-all"
            title="下載所有車輛與設定備份"
          >
            <FileDown size={14} />
            匯出設定
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 border border-outline-variant hover:border-primary text-xs font-display px-3 py-2 rounded hover:bg-surface-container text-on-surface transition-all"
            title="上傳並合併 JSON 備份檔"
          >
            <FileUp size={14} />
            匯入設定
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".json"
            className="hidden"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left column: Add Log form */}
        <div className="md:col-span-1 space-y-6">
          <form onSubmit={handleSave} className="glass-panel p-5 rounded-lg space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-primary-container"></div>
            <h3 className="text-sm font-mono font-bold text-primary uppercase tracking-wider">[ 儲存當前設定日誌 ]</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-outline mb-1 flex justify-between items-center">
                  <span>賽道名稱</span>
                  <button
                    type="button"
                    onClick={() => setShowPresetModal(true)}
                    className="text-[10px] text-primary hover:underline font-mono flex items-center gap-0.5"
                  >
                    🏁 預設
                  </button>
                </label>
                <input
                  type="text"
                  required
                  value={trackName}
                  onChange={(e) => setTrackName(e.target.value)}
                  placeholder="如: 麗寶國際賽車場"
                  list="tracks-datalist"
                  className="w-full bg-surface border border-outline-variant/50 focus:border-primary-container p-2 rounded text-sm text-on-surface font-mono focus:outline-none"
                />
                <datalist id="tracks-datalist">
                  {existingTracks.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-mono text-outline mb-1">佈局 / 方向 (選填)</label>
                <input
                  type="text"
                  value={trackLayout}
                  onChange={(e) => setTrackLayout(e.target.value)}
                  placeholder="如: 23彎全賽道"
                  list="layouts-datalist"
                  className="w-full bg-surface border border-outline-variant/50 focus:border-primary-container p-2 rounded text-sm text-on-surface font-mono focus:outline-none"
                />
                <datalist id="layouts-datalist">
                  {existingLayouts.map(l => <option key={l} value={l} />)}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-outline mb-1">本圈單圈成績</label>
              <input
                type="text"
                required
                value={lapTime}
                onChange={handleLapTimeChange}
                onBlur={handleLapTimeBlur}
                placeholder="例如: 1:23.493 或 85.24"
                className={`w-full bg-surface border p-2 rounded text-sm text-on-surface font-mono focus:outline-none ${
                  validationError ? 'border-error focus:border-error' : 'border-outline-variant/50 focus:border-primary-container'
                }`}
              />
              <p className="text-[10px] text-outline/60 mt-1 font-mono">
                格式要求: `分:秒.毫秒` (送出或移開焦點時會自動補零對齊)
              </p>
            </div>

            <div>
              <label className="block text-xs font-mono text-outline mb-1">試駕反饋與筆記</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="例如: 增加尾翼角度後高速彎更加穩定，但直線極速稍微下降..."
                rows={4}
                className="w-full bg-surface border border-outline-variant/50 focus:border-primary-container p-2 rounded text-sm text-on-surface focus:outline-none font-body"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-primary-container text-white text-xs font-bold font-display py-2.5 rounded hover:opacity-90 active:scale-95 transition-all shadow-[0_0_12px_rgba(255,92,0,0.3)] flex items-center justify-center gap-1.5"
            >
              <History size={14} />
              紀錄此調校設定
            </button>
          </form>

          {/* Parameters Current Snapshot */}
          <div className="bg-surface-container/30 border border-outline-variant/20 rounded-lg p-4 font-mono text-xs">
            <h4 className="text-[11px] text-outline uppercase tracking-wider mb-2 pb-1 border-b border-outline-variant/20">當前調校數據預覽</h4>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {currentVehicle.allowed_params.map(key => {
                const config = PARAM_CONFIGS[key];
                const value = useStore.getState().currentParams[key] || config?.default || 0;
                return (
                  <div key={key} className="flex justify-between text-[11px]">
                    <span className="text-on-surface-variant/80">{config?.name || key}:</span>
                    <span className="text-primary font-bold">{value}{config?.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Logs History */}
        <div className="md:col-span-2 space-y-4">
          <h3 className="text-sm font-mono font-bold text-outline uppercase tracking-wider flex items-center gap-2">
            <History size={16} />
            歷史調校設定日誌 ({logs.length})
          </h3>

          {/* Track and Layout filter pills */}
          {filterTracks.length > 0 && (
            <div className="space-y-2 bg-surface-container/20 border border-outline-variant/10 p-3 rounded-lg">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-outline">
                <span>📍 依賽道分類:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleTrackFilterChange('all')}
                  className={`px-3 py-1 rounded-full text-xs font-mono transition-all ${
                    selectedTrack === 'all'
                      ? 'bg-primary text-white shadow-[0_0_10px_rgba(255,92,0,0.3)]'
                      : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:border-primary'
                  }`}
                >
                  全部 ({logs.length})
                </button>
                {filterTracks.map(track => {
                  const count = logs.filter(l => (l.track_name || '未分類') === track).length;
                  return (
                    <button
                      key={track}
                      type="button"
                      onClick={() => handleTrackFilterChange(track)}
                      className={`px-3 py-1 rounded-full text-xs font-mono transition-all ${
                        selectedTrack === track
                          ? 'bg-primary text-white shadow-[0_0_10px_rgba(255,92,0,0.3)]'
                          : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:border-primary'
                      }`}
                    >
                      {track} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Sub-filtering: Layouts */}
              {selectedTrack !== 'all' && filterLayouts.length > 0 && (
                <div className="pt-2 mt-2 border-t border-outline-variant/10 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-outline">
                    <span>📐 細分布局/方向:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedLayout('all')}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono transition-all ${
                        selectedLayout === 'all'
                          ? 'bg-secondary text-white'
                          : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:border-secondary'
                      }`}
                    >
                      全部佈局 ({logs.filter(l => (l.track_name || '未分類') === selectedTrack).length})
                    </button>
                    {filterLayouts.map(layout => {
                      const count = logs.filter(l => (l.track_name || '未分類') === selectedTrack && l.track_layout === layout).length;
                      return (
                        <button
                          key={layout}
                          type="button"
                          onClick={() => setSelectedLayout(layout)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono transition-all ${
                            selectedLayout === layout
                              ? 'bg-secondary text-white'
                              : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:border-secondary'
                          }`}
                        >
                          {layout} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {logs.length === 0 ? (
            <div className="glass-panel p-8 text-center rounded-lg text-on-surface-variant font-mono text-xs">
              該車輛目前無歷史調校日誌紀錄。
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="glass-panel p-8 text-center rounded-lg text-on-surface-variant font-mono text-xs">
              該分類下無符合的歷史調校日誌。
            </div>
          ) : (
            <div className="space-y-4 max-h-[550px] overflow-y-auto pr-2">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="glass-panel p-4 rounded-lg border border-outline-variant/30 hover:border-outline-variant/60 transition-all space-y-3 relative group"
                >
                  <header className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      {/* Lap time display */}
                      <div className="bg-surface-container border border-outline-variant/40 px-3 py-1.5 rounded font-mono text-lg font-bold text-secondary tracking-tight">
                        {log.lap_time}
                      </div>
                      
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-outline">
                          <Calendar size={12} />
                          {new Date(log.created_at).toLocaleString('zh-TW')}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="bg-primary/10 text-primary border border-primary/20 text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            📍 {log.track_name || '未分類'}
                          </span>
                          {log.track_layout && (
                            <span className="bg-secondary/10 text-secondary border border-secondary/20 text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              📐 {log.track_layout}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => applySetup(log.values)}
                        className="bg-primary-container/10 border border-primary-container/30 hover:bg-primary-container text-primary-container hover:text-white text-xs font-bold px-3 py-1 rounded transition-all flex items-center gap-1"
                        title="套用此設定值至當前調校面板"
                      >
                        <Play size={10} fill="currentColor" />
                        套用設定
                      </button>
                      <button
                        onClick={() => deleteLog(log.id)}
                        className="text-outline/60 hover:text-error transition-colors p-1.5 rounded hover:bg-error-container/10"
                        title="刪除此紀錄"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </header>

                  {/* Feedback Notes */}
                  {log.feedback_notes && (
                    <div className="bg-surface/50 border border-outline-variant/20 p-2.5 rounded text-xs text-on-surface-variant font-body leading-relaxed flex gap-2">
                      <Clipboard size={14} className="text-outline/60 flex-shrink-0 mt-0.5" />
                      <p>{log.feedback_notes}</p>
                    </div>
                  )}

                  {/* Parameters Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-outline-variant/10 font-mono text-[10px]">
                    {log.values && log.values.map((v) => {
                      const config = PARAM_CONFIGS[v.param_key];
                      return (
                        <div key={v.id} className="bg-surface-container/20 p-1.5 rounded border border-outline-variant/10 flex justify-between">
                          <span className="text-outline/80 truncate max-w-[70px]" title={config?.name || v.param_key}>
                            {config?.name || v.param_key}
                          </span>
                          <span className="text-primary font-bold">{v.param_value}{config?.unit}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preset Tracks Selection Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-panel w-full max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-lg relative overflow-hidden border border-outline-variant/30 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary-container to-transparent shadow-[0_0_10px_#ff5c00]"></div>
            
            <header className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold font-display text-on-surface">🏁 選擇預設賽道</h3>
                <p className="text-xs text-outline font-mono mt-0.5">請先選擇國家，再帶入對應賽道名稱及佈局項目</p>
              </div>
              <button
                onClick={() => setShowPresetModal(false)}
                className="p-1 text-outline hover:text-on-surface hover:bg-surface-container rounded transition-colors"
              >
                <X size={18} />
              </button>
            </header>

            {/* Country tabs */}
            <div className="flex flex-wrap gap-1.5 pb-3 border-b border-outline-variant/20 max-h-[120px] overflow-y-auto">
              {Object.keys(TRACKS_PRESET).map((country) => (
                <button
                  type="button"
                  key={country}
                  onClick={() => setActivePresetCountry(country)}
                  className={`px-3 py-1.5 rounded text-xs font-mono font-medium transition-all ${
                    activePresetCountry === country
                      ? 'bg-primary-container text-white border border-primary-container shadow-[0_0_10px_rgba(255,92,0,0.2)]'
                      : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:border-primary'
                  }`}
                >
                  {country}
                </button>
              ))}
            </div>

            {/* Tracks List */}
            <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-3">
              {TRACKS_PRESET[activePresetCountry]?.map((track) => (
                <div key={track.name} className="p-3 bg-surface/50 border border-outline-variant/20 rounded hover:border-outline-variant/50 transition-all space-y-2">
                  <div className="flex justify-between items-baseline flex-wrap gap-2">
                    <h4 className="text-sm font-bold text-on-surface font-display">{track.name}</h4>
                    <span className="text-[10px] text-outline font-mono uppercase">{track.englishName}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTrackName(track.name);
                        setTrackLayout('');
                        setShowPresetModal(false);
                      }}
                      className="px-2 py-0.5 bg-surface-container border border-outline-variant/30 hover:border-primary text-[9px] rounded text-on-surface font-mono transition-all"
                    >
                      僅帶入賽道名稱
                    </button>
                    {track.layouts.map((layout) => (
                      <button
                        type="button"
                        key={layout}
                        onClick={() => {
                          setTrackName(track.name);
                          setTrackLayout(layout);
                          setValidationError(false);
                          setShowPresetModal(false);
                        }}
                        className="px-2 py-0.5 bg-primary/10 border border-primary/20 hover:bg-primary-container hover:text-white text-[9px] rounded text-primary font-mono transition-all"
                      >
                        ⚡ {layout}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
