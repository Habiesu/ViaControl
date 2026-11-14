import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../components/AuthGuard.jsx';

const { ipcRenderer } = window.require('electron');

export default function AjustesView({ showToast, theme, onThemeChange }) {
  const { user, isAdmin, logout, syncStatus, triggerSync } = useAuth();
  const [rutaDB, setRutaDB] = useState('');
  const [version, setVersion] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  // Estados del actualizador
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Modo de sincronización (disponible tanto para clientes como para admins)
  const [syncMode, setSyncMode] = useState('auto');
  const [savingMode, setSavingMode] = useState(false);
  const [marcando, setMarcando] = useState(false);

  const cargarConfig = useCallback(async () => {
    const res = await ipcRenderer.invoke('sync:obtenerConfig');
    if (res.ok) setSyncMode(res.config?.mode ?? 'auto');
  }, []);

  useEffect(() => {
    ipcRenderer.invoke('ajustes:obtenerRutaDatos').then(res => { if (res.ok) setRutaDB(res.ruta); });
    ipcRenderer.invoke('ajustes:obtenerVersion').then(res => { if (res.ok) setVersion(res.version); });
    cargarConfig();

    const handleUpdaterStatus = (event, data) => {
      if (!data) return;
      setUpdateStatus(data.status);
      if (data.status === 'checking') setCheckingUpdate(true);
      else if (data.status === 'available') { setCheckingUpdate(false); setUpdateInfo(data); }
      else if (data.status === 'downloading') { setCheckingUpdate(false); setDownloadProgress(data.percent || 0); }
      else if (data.status === 'downloaded') { setCheckingUpdate(false); setUpdateInfo(data); }
      else if (data.status === 'up-to-date') { setCheckingUpdate(false); setUpdateInfo(data); }
      else if (data.status === 'error') { setCheckingUpdate(false); setUpdateInfo(data); }
    };

    ipcRenderer.on('updater:status', handleUpdaterStatus);
    return () => ipcRenderer.removeListener('updater:status', handleUpdaterStatus);
  }, [cargarConfig]);

  const abrirCarpeta = async () => {
    setAbriendo(true);
    const res = await ipcRenderer.invoke('ajustes:abrirCarpetaDatos');
    setAbriendo(false);
    if (res.ok) showToast('Carpeta de datos abierta en el Explorador', 'success');
    else showToast('Error al abrir la carpeta: ' + res.error, 'error');
  };

  const comprobarActualizaciones = async () => {
    setCheckingUpdate(true); setUpdateStatus('checking');
    try {
      const res = await ipcRenderer.invoke('updater:check');
      if (!res.ok) { setCheckingUpdate(false); setUpdateStatus('error'); setUpdateInfo({ error: res.message || res.error || 'No se pudo contactar al servidor de actualizaciones' }); }
    } catch (err) { setCheckingUpdate(false); setUpdateStatus('error'); setUpdateInfo({ error: err.message }); }
  };

  const reiniciarEInstalar = () => ipcRenderer.invoke('updater:quitAndInstall');

  const handleManualSync = async () => {
    await triggerSync();
    showToast('Sincronización con la nube ejecutada');
  };

  const guardarSyncMode = async (mode) => {
    setSavingMode(true);
    setSyncMode(mode);
    const res = await ipcRenderer.invoke('sync:guardarConfig', { mode });
    setSavingMode(false);
    if (res.ok) showToast(`Modo de sincronización: ${mode === 'auto' ? 'Automático' : mode === 'manual' ? 'Manual' : 'Desactivado'}`, 'success');
    else showToast('Error al guardar configuración', 'error');
  };

  const marcarTodoSincronizado = async () => {
    if (!window.confirm('¿Marcar todos los registros pendientes como "sincronizados" sin subirlos a la nube?\n\nÚsalo cuando hayas cargado una BD de cliente y no quieras contaminar la nube.')) return;
    setMarcando(true);
    const res = await ipcRenderer.invoke('sync:marcarTodoSincronizado');
    setMarcando(false);
    if (res.ok) showToast(`${res.total} registros marcados como sincronizados.`, 'success');
    else showToast('Error: ' + res.error, 'error');
  };

  const abrirVentanaLogs = async () => {
    await ipcRenderer.invoke('app:abrirVentanaLogs');
  };

  const SYNC_MODE_LABELS = { auto: 'Automático', manual: 'Solo Manual', disabled: 'Desactivado (Local)' };
  const SYNC_MODE_DESC = {
    auto: 'Sincroniza automáticamente al iniciar y al guardar cambios.',
    manual: 'Solo sincroniza cuando pulsas el botón "Sincronizar Ahora".',
    disabled: 'No se conecta a la nube. Todo el trabajo queda estrictamente en este equipo.'
  };

  return (
    <div className="ajustes-view">

      {/* ── Apariencia: modo claro / oscuro ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>palette</span>
          <div>
            <h2>Apariencia</h2>
            <p>Elige cómo se ve ViaControl en esta computadora.</p>
          </div>
        </div>

        <div className="ajustes-card">
          <div className="ajustes-row">
            <div className="ajustes-row-info">
              <span className="ajustes-row-label">
                <span className="material-symbols-outlined">contrast</span>
                Modo de color
              </span>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                {theme === 'dark' ? 'Fondo oscuro, cómodo con poca luz.' : 'Fondo claro, ideal para oficina con luz de día.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['light', 'light_mode', 'Claro'], ['dark', 'dark_mode', 'Oscuro']].map(([modo, icono, etiqueta]) => (
                <button
                  key={modo}
                  className={`btn btn-sm ${theme === modo ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onThemeChange(modo)}
                  aria-pressed={theme === modo}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{icono}</span>
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECCIÓN UNIFICADA: Control de Sincronización ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined" style={{ color: '#38bdf8' }}>cloud_sync</span>
          <div>
            <h2>Control de Sincronización</h2>
            <p>Gestiona tu cuenta y configura cómo y cuándo se sincronizan tus datos con la nube.</p>
          </div>
        </div>

        <div className="ajustes-card">
          {/* Fila 1: Cuenta activa y botón Sincronizar Ahora */}
          <div className="ajustes-row" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
            <div className="ajustes-row-info">
              <span className="ajustes-row-label">
                <span className="material-symbols-outlined">account_circle</span>
                Sesión Activa
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--on-surface)' }}>{user?.email || 'Usuario conectado'}</span>
                <span className="badge badge-emerald">
                  <span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>verified_user</span>
                  Conectado
                </span>
                {isAdmin && (
                  <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>shield_person</span>
                    Administrador
                  </span>
                )}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                {syncStatus.lastSync ? `Última sincronización: ${new Date(syncStatus.lastSync).toLocaleString()}` : 'Sincronización pendiente'}
              </span>
            </div>
            <div>
              <button
                className="btn btn-secondary"
                onClick={handleManualSync}
                disabled={syncStatus.syncing || syncMode === 'disabled'}
                title="Sincronizar cambios locales y remotos"
              >
                <span className={`material-symbols-outlined ${syncStatus.syncing ? 'spinning' : ''}`} style={{ fontSize: '18px' }}>sync</span>
                {syncStatus.syncing ? 'Sincronizando…' : 'Sincronizar Ahora'}
              </button>
            </div>
          </div>

          {/* Fila 2: Selector de Modo de Sincronización */}
          <div className="ajustes-row" style={{ borderBottom: isAdmin ? '1px solid var(--outline-variant)' : 'none' }}>
            <div className="ajustes-row-info" style={{ maxWidth: '460px' }}>
              <span className="ajustes-row-label">
                <span className="material-symbols-outlined">settings_backup_restore</span>
                Modo de Sincronización
              </span>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
                {SYNC_MODE_DESC[syncMode]}
              </span>
              {syncMode === 'disabled' && (
                <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '6px', padding: '6px 10px', fontSize: '11.5px', color: '#facc15', marginTop: '4px' }}>
                  ⚠️ Modo local activado. Los datos no se sincronizan con la nube.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['auto', 'manual', 'disabled'].map(mode => (
                <button
                  key={mode}
                  className={`btn btn-sm ${syncMode === mode ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => guardarSyncMode(mode)}
                  disabled={savingMode}
                  style={mode === 'disabled' && syncMode === mode ? { background: 'rgba(239,68,68,0.2)', color: '#f87171', borderColor: 'rgba(239,68,68,0.4)' } : {}}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                    {mode === 'auto' ? 'sync' : mode === 'manual' ? 'touch_app' : 'cloud_off'}
                  </span>
                  {SYNC_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* Fila 3: Herramientas de Administrador */}
          {isAdmin && (
            <div className="ajustes-row">
              <div className="ajustes-row-info" style={{ maxWidth: '440px' }}>
                <span className="ajustes-row-label" style={{ color: '#f59e0b' }}>
                  <span className="material-symbols-outlined" style={{ color: '#f59e0b' }}>admin_panel_settings</span>
                  Herramientas de Administrador
                </span>
                <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
                  Abre la terminal de logs en una ventana independiente o resuelve conflictos de permisos RLS de bases de datos externas.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  onClick={abrirVentanaLogs}
                  title="Abre una ventana independiente con la terminal de logs en vivo"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>terminal</span>
                  Abrir Visor de Logs
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={marcarTodoSincronizado}
                  disabled={marcando}
                  style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}
                  title="Marca registros pendientes como sincronizados para evitar errores de RLS"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>task_alt</span>
                  {marcando ? 'Procesando…' : 'Resolver Error RLS'}
                </button>
              </div>
            </div>
          )}

          <div className="ajustes-hint">
            <span className="material-symbols-outlined">devices</span>
            <span>Tus datos se guardan primero en tu equipo (SQLite) y, si la sincronización está activa, se respaldan en la nube para compartirse entre tus equipos.</span>
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
                {updateStatus === 'up-to-date' && (<span className="badge badge-emerald"><span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>check_circle</span>Al día</span>)}
                {updateStatus === 'downloaded' && (<span className="badge badge-amber"><span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>download_done</span>Actualización lista</span>)}
                {updateStatus === 'error' && (<span className="badge badge-rose"><span className="material-symbols-outlined" style={{ fontSize: '13px', marginRight: '3px' }}>warning</span>Aviso</span>)}
              </div>
              {updateStatus === 'checking' && <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Buscando actualizaciones en el servidor...</span>}
              {updateStatus === 'up-to-date' && <span style={{ fontSize: '12px', color: 'var(--primary)' }}>Tienes la versión más reciente instalada.</span>}
              {updateStatus === 'downloading' && (
                <div style={{ marginTop: '6px', width: '220px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}><span>Descargando...</span><span className="mono">{downloadProgress}%</span></div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${downloadProgress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
              {updateStatus === 'downloaded' && <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>¡Versión {updateInfo?.version ? `v${updateInfo.version}` : ''} descargada! Reinicia para aplicar.</span>}
              {updateStatus === 'error' && <span style={{ fontSize: '12px', color: '#f87171' }}>{updateInfo?.error || 'No se pudo buscar actualizaciones'}</span>}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {updateStatus === 'downloaded' ? (
                <button id="btn-reiniciar-update" className="btn btn-primary" onClick={reiniciarEInstalar} style={{ background: 'var(--primary)', color: '#0f172a', fontWeight: 700 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>restart_alt</span>Reiniciar e Instalar
                </button>
              ) : (
                <button id="btn-comprobar-update" className="btn btn-secondary" onClick={comprobarActualizaciones} disabled={checkingUpdate}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{checkingUpdate ? 'sync' : 'refresh'}</span>
                  {checkingUpdate ? 'Buscando…' : 'Buscar actualizaciones'}
                </button>
              )}
            </div>
          </div>
          <div className="ajustes-hint">
            <span className="material-symbols-outlined">cloud_sync</span>
            <span>ViaControl revisa automáticamente al iniciar si existe una nueva versión disponible y la descarga en segundo plano.</span>
          </div>
        </div>
      </section>

      {/* ── SECCIÓN: Base de datos ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined">storage</span>
          <div><h2>Base de Datos Local</h2><p>Gestiona el archivo de almacenamiento local donde se guardan tus registros de ViaControl.</p></div>
        </div>
        <div className="ajustes-card">
          <div className="ajustes-row">
            <div className="ajustes-row-info">
              <span className="ajustes-row-label"><span className="material-symbols-outlined">folder_open</span>Ubicación del archivo</span>
              <span className="ajustes-row-path">{rutaDB || 'Cargando…'}</span>
            </div>
            <button id="btn-abrir-carpeta-db" className="btn btn-secondary" onClick={abrirCarpeta} disabled={abriendo}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{abriendo ? 'hourglass_top' : 'launch'}</span>
              {abriendo ? 'Abriendo…' : 'Abrir carpeta'}
            </button>
          </div>
          <div className="ajustes-hint">
            <span className="material-symbols-outlined">info</span>
            <span>Tus datos se guardan de forma segura en tu equipo. Puedes copiar el archivo .sqlite para hacer un respaldo manual en cualquier momento.</span>
          </div>
        </div>
      </section>

      {/* ── SECCIÓN FINAL: Cerrar Sesión ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined" style={{ color: '#ef4444' }}>logout</span>
          <div>
            <h2>Cerrar Sesión</h2>
            <p>Finaliza la sesión actual de tu cuenta en esta computadora.</p>
          </div>
        </div>
        <div className="ajustes-card">
          <div className="ajustes-row">
            <div className="ajustes-row-info">
              <span className="ajustes-row-label">
                Sesión iniciada con: <strong style={{ color: 'var(--on-surface)' }}>{user?.email || 'Usuario'}</strong>
              </span>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginTop: '2px' }}>
                Tus datos locales seguirán guardados en tu equipo. Solo se solicitarán tus credenciales la próxima vez que abras la app.
              </span>
            </div>
            <button
              id="btn-cerrar-sesion"
              className="btn btn-danger"
              onClick={() => { if (window.confirm('¿Seguro que deseas cerrar la sesión en esta computadora?')) logout(); }}
              style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', whiteSpace: 'nowrap' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
