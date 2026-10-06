const { app, BrowserWindow, dialog } = require('electron');
const { initDatabase } = require('./electron/db/database');
const { registerAllIPC } = require('./electron/ipc');
const { initAutoUpdater } = require('./electron/updater');

// Desactivar aceleración GPU en Windows para evitar bloqueos de renderizado
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'ViaControl | Gestión de Flota & Transporte',
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setMenu(null);
  if (mainWindow.removeMenu) mainWindow.removeMenu();

  mainWindow.loadFile('dist-renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    initAutoUpdater(mainWindow);
  });
}

// Registrar Handlers IPC
registerAllIPC();

// Inicialización de la aplicación
app.whenReady().then(async () => {
  try {
    await initDatabase();
    createWindow();
  } catch (err) {
    console.error('Error al inicializar base de datos:', err);
    dialog.showErrorBox('Error de Base de Datos', 'No se pudo inicializar el almacenamiento de datos local: ' + err.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});