const { ipcMain, shell, app } = require('electron');
const path = require('path');

function registerAjustesIPC() {
  // Abre en el Explorador de Windows la carpeta donde vive el .sqlite
  ipcMain.handle('ajustes:abrirCarpetaDatos', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const dataDir = path.join(userDataPath, 'gandolas_data');
      await shell.openPath(dataDir);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Devuelve la ruta completa del .sqlite (para mostrarla en la UI)
  ipcMain.handle('ajustes:obtenerRutaDatos', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const dataDir = path.join(userDataPath, 'gandolas_data');
      const dbPath = path.join(dataDir, 'gandolas_db.sqlite');
      return { ok: true, ruta: dbPath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Devuelve la versión de la app
  ipcMain.handle('ajustes:obtenerVersion', async () => {
    return { ok: true, version: app.getVersion() };
  });
}

module.exports = { registerAjustesIPC };
