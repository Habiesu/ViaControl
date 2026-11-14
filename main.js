const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const { initDatabase } = require('./electron/db/database');
const { registerAllIPC } = require('./electron/ipc');
const { initAutoUpdater } = require('./electron/updater');

// ─── Captura global de logs para el visor flotante ──────────────────────────
const logBuffer = [];
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

function broadcastLog(level, args) {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  const entry = {
    time: new Date().toLocaleTimeString(),
    level,
    msg
  };
  logBuffer.push(entry);
  if (logBuffer.length > 500) logBuffer.shift();

  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('app:log', entry);
    }
  });
}

console.log = (...args) => { origLog.apply(console, args); broadcastLog('info', args); };
console.warn = (...args) => { origWarn.apply(console, args); broadcastLog('warn', args); };
console.error = (...args) => { origError.apply(console, args); broadcastLog('error', args); };

// ─── Ventana de logs dedicada ───────────────────────────────────────────────
let logsWindow = null;

function openLogsWindow() {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.show();
    logsWindow.focus();
    return;
  }

  logsWindow = new BrowserWindow({
    width: 860,
    height: 560,
    minWidth: 550,
    minHeight: 350,
    title: 'ViaControl — Visor de Logs del Sistema (Terminal)',
    backgroundColor: '#080d1a',
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  logsWindow.setMenu(null);
  if (logsWindow.removeMenu) logsWindow.removeMenu();

  const logsHtmlPath = path.join(__dirname, 'electron', 'logsWindow.html');
  logsWindow.loadFile(logsHtmlPath);

  logsWindow.once('ready-to-show', () => {
    logsWindow.show();
    logsWindow.focus();
  });

  logsWindow.on('closed', () => {
    logsWindow = null;
  });
}

// Eliminar el menú de aplicación por completo para evitar que Windows capture
// el foco del teclado en la barra de menú al presionar Alt o cerrar diálogos
Menu.setApplicationMenu(null);

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
    autoHideMenuBar: false,
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
    mainWindow.focus();
    mainWindow.webContents.focus();
    initAutoUpdater(mainWindow);
  });

  // Asegurar que cuando la ventana reciba foco, Chromium webContents también tenga foco de teclado
  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.focus();
    }
  });
}

// IPC para forzar re-enfoque de la ventana y webContents desde el renderer
ipcMain.handle('app:refocusWindow', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Tras window.confirm/alert Electron cree que la ventana ya tiene foco y focus() no hace nada:
    // blur() primero fuerza a Windows a devolver el foco de teclado real.
    mainWindow.blur();
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
  return true;
});

// IPC para abrir la ventana de logs
ipcMain.handle('app:abrirVentanaLogs', () => {
  openLogsWindow();
  return { ok: true };
});

// IPC para obtener el historial reciente de logs
ipcMain.handle('logs:getHistory', () => {
  return logBuffer;
});

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