import React, { useState, useEffect, createContext, useContext } from 'react';
import LoginView from '../views/LoginView.jsx';
import Modal from './Modal.jsx';

const { ipcRenderer } = window.require('electron');

export const AuthContext = createContext({
  session: null,
  user: null,
  isAdmin: false,
  logout: () => {},
  syncStatus: { syncing: false, lastSync: null, pendingCount: 0, error: null },
  triggerSync: () => {}
});

export const useAuth = () => useContext(AuthContext);

const NOMBRES_TABLAS = {
  Viajes: 'Viajes', Gastos_Extra: 'Gastos', Aportes_Propietarios: 'Entregas de fondos',
  Propietarios: 'Propietarios', Choferes: 'Choferes', Gandolas: 'Gandolas',
  Agentes: 'Agentes', Grupos_Propietarios: 'Grupos', Rutas: 'Rutas y tarifas'
};

function resumenTexto(conteos) {
  const partes = Object.keys(NOMBRES_TABLAS)
    .filter(t => conteos?.[t] > 0)
    .map(t => `${conteos[t]} ${NOMBRES_TABLAS[t].toLowerCase()}`);
  return partes.length ? partes.join(', ') : 'sin datos';
}

/**
 * Primera sincronización de una PC que ya tiene datos propios mientras la nube también tiene datos:
 * el usuario elige mezclar (subir y bajar) o reemplazar lo local por la nube.
 */
function DecisionPrimeraSync({ resumen, onResuelto, onPosponer }) {
  const [paso, setPaso] = useState('elegir'); // elegir | confirmar
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);

  const resolver = async (modo) => {
    setTrabajando(true);
    setError(null);
    try {
      const res = await ipcRenderer.invoke('sync:resolverPrimeraSync', modo);
      if (res && res.ok) onResuelto(res);
      else setError(res?.error || 'No se pudo completar la sincronización.');
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  };

  // Esc: en la confirmación vuelve atrás; en la elección pospone. Mientras sincroniza no se puede cerrar.
  const alCerrar = trabajando ? undefined : (paso === 'confirmar' ? () => setPaso('elegir') : onPosponer);

  return (
    <Modal labelledBy="primera-sync-titulo" onClose={alCerrar} style={{ padding: '24px', gap: '16px', maxWidth: '560px' }}>
        {paso === 'elegir' ? (
          <>
            <h2 id="primera-sync-titulo" style={{ fontSize: '18px' }}>Esta computadora y la nube tienen datos distintos</h2>
            <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
              <p><strong style={{ color: 'var(--on-surface)' }}>En esta computadora (sin subir):</strong> {resumenTexto(resumen.local)}.</p>
              <p style={{ marginTop: '6px' }}><strong style={{ color: 'var(--on-surface)' }}>En la nube:</strong> {resumenTexto(resumen.nube)}.</p>
              <p style={{ marginTop: '10px' }}>¿Qué quieres hacer?</p>
            </div>

            <button className="btn btn-primary" style={{ height: 'auto', padding: '12px 16px', justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }}
              disabled={trabajando} onClick={() => resolver('mezclar')}>
              <span className="material-symbols-outlined">merge</span>
              <span><strong>Mezclar (recomendado)</strong><br />
                <span style={{ fontWeight: 400 }}>Sube los datos de esta computadora y descarga los que faltan. Si cargaste lo mismo en ambas, puede quedar duplicado.</span>
              </span>
            </button>

            <button className="btn btn-secondary" style={{ height: 'auto', padding: '12px 16px', justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }}
              disabled={trabajando} onClick={() => setPaso('confirmar')}>
              <span className="material-symbols-outlined">cloud_download</span>
              <span><strong>Reemplazar con la nube</strong><br />
                <span style={{ fontWeight: 400 }}>Borra los datos de esta computadora y descarga todo lo de la nube. Se guarda una copia de seguridad antes.</span>
              </span>
            </button>

            <button className="btn btn-sm" style={{ background: 'transparent', color: 'var(--on-surface-variant)', alignSelf: 'center' }}
              disabled={trabajando} onClick={onPosponer} data-autofocus>
              Decidir más tarde (no se sincroniza nada)
            </button>
          </>
        ) : (
          <>
            <h2 id="primera-sync-titulo" style={{ fontSize: '18px', color: 'var(--error)' }}>¿Borrar los datos de esta computadora?</h2>
            <p style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
              Se borrarán {resumenTexto(resumen.local)} que solo existen en esta computadora, y se descargará todo lo de la nube.
              Antes se guarda una copia de seguridad de la base de datos en la carpeta de datos de ViaControl.
              Si la descarga falla, no se borra nada.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" disabled={trabajando} onClick={() => setPaso('elegir')} autoFocus>Volver</button>
              <button className="btn btn-danger-solid" disabled={trabajando} onClick={() => resolver('reemplazar')}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                Sí, borrar y descargar
              </button>
            </div>
          </>
        )}

        {trabajando && <p style={{ fontSize: '13px', color: 'var(--primary)' }} role="status">Sincronizando con la nube…</p>}
        {error && <p style={{ fontSize: '13px', color: 'var(--error)' }} role="alert">{error}</p>}
    </Modal>
  );
}

