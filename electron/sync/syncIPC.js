const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const syncEngine = require('./syncEngine');

// ─── Config de sincronización ───────────────────────────────────────────────
function getSyncConfigPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'sync_config.json');
}

function readSyncConfig() {
  try {
    const p = getSyncConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return { mode: 'auto' }; // auto | manual | disabled
}

function writeSyncConfig(cfg) {
  fs.writeFileSync(getSyncConfigPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

function registerSyncIPC() {
  ipcMain.handle('sync:ejecutar', async () => {
    try {
      const cfg = readSyncConfig();
      if (cfg.mode === 'disabled') {
        return { ok: false, error: 'Sync desactivado en modo local.', disabled: true };
      }
      const result = await syncEngine.sync();
      return result;
    } catch (error) {
      console.error('[SyncIPC] Error al ejecutar sincronización:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('sync:estado', async () => {
    try {
      const lastSync = await syncEngine.getLastSync();
      const pendingCount = await syncEngine.getPendingCount();
      const config = readSyncConfig();
      return { ok: true, lastSync, pendingCount, config };
    } catch (error) {
      return { ok: false, error: error.message, pendingCount: 0 };
    }
  });

  ipcMain.handle('sync:obtenerConfig', async () => {
    return { ok: true, config: readSyncConfig() };
  });

  ipcMain.handle('sync:guardarConfig', async (event, config) => {
    try {
      writeSyncConfig(config);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Marca todos los registros pendientes como 'synced' sin subirlos.
  // Útil cuando el admin carga una BD de cliente y no quiere contaminar
  // la nube con datos ajenos (resuelve el error RLS de Supabase).
  ipcMain.handle('sync:marcarTodoSincronizado', async () => {
    try {
      const { SYNC_TABLES, dbRun } = require('../db/database');
      let total = 0;
      for (const tabla of SYNC_TABLES) {
        const res = await dbRun(
          `UPDATE ${tabla} SET sync_status = 'synced' WHERE sync_status IN ('pending_insert', 'pending_update', 'pending_delete')`
        );
        total += res.changes || 0;
      }
      console.log(`[SyncIPC] Marcados ${total} registros como sincronizados (sin subir).`);
      return { ok: true, total };
    } catch (err) {
      console.error('[SyncIPC] Error al marcar sincronizados:', err);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerSyncIPC, readSyncConfig };
