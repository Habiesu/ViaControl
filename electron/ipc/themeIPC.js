const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');

const THEME_FILE = path.join(app.getPath('userData'), 'theme.json');

function getTheme() {
  try {
    if (fs.existsSync(THEME_FILE)) {
      const data = JSON.parse(fs.readFileSync(THEME_FILE, 'utf8'));
      return data.theme || 'light';
    }
  } catch (_) {}
  return 'light';
}

function setTheme(theme) {
  fs.writeFileSync(THEME_FILE, JSON.stringify({ theme }), 'utf8');
}

function registerThemeIPC() {
  ipcMain.handle('theme:get', () => getTheme());
  ipcMain.handle('theme:set', (_e, theme) => {
    setTheme(theme);
    return { ok: true };
  });
}

module.exports = { registerThemeIPC };
