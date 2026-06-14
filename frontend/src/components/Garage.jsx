import React, { useState, useEffect } from 'react';
import { useStore, PARAM_CONFIGS } from '../store';
import { Car, Trash2, Plus, ArrowLeft, CheckSquare, Square, Upload, Store, ShieldAlert, DownloadCloud, RefreshCw, Cloud } from 'lucide-react';

export default function Garage() {
  const {
    vehicles, currentVehicle, deleteVehicle, selectVehicle, setActiveView,
    user, catalog, fetchCatalog, addFromCatalog, addVehicle, uploadModel
  } = useStore();

  const isAdmin = user?.role === 'admin';

  // Garage sub-view: 'list' (my garage) | 'catalog' (browse published) | 'create' (admin upload)
  const [mode, setMode] = useState('list');

  // Admin create-template form state
  const [name, setName] = useState('');
  const [weight, setWeight] = useState(1400);
  const [horsepower, setHorsepower] = useState(400);
  const [torque, setTorque] = useState(400);
  const [lengthM, setLengthM] = useState(4.5);
  const [allowedParams, setAllowedParams] = useState(Object.keys(PARAM_CONFIGS));
  const [modelFile, setModelFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const toggleParam = (key) => {
    setAllowedParams(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleAddFromCatalog = async (templateId) => {
    const ok = await addFromCatalog(templateId);
    if (ok) {
      setMode('list');
      setActiveView('tuning');
    }
  };

  const resetCreateForm = () => {
    setName(''); setWeight(1400); setHorsepower(400); setTorque(400); setLengthM(4.5);
    setAllowedParams(Object.keys(PARAM_CONFIGS)); setModelFile(null); setFormError('');
  };

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('請輸入車型名稱'); return; }
    if (!modelFile) { setFormError('請選擇要上傳的 .glb 模型檔'); return; }

    setBusy(true);
    try {
      const modelPath = await uploadModel(modelFile);
      const ok = await addVehicle({
        name,
        weight_kg: parseInt(weight),
        horsepower_hp: parseInt(horsepower),
        torque_nm: parseInt(torque),
        length_m: parseFloat(lengthM),
        model_path: modelPath,
        allowed_params: allowedParams
      });
      if (ok) {
        resetCreateForm();
        setMode('list');
        // Jump to tuning so the admin can calibrate hotspots then publish
        setActiveView('tuning');
      } else {
        setFormError('建立車型失敗，請稍後再試');
      }
    } catch (err) {
      setFormError(err.message || '上傳/建立過程發生錯誤');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <h2 className="font-display text-2xl font-bold text-on-surface">車庫管理 (Garage)</h2>
          <p className="text-xs font-mono text-outline uppercase mt-1">[ 管理你的個人車型底盤庫 ]</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {mode !== 'list' ? (
            <button
              onClick={() => setMode('list')}
              className="border border-outline-variant text-on-surface-variant text-sm font-display px-4 py-2 rounded hover:bg-surface-container transition-all flex items-center gap-1"
            >
              <ArrowLeft size={16} />
              返回車庫
            </button>
          ) : (
            <>
              <button
                onClick={() => { fetchCatalog(); setMode('catalog'); }}
                className="bg-primary-container text-white text-sm font-bold font-display px-4 py-2 rounded hover:bg-primary-container/80 active:scale-95 transition-all flex items-center gap-1 shadow-[0_0_15px_rgba(255,92,0,0.3)]"
              >
                <Plus size={16} />
                新增車輛
              </button>
              {isAdmin && (
                <button
                  onClick={() => { resetCreateForm(); setMode('create'); }}
                  className="bg-secondary-container/15 border border-secondary-container/50 text-secondary-container text-sm font-bold font-display px-4 py-2 rounded hover:bg-secondary-container/25 active:scale-95 transition-all flex items-center gap-1"
                >
                  <Upload size={16} />
                  建立新車型
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* ===== Mode: Browse published catalog ===== */}
      {mode === 'catalog' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Store size={18} className="text-primary-container" />
            <h3 className="font-display text-lg font-bold">公開車型目錄</h3>
            <span className="text-[10px] font-mono text-outline">[ 由管理員發布，加入後可進行調校 ]</span>
          </div>

          {catalog.length === 0 ? (
            <div className="glass-panel p-12 text-center rounded-lg space-y-3 text-on-surface-variant">
              <Store className="mx-auto text-outline/40" size={40} />
              <div>目前沒有已發布的車型</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalog.map((t) => (
                <div key={t.id} className="glass-panel p-5 rounded-lg border border-outline-variant/30 hover:border-primary-container/50 transition-all flex flex-col justify-between group">
                  <div className="space-y-4">
                    <header className="flex items-center gap-3">
                      <div className="p-2 rounded bg-surface border border-outline-variant/50 text-primary-container">
                        <Car size={20} />
                      </div>
                      <div>
                        <h4 className="font-display font-bold text-on-surface text-base">{t.name}</h4>
                        <span className="text-[10px] font-mono text-outline uppercase tracking-wider">
                          [可調項目: {t.allowed_params.length}{t.length_m ? ` · 車長 ${t.length_m}m` : ''}]
                        </span>
                      </div>
                    </header>
                    <div className="grid grid-cols-3 gap-2 bg-surface/40 p-2.5 rounded border border-outline-variant/20 font-mono text-xs text-center">
                      <div><div className="text-[10px] text-outline">馬力</div><div className="text-sm font-bold text-primary mt-0.5">{t.horsepower_hp} hp</div></div>
                      <div className="border-x border-outline-variant/30"><div className="text-[10px] text-outline">扭力</div><div className="text-sm font-bold text-secondary mt-0.5">{t.torque_nm} Nm</div></div>
                      <div><div className="text-[10px] text-outline">車重</div><div className="text-sm font-bold text-tertiary mt-0.5">{t.weight_kg} kg</div></div>
                    </div>
                  </div>
                  <div className="flex justify-end mt-5 pt-3 border-t border-outline-variant/20">
                    <button
                      onClick={() => handleAddFromCatalog(t.id)}
                      className="bg-primary-container text-white text-xs font-bold font-display px-4 py-2 rounded hover:opacity-90 transition-all flex items-center gap-1.5 shadow-[0_0_10px_rgba(255,92,0,0.3)]"
                    >
                      <DownloadCloud size={14} />
                      加入我的車庫
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Mode: Admin create new template (upload GLB) ===== */}
      {mode === 'create' && isAdmin && (
        <form onSubmit={handleCreateTemplate} className="glass-panel p-6 rounded-lg space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-secondary-container"></div>
          <h3 className="text-lg font-display font-bold text-secondary-container flex items-center gap-2">
            <ShieldAlert size={18} /> 建立新車型（管理員）
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-outline mb-1">車型名稱</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="例如: McLaren 720S"
                  className="w-full bg-surface border border-outline-variant/50 focus:border-secondary-container p-2 rounded text-sm text-on-surface focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-outline mb-1">車長 (m)</label>
                  <input type="number" step="0.01" min="0.3" max="30" required value={lengthM}
                    onChange={(e) => setLengthM(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/50 focus:border-secondary-container p-2 rounded text-sm text-on-surface focus:outline-none font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-outline mb-1">車重 (kg)</label>
                  <input type="number" min="10" max="5000" required value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/50 focus:border-secondary-container p-2 rounded text-sm text-on-surface focus:outline-none font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-outline mb-1">馬力 (HP)</label>
                  <input type="number" min="1" max="3000" required value={horsepower}
                    onChange={(e) => setHorsepower(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/50 focus:border-secondary-container p-2 rounded text-sm text-on-surface focus:outline-none font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-outline mb-1">扭力 (Nm)</label>
                  <input type="number" min="1" max="3000" required value={torque}
                    onChange={(e) => setTorque(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/50 focus:border-secondary-container p-2 rounded text-sm text-on-surface focus:outline-none font-mono" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-outline mb-1">3D 模型檔 (.glb)</label>
                <label className="flex items-center gap-2 cursor-pointer bg-surface border border-dashed border-outline-variant/50 hover:border-secondary-container p-3 rounded text-sm transition-colors">
                  <Upload size={16} className="text-secondary-container flex-shrink-0" />
                  <span className="text-on-surface-variant truncate">
                    {modelFile ? modelFile.name : '點擊選擇 .glb 檔（上限 50MB）'}
                  </span>
                  <input type="file" accept=".glb,.gltf,model/gltf-binary" className="hidden"
                    onChange={(e) => setModelFile(e.target.files?.[0] || null)} />
                </label>
                <p className="text-[10px] text-outline/70 mt-1.5">上傳後請到「調校」頁開啟管理員校準台微調熱點，再按「發布」。</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-outline mb-2">開放參數設定（可調校項目）</label>
              <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto border border-outline-variant/30 p-3 rounded bg-surface/50 font-mono text-xs">
                {Object.entries(PARAM_CONFIGS).map(([key, config]) => {
                  const isChecked = allowedParams.includes(key);
                  return (
                    <button key={key} type="button" onClick={() => toggleParam(key)}
                      className="flex items-center gap-2 text-left p-2 rounded hover:bg-surface transition-colors text-on-surface-variant hover:text-on-surface">
                      {isChecked ? <CheckSquare size={16} className="text-secondary-container flex-shrink-0" /> : <Square size={16} className="text-outline/40 flex-shrink-0" />}
                      <span>{config.name} ({key})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {formError && (
            <div className="text-[11px] font-mono text-error bg-error/10 border border-error/30 py-2 px-3 rounded">{formError}</div>
          )}

          <div className="flex justify-end pt-4 border-t border-outline-variant/30">
            <button type="submit" disabled={busy}
              className="bg-secondary-container text-on-secondary text-sm font-bold font-display px-6 py-2.5 rounded hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50">
              {busy ? <><RefreshCw size={14} className="animate-spin" /> 上傳並建立中…</> : <>建立車型草稿</>}
            </button>
          </div>
        </form>
      )}

      {/* ===== Mode: My garage list ===== */}
      {mode === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.length === 0 ? (
            <div className="col-span-2 glass-panel p-12 text-center rounded-lg space-y-4">
              <Car className="mx-auto text-outline/40" size={48} />
              <div className="text-on-surface-variant">車庫內尚無任何車輛</div>
              <button
                onClick={() => { fetchCatalog(); setMode('catalog'); }}
                className="mx-auto border border-primary-container/50 text-primary-container hover:bg-primary-container/10 px-4 py-2 rounded text-xs font-bold"
              >
                從公開目錄新增車輛
              </button>
            </div>
          ) : (
            vehicles.map((v) => {
              const isSelected = currentVehicle && currentVehicle.id === v.id;
              return (
                <div
                  key={v.id}
                  className={`glass-panel p-5 rounded-lg border transition-all flex flex-col justify-between relative overflow-hidden group ${
                    isSelected ? 'border-primary-container/80 bg-primary-container/5' : 'border-outline-variant/30 hover:border-outline/50'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 right-0 bg-primary-container text-white font-mono text-[9px] px-2 py-0.5 rounded-bl uppercase">
                      選定中
                    </div>
                  )}
                  {v.is_published && (
                    <div className="absolute top-0 left-0 bg-tertiary/80 text-background font-mono text-[9px] px-2 py-0.5 rounded-br uppercase">
                      已發布
                    </div>
                  )}

                  <div className="space-y-4">
                    <header className="flex items-start justify-between mt-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-surface border border-outline-variant/50 text-primary-container">
                          <Car size={20} />
                        </div>
                        <div>
                          <h4 className="font-display font-bold text-on-surface text-base group-hover:text-primary transition-colors">{v.name}</h4>
                          <span className="text-[10px] font-mono text-outline uppercase tracking-wider">
                            [ALLOWED PARAMS: {v.allowed_params.length}]
                          </span>
                        </div>
                      </div>
                    </header>

                    <div className="grid grid-cols-3 gap-2 bg-surface/40 p-2.5 rounded border border-outline-variant/20 font-mono text-xs text-center">
                      <div><div className="text-[10px] text-outline">馬力</div><div className="text-sm font-bold text-primary mt-0.5">{v.horsepower_hp} hp</div></div>
                      <div className="border-x border-outline-variant/30"><div className="text-[10px] text-outline">扭力</div><div className="text-sm font-bold text-secondary mt-0.5">{v.torque_nm} Nm</div></div>
                      <div><div className="text-[10px] text-outline">車重</div><div className="text-sm font-bold text-tertiary mt-0.5">{v.weight_kg} kg</div></div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-6 pt-3 border-t border-outline-variant/20">
                    {v.source_template_id == null ? (
                      // Cloud template (original): not deletable from the personal
                      // garage — DB removal is centralized in the cloud interface.
                      <button
                        onClick={() => { if (isAdmin) setActiveView('cloud'); }}
                        disabled={!isAdmin}
                        className="text-secondary-container/80 hover:text-secondary-container transition-colors p-1.5 rounded hover:bg-secondary-container/10 border border-transparent hover:border-secondary-container/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={isAdmin ? '雲端車型：請至「雲端車輛」介面刪除' : '雲端車型，無法從車庫刪除'}
                      >
                        <Cloud size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => deleteVehicle(v.id)}
                        className="text-on-surface-variant hover:text-error transition-colors p-1.5 rounded hover:bg-error-container/10 border border-transparent hover:border-error/20"
                        title="從我的車庫移除"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}

                    {!isSelected ? (
                      <button
                        onClick={() => selectVehicle(v)}
                        className="bg-surface-container border border-outline-variant hover:border-primary-container text-xs font-bold font-display px-4 py-2 rounded text-on-surface transition-all"
                      >
                        選擇此車
                      </button>
                    ) : (
                      <button
                        onClick={() => setActiveView('tuning')}
                        className="bg-primary-container text-white text-xs font-bold font-display px-4 py-2 rounded hover:opacity-90 transition-all shadow-[0_0_10px_rgba(255,92,0,0.3)]"
                      >
                        前往調校
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
