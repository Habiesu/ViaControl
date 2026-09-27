import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets, parseTelefono, buildTelefono, PREFIJOS_VZLA } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

function RutasView({ catalogos, onActualizar, showToast }) {
  const [rutas, setRutas] = useState([]);
  const [origenFiltro, setOrigenFiltro] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [rutaForm, setRutaForm] = useState({ id: null, origen: 'Puerto Cabello', destino: '', precio_base: '' });
  const [sincronizando, setSincronizando] = useState(false);

  const cargarRutas = async () => {
    try {
      const res = await ipcRenderer.invoke('rutas:listar');
      if (res.ok) setRutas(res.data);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    cargarRutas();
  }, []);

  const sincronizarDesdeExcel = async () => {
    setSincronizando(true);
    try {
      const res = await ipcRenderer.invoke('rutas:importar-excel');
      if (res.ok) {
        showToast(`¡Excel Sincronizado! ${res.totalImportados} rutas nuevas y ${res.totalActualizados} actualizadas.`);
        await cargarRutas();
        await onActualizar();
      } else {
        showToast(res.error || 'No se pudo sincronizar el archivo Excel', 'error');
      }
    } catch (err) {
      showToast('Error al importar Excel: ' + err.message, 'error');
    } finally {
      setSincronizando(false);
    }
  };

  const guardarRuta = async (e) => {
    e.preventDefault();
    if (!rutaForm.origen || !rutaForm.destino || !rutaForm.precio_base) {
      return showToast('Complete origen, destino y precio', 'error');
    }
    try {
      const res = await ipcRenderer.invoke('rutas:guardar', rutaForm);
      if (res.ok) {
        showToast(res.mensaje);
        setRutaForm({ id: null, origen: rutaForm.origen, destino: '', precio_base: '' });
        cargarRutas();
        onActualizar();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const eliminarRuta = async (id, origen, destino) => {
    if (!window.confirm(`¿Eliminar la tarifa para ${origen} ➔ ${destino}?`)) return;
    try {
      const res = await ipcRenderer.invoke('rutas:eliminar', id);
      if (res.ok) {
        showToast('Ruta eliminada');
        cargarRutas();
        onActualizar();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  // Extraer lista de orígenes únicos
  const origenesUnicos = useMemo(() => {
    const s = new Set(rutas.map(r => r.origen));
    return Array.from(s).sort();
  }, [rutas]);

  // Rutas filtradas
  const rutasFiltradas = useMemo(() => {
    return rutas.filter(r => {
      const matchOrigen = origenFiltro === 'TODOS' || r.origen.toLowerCase() === origenFiltro.toLowerCase();
      const matchBusqueda = !busqueda || r.destino.toLowerCase().includes(busqueda.toLowerCase()) || r.origen.toLowerCase().includes(busqueda.toLowerCase());
      return matchOrigen && matchBusqueda;
    });
  }, [rutas, origenFiltro, busqueda]);

  return (
    <div>
      {/* BARRA DE ACCIÓN Y SINCRONIZACIÓN EXCEL */}
      <div className="card" style={{ marginBottom: '24px', padding: '18px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>analytics</span> Catálogo Dinámico de Precios por Origen y Destino
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Base de datos cargada directamente desde <strong>Listas_de_Precios_Fletes.xlsx</strong> (Hojas: La Guaira, Puerto Cabello, Guanta).
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={sincronizarDesdeExcel}
            disabled={sincronizando}
          >
            {sincronizando ? 'Leyendo Excel...' : 'Sincronizar / Reimportar Excel'}
          </button>
        </div>
      </div>

      <div className="layout-grid-sidebar">
        {/* FORMULARIO CREAR / EDITAR RUTA */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                {rutaForm.id ? 'Modificar Tarifa de Ruta' : 'Nueva Ruta y Tarifa'}
              </div>
              <div className="card-subtitle">
                {rutaForm.id ? `Editando ID #${rutaForm.id}` : 'Agregue un nuevo par Origen ➔ Destino con su flete'}
              </div>
            </div>
          </div>

          <form onSubmit={guardarRuta}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Ciudad / Puerto de Origen *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: Puerto Cabello, La Guaira, Guanta..."
                value={rutaForm.origen}
                onChange={e => setRutaForm({ ...rutaForm, origen: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Ciudad / Estado de Destino *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: Maturín, Valencia, Barquisimeto..."
                value={rutaForm.destino}
                onChange={e => setRutaForm({ ...rutaForm, destino: e.target.value.toUpperCase() })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">Tarifa Base del Flete ($) *</label>
              <input
                type="number"
                step="0.01"
                min="1"
                className="form-input mono"
                placeholder="0.00"
                value={rutaForm.precio_base}
                onChange={e => setRutaForm({ ...rutaForm, precio_base: e.target.value })}
                required
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                El 10% del chofer será: {formatUSD((Number(rutaForm.precio_base) || 0) * 0.10)}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {rutaForm.id && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRutaForm({ id: null, origen: 'Puerto Cabello', destino: '', precio_base: '' })}
                >
                  Cancelar
                </button>
              )}
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>save</span> {rutaForm.id ? 'Actualizar Tarifa' : 'Guardar Ruta'}
              </button>
            </div>
          </form>
        </div>

        {/* LISTA Y TABLA DE RUTAS */}
        <div>
          <div className="card" style={{ marginBottom: '16px', padding: '14px 18px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              {/* Selector de Origen (Pestañas Rápidas) */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Origen:</span>
                <button
                  type="button"
                  className={`btn btn-sm ${origenFiltro === 'TODOS' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setOrigenFiltro('TODOS')}
                >
                  Todos ({rutas.length})
                </button>
                {origenesUnicos.map(orig => (
                  <button
                    key={orig}
                    type="button"
                    className={`btn btn-sm ${origenFiltro === orig ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setOrigenFiltro(orig)}
                  >
                    {orig} ({rutas.filter(r => r.origen === orig).length})
                  </button>
                ))}
              </div>

              <div className="search-input-box" style={{ minWidth: '220px' }}>
                <span className="search-icon"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>search</span></span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Buscar destino..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="table-container scrollable-table" style={{ maxHeight: '65vh' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Tarifa Base ($)</th>
                  <th>10% Chofer Sugerido</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rutasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No se encontraron rutas con los filtros seleccionados.
                    </td>
                  </tr>
                ) : rutasFiltradas.map(r => (
                  <tr key={r.id}>
                    <td>
                      <span className="badge badge-gray mono">{r.origen}</span>
                    </td>
                    <td><strong>{r.destino}</strong></td>
                    <td className="mono" style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: '14px' }}>
                      {formatUSD(r.precio_base)}
                    </td>
                    <td className="mono" style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
                      {formatUSD(r.precio_base * 0.10)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Editar precio o ruta"
                          onClick={() => setRutaForm({ ...r })}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span> Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          title="Eliminar ruta"
                          onClick={() => eliminarRuta(r.id, r.origen, r.destino)}
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
// MÓDULO 8: Gastos de Mantenimiento y Taller
// ==========================================================================

export default RutasView;
