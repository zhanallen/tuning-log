import { create } from 'zustand';

// API Base URL through Nginx Gateway
const API_BASE = '/api/v1';

// Supported tuning parameters configurations
export const PARAM_CONFIGS = {
  pressure_fl: { name: '左前輪胎壓', min: 15.0, max: 45.0, step: 0.1, unit: 'psi', default: 26.5, category: 'tire' },
  pressure_fr: { name: '右前輪胎壓', min: 15.0, max: 45.0, step: 0.1, unit: 'psi', default: 26.5, category: 'tire' },
  pressure_rl: { name: '左後輪胎壓', min: 15.0, max: 45.0, step: 0.1, unit: 'psi', default: 26.5, category: 'tire' },
  pressure_rr: { name: '右後輪胎壓', min: 15.0, max: 45.0, step: 0.1, unit: 'psi', default: 26.5, category: 'tire' },
  aero_f: { name: '前翼空力角度', min: 0.0, max: 10.0, step: 0.1, unit: '°', default: 4.5, category: 'aero' },
  aero_r: { name: '尾翼空力角度', min: 0.0, max: 15.0, step: 0.5, unit: '°', default: 8.0, category: 'aero' },
  susp_h_f: { name: '前懸吊高度', min: 50, max: 150, step: 1, unit: 'mm', default: 85, category: 'suspension' },
  susp_h_r: { name: '後懸吊高度', min: 50, max: 150, step: 1, unit: 'mm', default: 92, category: 'suspension' },
  susp_d_f: { name: '前懸吊阻尼', min: 0, max: 30, step: 1, unit: '段', default: 12, category: 'suspension' },
  susp_d_r: { name: '後懸吊阻尼', min: 0, max: 30, step: 1, unit: '段', default: 14, category: 'suspension' }
};

// Default vehicle configurations (base scale 1.0 coordinates in meters)
export const DEFAULT_VEHICLE_CONFIG = {
  modelOffset: [0, 0, 0],
  hotspots: {
    pressure_fl: [-0.95, 0.35, 1.25],
    pressure_fr: [0.95, 0.35, 1.25],
    pressure_rl: [-0.98, 0.35, -1.25],
    pressure_rr: [0.98, 0.35, -1.25],
    aero_f: [0.0, 0.15, 2.1],
    aero_r: [0.0, 1.15, -2.1],
    susp_h_f: [-0.55, 0.7, 1.25],
    susp_d_f: [0.55, 0.7, 1.25],
    susp_h_r: [-0.55, 0.8, -1.25],
    susp_d_r: [0.55, 0.8, -1.25]
  }
};

// Symmetric hotspots mapping (X axis mirrors, Y & Z axles copy)
export const SYMMETRIC_PAIRS = {
  pressure_fl: 'pressure_fr',
  pressure_fr: 'pressure_fl',
  pressure_rl: 'pressure_rr',
  pressure_rr: 'pressure_rl',
  susp_h_f: 'susp_d_f',
  susp_d_f: 'susp_h_f',
  susp_h_r: 'susp_d_r',
  susp_d_r: 'susp_h_r'
};

export const getVehicleConfig = (vehicle) => {
  if (!vehicle) return DEFAULT_VEHICLE_CONFIG;
  const dbConfig = vehicle.config || {};
  return {
    modelOffset: dbConfig.modelOffset || DEFAULT_VEHICLE_CONFIG.modelOffset,
    hotspots: {
      ...DEFAULT_VEHICLE_CONFIG.hotspots,
      ...(dbConfig.hotspots || {})
    }
  };
};

