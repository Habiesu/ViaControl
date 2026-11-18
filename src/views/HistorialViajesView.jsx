import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
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

  // Estado importación Excel
  const [importModal, setImportModal] = useState(false);
  const [importFilas, setImportFilas] = useState(null);
  const [importFilePath, setImportFilePath] = useState('');
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState(null); // { exitosos, errores }

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

          <button
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => { setImportModal(true); setImportFilas(null); setImportResult(null); setImportFilePath(''); }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
            Importar Excel
          </button>
        </div>
      </div>

      {/* TABLA DE VIAJES */}
      <div className="table-container" style={{
        height: 'calc(100vh - 360px)',
        minHeight: '280px',
        overflowY: 'auto'
      }}>
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
        <Modal onClose={() => setViajeAEditar(null)} cerrarAlClicFuera labelledBy="editar-viaje-titulo" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <div id="editar-viaje-titulo" style={{ fontWeight: 700, fontSize: '16px' }}>
                Modificar Registro de Viaje #{viajeAEditar.id}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setViajeAEditar(null)} aria-label="Cerrar">✕</button>
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
                      data-autofocus
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
        </Modal>
      )}

      {/* MODAL CONFIRMACIÓN DE ELIMINACIÓN */}
      {viajeAEliminar && (
        <Modal onClose={() => setViajeAEliminar(null)} labelledBy="eliminar-viaje-titulo" className="card" style={{ maxWidth: '440px', width: '90%', border: '1px solid var(--tertiary)' }}>
            <div className="card-header">
              <div id="eliminar-viaje-titulo" className="card-title" style={{ color: 'var(--tertiary)' }}>
                <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '6px' }}>warning</span>
                Confirmar Eliminación
              </div>
            </div>

            <div style={{ margin: '14px 0', fontSize: '14px', color: 'var(--on-surface)' }}>
              ¿Está seguro de eliminar permanentemente el viaje a <strong>{viajeAEliminar.destino}</strong> ({viajeAEliminar.fecha}) por monto de <strong style={{ color: 'var(--primary)' }}>{formatUSD(viajeAEliminar.precio_viaje)}</strong>?
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setViajeAEliminar(null)} data-autofocus>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={() => ejecutarEliminacionViaje(viajeAEliminar.id)}>
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span> Confirmar y Eliminar
              </button>
            </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL DE IMPORTACIÓN EXCEL
      ═══════════════════════════════════════════════════════════════════ */}
      {importModal && (
        <Modal
          onClose={importando ? undefined : () => { setImportModal(false); setImportResult(null); setImportFilas(null); }}
          labelledBy="importar-viajes-titulo"
          className="card"
          style={{ width: '720px', maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        >

            {/* Header */}
            <div className="card-header" style={{ borderBottom: '1px solid var(--surface-variant)' }}>
              <div id="importar-viajes-titulo" className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>upload_file</span>
                Importar Viajes desde Excel
              </div>
              <button className="btn btn-ghost btn-sm" aria-label="Cerrar" onClick={() => { setImportModal(false); setImportResult(null); setImportFilas(null); }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>

              {/* Resultado final */}
              {importResult ? (
                <div>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '18px' }}>
                    <div className="kpi-card" style={{ flex: 1, textAlign: 'center' }}>
                      <div className="kpi-data">
                        <span className="kpi-label">Importados</span>
                        <span className="kpi-value" style={{ color: 'var(--primary)' }}>{importResult.exitosos}</span>
                      </div>
                    </div>
                    <div className="kpi-card" style={{ flex: 1, textAlign: 'center' }}>
                      <div className="kpi-data">
                        <span className="kpi-label">Con errores</span>
                        <span className="kpi-value" style={{ color: importResult.errores.length > 0 ? 'var(--tertiary)' : 'var(--primary)' }}>
                          {importResult.errores.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {importResult.errores.length > 0 && (
                    <>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tertiary)', marginBottom: '8px' }}>Filas con errores:</p>
                      <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'var(--surface-variant)', borderRadius: '8px', padding: '10px' }}>
                        {importResult.errores.map((e, i) => (
                          <div key={i} style={{ fontSize: '12px', padding: '3px 0', color: 'var(--on-surface)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <strong>Fila {e.fila}:</strong> {e.error}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    <button className="btn btn-secondary" onClick={() => { setImportModal(false); setImportResult(null); setImportFilas(null); cargarViajes(); }}>
                      Cerrar y actualizar
                    </button>
                    <button className="btn btn-primary" onClick={() => { setImportResult(null); setImportFilas(null); setImportFilePath(''); }}>
                      Importar otro archivo
                    </button>
                  </div>
                </div>

              ) : !importFilas ? (
                /* Paso 1: Seleccionar archivo */
                <div style={{ textAlign: 'center' }}>
                  <div style={{ marginBottom: '24px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '56px', color: 'var(--primary)', opacity: 0.7 }}>table_chart</span>
                    <p style={{ fontSize: '14px', color: 'var(--on-surface-variant)', marginTop: '8px' }}>
                      Selecciona un archivo <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong> con los viajes a importar.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={async () => {
                        const res = await ipcRenderer.invoke('import:descargarPlantilla');
                        if (res.canceled) return;
                        if (res.ok) showToast(`Plantilla guardada: ${res.path}`);
                        else showToast(res.error, 'error');
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                      Descargar Plantilla
                    </button>

                    <button
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={async () => {
                        const res = await ipcRenderer.invoke('import:seleccionarArchivo');
                        if (res.canceled) return;
                        if (!res.ok) { showToast(res.error, 'error'); return; }
                        setImportFilas(res.filas);
                        setImportFilePath(res.filePath);
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>folder_open</span>
                      Seleccionar Archivo
                    </button>
                  </div>
                </div>

              ) : (
                /* Paso 2: Previsualización */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '18px' }}>check_circle</span>
                    <span style={{ fontSize: '13px', color: 'var(--on-surface)' }}>
                      <strong>{importFilas.length}</strong> filas detectadas en: <em>{importFilePath.split(/[\/\\]/).pop()}</em>
                    </span>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setImportFilas(null); setImportFilePath(''); }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span> Cambiar
                    </button>
                  </div>

                  {/* Mini tabla preview (max 5 filas) */}
                  <div style={{ overflowX: 'auto', maxHeight: '220px', background: 'var(--surface-variant)', borderRadius: '8px', marginBottom: '16px' }}>
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {Object.keys(importFilas[0]).map(k => (
                            <th key={k} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--primary)', borderBottom: '1px solid var(--surface-variant)', whiteSpace: 'nowrap' }}>{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importFilas.slice(0, 5).map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {Object.values(row).map((v, j) => (
                              <td key={j} style={{ padding: '5px 8px', color: 'var(--on-surface)', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importFilas.length > 5 && (
                      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--on-surface-variant)', padding: '6px' }}>... y {importFilas.length - 5} filas más</p>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={() => setImportModal(false)} disabled={importando}>
                      Cancelar
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      disabled={importando}
                      onClick={async () => {
                        setImportando(true);
                        try {
                          const res = await ipcRenderer.invoke('import:procesarViajes', { filas: importFilas });
                          setImportResult({ exitosos: res.exitosos, errores: res.errores });
                          if (res.exitosos > 0) {
                            showToast(`${res.exitosos} viajes importados correctamente`);
                            cargarViajes();
                          }
                          if (res.errores.length > 0) showToast(`${res.errores.length} filas con errores`, 'error');
                        } catch (err) {
                          showToast('Error al procesar: ' + err.message, 'error');
                        } finally {
                          setImportando(false);
                        }
                      }}
                    >
                      {importando
                        ? <><span className="material-symbols-outlined" style={{ fontSize: '16px', animation: 'spin 1s linear infinite' }}>progress_activity</span> Importando...</>
                        : <><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Confirmar Importación</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
        </Modal>
      )}
    </div>
  );
}

export default HistorialViajesView;
