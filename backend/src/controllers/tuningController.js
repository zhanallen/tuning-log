import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from './modelController.js';

const prisma = new PrismaClient();

// Remove an uploaded GLB from disk, but only if no remaining vehicle references it
// (clones share the same modelPath, so we must not break them).
async function cleanupModelFile(modelPath) {
  if (!modelPath || !modelPath.startsWith('/api/v1/models/')) return; // never touch static /modle presets
  const stillUsed = await prisma.vehicle.findFirst({ where: { modelPath } });
  if (stillUsed) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(modelPath)); // basename guards path traversal
  if (filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) {
    fs.unlink(filePath, () => {});
  }
}

// Helper to escape HTML to prevent XSS (REQ-NFR-006)
function escapeHTML(str) {
  if (!str) return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Helper to parse and normalize flexible lap times (e.g., 1:23.493 or 23.49 -> 01:23.493)
function parseAndNormalizeLapTime(timeStr) {
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
}

// Helper to translate camelCase Database fields to snake_case for Frontend compatibility
function formatVehicle(v) {
  if (!v) return null;
  return {
    id: v.id,
    user_id: v.userId,
    name: v.name,
    weight_kg: v.weightKg,
    horsepower_hp: v.horsepowerHp,
    torque_nm: v.torqueNm,
    model_path: v.modelPath,
    model_scale: v.modelScale,
    length_m: v.lengthM,
    allowed_params: v.allowedParams,
    config: v.config,
    is_published: v.isPublished,
    source_template_id: v.sourceTemplateId,
    created_at: v.createdAt,
    updated_at: v.updatedAt
  };
}

// 1. Vehicle Controllers
export async function getVehicles(req, res) {
  const userId = req.user.userId;
  try {
    const list = await prisma.vehicle.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    const formatted = list.map(formatVehicle);
    return res.status(200).json({ status: 'success', data: formatted });
  } catch (err) {
    console.error('getVehicles error:', err);
    return res.status(500).json({ status: 'error', message: '無法取得車庫列表' });
  }
}

export async function createVehicle(req, res) {
  const userId = req.user.userId;
  const { name, weight_kg, horsepower_hp, torque_nm, model_path, model_scale, length_m, allowed_params } = req.body;

  if (!name) {
    return res.status(400).json({ status: 'error', message: '車輛名稱為必填項目' });
  }

  try {
    const vehicle = await prisma.vehicle.create({
      data: {
        userId,
        name,
        weightKg: parseInt(weight_kg) || 0,
        horsepowerHp: parseInt(horsepower_hp) || 0,
        torqueNm: parseInt(torque_nm) || 0,
        modelPath: model_path || '/modle/2017_porsche_911_991_gt3_rs.glb',
        modelScale: parseFloat(model_scale) || 1.0,
        lengthM: length_m !== undefined && length_m !== null && length_m !== '' ? parseFloat(length_m) : null,
        allowedParams: allowed_params || []
      }
    });
    return res.status(201).json({ status: 'success', data: formatVehicle(vehicle) });
  } catch (err) {
    console.error('createVehicle error:', err);
    return res.status(500).json({ status: 'error', message: '車輛新增失敗' });
  }
}

// GET /api/v1/catalog — all published templates, visible to every authenticated user
export async function getCatalog(req, res) {
  try {
    const list = await prisma.vehicle.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ status: 'success', data: list.map(formatVehicle) });
  } catch (err) {
    console.error('getCatalog error:', err);
    return res.status(500).json({ status: 'error', message: '無法取得發布車型目錄' });
  }
}

// GET /api/v1/admin/vehicles — admin management view of all cloud templates
// (originals, i.e. not user clones), with owner + how many users cloned each.
export async function getAdminVehicles(req, res) {
  try {
    const templates = await prisma.vehicle.findMany({
      where: { sourceTemplateId: null },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } }
    });

    const groups = await prisma.vehicle.groupBy({
      by: ['sourceTemplateId'],
      where: { sourceTemplateId: { not: null } },
      _count: { _all: true }
    });
    const cloneCount = {};
    groups.forEach((g) => { cloneCount[g.sourceTemplateId] = g._count._all; });

    const data = templates.map((t) => ({
      ...formatVehicle(t),
      owner_email: t.user?.email,
      owner_name: t.user?.name,
      clone_count: cloneCount[t.id] || 0
    }));
    return res.status(200).json({ status: 'success', data });
  } catch (err) {
    console.error('getAdminVehicles error:', err);
    return res.status(500).json({ status: 'error', message: '無法取得雲端車輛列表' });
  }
}