export const useStore = create((set, get) => ({
  // Authentication State
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  isAuthenticated: !!localStorage.getItem('token'),
  authError: null,

  // UI State
  activeView: 'garage', // 'garage' | 'tuning' | 'logs'
  activePartKey: null, // active 3D hotspot component
  isAdminMode: false,
  
  // Data State
  vehicles: [],
  catalog: [], // published vehicle templates available to add
  adminVehicles: [], // admin cloud-management list (all templates)
  currentVehicle: null,
  currentParams: {}, // values for current vehicle parameters
  logs: [],
  isLoading: false,

  // Helper fetch method with Authorization header
  apiFetch: async (path, options = {}) => {
    const token = get().token;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `API error: ${response.status}`);
    }
    return response.json();
  },

  // Auth Actions
  loginWithGoogle: async (googleCredential) => {
    set({ isLoading: true, authError: null });
    try {
      const data = await get().apiFetch('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ token: googleCredential })
      });
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      set({ 
        token: data.data.token, 
        user: data.data.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
      await get().fetchVehicles();
    } catch (err) {
      set({ authError: err.message, isLoading: false });
    }
  },

  loginGuest: async (name = '訪客') => {
    set({ isLoading: true, authError: null });
    try {
      const data = await get().apiFetch('/auth/guest', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      set({ 
        token: data.data.token, 
        user: data.data.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
      await get().fetchVehicles();
    } catch (err) {
      set({ authError: err.message, isLoading: false });
    }
  },

  logout: async () => {
    const user = get().user;
    if (user && user.email && user.email.startsWith('guest_')) {
      try {
        await get().apiFetch('/auth/guest-cleanup', { method: 'POST' });
      } catch (err) {
        console.error('Guest active cleanup failed on logout:', err);
      }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ 
      token: null, 
      user: null, 
      isAuthenticated: false, 
      vehicles: [], 
      currentVehicle: null, 
      currentParams: {}, 
      logs: [],
      activePartKey: null
    });
  },

  // View control
  setActiveView: (view) => set({ activeView: view, activePartKey: null }),
  setActivePartKey: (partKey) => set({ activePartKey: partKey }),

  // Vehicles (Garage) Actions
  fetchVehicles: async () => {
    set({ isLoading: true });
    try {
      const data = await get().apiFetch('/vehicles');
      const list = data.data || [];
      set({ vehicles: list, isLoading: false });
      
      // Auto select first vehicle if none selected
      if (list.length > 0 && !get().currentVehicle) {
        get().selectVehicle(list[0]);
      }
    } catch (err) {
      console.error('Fetch vehicles failed:', err);
      set({ isLoading: false });
    }
  },

  selectVehicle: async (vehicle) => {
    set({ currentVehicle: vehicle, activePartKey: null });
    if (vehicle) {
      // Initialize parameter values (use defaults or latest log values)
      const defaultParams = {};
      vehicle.allowed_params.forEach(key => {
        defaultParams[key] = PARAM_CONFIGS[key]?.default || 0;
      });
      
      set({ currentParams: defaultParams });
      await get().fetchLogs(vehicle.id);
    } else {
      set({ currentParams: {}, logs: [] });
    }
  },

  addVehicle: async (vehicleData) => {
    set({ isLoading: true });
    try {
      const response = await get().apiFetch('/vehicles', {
        method: 'POST',
        body: JSON.stringify(vehicleData)
      });
      await get().fetchVehicles();
      // Select the newly created vehicle
      if (response.data) {
        const added = get().vehicles.find(v => v.id === response.data.id);
        if (added) get().selectVehicle(added);
      }
      return true;
    } catch (err) {
      console.error('Add vehicle failed:', err);
      set({ isLoading: false });
      return false;
    }
  },

  deleteVehicle: async (vehicleId) => {
    set({ isLoading: true });
    try {
      await get().apiFetch(`/vehicles/${vehicleId}`, {
        method: 'DELETE'
      });
      const oldCurrent = get().currentVehicle;
      await get().fetchVehicles();
      
      // If we deleted the currently selected vehicle, select another one
      if (oldCurrent && oldCurrent.id === vehicleId) {
        const list = get().vehicles;
        if (list.length > 0) {
          get().selectVehicle(list[0]);
        } else {
          get().selectVehicle(null);
        }
      }
      return true;
    } catch (err) {
      console.error('Delete vehicle failed:', err);
      set({ isLoading: false });
      return false;
    }
  },

  updateVehicleScale: async (vehicleId, scale, lengthM) => {
    try {
      const body = { model_scale: parseFloat(scale) };
      if (lengthM !== undefined) {
        body.length_m = lengthM === null || lengthM === '' ? null : parseFloat(lengthM);
      }
      const response = await get().apiFetch(`/vehicles/${vehicleId}/scale`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      
      const updatedList = get().vehicles.map(v => v.id === vehicleId ? response.data : v);
      set({ vehicles: updatedList });
      if (get().currentVehicle && get().currentVehicle.id === vehicleId) {
        set({ currentVehicle: response.data });
      }
      return true;
    } catch (err) {
      console.error('Update vehicle scale failed:', err);
      return false;
    }
  },

  setAdminMode: (isAdmin) => {
    set({ isAdminMode: isAdmin });
  },

  updateVehicleConfig: async (vehicleId, config) => {
    try {
      const response = await get().apiFetch(`/vehicles/${vehicleId}/config`, {
        method: 'PUT',
        body: JSON.stringify({ config })
      });
      
      const updatedList = get().vehicles.map(v => v.id === vehicleId ? response.data : v);
      set({ vehicles: updatedList });
      if (get().currentVehicle && get().currentVehicle.id === vehicleId) {
        set({ currentVehicle: response.data });
      }
      return true;
    } catch (err) {
      console.error('Update vehicle config failed:', err);
      return false;
    }
  },

  setTempModelOffset: (offset) => {
    set(state => {
      if (state.currentVehicle) {
        const currentConfig = state.currentVehicle.config || {};
        return {
          currentVehicle: {
            ...state.currentVehicle,
            config: {
              ...currentConfig,
              modelOffset: offset
            }
          }
        };
      }
      return {};
    });
  },

  setTempHotspotPosition: (hotspotKey, position, isSymmetric = false) => {
    set(state => {
      if (state.currentVehicle) {
        const currentConfig = state.currentVehicle.config || {};
        const currentHotspots = { ...(currentConfig.hotspots || {}) };
        
        currentHotspots[hotspotKey] = position;
        
        if (isSymmetric) {
          const partnerKey = SYMMETRIC_PAIRS[hotspotKey];
          if (partnerKey) {
            const [x, y, z] = position;
            currentHotspots[partnerKey] = [-x, y, z];
          }
        }

        return {
          currentVehicle: {
            ...state.currentVehicle,
            config: {
              ...currentConfig,
              hotspots: currentHotspots
            }
          }
        };
      }
      return {};
    });
  },

  setTempModelScale: (scale) => {
    set(state => {
      if (state.currentVehicle) {
        return {
          currentVehicle: {
            ...state.currentVehicle,
            model_scale: parseFloat(scale)
          }
        };
      }
      return {};
    });
  },

  // Live-preview the real car length (drives auto-scale in ThreeCanvas)
  setTempLength: (length) => {
    set(state => {
      if (state.currentVehicle) {
        return {
          currentVehicle: {
            ...state.currentVehicle,
            length_m: length === '' || length === null ? null : parseFloat(length)
          }
        };
      }
      return {};
    });
  },

  // Published catalog (visible to all users in "add vehicle")
  fetchCatalog: async () => {
    try {
      const data = await get().apiFetch('/catalog');
      set({ catalog: data.data || [] });
    } catch (err) {
      console.error('Fetch catalog failed:', err);
    }
  },

  // Admin cloud-vehicle management list (all templates, any owner)
  fetchAdminVehicles: async () => {
    try {
      const data = await get().apiFetch('/admin/vehicles');
      set({ adminVehicles: data.data || [] });
    } catch (err) {
      console.error('Fetch admin vehicles failed:', err);
    }
  },

  // Admin: permanently remove a vehicle from the DB (cloud management only)
  deleteCloudVehicle: async (vehicleId) => {
    try {
      await get().apiFetch(`/admin/vehicles/${vehicleId}`, { method: 'DELETE' });
      // If it was loaded/selected for calibration, refresh garage + reselect
      if (get().currentVehicle?.id === vehicleId) {
        await get().fetchVehicles();
        const list = get().vehicles;
        get().selectVehicle(list[0] || null);
      } else {
        get().fetchVehicles();
      }
      return true;
    } catch (err) {
      console.error('Delete cloud vehicle failed:', err);
      return false;
    }
  },

  // Clone a published template into the user's own garage
  addFromCatalog: async (templateId) => {
    set({ isLoading: true });
    try {
      const response = await get().apiFetch(`/vehicles/from-catalog/${templateId}`, { method: 'POST' });
      await get().fetchVehicles();
      if (response.data) {
        const added = get().vehicles.find(v => v.id === response.data.id);
        if (added) get().selectVehicle(added);
      }
      set({ isLoading: false });
      return true;
    } catch (err) {
      console.error('Add from catalog failed:', err);
      set({ isLoading: false });
      return false;
    }
  },

  // Admin: upload a GLB model file, returns its served model_path
  uploadModel: async (file) => {
    const token = get().token;
    const formData = new FormData();
    formData.append('model', file);
    const response = await fetch(`${API_BASE}/admin/models`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `上傳失敗: ${response.status}`);
    }
    const data = await response.json();
    return data.data.model_path;
  },

  // Admin: toggle a vehicle's published (catalog) state
  publishVehicle: async (vehicleId, isPublished) => {
    try {
      const response = await get().apiFetch(`/vehicles/${vehicleId}/publish`, {
        method: 'PUT',
        body: JSON.stringify({ is_published: isPublished })
      });
      const updatedList = get().vehicles.map(v => v.id === vehicleId ? response.data : v);
      set({ vehicles: updatedList });
      if (get().currentVehicle && get().currentVehicle.id === vehicleId) {
        set({ currentVehicle: response.data });
      }
      return true;
    } catch (err) {
      console.error('Publish vehicle failed:', err);
      return false;
    }
  },

  // Parameters actions
  updateParam: (key, value) => {
    set((state) => ({
      currentParams: {
        ...state.currentParams,
        [key]: parseFloat(value)
      }
    }));
  },

  // Logs Actions
  fetchLogs: async (vehicleId) => {
    try {
      const data = await get().apiFetch(`/logs/${vehicleId}`);
      set({ logs: data.data || [] });
      
      // If there are logs, overlay current parameters with the latest log's configurations
      const latestLog = data.data[0];
      if (latestLog && latestLog.values) {
        const updatedParams = { ...get().currentParams };
        latestLog.values.forEach(v => {
          if (updatedParams[v.param_key] !== undefined) {
            updatedParams[v.param_key] = v.param_value;
          }
        });
        set({ currentParams: updatedParams });
      }
    } catch (err) {
      console.error('Fetch logs failed:', err);
    }
  },

  saveLog: async (lapTime, feedbackNotes) => {
    const currentVehicle = get().currentVehicle;
    if (!currentVehicle) return false;
    
    set({ isLoading: true });
    try {
      await get().apiFetch('/logs', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: currentVehicle.id,
          lap_time: lapTime,
          feedback_notes: feedbackNotes,
          params: get().currentParams
        })
      });
      await get().fetchLogs(currentVehicle.id);
      return true;
    } catch (err) {
      console.error('Save log failed:', err);
      set({ isLoading: false });
      throw err;
    }
  },

  deleteLog: async (logId) => {
    const currentVehicle = get().currentVehicle;
    if (!currentVehicle) return false;
    
    try {
      await get().apiFetch(`/logs/${logId}`, {
        method: 'DELETE'
      });
      await get().fetchLogs(currentVehicle.id);
      return true;
    } catch (err) {
      console.error('Delete log failed:', err);
      return false;
    }
  },

  applySetup: (logValues) => {
    const updated = { ...get().currentParams };
    logValues.forEach(v => {
      if (updated[v.param_key] !== undefined) {
        updated[v.param_key] = v.param_value;
      }
    });
    set({ currentParams: updated, activePartKey: null });
  },

  // Backup & Restore
  exportBackup: async () => {
    try {
      const data = await get().apiFetch('/backup/export');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data.data));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `tuning_log_backup_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      return true;
    } catch (err) {
      console.error('Export failed:', err);
      return false;
    }
  },

  importBackup: async (jsonData) => {
    set({ isLoading: true });
    try {
      await get().apiFetch('/backup/import', {
        method: 'POST',
        body: JSON.stringify(jsonData)
      });
      await get().fetchVehicles();
      return true;
    } catch (err) {
      console.error('Import failed:', err);
      set({ isLoading: false });
      throw err;
    }
  }
}));
