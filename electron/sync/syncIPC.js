const { ipcMain } = require('electron');
const syncEngine = require('./syncEngine');

function registerSyncIPC() {
  ipcMain.handle('sync:ejecutar', async () => {
    try {
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
      return { ok: true, lastSync, pendingCount };
    } catch (error) {
      return { ok: false, error: error.message, pendingCount: 0 };
    }
  });
}

module.exports = { registerSyncIPC };
