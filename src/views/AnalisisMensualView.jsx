import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets, parseTelefono, buildTelefono, PREFIJOS_VZLA } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

function AnalisisMensualView({ catalogos, showToast }) {
  const hoy = new Date();
  const [tipoPeriodo, setTipoPeriodo] = useState('esta_semana');
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [fechaInicio, setFechaInicio] = useState(getDateRangePresets('esta_semana').inicio);
  const [fechaFin, setFechaFin] = useState(getDateRangePresets('esta_semana').fin);
  const [analisis, setAnalisis] = useState(null);

  const cargarAnalisis = useCallback(async () => {
    try {
      let params = {};
      if (tipoPeriodo === 'mes') {
        params = { mes, anio };
      } else {
        params = { fecha_inicio: fechaInicio, fecha_fin: fechaFin };
      }
      const res = await ipcRenderer.invoke('analisis-mensual:obtener', params);
      if (res.ok) {
        setAnalisis(res.data);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error al obtener análisis: ' + err.message, 'error');
    }
  }, [tipoPeriodo, mes, anio, fechaInicio, fechaFin]);

  useEffect(() => {
    cargarAnalisis();
  }, [cargarAnalisis]);

  const cambiarPeriodo = (tipo) => {
    setTipoPeriodo(tipo);
    if (tipo === 'esta_semana' || tipo === 'semana_anterior') {
      const rango = getDateRangePresets(tipo);
      setFechaInicio(rango.inicio);
      setFechaFin(rango.fin);
    } else if (tipo === 'mes') {
      setMes(String(hoy.getMonth() + 1));
      setAnio(String(hoy.getFullYear()));
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Alcance del Análisis:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`btn btn-sm ${tipoPeriodo === 'esta_semana' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => cambiarPeriodo('esta_semana')}
              >
                📅 Esta Semana
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tipoPeriodo === 'semana_anterior' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => cambiarPeriodo('semana_anterior')}
              >
                📅 Semana Anterior
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tipoPeriodo === 'mes' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => cambiarPeriodo('mes')}
              >
                🗓️ Mensual
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tipoPeriodo === 'personalizado' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => cambiarPeriodo('personalizado')}
              >
                📆 Rango Libre
              </button>
            </div>

            {tipoPeriodo === 'mes' && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '6px' }}>
                <select
                  className="form-select"
                  value={mes}
                  onChange={e => setMes(e.target.value)}
                  style={{ width: '140px' }}
                >
                  <option value="1">Enero</option>
                  <option value="2">Febrero</option>
                  <option value="3">Marzo</option>
                  <option value="4">Abril</option>
                  <option value="5">Mayo</option>
                  <option value="6">Junio</option>
                  <option value="7">Julio</option>
                  <option value="8">Agosto</option>
                  <option value="9">Septiembre</option>
                  <option value="10">Octubre</option>
                  <option value="11">Noviembre</option>
                  <option value="12">Diciembre</option>
                </select>

                <select
                  className="form-select"
                  value={anio}
                  onChange={e => setAnio(e.target.value)}
                  style={{ width: '100px' }}
                >
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
              </div>
            )}

            {tipoPeriodo === 'personalizado' && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '6px' }}>
                <input
                  type="date"
                  className="form-input"
                  value={fechaInicio}
                  onChange={e => setFechaInicio(e.target.value)}
                />
                <span style={{ color: 'var(--text-muted)' }}>a</span>
                <input
                  type="date"
                  className="form-input"
                  value={fechaFin}
                  onChange={e => setFechaFin(e.target.value)}
                />
              </div>
            )}

            <button className="btn btn-secondary btn-sm" onClick={cargarAnalisis} title="Recargar datos">
              🔄 Actualizar
            </button>
          </div>

          {analisis && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Período evaluado: <strong style={{ color: 'var(--accent-emerald)' }}>{analisis.rango.inicio}</strong> al <strong style={{ color: 'var(--accent-emerald)' }}>{analisis.rango.fin}</strong>
            </div>
          )}
        </div>
      </div>

      {analisis && (
        <div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-blue"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>attach_money</span></div>
              <div className="kpi-data">
                <span className="kpi-label">Facturación Flota</span>
                <span className="kpi-value">{formatUSD(analisis.kpis.totalFacturado)}</span>
                <span className="kpi-helper">{analisis.kpis.totalViajesFlota} viajes</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-rose">📉</div>
              <div className="kpi-data">
                <span className="kpi-label">Gastos Operativos</span>
                <span className="kpi-value">{formatUSD(analisis.kpis.totalGastosOperativos)}</span>
                <span className="kpi-helper">Combustible + Peajes + Chofer + Taller</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-emerald">🏆</div>
              <div className="kpi-data">
                <span className="kpi-label">Ganancia Neta</span>
                <span className="kpi-value emerald">{formatUSD(analisis.kpis.totalGananciaFlota)}</span>
                <span className="kpi-helper">Margen Flota: {analisis.kpis.margenGlobalFlota}%</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-purple">⭐</div>
              <div className="kpi-data">
                <span className="kpi-label">Unidad Más Rentable</span>
                <span className="kpi-value" style={{ fontSize: '19px' }}>
                  {analisis.kpis.gandolaEstrella ? analisis.kpis.gandolaEstrella.placa : 'N/A'}
                </span>
                <span className="kpi-helper">
                  {analisis.kpis.gandolaEstrella ? formatUSD(analisis.kpis.gandolaEstrella.gananciaNeta) + ` (${analisis.kpis.gandolaEstrella.margenRentabilidad}%)` : 'Sin viajes'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>local_shipping</span> Ranking de Rendimiento y Margen Operativo por Unidad</div>
                <div className="card-subtitle">Segregación completa de costes de combustible, viáticos, pagos y taller.</div>
              </div>
            </div>

            <div className="table-container scrollable-table" style={{ maxHeight: '65vh' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Gandola</th>
                    <th>Viajes</th>
                    <th>Flete Bruto</th>
                    <th>Gasoil</th>
                    <th>Peajes + Viát.</th>
                    <th>Pago Chofer</th>
                    <th>Mantenimiento</th>
                    <th>Costo Operativo</th>
                    <th>Ganancia Neta</th>
                    <th>Margen %</th>
                  </tr>
                </thead>
                <tbody>
                  {analisis.reporteGandolas.map((g, idx) => {
    const badgeClass = g.margenRentabilidad >= 40 ? 'badge-emerald' : (g.margenRentabilidad >= 25 ? 'badge-amber' : 'badge-rose');
    return (
                      <tr key={g.placa}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)' }} className="mono">
                              {g.placa}
                            </span>
                            {idx === 0 && g.gananciaNeta > 0 && (
                              <span className="badge badge-emerald" style={{ fontSize: '10px' }}>Top #1</span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {g.modelo || 'Gandola'} • {g.capacidad || 'Batea'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{g.cantidadViajes}</td>
                        <td className="mono" style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                          {formatUSD(g.fleteBruto)}
                        </td>
                        <td className="mono" style={{ fontSize: '12px' }}>{formatUSD(g.gasoil)}</td>
                        <td className="mono" style={{ fontSize: '12px' }}>{formatUSD(g.peajes + g.viaticos)}</td>
                        <td className="mono" style={{ fontSize: '12px', color: 'var(--accent-amber)' }}>
                          {formatUSD(g.pagoChofer)}
                        </td>
                        <td className="mono" style={{ fontSize: '12px', color: 'var(--accent-rose)' }}>
                          {formatUSD(g.gastosTaller)}
                        </td>
                        <td className="mono" style={{ fontWeight: 600, color: 'var(--accent-rose)' }}>
                          {formatUSD(g.gastosOperativos)}
                        </td>
                        <td className="mono" style={{ fontWeight: 800, color: g.gananciaNeta >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                          {formatUSD(g.gananciaNeta)}
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`} style={{ fontSize: '12px', fontWeight: 700 }}>
                            {g.margenRentabilidad}%
                          </span>
                        </td>
                      </tr>
                    );
  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// MÓDULO 5: Gestión de Choferes (Ver, Crear, Editar <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span>, Eliminar <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>)
// ==========================================================================

export default AnalisisMensualView;