function checkUserIsAdmin(u) {
  if (!u) return false;
  // Solo app_metadata: user_metadata lo puede editar el propio usuario.
  return u.app_metadata?.role === 'admin' || u.app_metadata?.is_admin === true;
}

export default function AuthGuard({ children, onDataRefreshed }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({
    syncing: false,
    lastSync: null,
    pendingCount: 0,
    error: null
  });
  const [decisionSync, setDecisionSync] = useState(null); // resumen de la primera sincronización pendiente de decidir

  const aplicarResultadoSync = (res) => {
    setSyncStatus({
      syncing: false,
      lastSync: res.lastSync,
      pendingCount: res.pendingCount || 0,
      error: null
    });
    if (res.pulled > 0 && typeof onDataRefreshed === 'function') {
      onDataRefreshed(res.pulled);
    }
  };

  const checkSession = async () => {
    try {
      setLoading(true);
      const res = await ipcRenderer.invoke('auth:getSession');
      if (res.ok && res.session) {
        setSession(res.session);
        const currentUser = res.user || res.session.user;
        setUser(currentUser);
        setIsAdmin(res.isAdmin ?? checkUserIsAdmin(currentUser));
      } else {
        setSession(null);
        setUser(null);
        setIsAdmin(false);
      }
    } catch (err) {
      console.warn('[AuthGuard] Error al verificar sesión:', err.message);
      setSession(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    if (syncStatus.syncing) return;
    setSyncStatus(prev => ({ ...prev, syncing: true, error: null }));

    try {
      const res = await ipcRenderer.invoke('sync:ejecutar');
      if (res && res.ok) {
        aplicarResultadoSync(res);
      } else if (res?.requiereDecision) {
        setSyncStatus(prev => ({ ...prev, syncing: false, pendingCount: res.pendingCount || prev.pendingCount }));
        setDecisionSync(res.resumen);
      } else {
        setSyncStatus(prev => ({
          ...prev,
          syncing: false,
          error: res?.error || 'Sin conexión a la nube',
          pendingCount: res?.pendingCount || prev.pendingCount
        }));
      }
    } catch (err) {
      setSyncStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message
      }));
    }
  };

  const handleLogout = async () => {
    try {
      await ipcRenderer.invoke('auth:logout');
    } catch (err) {
      console.warn('Error en logout:', err);
    }
    setSession(null);
    setUser(null);
  };

  useEffect(() => {
    checkSession();
  }, []);

  // Al iniciar con sesión activa o tras login, sincronizar automáticamente (si no está desactivado)
  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    ipcRenderer.invoke('sync:obtenerConfig').then(res => {
      if (cancelled) return;
      const mode = res?.config?.mode ?? 'auto';
      if (mode === 'auto') {
        triggerSync();
      }

      const handleOnline = async () => {
        const cfg = await ipcRenderer.invoke('sync:obtenerConfig');
        if ((cfg?.config?.mode ?? 'auto') === 'auto') {
          console.log('[AuthGuard] Conexión restaurada, sincronizando...');
          triggerSync();
        }
      };

      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    });

    return () => { cancelled = true; };
  }, [session]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0f19',
        color: '#e2e8f0',
        fontFamily: 'Inter, system-ui, sans-serif',
        gap: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)'
        }}>
          <span className="material-symbols-outlined spinning" style={{ fontSize: '28px', color: '#fff' }}>
            sync
          </span>
        </div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#94a3b8' }}>
          Iniciando ViaControl...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginView
        onLoginSuccess={(newSession, newIsAdmin) => {
          setSession(newSession);
          const currentUser = newSession.user;
          setUser(currentUser);
          if (typeof newIsAdmin === 'boolean') {
            setIsAdmin(newIsAdmin);
          } else {
            setIsAdmin(checkUserIsAdmin(currentUser));
            ipcRenderer.invoke('auth:esAdmin').then(r => {
              if (r && r.ok) setIsAdmin(!!r.isAdmin);
            });
          }
        }}
      />
    );
  }

  return (
    <AuthContext.Provider value={{
      session,
      user,
      isAdmin,
      logout: handleLogout,
      syncStatus,
      triggerSync
    }}>
      {children}
      {decisionSync && (
        <DecisionPrimeraSync
          resumen={decisionSync}
          onPosponer={() => setDecisionSync(null)}
          onResuelto={(res) => {
            setDecisionSync(null);
            // Tras reemplazar, todas las vistas tienen datos viejos en memoria: recargar la interfaz
            if (res.reemplazado) window.location.reload();
            else aplicarResultadoSync(res);
          }}
        />
      )}
    </AuthContext.Provider>
  );
}
