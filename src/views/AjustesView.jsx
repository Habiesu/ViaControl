import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthGuard.jsx';

const { ipcRenderer } = window.require('electron');

export default function AjustesView({ showToast }) {
  const { user, logout, syncStatus, triggerSync } = useAuth();
  const [rutaDB, setRutaDB] = useState('');
  const [version, setVersion] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  // Estados del actualizador
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null); // 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    ipcRenderer.invoke('ajustes:obtenerRutaDatos').then(res => {
      if (res.ok) setRutaDB(res.ruta);
    });
    ipcRenderer.invoke('ajustes:obtenerVersion').then(res => {
      if (res.ok) setVersion(res.version);
    });

    const handleUpdaterStatus = (event, data) => {
      if (!data) return;
      setUpdateStatus(data.status);

      if (data.status === 'checking') {
        setCheckingUpdate(true);
      } else if (data.status === 'available') {
        setCheckingUpdate(false);
        setUpdateInfo(data);
      } else if (data.status === 'downloading') {
        setCheckingUpdate(false);
        setDownloadProgress(data.percent || 0);
      } else if (data.status === 'downloaded') {
        setCheckingUpdate(false);
        setUpdateInfo(data);
      } else if (data.status === 'up-to-date') {
        setCheckingUpdate(false);
        setUpdateInfo(data);
      } else if (data.status === 'error') {
        setCheckingUpdate(false);
        setUpdateInfo(data);
      }
    };

    ipcRenderer.on('updater:status', handleUpdaterStatus);

    return () => {
      ipcRenderer.removeListener('updater:status', handleUpdaterStatus);
    };
  }, []);

  const abrirCarpeta = async () => {
    setAbriendo(true);
    const res = await ipcRenderer.invoke('ajustes:abrirCarpetaDatos');
    setAbriendo(false);
    if (res.ok) showToast('Carpeta de datos abierta en el Explorador', 'success');
    else showToast('Error al abrir la carpeta: ' + res.error, 'error');
  };

  const comprobarActualizaciones = async () => {
    setCheckingUpdate(true);
    setUpdateStatus('checking');
    try {
      const res = await ipcRenderer.invoke('updater:check');
      if (!res.ok) {
        setCheckingUpdate(false);
        setUpdateStatus('error');
        setUpdateInfo({ error: res.message || res.error || 'No se pudo contactar al servidor de actualizaciones' });
      }
    } catch (err) {
      setCheckingUpdate(false);
      setUpdateStatus('error');
      setUpdateInfo({ error: err.message });
    }
  };

  const reiniciarEInstalar = () => {
    ipcRenderer.invoke('updater:quitAndInstall');
  };

  const handleManualSync = async () => {
    await triggerSync();
    showToast('Sincronización con la nube ejecutada');
  };

  return (
    <div className="ajustes-view">

      {/* ── SECCIÓN: Cuenta y Sincronización en la Nube ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined" style={{ color: '#3b82f6' }}>cloud_sync</span>
          <div>
            <h2>Cuenta y Sincronización en la Nube</h2>
            <p>Gestión de tu cuenta de usuario y estado de sincronización entre equipos.</p>
          </div>
        </div>

        <div className="ajustes-card">
          <div className="ajustes-row">
            <div className="ajustes-row-info">
              <span className="ajustes-row-label">
                <span className="material-symbols-outlined">account_circle</span>
                Sesión Activa
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--on-surface)' }}>
                  {user?.email || 'Usuario conectado'}
                </span>
                <span className="badge badge-emerald">
                  <span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>verified_user</span>
                  Conectado
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginTop: '4px' }}>
                {syncStatus.lastSync
                  ? `Última sincronización: ${new Date(syncStatus.lastSync).toLocaleString()}`
                  : 'Sincronización pendiente'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleManualSync}
                disabled={syncStatus.syncing}
                title="Sincronizar cambios locales y remotos"
              >
                <span className={`material-symbols-outlined ${syncStatus.syncing ? 'spinning' : ''}`} style={{ fontSize: '18px' }}>
                  sync
                </span>
                {syncStatus.syncing ? 'Sincronizando…' : 'Sincronizar Ahora'}
              </button>

              <button
                className="btn btn-danger"
                onClick={() => {
                  if (window.confirm('¿Seguro que deseas cerrar la sesión en esta computadora?')) {
                    logout();
                  }
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
                Cerrar Sesión
              </button>
            </div>
          </div>

          <div className="ajustes-hint">
            <span className="material-symbols-outlined">devices</span>
            <span>
              Cualquier cambio que realices en esta computadora se subirá a la nube y se reflejará automáticamente en otras computadoras al iniciar sesión con la misma cuenta.
            </span>
          </div>
        </div>
      </section>

      {/* ── SECCIÓN: Actualizaciones del Sistema ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined">system_update</span>
          <div>
            <h2>Actualizaciones del Sistema</h2>
            <p>Comprueba si hay nuevas versiones de ViaControl y actualiza automáticamente.</p>
          </div>
        </div>

        <div className="ajustes-card">
          <div className="ajustes-row">
            <div className="ajustes-row-info">
              <span className="ajustes-row-label">
                <span className="material-symbols-outlined">verified</span>
                Estado de la Aplicación
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface)' }}>
                  Versión actual: <span className="mono" style={{ color: 'var(--primary)' }}>v{version || '1.3.0'}</span>
                </span>

                {updateStatus === 'up-to-date' && (
                  <span className="badge badge-emerald">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>check_circle</span>
                    Al día
                  </span>
                )}
                {updateStatus === 'downloaded' && (
                  <span className="badge badge-amber">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>download_done</span>
                    Actualización lista
                  </span>
                )}
                {updateStatus === 'error' && (
                  <span className="badge badge-rose">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>warning</span>
                    Aviso
                  </span>
                )}
              </div>

              {/* Mensajes de estado detallados */}
              {updateStatus === 'checking' && (
                <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                  Buscando actualizaciones en el servidor...
                </span>
              )}
              {updateStatus === 'up-to-date' && (
                <span style={{ fontSize: '12px', color: 'var(--primary)' }}>
                  Tienes la versión más reciente instalada.
                </span>
              )}
              {updateStatus === 'downloading' && (
                <div style={{ marginTop: '6px', width: '220px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span>Descargando...</span>
                    <span className="mono">{downloadProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${downloadProgress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s' }}></div>
                  </div>
                </div>
              )}
              {updateStatus === 'downloaded' && (
                <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                  ¡Versión {updateInfo?.version ? `v${updateInfo.version}` : ''} descargada! Reinicia para aplicar.
                </span>
              )}
              {updateStatus === 'error' && (
                <span style={{ fontSize: '12px', color: '#f87171' }}>
                  {updateInfo?.error || 'No se pudo buscar actualizaciones'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {updateStatus === 'downloaded' ? (
                <button
                  id="btn-reiniciar-update"
                  className="btn btn-primary"
                  onClick={reiniciarEInstalar}
                  style={{ background: 'var(--primary)', color: '#0f172a', fontWeight: 700 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>restart_alt</span>
                  Reiniciar e Instalar
                </button>
              ) : (
                <button
                  id="btn-comprobar-update"
                  className="btn btn-secondary"
                  onClick={comprobarActualizaciones}
                  disabled={checkingUpdate}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    {checkingUpdate ? 'sync' : 'refresh'}
                  </span>
                  {checkingUpdate ? 'Buscando…' : 'Buscar actualizaciones'}
                </button>
              )}
            </div>
          </div>

          <div className="ajustes-hint">
            <span className="material-symbols-outlined">cloud_sync</span>
            <span>
              ViaControl revisa automáticamente al iniciar si existe una nueva versión disponible y la descarga en segundo plano.
            </span>
          </div>
        </div>
      </section>

      {/* ── SECCIÓN: Base de datos ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined">storage</span>
          <div>
            <h2>Base de Datos Local</h2>
            <p>Gestiona el archivo de almacenamiento local donde se guardan tus registros de ViaControl.</p>
          </div>
        </div>

        <div className="ajustes-card">
          <div className="ajustes-row">
            <div className="ajustes-row-info">
              <span className="ajustes-row-label">
                <span className="material-symbols-outlined">folder_open</span>
                Ubicación del archivo
              </span>
              <span className="ajustes-row-path">{rutaDB || 'Cargando…'}</span>
            </div>
            <button
              id="btn-abrir-carpeta-db"
              className="btn btn-secondary"
              onClick={abrirCarpeta}
              disabled={abriendo}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {abriendo ? 'hourglass_top' : 'launch'}
              </span>
              {abriendo ? 'Abriendo…' : 'Abrir carpeta'}
            </button>
          </div>

          <div className="ajustes-hint">
            <span className="material-symbols-outlined">info</span>
            <span>
              Tus datos se guardan de forma segura en tu equipo y se sincronizan automáticamente con la nube. Puedes respaldar tu archivo de datos cuando lo desees.
            </span>
          </div>
        </div>
      </section>

      {/* ── SECCIÓN: Acerca de ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined">info</span>
          <div>
            <h2>Acerca de ViaControl</h2>
            <p>Información de la aplicación instalada.</p>
          </div>
        </div>

        <div className="ajustes-card">
          <div className="ajustes-about-grid">
            <div className="ajustes-about-item">
              <span className="ajustes-about-label">Versión</span>
              <span className="ajustes-about-value">v{version || '1.3.0'}</span>
            </div>
            <div className="ajustes-about-item">
              <span className="ajustes-about-label">Plataforma</span>
              <span className="ajustes-about-value">ViaControl Terminal Core</span>
            </div>
            <div className="ajustes-about-item">
              <span className="ajustes-about-label">Almacenamiento</span>
              <span className="ajustes-about-value">Local Seguro</span>
            </div>
            <div className="ajustes-about-item">
              <span className="ajustes-about-label">Sincronización</span>
              <span className="ajustes-about-value">Nube Automática</span>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
