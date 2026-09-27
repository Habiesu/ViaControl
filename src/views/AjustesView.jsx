import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

export default function AjustesView({ showToast }) {
  const [rutaDB, setRutaDB] = useState('');
  const [version, setVersion] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    ipcRenderer.invoke('ajustes:obtenerRutaDatos').then(res => {
      if (res.ok) setRutaDB(res.ruta);
    });
    ipcRenderer.invoke('ajustes:obtenerVersion').then(res => {
      if (res.ok) setVersion(res.version);
    });
  }, []);

  const abrirCarpeta = async () => {
    setAbriendo(true);
    const res = await ipcRenderer.invoke('ajustes:abrirCarpetaDatos');
    setAbriendo(false);
    if (res.ok) showToast('Carpeta de datos abierta en el Explorador', 'success');
    else showToast('Error al abrir la carpeta: ' + res.error, 'error');
  };

  return (
    <div className="ajustes-view">

      {/* ── SECCIÓN: Base de datos ── */}
      <section className="ajustes-section">
        <div className="ajustes-section-header">
          <span className="material-symbols-outlined">storage</span>
          <div>
            <h2>Base de Datos Local</h2>
            <p>Gestiona el archivo SQLite donde se almacenan todos los datos de ViaControl.</p>
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
              Para hacer una copia de seguridad, copia el archivo <code>gandolas_db.sqlite</code> a otro lugar.
              Para restaurar, reemplaza ese mismo archivo con tu copia.
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
              <span className="ajustes-about-value">v{version || '–'}</span>
            </div>
            <div className="ajustes-about-item">
              <span className="ajustes-about-label">Motor</span>
              <span className="ajustes-about-value">Electron + React 19</span>
            </div>
            <div className="ajustes-about-item">
              <span className="ajustes-about-label">Base de datos</span>
              <span className="ajustes-about-value">SQLite 3 (local)</span>
            </div>
            <div className="ajustes-about-item">
              <span className="ajustes-about-label">Producto</span>
              <span className="ajustes-about-value">ViaControl — Gestión de Flota</span>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
