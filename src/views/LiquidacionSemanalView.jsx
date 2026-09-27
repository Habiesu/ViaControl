import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets, parseTelefono, buildTelefono, PREFIJOS_VZLA } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

function LiquidacionSemanalView({ catalogos, showToast }) {
  // ── Pestaña activa ──────────────────────────────────────
  const [tabActiva, setTabActiva] = useState('chofer'); // 'chofer' | 'propietario'

  // ── Estado Chofer ───────────────────────────────────────
  const [idChofer, setIdChofer] = useState(catalogos.choferes[0] ? catalogos.choferes[0].nombre : '');
  const [fechaInicio, setFechaInicio] = useState(getDateRangePresets('esta_semana').inicio);
  const [fechaFin, setFechaFin] = useState(getDateRangePresets('esta_semana').fin);
  const [liquidacionData, setLiquidacionData] = useState(null);
  const [showAdelantoModal, setShowAdelantoModal] = useState(false);
  const [adelantoForm, setAdelantoForm] = useState({ fecha: getTodayString(), descripcion: '', monto: '' });

  // ── Estado Propietario ──────────────────────────────────
  const propietarios = catalogos.propietarios || [];
  const [idPropietario, setIdPropietario] = useState(propietarios[0] ? propietarios[0].id : '');
  const [fechaInicioP, setFechaInicioP] = useState(getDateRangePresets('esta_semana').inicio);
  const [fechaFinP, setFechaFinP] = useState(getDateRangePresets('esta_semana').fin);
  const [resumenPropData, setResumenPropData] = useState(null);
  const [loadingProp, setLoadingProp] = useState(false);

  const cargarLiquidacion = async () => {
    if (!idChofer) return showToast('Seleccione un chofer', 'error');
    try {
      const res = await ipcRenderer.invoke('liquidacion-semanal:obtener', {
        id_chofer: idChofer,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin

      });
      if (res.ok) {
        setLiquidacionData(res.data);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    if (idChofer) cargarLiquidacion();
  }, [idChofer, fechaInicio, fechaFin]);

  const aplicarRangoRapido = (preset) => {
    const rango = getDateRangePresets(preset);
    setFechaInicio(rango.inicio);
    setFechaFin(rango.fin);
  };

  const guardarAdelanto = async (e) => {
    e.preventDefault();
    if (!adelantoForm.monto || Number(adelantoForm.monto) <= 0) return showToast('Monto inválido', 'error');
    try {
      const res = await ipcRenderer.invoke('gastos-extra:guardar', {
        fecha: adelantoForm.fecha,
        id_chofer: idChofer,
        categoria: 'Adelanto Chofer',
        tipo: 'Deduccion_Chofer',
        descripcion: adelantoForm.descripcion || 'Adelanto de sueldo / flete',
        monto: adelantoForm.monto
      });
      if (res.ok) {
        showToast('Adelanto registrado correctamente');
        setShowAdelantoModal(false);
        setAdelantoForm({ fecha: getTodayString(), descripcion: '', monto: '' });
        cargarLiquidacion();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const eliminarDeduccion = async (id) => {
    if (!window.confirm('¿Desea eliminar este adelanto/deducción?')) return;
    try {
      const res = await ipcRenderer.invoke('gastos-extra:eliminar', id);
      if (res.ok) {
        showToast('Deducción eliminada');
        cargarLiquidacion();
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const cargarResumenProp = async () => {
    if (!idPropietario) return showToast('Seleccione un propietario', 'error');
    setLoadingProp(true);
    try {
      const res = await ipcRenderer.invoke('resumen-propietario:obtener', {
        id_propietario: idPropietario,
        fecha_inicio: fechaInicioP,
        fecha_fin: fechaFinP
      });
      if (res.ok) setResumenPropData(res.data);
      else showToast(res.error, 'error');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setLoadingProp(false);
    }
  };

  useEffect(() => {
    if (idPropietario && tabActiva === 'propietario') cargarResumenProp();
  }, [idPropietario, fechaInicioP, fechaFinP, tabActiva]);

  const aplicarRangoRapidoP = (preset) => {
    const r = getDateRangePresets(preset);
    setFechaInicioP(r.inicio);
    setFechaFinP(r.fin);
  };

  return (
    <div>
      {/* SELECTOR DE PESTAÑA */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          className={`btn ${tabActiva === 'chofer' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTabActiva('chofer')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>person</span> Liquidación a Chofer
        </button>
        <button
          className={`btn ${tabActiva === 'propietario' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTabActiva('propietario')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--primary)" }}>domain</span> Resumen por Propietario
        </button>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* PESTAÑA: RESUMEN PROPIETARIO            */}
      {/* ═══════════════════════════════════════ */}
      {tabActiva === 'propietario' && (
        <div>
          {/* Filtros */}
          <div className="card no-print" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ minWidth: '220px' }}>
                <label className="form-label">Propietario *</label>
                <select className="form-select" value={idPropietario} onChange={e => setIdPropietario(e.target.value)}>
                  <option value="">-- Seleccionar --</option>
                  {propietarios.map(p => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={fechaInicioP} onChange={e => setFechaInicioP(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={fechaFinP} onChange={e => setFechaFinP(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarRangoRapidoP('esta_semana')}>Esta Semana</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarRangoRapidoP('semana_anterior')}>Semana Pasada</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarRangoRapidoP('mes_actual')}>Este Mes</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarRangoRapidoP('mes_anterior')}>Mes Anterior</button>
              </div>
              <button className="btn btn-primary" onClick={cargarResumenProp} disabled={loadingProp}>
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>search</span> {loadingProp ? 'Cargando...' : 'Consultar'}
              </button>
              {resumenPropData && (
                <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>print</span> Imprimir / Guardar PDF Propietario
                </button>
              )}
            </div>
          </div>

          {!resumenPropData && (
            <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
              <div style={{ marginBottom: "12px" }}><span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--outline)" }}>domain</span></div>
              <div style={{ fontWeight: 600, fontSize: '16px' }}>Selecciona un propietario y consulta su resumen</div>
            </div>
          )}

          {resumenPropData && (
            <div className="receipt-container card" style={{ padding: '32px' }}>
              {/* ENCABEZADO IMPRESO DEL PROPIETARIO */}
              <div className="receipt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                    ESTADO DE CUENTA Y RENDIMIENTO DE FLOTA
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Flota y Transporte de Carga Pesada • Puerto Cabello, Venezuela
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Período Auditado: <strong>{resumenPropData.periodo.fecha_inicio}</strong> al <strong>{resumenPropData.periodo.fecha_fin}</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className="badge badge-emerald" style={{ fontSize: '13px', padding: '6px 14px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--primary)" }}>domain</span> Propietario: {resumenPropData.propietario.nombre}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Fecha de Emisión: {getTodayString()}
                  </div>
                </div>
              </div>

              {/* KPIs */}
              <div className="kpi-grid" style={{ marginBottom: '24px' }}>
                <div className="kpi-card">
                  <div className="kpi-icon-box kpi-icon-blue"><span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--primary)" }}>domain</span></div>
                  <div className="kpi-data">
                    <span className="kpi-label">Propietario</span>
                    <span className="kpi-value" style={{ fontSize: '16px' }}>{resumenPropData.propietario.nombre}</span>
                    <span className="kpi-helper">{resumenPropData.periodo.fecha_inicio} → {resumenPropData.periodo.fecha_fin}</span>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-icon-box kpi-icon-blue"><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>local_shipping</span></div>
                  <div className="kpi-data">
                    <span className="kpi-label">Gandolas Activas</span>
                    <span className="kpi-value">{resumenPropData.resumenGandolas.length}</span>
                    <span className="kpi-helper">Con gandolas asignadas</span>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-icon-box kpi-icon-blue"><span className="material-symbols-outlined">inventory_2</span></div>
                  <div className="kpi-data">
                    <span className="kpi-label">Total Viajes</span>
                    <span className="kpi-value">{resumenPropData.totales.totalViajes}</span>
                    <span className="kpi-helper">En el período</span>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-icon-box kpi-icon-emerald"><span className="material-symbols-outlined">payments</span></div>
                  <div className="kpi-data">
                    <span className="kpi-label">Flete Total Generado</span>
                    <span className="kpi-value" style={{ color: 'var(--accent-emerald)' }}>{formatUSD(resumenPropData.totales.totalFlete)}</span>
                    <span className="kpi-helper">Ingresos brutos del propietario</span>
                  </div>
                </div>
              </div>

              {/* Tabla por gandola */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px' }}><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>local_shipping</span> Consolidado por Gandola</div>
                {resumenPropData.resumenGandolas.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    No hay gandolas asignadas o no se registraron viajes en este período.
                  </div>
                )}
                {resumenPropData.resumenGandolas.length > 0 && (
                  <div className="table-container" style={{ marginBottom: '16px' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'center' }}>Gandola</th>
                          <th style={{ textAlign: 'center' }}>Modelo</th>
                          <th style={{ textAlign: 'center' }}>Viajes</th>
                          <th style={{ textAlign: 'right' }}>Flete Generado ($)</th>
                          <th style={{ textAlign: 'right' }}>Gastos Viaje ($)</th>
                          <th style={{ textAlign: 'right' }}>Gastos ($)</th>
                          <th style={{ textAlign: 'right' }}>Ganancia Neta ($)</th>
                        </tr>
                      </thead>
                    <tbody>
                      {resumenPropData.resumenGandolas.map(rg => (
                        <tr key={rg.gandola.id}>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{rg.gandola.placa}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                            {rg.gandola.marca || ''} {rg.gandola.modelo || '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {rg.totalViajes}
                          </td>
                          <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                            {formatUSD(rg.totalFlete)}
                          </td>
                          <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-rose)' }}>
                            {formatUSD(rg.totalGastosViaje)}
                          </td>
                          <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-amber)', fontWeight: 700 }}>
                            {formatUSD(rg.totalGastosTaller)}
                          </td>
                          <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: rg.totalGanancia >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                            {formatUSD(rg.totalGanancia)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                        <td colSpan="3" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>TOTAL GENERAL</td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-emerald)', fontSize: '15px' }}>
                          {formatUSD(resumenPropData.totales.totalFlete)}
                        </td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-rose)', fontSize: '15px' }}>
                          {formatUSD(resumenPropData.totales.totalGastosViaje)}
                        </td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-amber)', fontSize: '15px' }}>
                          {formatUSD(resumenPropData.totales.totalGastosTaller)}
                        </td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-emerald)', fontSize: '15px' }}>
                          {formatUSD(resumenPropData.totales.totalGanancia)}
                        </td>
                      </tr>
                    </tbody>
                  </table></div>
                )}
              </div>

              {/* Detalle completo de viajes del propietario */}
              {resumenPropData.resumenGandolas.some(rg => rg.viajes && rg.viajes.length > 0) && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px', marginTop: '24px' }}><span className="material-symbols-outlined" style={{ fontSize: "18px", verticalAlign: "middle", marginRight: "6px" }}>history_edu</span> Bitácora Detallada de Viajes del Período</div>
                  <div className="table-container" style={{ marginBottom: '16px' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'center' }}>Fecha</th>
                          <th style={{ textAlign: 'center' }}>Contenedor</th>
                          <th style={{ textAlign: 'center' }}>Origen ➔ Destino</th>
                          <th style={{ textAlign: 'center' }}>Gandola</th>
                          <th style={{ textAlign: 'center' }}>Chofer</th>
                          <th style={{ textAlign: 'right' }}>Flete ($)</th>
                        </tr>
                      </thead>
                    <tbody>
                      {resumenPropData.resumenGandolas.flatMap(rg => rg.viajes || []).map(v => (
                        <tr key={v.id}>
                          <td style={{ textAlign: 'center' }}>{v.fecha}</td>
                          <td className="mono" style={{ textAlign: 'center' }}>{v.contenedor || 'S/C'}</td>
                          <td style={{ textAlign: 'center' }}>{v.origen} ➔ {v.destino}</td>
                          <td className="mono" style={{ textAlign: 'center', fontWeight: 700 }}>{v.id_gandola}</td>
                          <td style={{ textAlign: 'center' }}>{v.id_chofer}</td>
                          <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{formatUSD(v.precio_viaje)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              )}

              {/* Detalle de gastos de taller del propietario */}
              {resumenPropData.resumenGandolas.some(rg => rg.gastosTaller && rg.gastosTaller.length > 0) && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '12px', marginTop: '24px' }}><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>build</span> Gastos de Taller, Mantenimiento y Repuestos en el Período</div>
                  <div className="table-container" style={{ marginBottom: '16px' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'center' }}>Fecha</th>
                          <th style={{ textAlign: 'center' }}>Gandola / Unidad</th>
                          <th style={{ textAlign: 'center' }}>Categoría</th>
                          <th>Descripción</th>
                          <th style={{ textAlign: 'right' }}>Monto ($)</th>
                        </tr>
                      </thead>
                    <tbody>
                      {resumenPropData.resumenGandolas.flatMap(rg => rg.gastosTaller || []).map(ge => (
                        <tr key={ge.id}>
                          <td style={{ textAlign: 'center' }}>{ge.fecha}</td>
                          <td className="mono" style={{ textAlign: 'center', fontWeight: 700 }}>{ge.id_gandola || 'Flota'}</td>
                          <td><span className="badge badge-amber">{ge.categoria}</span></td>
                          <td>{ge.descripcion}</td>
                          <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-rose)' }}>{formatUSD(ge.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* PESTAÑA: LIQUIDACIÓN CHOFER             */}
      {/* ═══════════════════════════════════════ */}
      {tabActiva === 'chofer' && (
      <div>
      <div className="card no-print" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: '220px' }}>
              <label className="form-label">Chofer a Liquidar *</label>
              <select
                className="form-select"
                value={idChofer}
                onChange={e => setIdChofer(e.target.value)}
              >
                {catalogos.choferes.map(c => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre} ({c.cedula || 'Sin C.I.'})
                  </option>
                ))}
              </select>
            </div>


            <div className="form-group">
              <label className="form-label">Período Desde</label>
              <input
                type="date"
                className="form-input"
                value={fechaInicio}
                onChange={e => setFechaInicio(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Período Hasta</label>
              <input
                type="date"
                className="form-input"
                value={fechaFin}
                onChange={e => setFechaFin(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarRangoRapido('esta_semana')}>
                Esta Semana
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarRangoRapido('semana_anterior')}>
                Semana Pasada
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarRangoRapido('mes_actual')}>
                Este Mes
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAdelantoModal(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span> Registrar Adelanto
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              🖨️ Imprimir / Guardar Recibo
            </button>
          </div>
        </div>
      </div>

      {liquidacionData && (
        <div className="receipt-container card" style={{ padding: '32px' }}>
          <div className="receipt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                RECIBO DE LIQUIDACIÓN DE FLETES
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Flota y Transporte de Carga Pesada • Puerto Cabello, Venezuela
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Período Auditado: <strong>{liquidacionData.periodo.fecha_inicio}</strong> al <strong>{liquidacionData.periodo.fecha_fin}</strong>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="badge badge-emerald" style={{ fontSize: '13px', padding: '6px 14px' }}>
                Liquidación Cerrada
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Fecha de Emisión: {getTodayString()}
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Chofer:</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>{liquidacionData.chofer.nombre}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Cédula de Identidad:</span>
                <div style={{ fontSize: '14px', fontWeight: 600 }} className="mono">{liquidacionData.chofer.cedula || 'N/A'}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Teléfono:</span>
                <div style={{ fontSize: '14px' }}>{liquidacionData.chofer.telefono || 'N/A'}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Viajes en el Período:</span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                  {liquidacionData.resumen.totalViajes} Viajes Realizados
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', color: 'var(--text-main)' }}>
              1. Detalle de Viajes Realizados ({liquidacionData.viajes.length})
            </div>
            <div className="table-container" style={{ overflow: 'visible' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '13%', textAlign: 'center' }}>Fecha</th>
                    <th style={{ width: '20%', textAlign: 'center' }}>N° Contenedor</th>
                    <th style={{ width: '31%', textAlign: 'center' }}>Ruta Realizada</th>
                    <th style={{ width: '14%', textAlign: 'center' }}>Gandola</th>
                    <th style={{ width: '11%', textAlign: 'right' }}>Pago Chofer ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidacionData.viajes.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        No se registraron viajes para este chofer en el período seleccionado.
                      </td>
                    </tr>
                  ) : liquidacionData.viajes.map(v => (
                    <tr key={v.id}>
                      <td className="mono" style={{ textAlign: 'center' }}>{v.fecha}</td>
                      <td className="mono" style={{ textAlign: 'center' }}><strong>{v.contenedor || 'S/C'}</strong></td>
                      <td style={{ textAlign: 'center' }}><strong>{v.destino}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>(desde {v.origen})</span></td>
                      <td className="mono" style={{ textAlign: 'center', fontWeight: 700 }}>{v.id_gandola}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-amber)', fontWeight: 700 }}>
                        {formatUSD(v.pago_chofer)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', marginBottom: '12px' }}>
              2. Adelantos y Descuentos al Chofer
            </div>
            <div className="table-container" style={{ overflow: 'visible' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>Fecha</th>
                    <th style={{ width: '25%' }}>Concepto</th>
                    <th>Descripción</th>
                    <th style={{ width: '18%', textAlign: 'right' }}>Monto Deducido ($)</th>
                    <th className="no-print" style={{ width: '8%', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidacionData.deducciones.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                        No existen adelantos registrados en este período.
                      </td>
                    </tr>
                  ) : liquidacionData.deducciones.map(d => (
                    <tr key={d.id}>
                      <td className="mono">{d.fecha}</td>
                      <td><span className="badge badge-amber">{d.categoria}</span></td>
                      <td>{d.descripcion}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-rose)', fontWeight: 700 }}>
                        -{formatUSD(d.monto)}
                      </td>
                      <td className="no-print" style={{ textAlign: 'center' }}>
                        <button className="btn btn-danger btn-sm" onClick={() => eliminarDeduccion(d.id)}><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <span className="calc-metric-label">Viajes Realizados</span>
              <div className="calc-metric-value blue" style={{ fontSize: '22px' }}>
                {liquidacionData.resumen.totalViajes}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Viajes completados en el período</span>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <span className="calc-metric-label">Total Pago por Viajes</span>
              <div className="calc-metric-value amber" style={{ fontSize: '22px' }}>
                {formatUSD(liquidacionData.resumen.totalPagoChofer)}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Monto bruto a favor del chofer</span>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <span className="calc-metric-label">(-) Total Adelantos Recibidos</span>
              <div className="calc-metric-value rose" style={{ fontSize: '22px' }}>
                -{formatUSD(liquidacionData.resumen.totalDeducciones)}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Descontado de la liquidación</span>
            </div>

            <div style={{ background: 'linear-gradient(145deg, #093322 0%, #062217 100%)', padding: '18px', borderRadius: 'var(--radius-md)', border: '2px solid var(--accent-emerald)' }}>
              <span className="calc-metric-label" style={{ color: '#86efac', fontWeight: 700 }}>
                ⭐ TOTAL NETO A COBRAR
              </span>
              <div className="calc-metric-value emerald" style={{ fontSize: '26px' }}>
                {formatUSD(liquidacionData.resumen.netoALiquidar)}
              </div>
              <span style={{ fontSize: '11px', color: '#a7f3d0' }}>Monto final a cancelar al chofer</span>
            </div>
          </div>
        </div>
      )}

      {showAdelantoModal && (
        <div className="modal-overlay" onClick={() => setShowAdelantoModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: '16px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span> Registrar Adelanto a: {idChofer}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAdelantoModal(false)}>✕</button>
            </div>
            <form onSubmit={guardarAdelanto}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Fecha *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={adelantoForm.fecha}
                    onChange={e => setAdelantoForm({ ...adelantoForm, fecha: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Monto del Adelanto ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className="form-input mono"
                    placeholder="0.00"
                    value={adelantoForm.monto}
                    onChange={e => setAdelantoForm({ ...adelantoForm, monto: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Motivo / Descripción *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Adelanto quincenal, préstamo para repuesto personal..."
                    value={adelantoForm.descripcion}
                    onChange={e => setAdelantoForm({ ...adelantoForm, descripcion: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdelantoModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Guardar Deducción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    )}
    </div>
  );
}


// ==========================================================================
// MÓDULO 4: Análisis de Rentabilidad (Semanal / Mensual)
// ==========================================================================

export default LiquidacionSemanalView;
