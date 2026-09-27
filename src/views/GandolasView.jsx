import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets, parseTelefono, buildTelefono, PREFIJOS_VZLA } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

function GandolasView({ catalogos, onActualizar, showToast }) {
  const [gandolas, setGandolas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [gandolaForm, setGandolaForm] = useState({ id: null, placa: '', modelo: '', capacidad: '' });

  const cargarGandolas = async () => {
    try {
      const res = await ipcRenderer.invoke('gandolas:listar');
      if (res.ok) setGandolas(res.data);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    cargarGandolas();
  }, []);

  const guardarGandola = async (e) => {
    e.preventDefault();
    if (!gandolaForm.placa) return showToast('La placa de la unidad es obligatoria', 'error');
    try {
      const res = await ipcRenderer.invoke('gandolas:guardar', gandolaForm);
      if (res.ok) {
        showToast(res.mensaje);
        setGandolaForm({ id: null, placa: '', modelo: '', capacidad: '' });
        cargarGandolas();
        onActualizar();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const eliminarGandola = async (id, placa) => {
    if (!window.confirm(`¿Está seguro de eliminar la gandola placa "${placa}"?`)) return;
    try {
      const res = await ipcRenderer.invoke('gandolas:eliminar', id);
      if (res.ok) {
        showToast('Gandola eliminada');
        cargarGandolas();
        onActualizar();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const gandolasFiltradas = useMemo(() => {
    if (!busqueda) return gandolas;
    const q = busqueda.toLowerCase();
    return gandolas.filter(g => g.placa.toLowerCase().includes(q) || (g.modelo && g.modelo.toLowerCase().includes(q)));
  }, [gandolas, busqueda]);

  return (
    <div>
      <div className="layout-grid-sidebar">
        {/* FORMULARIO CREAR / EDITAR GANDOLA */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                {gandolaForm.id ? 'Modificar Gandola' : 'Registrar Nueva Gandola'}
              </div>
              <div className="card-subtitle">
                {gandolaForm.id ? `Editando Placa ${gandolaForm.placa}` : 'Ingrese los datos de la unidad vehicular'}
              </div>
            </div>
          </div>

          <form onSubmit={guardarGandola}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Placa de la Unidad *</label>
              <input
                type="text"
                className="form-input mono"
                placeholder="Ej: A12BC3D"
                value={gandolaForm.placa}
                onChange={e => setGandolaForm({ ...gandolaForm, placa: e.target.value.toUpperCase() })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Marca y Modelo</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: Mack Vision 2008 / Freightliner Coronado"
                value={gandolaForm.modelo}
                onChange={e => setGandolaForm({ ...gandolaForm, modelo: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">Tipo de Remolque / Capacidad</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: Batea 40 pies, Chuto doble eje, Tolva granelera..."
                value={gandolaForm.capacidad}
                onChange={e => setGandolaForm({ ...gandolaForm, capacidad: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {gandolaForm.id && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setGandolaForm({ id: null, placa: '', modelo: '', capacidad: '' })}
                >
                  Cancelar
                </button>
              )}
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                {gandolaForm.id ? '💾 Guardar Modificación' : 'Guardar Gandola'}
              </button>
            </div>
          </form>
        </div>

        {/* LISTA Y TABLA DE GANDOLAS */}
        <div>
          <div className="card" style={{ marginBottom: '16px', padding: '12px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="search-input-box" style={{ maxWidth: '320px' }}>
                <span className="search-icon"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>search</span></span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Buscar por placa o modelo..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>
              <span className="badge badge-blue" style={{ fontSize: '12px' }}>
                {gandolas.length} Gandolas en Flota
              </span>
            </div>
          </div>

          <div className="table-container scrollable-table" style={{ maxHeight: '65vh' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Modelo</th>
                  <th>Configuración</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gandolasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No se encontraron gandolas registradas.
                    </td>
                  </tr>
                ) : gandolasFiltradas.map(g => (
                  <tr key={g.id}>
                    <td>
                      <span className="badge badge-blue mono" style={{ fontSize: '14px', fontWeight: 800 }}>
                        {g.placa}
                      </span>
                    </td>
                    <td><strong>{g.modelo || 'Sin modelo especificado'}</strong></td>
                    <td>{g.capacidad || 'Plataforma portacontenedor'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Modificar datos de la unidad"
                          onClick={() => setGandolaForm({ ...g })}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span> Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          title="Eliminar unidad"
                          onClick={() => eliminarGandola(g.id, g.placa)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// MÓDULO 7: Rutas y Tarifas (Sincronización Excel y Edición)
// ==========================================================================

export default GandolasView;
