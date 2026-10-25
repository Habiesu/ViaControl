const { ipcMain } = require('electron');
const authManager = require('./authManager');

function registerAuthIPC() {
  ipcMain.handle('auth:login', async (event, { email, password }) => {
    try {
      const result = await authManager.login(email, password);
      const isAdm = authManager.isAdmin(result.user);
      return { ok: true, session: result.session, user: result.user, isAdmin: isAdm };
    } catch (error) {
      console.error('[AuthIPC] Error en login:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('auth:register', async (event, { email, password }) => {
    try {
      const result = await authManager.register(email, password);
      const isAdm = authManager.isAdmin(result.user);
      return {
        ok: true,
        session: result.session,
        user: result.user,
        isAdmin: isAdm,
        needsEmailConfirmation: !result.session
      };
    } catch (error) {
      console.error('[AuthIPC] Error en register:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await authManager.logout();
      return { ok: true };
    } catch (error) {
      console.error('[AuthIPC] Error en logout:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('auth:getSession', async () => {
    try {
      const session = await authManager.restoreSession();
      const user = authManager.getUser();
      const isAdm = authManager.isAdmin(user);
      return { ok: true, session, user, isAdmin: isAdm };
    } catch (error) {
      console.error('[AuthIPC] Error en getSession:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('auth:getUser', async () => {
    try {
      const user = authManager.getUser();
      const isAdm = authManager.isAdmin(user);
      return { ok: true, user, isAdmin: isAdm };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('auth:esAdmin', async () => {
    return { ok: true, isAdmin: authManager.isAdmin() };
  });
}

module.exports = { registerAuthIPC };
