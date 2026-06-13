import React, { useEffect } from 'react';
import { useStore } from '../store';
import { Cloud, Car, Trash2, Wrench, Upload, RefreshCw, Users, Globe, FileBox } from 'lucide-react';

export default function CloudManager() {
  const {
    adminVehicles, fetchAdminVehicles, selectVehicle, setActiveView, setAdminMode,
    publishVehicle, deleteCloudVehicle, fetchCatalog
  } = useStore();

  useEffect(() => {
    fetchAdminVehicles();
  }, [fetchAdminVehicles]);

  const handleCalibrate = (v) => {
    selectVehicle(v);
    setAdminMode(true);
    setActiveView('tuning');
  };

  const handleTogglePublish = async (v) => {
    await publishVehicle(v.id, !v.is_published);
    await Promise.all([fetchAdminVehicles(), fetchCatalog()]);
  };

  const handleDelete = async (v) => {
    const msg = `確定要刪除雲端車型「${v.name}」嗎？\n` +
      (v.is_published ? '此車型目前已發布，刪除後會從公開目錄下架。\n' : '') +
      (v.clone_count > 0 ? `已有 ${v.clone_count} 位使用者加入此車型；他們已加入的副本不受影響。\n` : '') +
      '此操作無法復原。';
    if (!window.confirm(msg)) return;
    await deleteCloudVehicle(v.id);
    await Promise.all([fetchAdminVehicles(), fetchCatalog()]);
  };

  const isUploaded = (path) => typeof path === 'string' && path.startsWith('/api/v1/models/');

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
      <header className="flex justify-between items-center pb-4 border-b border-outline-variant/30">
        <div>
          <h2 className="font-display text-2xl font-bold text-on-surface flex items-center gap-2">
            <Cloud size={24} className="text-secondary-container" />
            雲端車輛管理
          </h2>
          <p className="text-xs font-mono text-outline uppercase mt-1">[ 管理所有可發布的雲端車型範本 ]</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAdminVehicles()}
            className="border border-outline-variant/40 text-on-surface-variant text-sm font-display px-3 py-2 rounded hover:bg-surface-container transition-all flex items-center gap-1.5"
            title="重新整理"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setActiveView('garage')}
            className="bg-secondary-container/15 border border-secondary-container/50 text-secondary-container text-sm font-bold font-display px-4 py-2 rounded hover:bg-secondary-container/25 active:scale-95 transition-all flex items-center gap-1.5"
            title="到車庫管理上傳並建立新車型"
          >
            <Upload size={16} />
            建立新車型
          </button>
        </div>
      </header>

      {adminVehicles.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-lg space-y-3 text-on-surface-variant">
          <Cloud className="mx-auto text-outline/40" size={40} />
          <div>尚無任何雲端車型</div>
          <button
            onClick={() => setActiveView('garage')}
            className="mx-auto border border-secondary-container/50 text-secondary-container hover:bg-secondary-container/10 px-4 py-2 rounded text-xs font-bold"
          >
            上傳第一台雲端車型
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {adminVehicles.map((v) => (
            <div
              key={v.id}
              className="glass-panel rounded-lg border border-outline-variant/30 hover:border-secondary-container/40 transition-all p-4 flex flex-col md:flex-row md:items-center gap-4"
            >
              {/* Identity */}
              <div className="flex items-center gap-3 min-w-0 md:w-64">
                <div className="p-2 rounded bg-surface border border-outline-variant/50 text-secondary-container flex-shrink-0">
                  <Car size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-display font-bold text-on-surface text-sm truncate">{v.name}</h4>
                    {v.is_published ? (
                      <span className="flex-shrink-0 text-[8px] font-mono font-bold bg-tertiary/20 text-tertiary border border-tertiary/40 px-1.5 py-0.5 rounded uppercase">已發布</span>
                    ) : (
                      <span className="flex-shrink-0 text-[8px] font-mono font-bold bg-outline/15 text-outline border border-outline/30 px-1.5 py-0.5 rounded uppercase">草稿</span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-outline truncate" title={v.owner_email}>
                    擁有者: {v.owner_name || v.owner_email || '—'}
                  </div>
                </div>
              </div>

              {/* Specs */}
              <div className="grid grid-cols-4 gap-2 flex-1 font-mono text-[11px] text-center">
                <div><div className="text-[9px] text-outline">車長</div><div className="font-bold text-on-surface mt-0.5">{v.length_m ? `${v.length_m}m` : '—'}</div></div>
                <div><div className="text-[9px] text-outline">馬力</div><div className="font-bold text-primary mt-0.5">{v.horsepower_hp}</div></div>
                <div><div className="text-[9px] text-outline">扭力</div><div className="font-bold text-secondary mt-0.5">{v.torque_nm}</div></div>
                <div><div className="text-[9px] text-outline">車重</div><div className="font-bold text-tertiary mt-0.5">{v.weight_kg}</div></div>
              </div>

              {/* Meta */}
              <div className="flex items-center gap-3 text-[10px] font-mono text-outline md:w-40">
                <span className="flex items-center gap-1" title="模型來源">
                  {isUploaded(v.model_path)
                    ? <><Upload size={12} className="text-secondary-container" /> 上傳</>
                    : <><FileBox size={12} /> 內建</>}
                </span>
                <span className="flex items-center gap-1" title="已被加入次數">
                  <Users size={12} /> {v.clone_count}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleCalibrate(v)}
                  className="bg-surface-container border border-outline-variant hover:border-secondary-container text-on-surface text-[11px] font-bold font-display px-3 py-1.5 rounded transition-all flex items-center gap-1"
                  title="載入並開啟校準台調整熱點/比例/車長"
                >
                  <Wrench size={13} /> 校準
                </button>
                <button
                  onClick={() => handleTogglePublish(v)}
                  className={`text-[11px] font-bold font-display px-3 py-1.5 rounded transition-all flex items-center gap-1 ${
                    v.is_published
                      ? 'bg-tertiary/10 border border-tertiary/40 text-tertiary hover:bg-tertiary/20'
                      : 'bg-primary-container text-white hover:opacity-90'
                  }`}
                  title={v.is_published ? '從公開目錄下架' : '發布到公開目錄'}
                >
                  <Globe size={13} /> {v.is_published ? '下架' : '發布'}
                </button>
                <button
                  onClick={() => handleDelete(v)}
                  className="bg-error/10 border border-error/40 text-error hover:bg-error/20 p-1.5 rounded transition-all"
                  title="刪除此雲端車型"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
