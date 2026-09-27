import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

export default function UpdateNotifier() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    // Obtener versión actual
    ipcRenderer.invoke('updater:getVersion').then(v => {
      if (v) setCurrentVersion(v);
    }).catch(() => {});

    // Escuchar eventos de actualización
    const handleStatus = (event, data) => {
      if (!data) return;

      if (data.status === 'available') {
        setUpdateInfo(data);
      } else if (data.status === 'downloading') {
        setDownloadProgress(data.percent);
      } else if (data.status === 'downloaded') {
        setDownloadProgress(null);
        setIsDownloaded(true);
        setUpdateInfo(data);
      } else if (data.status === 'error' || data.status === 'up-to-date') {
        setDownloadProgress(null);
      }
    };

    ipcRenderer.on('updater:status', handleStatus);

    return () => {
      ipcRenderer.removeListener('updater:status', handleStatus);
    };
  }, []);

  const handleRestart = () => {
    ipcRenderer.invoke('updater:quitAndInstall');
  };

  if (isDownloaded) {
    return (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        background: 'linear-gradient(135deg, #15803d, #166534)',
        color: '#fff',
        padding: '14px 20px',
        borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        border: '1px solid rgba(74, 222, 128, 0.4)',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#4ade80' }}>
            system_update
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px' }}>
              ¡Actualización {updateInfo?.version ? `v${updateInfo.version}` : ''} lista!
            </div>
            <div style={{ fontSize: '11px', opacity: 0.9 }}>
              Reinicia la aplicación para aplicar las novedades.
            </div>
          </div>
        </div>

        <button
          onClick={handleRestart}
          className="btn"
          style={{
            background: '#fff',
            color: '#15803d',
            fontWeight: 700,
            fontSize: '12px',
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Reiniciar Ahora
        </button>
      </div>
    );
  }

  if (downloadProgress !== null && downloadProgress > 0 && downloadProgress < 100) {
    return (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        background: 'var(--surface-container-high)',
        color: 'var(--on-surface)',
        padding: '12px 18px',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        border: '1px solid var(--outline-variant)',
        minWidth: '240px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
          <span>Descargando actualización...</span>
          <span className="mono">{downloadProgress}%</span>
        </div>
        <div style={{
          width: '100%',
          height: '6px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${downloadProgress}%`,
            height: '100%',
            background: 'var(--primary)',
            transition: 'width 0.2s ease'
          }}></div>
        </div>
      </div>
    );
  }

  return null;
}
