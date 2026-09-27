import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

function formatGandolaLabel(g) {
  if (!g) return '';
  const placa = (g.placa || '').trim();
  const modelo = (g.modelo || '').trim();
  if (!modelo || modelo.toLowerCase() === placa.toLowerCase()) {
    if (/^\d+$/.test(placa)) return `Unidad N° ${placa}`;
    return placa;
  }
  return `${placa} (${modelo})`;
}

function HistorialViajesView({ catalogos, onActualizarCatalogos, showToast }) {
  const [viajes, setViajes] = useState([]);
  const [viajeAEditar, setViajeAEditar] = useState(null);
  const [viajeAEliminar, setViajeAEliminar] = useState(null);

  const [filtros, setFiltros] = useState({
    busqueda: '',
    id_propietario: '',
    id_chofer: '',
    id_gandola: '',
    fecha_desde: '',
    fecha_hasta: ''
  });
  const [loading, setLoading] = useState(false);

  const getPropName = (idProp) => {
    if (!idProp) return '';
    const p = (catalogos.propietarios || []).find(pr => String(pr.id) === String(idProp));
    return p ? p.nombre : '';
  };

  const cargarViajes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('viajes:listar', filtros);
      if (res.ok) {
        // Ordenar del más reciente al más antiguo (Fecha DESC, ID DESC)
        const ordenados = [...res.data].sort((a, b) => {
          if (b.fecha !== a.fecha) {
            return b.fecha.localeCompare(a.fecha);
          }
          return (b.id || 0) - (a.id || 0);
        });
        setViajes(ordenados);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error al cargar viajes: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    cargarViajes();
  }, [cargarViajes]);

  const ejecutarEliminacionViaje = async (id) => {
    try {
      const res = await ipcRenderer.invoke('viajes:eliminar', id);
      if (res.ok) {
        showToast('Viaje eliminado con éxito');
        cargarViajes();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setViajeAEliminar(null);
      setTimeout(() => window.focus(), 50);
    }
  };

  const guardarEdicionViaje = async (e) => {
    e.preventDefault();
    try {
      const res = await ipcRenderer.invoke('viajes:guardar', viajeAEditar);
      if (res.ok) {
        showToast('Viaje modificado con éxito');
        setViajeAEditar(null);
        cargarViajes();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error al actualizar viaje: ' + err.message, 'error');
    }
  };

  // Resumen del conjunto filtrado
  const totales = useMemo(() => {
    const cantidad = viajes.length;
    const flete = viajes.reduce((acc, v) => acc + (Number(v.precio_viaje) || 0), 0);
    const chofer = viajes.reduce((acc, v) => acc + (Number(v.pago_chofer) || 0), 0);
    const gastos = viajes.reduce((acc, v) => acc + (Number(v.total_gastos) || 0), 0);
    const ganancia = viajes.reduce((acc, v) => acc + (Number(v.ganancia) || 0), 0);
    return { cantidad, flete, chofer, gastos, ganancia };
  }, [viajes]);

  return (
    <div>
      {/* KPIS DEL HISTORIAL */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-blue">
            <span className="material-symbols-outlined">inventory_2</span>
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Total Viajes</span>
            <span className="kpi-value">{totales.cantidad}</span>
            <span className="kpi-helper">Registros filtrados</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-blue">
            <span className="material-symbols-outlined">payments</span>
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Flete Facturado</span>
            <span className="kpi-value" title={formatUSD(totales.flete)}>{formatUSD(totales.flete)}</span>
            <span className="kpi-helper">Ingreso bruto</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-amber">
            <span className="material-symbols-outlined">person</span>
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Comisiones Chofer</span>
            <span className="kpi-value" title={formatUSD(totales.chofer)}>{formatUSD(totales.chofer)}</span>
            <span className="kpi-helper">10% devengado</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-rose">
            <span className="material-symbols-outlined">local_gas_station</span>
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Gastos Totales</span>
            <span className="kpi-value" title={formatUSD(totales.gastos)}>{formatUSD(totales.gastos)}</span>
            <span className="kpi-helper">Gasoil + Peajes + Viáticos</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box kpi-icon-emerald">
            <span className="material-symbols-outlined">trending_up</span>
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Ganancia Neta</span>
            <span className="kpi-value" style={{ color: 'var(--primary)' }} title={formatUSD(totales.ganancia)}>{formatUSD(totales.ganancia)}</span>
            <span className="kpi-helper">Utilidad consolidada</span>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div className="filter-bar" style={{ margin: 0 }}>
          <div className="search-input-box">
            <span className="search-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
            </span>
            <input
              type="text"
              className="form-input"
              placeholder="Buscar contenedor, destino, origen, chofer..."
              value={filtros.busqueda}
              onChange={e => setFiltros({ ...filtros, busqueda: e.target.value })}
            />
          </div>

          <div style={{ minWidth: '170px' }}>
            <select
              className="form-select"
              value={filtros.id_propietario}
              onChange={e => setFiltros({ ...filtros, id_propietario: e.target.value })}
            >
              <option value="">Todos los propietarios</option>
              {(catalogos.propietarios || []).map(p => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <select
              className="form-select"
              value={filtros.id_chofer}
              onChange={e => setFiltros({ ...filtros, id_chofer: e.target.value })}
            >
              <option value="">Todos los choferes</option>
              {catalogos.choferes.map(c => (<option key={c.id} value={c.nombre}>{c.nombre}</option>))}
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <select
              className="form-select"
              value={filtros.id_gandola}
              onChange={e => setFiltros({ ...filtros, id_gandola: e.target.value })}
            >
              <option value="">Todas las gandolas</option>
              {catalogos.gandolas.map(g => (<option key={g.id} value={g.placa}>{formatGandolaLabel(g)}</option>))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="date"
              className="form-input"
              value={filtros.fecha_desde}
              onChange={e => setFiltros({ ...filtros, fecha_desde: e.target.value })}
              title="Fecha Desde"
            />
            <span style={{ color: 'var(--on-surface-variant)' }}>a</span>
            <input
              type="date"
              className="form-input"
              value={filtros.fecha_hasta}
              onChange={e => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
              title="Fecha Hasta"
            />
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setFiltros({ busqueda: '', id_propietario: '', id_chofer: '', id_gandola: '', fecha_desde: '', fecha_hasta: '' })}
          >
            Restablecer
          </button>
        </div>
      </div>

      {/* TABLA DE VIAJES */}
      <div className="table-container" style={{ maxHeight: "540px", overflowY: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Fecha</th>
              <th>Contenedor</th>
              <th>Ruta (Origen ➔ Destino)</th>
              <th>Chofer</th>
              <th>Gandola</th>
              <th>Flete ($)</th>
              <th>Chofer (10%)</th>
              <th>Gasoil</th>
              <th>Peajes / Viát.</th>
              <th>Total Gastos</th>
              <th>Ganancia Neta</th>
              <th style={{ textAlign: 'center', minWidth: '100px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '36px', color: 'var(--primary)' }}>
                  <span className="material-symbols-outlined spinning" style={{ fontSize: '24px', verticalAlign: 'middle', marginRight: '8px' }}>sync</span>
                  Cargando bitácora de viajes...
                </td>
              </tr>
            ) : viajes.length === 0 ? (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '36px', color: 'var(--on-surface-variant)' }}>
                  No se encontraron viajes con los filtros seleccionados.
                </td>
              </tr>
            ) : viajes.map(v => {
              const foundGandola = (catalogos.gandolas || []).find(g => String(g.placa) === String(v.id_gandola));
              const gandolaDisplay = foundGandola ? formatGandolaLabel(foundGandola) : (v.id_gandola && v.id_gandola.startsWith('S/P-') ? 'Sin Placa' : v.id_gandola);

              return (
                <tr key={v.id}>
                  <td className="mono" style={{ textAlign: 'center', fontWeight: 600 }}>
                    {v.fecha}
                  </td>
                  <td>
                    <span className="badge badge-gray mono">{v.contenedor || 'S/C'}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{v.destino}</div>
                    <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>Desde: {v.origen}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{v.id_chofer}</div>
                    {v.id_propietario && getPropName(v.id_propietario) && (
                      <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>{getPropName(v.id_propietario)}</div>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-blue mono">{gandolaDisplay}</span>
                  </td>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--on-surface)' }}>
                    {formatUSD(v.precio_viaje)}
                  </td>
                  <td className="mono" style={{ color: 'var(--secondary)', fontWeight: 600 }}>
                    {formatUSD(v.pago_chofer)}
                  </td>
                  <td className="mono" style={{ fontSize: '12px' }}>
                    {formatUSD(v.gasoil)}
                  </td>
                  <td className="mono" style={{ fontSize: '12px' }}>
                    {formatUSD(Number(v.peajes || 0) + Number(v.viaticos || 0))}
                  </td>
                  <td className="mono" style={{ color: 'var(--tertiary)', fontWeight: 600 }}>
                    {formatUSD(v.total_gastos)}
                  </td>
                  <td className="mono" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                    {formatUSD(v.ganancia)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        title="Modificar viaje"
                        onClick={() => setViajeAEditar({ ...v })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        title="Eliminar viaje"
                        onClick={() => setViajeAEliminar(v)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL PARA EDITAR VIAJE */}
      {viajeAEditar && (
        <div className="modal-overlay" onClick={() => setViajeAEditar(null)}>
          <div className="modal-card" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: '16px' }}>
                Modificar Registro de Viaje #{viajeAEditar.id}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setViajeAEditar(null)}>✕</button>
            </div>
            <form onSubmit={guardarEdicionViaje}>
              <div className="modal-body">
                <div className="grid-form">
                  <div className="form-group">
                    <label className="form-label">Fecha *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={viajeAEditar.fecha}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, fecha: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">N° Contenedor</label>
                    <input
                      type="text"
                      className="form-input mono"
                      value={viajeAEditar.contenedor || ''}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, contenedor: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Origen *</label>
                    <select
                      className="form-select"
                      value={viajeAEditar.origen}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, origen: e.target.value })}
                      required
                    >
                      {(catalogos.origenes || ['Puerto Cabello', 'La Guaira', 'Guanta']).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Destino *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={viajeAEditar.destino}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, destino: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Chofer *</label>
                    <select
                      className="form-select"
                      value={viajeAEditar.id_chofer}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, id_chofer: e.target.value })}
                      required
                    >
                      {catalogos.choferes.map(c => (
                        <option key={c.id} value={c.nombre}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Gandola *</label>
                    <select
                      className="form-select"
                      value={viajeAEditar.id_gandola}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, id_gandola: e.target.value })}
                      required
                    >
                      {catalogos.gandolas.map(g => (
                        <option key={g.id} value={g.placa}>{formatGandolaLabel(g)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Flete ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input mono"
                      value={viajeAEditar.precio_viaje}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, precio_viaje: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Gasoil ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input mono"
                      value={viajeAEditar.gasoil}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, gasoil: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Peajes ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input mono"
                      value={viajeAEditar.peajes}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, peajes: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Viáticos ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input mono"
                      value={viajeAEditar.viaticos}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, viaticos: e.target.value })}
                    />
                  </div>

                  <div className="form-group col-span-2">
                    <label className="form-label">Notas / Observaciones</label>
                    <input
                      type="text"
                      className="form-input"
                      value={viajeAEditar.notas || ''}
                      onChange={e => setViajeAEditar({ ...viajeAEditar, notas: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setViajeAEditar(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACIÓN DE ELIMINACIÓN */}
      {viajeAEliminar && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 15, 25, 0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div className="card" style={{ maxWidth: '440px', width: '90%', border: '1px solid var(--tertiary)' }}>
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--tertiary)' }}>
                <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '6px' }}>warning</span>
                Confirmar Eliminación
              </div>
            </div>

            <div style={{ margin: '14px 0', fontSize: '14px', color: 'var(--on-surface)' }}>
              ¿Está seguro de eliminar permanentemente el viaje a <strong>{viajeAEliminar.destino}</strong> ({viajeAEliminar.fecha}) por monto de <strong style={{ color: 'var(--primary)' }}>{formatUSD(viajeAEliminar.precio_viaje)}</strong>?
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setViajeAEliminar(null)}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={() => ejecutarEliminacionViaje(viajeAEliminar.id)}>
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span> Confirmar y Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HistorialViajesView;
