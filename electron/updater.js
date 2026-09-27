const { autoUpdater } = require('electron-updater');
const { app, ipcMain } = require('electron');

let updateWindow = null;

function initAutoUpdater(mainWindow) {
  updateWindow = mainWindow;

  // Configuración de auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  const sendStatusToWindow = (channel, data) => {
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send(channel, data);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('updater:status', {
      status: 'checking',
      message: 'Verificando si hay nuevas actualizaciones...'
    });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow('updater:status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      message: `Nueva versión ${info.version} encontrada. Descargando en segundo plano...`
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('updater:status', {
      status: 'up-to-date',
      version: info?.version || app.getVersion(),
      message: 'La aplicación está actualizada en la última versión.'
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendStatusToWindow('updater:status', {
      status: 'downloading',
      percent: Math.round(progressObj.percent || 0),
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('updater:status', {
      status: 'downloaded',
      version: info.version,
      message: `¡Versión ${info.version} descargada! Lista para reiniciar.`
    });
  });

  autoUpdater.on('error', (err) => {
    sendStatusToWindow('updater:status', {
      status: 'error',
      error: err?.message || 'Error al buscar actualizaciones'
    });
  });

  // IPC Handlers
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { ok: false, message: 'Auto-updater inactivo en modo desarrollo' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('updater:quitAndInstall', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('updater:getVersion', () => {
    return app.getVersion();
  });

  // En producción, comprobar actualizaciones tras iniciar
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.warn('Auto-updater no pudo verificar actualizaciones:', err.message);
      });
    }, 4000);
  }
}

module.exports = { initAutoUpdater };
