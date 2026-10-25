const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://arzinbvqlszbsokgzgtw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XhZF-zmfyg05HEVMsQ6ZKA_H0st3iWw';

let supabase = null;
let currentSession = null;

function getSessionFilePath() {
  const userDataPath = app ? app.getPath('userData') : path.join(process.env.APPDATA || '', 'ViaControl');
  const dir = path.join(userDataPath, 'auth');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'session.json');
}

function loadSavedSession() {
  try {
    const file = getSessionFilePath();
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[AuthManager] Error al leer sesión guardada:', err.message);
  }
  return null;
}

function saveSessionToDisk(session) {
  try {
    const file = getSessionFilePath();
    if (session) {
      fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf8');
    } else {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (err) {
    console.warn('[AuthManager] Error al guardar sesión:', err.message);
  }
}

function initSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false, // Manejamos la persistencia en disco con cifrado/JSON local
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  }
  return supabase;
}

async function restoreSession() {
  initSupabase();
  const saved = loadSavedSession();
  if (!saved || !saved.access_token) {
    currentSession = null;
    return null;
  }

  // Intentar validar y refrescar sesión con Supabase si hay internet
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: saved.access_token,
      refresh_token: saved.refresh_token
    });

    if (!error && data?.session) {
      currentSession = data.session;
      saveSessionToDisk(currentSession);
      await checkIsAdminFromDB(data.session.user);
      return currentSession;
    }
  } catch (err) {
    console.warn('[AuthManager] Sin conexión a internet al restaurar sesión. Usando sesión offline:', err.message);
  }

  // Si falló por falta de red (offline), mantenemos la sesión guardada localmente
  // permitiendo el uso Offline-First de la aplicación
  currentSession = saved;
  if (saved.user) {
    cachedIsAdmin = (saved.user.app_metadata?.role === 'admin' || saved.user.app_metadata?.is_admin === true);
  }
  return currentSession;
}

async function login(email, password) {
  initSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message || 'Error al iniciar sesión');
  }

  currentSession = data.session;
  saveSessionToDisk(currentSession);
  const isAdm = await checkIsAdminFromDB(data.user);
  return { session: currentSession, user: data.user, isAdmin: isAdm };
}

async function register(email, password) {
  initSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    throw new Error(error.message || 'Error al registrarse');
  }

  if (data?.session) {
    currentSession = data.session;
    saveSessionToDisk(currentSession);
  }
  cachedIsAdmin = false;
  return { session: data.session, user: data.user, isAdmin: false };
}

async function logout() {
  initSupabase();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[AuthManager] Error al cerrar sesión en el servidor:', err.message);
  }
  currentSession = null;
  cachedIsAdmin = false;
  saveSessionToDisk(null);
  return { ok: true };
}

function getSession() {
  if (!currentSession) {
    currentSession = loadSavedSession();
  }
  return currentSession;
}

function getUser() {
  const session = getSession();
  return session ? session.user : null;
}

let cachedIsAdmin = null;

async function checkIsAdminFromDB(user = null) {
  const u = user || getUser();
  if (!u || !u.id) {
    cachedIsAdmin = false;
    return false;
  }

  // 1. Verificación por app_metadata (asignado por SQL o claims del servidor en Supabase)
  const appRole = u.app_metadata?.role;
  if (appRole === 'admin' || u.app_metadata?.is_admin === true) {
    console.log(`[AuthManager] Usuario ${u.email} identificado como ADMIN vía app_metadata.`);
    cachedIsAdmin = true;
    return true;
  }

  // 2. Verificación por user_metadata (asignado al editar el usuario en Supabase Dashboard)
  const userRole = u.user_metadata?.role;
  if (userRole === 'admin' || u.user_metadata?.is_admin === true) {
    console.log(`[AuthManager] Usuario ${u.email} identificado como ADMIN vía user_metadata.`);
    cachedIsAdmin = true;
    return true;
  }

  // 3. Verificación en la tabla 'usuarios_admin' en Supabase (por user_id o por email)
  try {
    initSupabase();
    let { data, error } = await supabase
      .from('usuarios_admin')
      .select('user_id, email')
      .eq('user_id', u.id)
      .maybeSingle();

    if (!data && u.email) {
      const resEmail = await supabase
        .from('usuarios_admin')
        .select('user_id, email')
        .eq('email', u.email)
        .maybeSingle();
      data = resEmail.data;
    }

    if (data) {
      console.log(`[AuthManager] Usuario ${u.email} identificado como ADMIN vía tabla usuarios_admin.`);
      cachedIsAdmin = true;
      return true;
    }
  } catch (err) {
    console.warn('[AuthManager] Error al consultar tabla usuarios_admin en Supabase:', err.message);
  }

  console.log(`[AuthManager] Usuario ${u.email} autenticado como estándar (no admin). Metadata:`, {
    app_metadata: u.app_metadata,
    user_metadata: u.user_metadata
  });
  cachedIsAdmin = false;
  return false;
}

function isAdmin(user = null) {
  const u = user || getUser();
  if (!u) return false;
  if (u.app_metadata?.role === 'admin' || u.app_metadata?.is_admin === true) {
    return true;
  }
  return cachedIsAdmin === true;
}

function getSupabaseClient() {
  initSupabase();
  return supabase;
}

module.exports = {
  initSupabase,
  restoreSession,
  login,
  register,
  logout,
  getSession,
  getUser,
  checkIsAdminFromDB,
  isAdmin,
  getSupabaseClient
};
