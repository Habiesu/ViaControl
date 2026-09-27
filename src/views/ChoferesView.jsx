import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets, parseTelefono, buildTelefono, PREFIJOS_VZLA } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

function ChoferesView({ catalogos, onActualizar, showToast }) {
  const [choferes, setChoferes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [choferForm, setChoferForm] = useState({ id: null, nombre: '', cedula: '', telefono: '', porcentaje_comision: 10 });
  const [loading, setLoading] = useState(false);

  const cargarChoferes = async () => {
    try {
      const res = await ipcRenderer.invoke('choferes:listar');
      if (res.ok) setChoferes(res.data);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    cargarChoferes();
  }, []);

  const guardarChofer = async (e) => {
    e.preventDefault();
    if (!choferForm.nombre) return showToast('El nombre del chofer es obligatorio', 'error');
    try {
      const res = await ipcRenderer.invoke('choferes:guardar', choferForm);
      if (res.ok) {
        showToast(res.mensaje);
        setChoferForm({ id: null, nombre: '', cedula: '', telefono: '', porcentaje_comision: 10 });
        cargarChoferes();
        onActualizar();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const eliminarChofer = async (id, nombre) => {
    if (!window.confirm(`¿Está seguro de eliminar al chofer "${nombre}"?`)) return;
    try {
      const res = await ipcRenderer.invoke('choferes:eliminar', id);
      if (res.ok) {
        showToast('Chofer eliminado');
        cargarChoferes();
        onActualizar();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const choferesFiltrados = useMemo(() => {
    if (!busqueda) return choferes;
    const q = busqueda.toLowerCase();
    return choferes.filter(c => c.nombre.toLowerCase().includes(q) || (c.cedula && c.cedula.toLowerCase().includes(q)));
  }, [choferes, busqueda]);

  return (
    <div>
      <div className="layout-grid-sidebar">
        {/* FORMULARIO CREAR / EDITAR CHOFER */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                {choferForm.id ? 'Modificar Datos del Chofer' : 'Registrar Nuevo Chofer'}
              </div>
              <div className="card-subtitle">
                {choferForm.id ? `Editando registro ID #${choferForm.id}` : 'Ingrese los datos del conductor de la flota'}
              </div>
            </div>
          </div>

          <form onSubmit={guardarChofer}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Nombre y Apellido *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: Carlos Mendoza"
                value={choferForm.nombre}
                onChange={e => setChoferForm({ ...choferForm, nombre: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Cédula de Identidad</label>
              <input
                type="text"
                className="form-input mono"
                placeholder="Ej: V-15.421.902"
                value={choferForm.cedula}
                onChange={e => setChoferForm({ ...choferForm, cedula: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Teléfono de Contacto</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: 0414-5551234"
                value={choferForm.telefono}
                onChange={e => setChoferForm({ ...choferForm, telefono: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">Porcentaje de Comisión (%)</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="100"
                className="form-input mono"
                value={choferForm.porcentaje_comision}
                onChange={e => setChoferForm({ ...choferForm, porcentaje_comision: e.target.value })}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Porcentaje estándar pactado: 10%</span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {choferForm.id && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setChoferForm({ id: null, nombre: '', cedula: '', telefono: '', porcentaje_comision: 10 })}
                >
                  Cancelar
                </button>
              )}
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                {choferForm.id ? '💾 Guardar Modificación' : 'Guardar Chofer'}
              </button>
            </div>
          </form>
        </div>

        {/* LISTA Y TABLA DE CHOFERES */}
        <div>
          <div className="card" style={{ marginBottom: '16px', padding: '12px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="search-input-box" style={{ maxWidth: '320px' }}>
                <span className="search-icon"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>search</span></span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Buscar chofer por nombre o cédula..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>
              <span className="badge badge-emerald" style={{ fontSize: '12px' }}>
                {choferes.length} Choferes Registrados
              </span>
            </div>
          </div>

          <div className="table-container scrollable-table" style={{ maxHeight: '65vh' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre Completo</th>
                  <th>Cédula</th>
                  <th>Teléfono</th>
                  <th>Comisión</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {choferesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No se encontraron choferes registrados.
                    </td>
                  </tr>
                ) : choferesFiltrados.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{c.nombre}</div>
                    </td>
                    <td className="mono">{c.cedula || 'N/A'}</td>
                    <td>{c.telefono || 'N/A'}</td>
                    <td><span className="badge badge-amber">{c.porcentaje_comision || 10}%</span></td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Modificar datos del chofer"
                          onClick={() => setChoferForm({ ...c })}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span> Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          title="Eliminar chofer"
                          onClick={() => eliminarChofer(c.id, c.nombre)}
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
// MÓDULO 6: Gestión de Gandolas (Ver, Crear, Editar <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span>, Eliminar <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>)
// ==========================================================================

export default ChoferesView;