// POST /api/v1/vehicles/from-catalog/:templateId — clone a published template into the user's garage
export async function addFromCatalog(req, res) {
  const userId = req.user.userId;
  const { templateId } = req.params;

  try {
    const template = await prisma.vehicle.findFirst({
      where: { id: templateId, isPublished: true }
    });
    if (!template) {
      return res.status(404).json({ status: 'error', message: '找不到該發布車型，或尚未發布' });
    }

    const clone = await prisma.vehicle.create({
      data: {
        userId,
        name: template.name,
        weightKg: template.weightKg,
        horsepowerHp: template.horsepowerHp,
        torqueNm: template.torqueNm,
        modelPath: template.modelPath,
        modelScale: template.modelScale,
        lengthM: template.lengthM,
        allowedParams: template.allowedParams,
        config: template.config ?? undefined,
        isPublished: false,
        sourceTemplateId: template.id
      }
    });
    return res.status(201).json({ status: 'success', data: formatVehicle(clone) });
  } catch (err) {
    console.error('addFromCatalog error:', err);
    return res.status(500).json({ status: 'error', message: '加入車庫失敗' });
  }
}

// PUT /api/v1/vehicles/:id/publish — admin toggles a vehicle's published state
export async function publishVehicle(req, res) {
  const { id } = req.params;
  const { is_published } = req.body;

  try {
    // Admin-only route (see server.js): admins may publish any cloud vehicle
    const vehicle = await prisma.vehicle.findFirst({ where: { id } });
    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: '找不到對應的車輛，或權限不足' });
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data: { isPublished: is_published === undefined ? !vehicle.isPublished : !!is_published }
    });
    return res.status(200).json({ status: 'success', data: formatVehicle(updated) });
  } catch (err) {
    console.error('publishVehicle error:', err);
    return res.status(500).json({ status: 'error', message: '發布狀態更新失敗' });
  }
}

export async function updateVehicleScale(req, res) {
  const { id } = req.params;
  const { model_scale, length_m } = req.body;

  try {
    // Admin-only route (see server.js): admins may calibrate any cloud vehicle
    const vehicle = await prisma.vehicle.findFirst({
      where: { id }
    });

    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: '找不到對應的車輛，或權限不足' });
    }

    const data = { modelScale: parseFloat(model_scale) || 1.0 };
    // length_m is part of the model geometry settings; persist when provided
    if (length_m !== undefined) {
      data.lengthM = length_m === null || length_m === '' ? null : parseFloat(length_m);
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data
    });

    return res.status(200).json({ status: 'success', data: formatVehicle(updated) });
  } catch (err) {
    console.error('updateVehicleScale error:', err);
    return res.status(500).json({ status: 'error', message: '更新模型縮放失敗' });
  }
}

export async function updateVehicleConfig(req, res) {
  const { id } = req.params;
  const { config } = req.body;

  try {
    // Admin-only route (see server.js): admins may calibrate any cloud vehicle
    const vehicle = await prisma.vehicle.findFirst({
      where: { id }
    });

    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: '找不到對應的車輛，或權限不足' });
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        config: config
      }
    });

    return res.status(200).json({ status: 'success', data: formatVehicle(updated) });
  } catch (err) {
    console.error('updateVehicleConfig error:', err);
    return res.status(500).json({ status: 'error', message: '更新車輛設定檔失敗' });
  }
}

// DELETE /api/v1/vehicles/:id — PERSONAL GARAGE removal.
// Only removes the caller's own cloned instances. A cloud template (an original,
// sourceTemplateId == null) is NEVER deleted here — DB removal of cloud vehicles
// is centralized in the cloud-vehicle management interface (deleteCloudVehicle).
export async function deleteVehicle(req, res) {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    const vehicle = await prisma.vehicle.findFirst({ where: { id, userId } });
    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: '找不到該車輛，或權限不足' });
    }

    // Guard: cloud templates may only be removed from the cloud management UI.
    if (vehicle.sourceTemplateId === null) {
      return res.status(409).json({
        status: 'error',
        message: '此為雲端車型，無法從個人車庫刪除；請至「雲端車輛」介面統一管理刪除'
      });
    }

    await prisma.vehicle.delete({ where: { id } });
    // Free the uploaded GLB only if no remaining vehicle references it
    await cleanupModelFile(vehicle.modelPath);

    return res.status(200).json({ status: 'success', message: '已從車庫移除' });
  } catch (err) {
    console.error('deleteVehicle error:', err);
    return res.status(500).json({ status: 'error', message: '車輛刪除失敗' });
  }
}

