import React, { useState, useEffect, createContext, useContext } from 'react';
import LoginView from '../views/LoginView.jsx';

const { ipcRenderer } = window.require('electron');

export const AuthContext = createContext({
  session: null,
  user: null,
  logout: () => {},
  syncStatus: { syncing: false, lastSync: null, pendingCount: 0, error: null },
  triggerSync: () => {}
});

export const useAuth = () => useContext(AuthContext);

export default function AuthGuard({ children, onDataRefreshed }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({
    syncing: false,
    lastSync: null,
    pendingCount: 0,
    error: null
  });

  const checkSession = async () => {
    try {
      setLoading(true);
      const res = await ipcRenderer.invoke('auth:getSession');
      if (res.ok && res.session) {
        setSession(res.session);
        setUser(res.user || res.session.user);
      } else {
        setSession(null);
        setUser(null);
      }
    } catch (err) {
      console.warn('[AuthGuard] Error al verificar sesión:', err.message);
      setSession(null);
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
        setSyncStatus({
          syncing: false,
          lastSync: res.lastSync,
          pendingCount: res.pendingCount || 0,
          error: null
        });

        if (res.pulled > 0 && typeof onDataRefreshed === 'function') {
          onDataRefreshed(res.pulled);
        }
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

  // Al iniciar con sesión activa o tras login, sincronizar automáticamente
  useEffect(() => {
    if (session) {
      triggerSync();

      const handleOnline = () => {
        console.log('[AuthGuard] Conexión restaurada, sincronizando...');
        triggerSync();
      };

      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    }
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
        onLoginSuccess={(newSession) => {
          setSession(newSession);
          setUser(newSession.user);
        }}
      />
    );
  }

  return (
    <AuthContext.Provider value={{
      session,
      user,
      logout: handleLogout,
      syncStatus,
      triggerSync
    }}>
      {children}
    </AuthContext.Provider>
  );
}