// DELETE /api/v1/admin/vehicles/:id — CLOUD removal (admin-only route).
// The single place that permanently removes a vehicle/template from the database.
export async function deleteCloudVehicle(req, res) {
  const { id } = req.params;

  try {
    const vehicle = await prisma.vehicle.findFirst({ where: { id } });
    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: '找不到該雲端車輛' });
    }

    // Cascade removes its tuning logs/values; user clones keep their own copies.
    await prisma.vehicle.delete({ where: { id } });
    await cleanupModelFile(vehicle.modelPath);

    return res.status(200).json({ status: 'success', message: '雲端車輛已從資料庫移除' });
  } catch (err) {
    console.error('deleteCloudVehicle error:', err);
    return res.status(500).json({ status: 'error', message: '雲端車輛刪除失敗' });
  }
}

// 2. Logging Controllers
export async function getLogs(req, res) {
  const userId = req.user.userId;
  const isAdmin = req.user.role === 'admin';
  const { vehicleId } = req.params;

  try {
    // Validate vehicle ownership (admins may read any vehicle's logs)
    const vehicle = await prisma.vehicle.findFirst({
      where: isAdmin ? { id: vehicleId } : { id: vehicleId, userId }
    });
    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: '找不到對應的車輛' });
    }

    // Read logs in descending order (REQ-SW-018)
    const logs = await prisma.tuningLog.findMany({
      where: { vehicleId },
      include: {
        values: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Map logs to return key-value format matches
    const formatted = logs.map(l => ({
      id: l.id,
      vehicle_id: l.vehicleId,
      lap_time: l.lapTime,
      feedback_notes: l.feedbackNotes,
      created_at: l.createdAt,
      values: l.values.map(v => ({
        id: v.id,
        param_key: v.paramKey,
        param_value: v.paramValue
      }))
    }));

    return res.status(200).json({ status: 'success', data: formatted });
  } catch (err) {
    console.error('getLogs error:', err);
    return res.status(500).json({ status: 'error', message: '無法取得調校日誌' });
  }
}

export async function createLog(req, res) {
  const userId = req.user.userId;
  const { vehicle_id, lap_time, feedback_notes, params } = req.body;

  // Validate and normalize lap time format (REQ-SW-017)
  const normalizedLapTime = parseAndNormalizeLapTime(lap_time);
  if (!normalizedLapTime) {
    return res.status(400).json({ 
      status: 'error', 
      message: '單圈時間格式不正確，格式需為 分分:秒秒.毫秒 (例如: 01:25.450 或 1:25.450)' 
    });
  }

  try {
    // Validate vehicle ownership
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicle_id, userId }
    });
    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: '找不到對應的車輛，或權限不足' });
    }

    // Escape HTML of feedback notes (REQ-NFR-006)
    const safeFeedbackNotes = escapeHTML(feedback_notes);

    // EAV transaction block (REQ-SW-016)
    const result = await prisma.$transaction(async (tx) => {
      const log = await tx.tuningLog.create({
        data: {
          userId,
          vehicleId: vehicle_id,
          lapTime: normalizedLapTime,
          feedbackNotes: safeFeedbackNotes
        }
      });

      // Insert EAV param values
      const paramData = Object.entries(params || {}).map(([key, val]) => ({
        tuningLogId: log.id,
        paramKey: key,
        paramValue: parseFloat(val) || 0.0
      }));

      if (paramData.length > 0) {
        await tx.tuningValue.createMany({
          data: paramData
        });
      }

      return log;
    });

    return res.status(201).json({ status: 'success', log_id: result.id });
  } catch (err) {
    console.error('createLog error:', err);
    return res.status(500).json({ status: 'error', message: '日誌儲存交易失敗' });
  }
}

export async function deleteLog(req, res) {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    // Check ownership
    const log = await prisma.tuningLog.findFirst({
      where: { id, userId }
    });
    if (!log) {
      return res.status(404).json({ status: 'error', message: '找不到該調校日誌，或權限不足' });
    }

    await prisma.tuningLog.delete({
      where: { id }
    });

    return res.status(200).json({ status: 'success', message: '日誌刪除成功' });
  } catch (err) {
    console.error('deleteLog error:', err);
    return res.status(500).json({ status: 'error', message: '日誌刪除失敗' });
  }
}

// 3. Backup & Restore
export async function exportBackup(req, res) {
  const userId = req.user.userId;

  try {
    const backupData = await prisma.vehicle.findMany({
      where: { userId },
      include: {
        tuningLogs: {
          include: {
            values: true
          }
        }
      }
    });

    const formatted = backupData.map(v => ({
      ...formatVehicle(v),
      tuningLogs: v.tuningLogs.map(l => ({
        id: l.id,
        vehicle_id: l.vehicleId,
        lap_time: l.lapTime,
        feedback_notes: l.feedbackNotes,
        created_at: l.createdAt,
        values: l.values.map(val => ({
          id: val.id,
          param_key: val.paramKey,
          param_value: val.paramValue
        }))
      }))
    }));

    return res.status(200).json({ status: 'success', data: formatted });
  } catch (err) {
    console.error('exportBackup error:', err);
    return res.status(500).json({ status: 'error', message: '備份設定導出失敗' });
  }
}

export async function importBackup(req, res) {
  const userId = req.user.userId;
  const backupData = req.body;

  if (!Array.isArray(backupData)) {
    return res.status(400).json({ status: 'error', message: '匯入格式不正確，應為陣列型式' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const v of backupData) {
        // Find if user already has a vehicle with the same name
        let vehicle = await tx.vehicle.findFirst({
          where: { userId, name: v.name }
        });

        if (!vehicle) {
          vehicle = await tx.vehicle.create({
            data: {
              userId,
              name: v.name,
              weightKg: parseInt(v.weight_kg !== undefined ? v.weight_kg : v.weightKg) || 0,
              horsepowerHp: parseInt(v.horsepower_hp !== undefined ? v.horsepower_hp : v.horsepowerHp) || 0,
              torqueNm: parseInt(v.torque_nm !== undefined ? v.torque_nm : v.torqueNm) || 0,
              modelPath: v.model_path !== undefined ? v.model_path : v.modelPath || '/modle/2017_porsche_911_991_gt3_rs.glb',
              allowedParams: v.allowed_params !== undefined ? v.allowed_params : v.allowedParams || [],
            }
          });
        }

        // Merge logs
        if (v.tuningLogs && Array.isArray(v.tuningLogs)) {
          for (const l of v.tuningLogs) {
            const lapTime = l.lap_time !== undefined ? l.lap_time : l.lapTime;
            const feedbackNotes = l.feedback_notes !== undefined ? l.feedback_notes : l.feedbackNotes;
            const createdAt = l.created_at !== undefined ? l.created_at : l.createdAt;
            
            // Check if log already exists based on lapTime and userId
            const existingLog = await tx.tuningLog.findFirst({
              where: {
                vehicleId: vehicle.id,
                lapTime,
                feedbackNotes
              }
            });

            if (!existingLog) {
              const newLog = await tx.tuningLog.create({
                data: {
                  userId,
                  vehicleId: vehicle.id,
                  lapTime,
                  feedbackNotes,
                  createdAt: createdAt ? new Date(createdAt) : new Date(),
                }
              });

              const valuesList = l.values || [];
              if (valuesList && Array.isArray(valuesList)) {
                const paramData = valuesList.map(val => {
                  const paramKey = val.param_key !== undefined ? val.param_key : val.paramKey;
                  const paramValue = val.param_value !== undefined ? val.param_value : val.paramValue;
                  return {
                    tuningLogId: newLog.id,
                    paramKey,
                    paramValue: parseFloat(paramValue) || 0.0
                  };
                });

                if (paramData.length > 0) {
                  await tx.tuningValue.createMany({
                    data: paramData
                  });
                }
              }
            }
          }
        }
      }
    });

    return res.status(200).json({ status: 'success', message: '資料合併匯入成功' });
  } catch (err) {
    console.error('importBackup error:', err);
    return res.status(500).json({ status: 'error', message: '備份檔案還原合併失敗' });
  }
}
