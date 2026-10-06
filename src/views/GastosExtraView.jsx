import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

// Helper para dar formato limpio a la unidad/gandola en selects y badges
function formatGandolaLabel(g) {
  if (!g) return '';
  const placa = (g.placa || '').trim();
  const modelo = (g.modelo || '').trim();
  
  if (!modelo || modelo.toLowerCase() === placa.toLowerCase()) {
    if (/^\d+$/.test(placa)) {
      return `Unidad N° ${placa}`;
    }
    return placa;
  }
  
  return `${placa} (${modelo})`;
}

function GastosExtraView({ catalogos, showToast }) {
  const [gastos, setGastos] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form State (Edición & Creación)
  const [gastoForm, setGastoForm] = useState({
    id: null,
    fecha: getTodayString(),
    categoria: 'Mantenimiento / Taller',
    id_gandola: '',
    descripcion: '',
    monto: '',
    asignarAgente: false,
    id_agente: ''
  });

  // Filtros State
  const [filtroGandola, setFiltroGandola] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroAgente, setFiltroAgente] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [presetFecha, setPresetFecha] = useState('todo');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Modal de confirmación para eliminar
  const [gastoAEliminar, setGastoAEliminar] = useState(null);

  const cargarGastos = async () => {
    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('gastos-extra:listar', { tipo: 'Gasto_Empresa' });
      if (res.ok) {
        setGastos(res.data);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error al cargar gastos: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const cargarAgentes = async () => {
    try {
      const res = await ipcRenderer.invoke('saldos:obtenerAgentes');
      if (res.ok && res.data) {
        setAgentes(res.data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    cargarGastos();
    cargarAgentes();
  }, []);

  const agentMap = useMemo(() => {
    const map = {};
    (agentes || []).forEach(a => {
      map[a.id] = a.nombre;
    });
    return map;
  }, [agentes]);

  const cambiarPresetFecha = (preset) => {
    setPresetFecha(preset);
    const presets = getDateRangePresets();
    if (preset === 'este-mes') {
      setFechaDesde(presets.esteMes.desde);
      setFechaHasta(presets.esteMes.hasta);
    } else if (preset === 'mes-anterior') {
      setFechaDesde(presets.mesAnterior.desde);
      setFechaHasta(presets.mesAnterior.hasta);
    } else if (preset === 'todo') {
      setFechaDesde('');
      setFechaHasta('');
    }
  };

  // Filtrado reactivo en memoria
  const gastosFiltrados = useMemo(() => {
    return gastos.filter(g => {
      // Filtro por Gandola
      if (filtroGandola === '__GENERAL__') {
        if (g.id_gandola) return false;
      } else if (filtroGandola && String(g.id_gandola) !== String(filtroGandola)) {
        return false;
      }

      // Filtro por Categoría
      if (filtroCategoria && g.categoria !== filtroCategoria) {
        return false;
      }

      // Filtro por Agente / Destino
      if (filtroAgente === '__SIN_AGENTE__') {
        if (g.id_agente) return false;
      } else if (filtroAgente === '__CON_AGENTE__') {
        if (!g.id_agente) return false;
      } else if (filtroAgente && String(g.id_agente) !== String(filtroAgente)) {
        return false;
      }

      // Filtro Búsqueda de Texto
      if (filtroBusqueda.trim()) {
        const q = filtroBusqueda.toLowerCase().trim();
        const desc = (g.descripcion || '').toLowerCase();
        const cat = (g.categoria || '').toLowerCase();
        const unit = (g.id_gandola || '').toLowerCase();
        const agentName = (agentMap[g.id_agente] || '').toLowerCase();
        if (!desc.includes(q) && !cat.includes(q) && !unit.includes(q) && !agentName.includes(q)) {
          return false;
        }
      }

      // Filtro Fechas
      if (fechaDesde && g.fecha < fechaDesde) return false;
      if (fechaHasta && g.fecha > fechaHasta) return false;

      return true;
    });
  }, [gastos, filtroGandola, filtroCategoria, filtroAgente, filtroBusqueda, fechaDesde, fechaHasta, agentMap]);

  // Cálculos dinámicos KPIs
  const stats = useMemo(() => {
    const totalMonto = gastosFiltrados.reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
    const cantidad = gastosFiltrados.length;
    const promedio = cantidad > 0 ? totalMonto / cantidad : 0;
    return { totalMonto, cantidad, promedio };
  }, [gastosFiltrados]);

  // Iniciar edición de un elemento
  const iniciarEdicion = (gasto) => {
    setGastoForm({
      id: gasto.id,
      fecha: gasto.fecha || getTodayString(),
      categoria: gasto.categoria || 'Mantenimiento / Taller',
      id_gandola: gasto.id_gandola || '',
      descripcion: gasto.descripcion || '',
      monto: gasto.monto || '',
      asignarAgente: !!gasto.id_agente,
      id_agente: gasto.id_agente ? String(gasto.id_agente) : ''
    });
  };

  const cancelarEdicion = () => {
    setGastoForm({
      id: null,
      fecha: getTodayString(),
      categoria: 'Mantenimiento / Taller',
      id_gandola: '',
      descripcion: '',
      monto: '',
      asignarAgente: false,
      id_agente: ''
    });
  };

  const guardarGasto = async (e) => {
    e.preventDefault();
    if (!gastoForm.monto || Number(gastoForm.monto) <= 0) {
      return showToast('Ingrese un monto válido para el gasto', 'error');
    }

    if (gastoForm.asignarAgente && !gastoForm.id_agente) {
      return showToast('Seleccione el agente al cual deducir este gasto', 'error');
    }

    try {
      const payload = {
        fecha: gastoForm.fecha,
        categoria: gastoForm.categoria,
        id_gandola: gastoForm.id_gandola || null,
        id_agente: (gastoForm.asignarAgente && gastoForm.id_agente) ? Number(gastoForm.id_agente) : null,
        tipo: 'Gasto_Empresa',
        descripcion: gastoForm.descripcion,
        monto: Number(gastoForm.monto)
      };

      if (gastoForm.id) {
        payload.id = gastoForm.id;
      }

      const res = await ipcRenderer.invoke('gastos-extra:guardar', payload);
      if (res.ok) {
        const msg = gastoForm.asignarAgente
          ? 'Gasto guardado y asignado a Saldos de Agentes exitosamente'
          : 'Gasto de flota registrado herméticamente (sin afectar agentes)';
        showToast(gastoForm.id ? 'Gasto actualizado con éxito' : msg);
        cancelarEdicion();
        cargarGastos();
      } else {
        showToast(res.error || 'Error al guardar el gasto', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const ejecutarEliminacion = async (id) => {
    try {
      const res = await ipcRenderer.invoke('gastos-extra:eliminar', id);
      if (res.ok) {
        showToast('Gasto de flota eliminado correctamente');
        if (gastoForm.id === id) cancelarEdicion();
        cargarGastos();
      } else {
        showToast(res.error || 'Error al eliminar', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setGastoAEliminar(null);
      setTimeout(() => window.focus(), 50);
    }
  };

  return (
    <div>
      {/* GRID PRINCIPAL: FORMULARIO A LA IZQUIERDA + SECCIÓN TABLA Y FILTROS A LA DERECHA */}
      <div className="layout-grid-sidebar">
        
        {/* COLUMNA IZQUIERDA: FORMULARIO DE REGISTRO / EDICIÓN */}
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-header">
            <div>
              <div className="card-title" style={{ color: gastoForm.id ? 'var(--primary)' : 'var(--on-surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                  {gastoForm.id ? 'edit_note' : 'build'}
                </span>
                {gastoForm.id ? ` Editar Gasto #${gastoForm.id}` : ' Registrar Gasto de Flota'}
              </div>
              <div className="card-subtitle">
                {gastoForm.id ? 'Modifique los datos y guarde los cambios' : 'Impacta en el análisis de rentabilidad de la unidad'}
              </div>
            </div>
          </div>

          <form onSubmit={guardarGasto}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Fecha *</label>
              <input
                type="date"
                className="form-input"
                value={gastoForm.fecha}
                onChange={e => setGastoForm({ ...gastoForm, fecha: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Gandola / Unidad Asociada</label>
              <select
                className="form-select"
                value={gastoForm.id_gandola}
                onChange={e => {
                  const placa = e.target.value;
                  let autoAgent = gastoForm.id_agente;
                  if (placa && !gastoForm.id_agente && agentes.length > 0) {
                    const foundGandola = (catalogos.gandolas || []).find(g => String(g.placa) === String(placa));
                    if (foundGandola && foundGandola.id_propietario) {
                      const matched = agentes.find(a => (a.propietarios || []).some(p => p.id === foundGandola.id_propietario) || a.id_propietario_vinculado === foundGandola.id_propietario);
                      if (matched) autoAgent = String(matched.id);
                    }
                  }
                  setGastoForm({ ...gastoForm, id_gandola: placa, id_agente: autoAgent });
                }}
              >
                <option value="">Gasto General de Flota (Sin unidad)</option>
                {(catalogos.gandolas || []).map(g => (
                  <option key={g.id} value={g.placa}>{formatGandolaLabel(g)}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Categoría *</label>
              <select
                className="form-select"
                value={gastoForm.categoria}
                onChange={e => setGastoForm({ ...gastoForm, categoria: e.target.value })}
              >
                <option value="Mantenimiento / Taller">Mantenimiento / Taller</option>
                <option value="Repuestos / Cauchos">Repuestos / Cauchos</option>
                <option value="Cambio de Aceite / Filtros">Cambio de Aceite / Filtros</option>
                <option value="Tránsito / Permisología">Tránsito / Permisología</option>
                <option value="Otros Gastos Operativos">Otros Gastos Operativos</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Monto ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="form-input mono"
                placeholder="0.00"
                value={gastoForm.monto}
                onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Descripción Detallada (Opcional)</label>
              <textarea
                rows="2"
                className="form-textarea"
                placeholder="Ej: Compra de 2 cauchos 295/80R22.5 o reparación de frenos traseros..."
                value={gastoForm.descripcion}
                onChange={e => setGastoForm({ ...gastoForm, descripcion: e.target.value })}
              ></textarea>
            </div>

            {/* SECCIÓN OPCIONAL: VINCULACIÓN HERMÉTICA O REFLEJO EN SALDOS DE AGENTES */}
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              borderRadius: '8px',
              background: gastoForm.asignarAgente ? 'rgba(90, 240, 179, 0.08)' : 'var(--surface-container-low)',
              border: `1px solid ${gastoForm.asignarAgente ? 'var(--primary)' : 'var(--outline-variant)'}`,
              transition: 'all 0.2s ease'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, userSelect: 'none' }}>
                <input
                  type="checkbox"
                  style={{ accentColor: 'var(--primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                  checked={gastoForm.asignarAgente}
                  onChange={e => {
                    const checked = e.target.checked;
                    let defaultAgent = gastoForm.id_agente;
                    if (checked && !defaultAgent && agentes.length > 0) {
                      if (gastoForm.id_gandola) {
                        const foundGandola = (catalogos.gandolas || []).find(g => String(g.placa) === String(gastoForm.id_gandola));
                        if (foundGandola && foundGandola.id_propietario) {
                          const matched = agentes.find(a => (a.propietarios || []).some(p => p.id === foundGandola.id_propietario) || a.id_propietario_vinculado === foundGandola.id_propietario);
                          if (matched) defaultAgent = String(matched.id);
                        }
                      }
                      if (!defaultAgent) defaultAgent = String(agentes[0].id);
                    }
                    setGastoForm({ ...gastoForm, asignarAgente: checked, id_agente: checked ? defaultAgent : '' });
                  }}
                />
                <span style={{ fontSize: '13px', fontWeight: 600, color: gastoForm.asignarAgente ? 'var(--primary)' : 'var(--on-surface)' }}>
                  Deducir / Asignar a Saldos de Agentes
                </span>
              </label>

              {gastoForm.asignarAgente && (
                <div style={{ marginTop: '10px' }}>
                  <label className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>
                    Agente Responsable *
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: '12px' }}
                    value={gastoForm.id_agente}
                    onChange={e => setGastoForm({ ...gastoForm, id_agente: e.target.value })}
                    required={gastoForm.asignarAgente}
                  >
                    <option value="">-- Seleccionar Agente --</option>
                    {agentes.map(ag => (
                      <option key={ag.id} value={ag.id}>
                        👤 {ag.nombre} {ag.total_propietarios ? `(${ag.total_propietarios} prop.)` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '11px', color: 'var(--outline)', marginTop: '4px' }}>
                    Se reflejará en el balance y en el Historial de Movimientos de este agente.
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {gastoForm.id && (
                <button type="button" className="btn btn-secondary" onClick={cancelarEdicion} style={{ flex: 1 }}>
                  Cancelar
                </button>
              )}
              <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                {gastoForm.id ? '💾 Actualizar Gasto' : '💾 Registrar Gasto'}
              </button>
            </div>
          </form>
        </div>

        {/* COLUMNA DERECHA: BARRA DE FILTROS + TABLA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
          
          {/* BARRA DE FILTROS */}
          <div className="card" style={{ padding: '16px' }}>
            {/* Fila 1: Buscador y Dropdowns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              
              {/* Campo Búsqueda */}
              <div style={{ position: 'relative', minWidth: '160px' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--outline)', fontSize: '18px' }}>search</span>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '34px', width: '100%' }}
                  placeholder="Buscar descripción, agente..."
                  value={filtroBusqueda}
                  onChange={e => setFiltroBusqueda(e.target.value)}
                />
              </div>

              {/* Filtro Unidad */}
              <div>
                <select
                  className="form-select"
                  style={{ width: '100%' }}
                  value={filtroGandola}
                  onChange={e => setFiltroGandola(e.target.value)}
                >
                  <option value="">Todas las Unidades</option>
                  <option value="__GENERAL__">Flota General</option>
                  {(catalogos.gandolas || []).map(g => (
                    <option key={g.id} value={g.placa}>{formatGandolaLabel(g)}</option>
                  ))}
                </select>
              </div>

              {/* Filtro Categoría */}
              <div>
                <select
                  className="form-select"
                  style={{ width: '100%' }}
                  value={filtroCategoria}
                  onChange={e => setFiltroCategoria(e.target.value)}
                >
                  <option value="">Todas las Categorías</option>
                  <option value="Mantenimiento / Taller">Mantenimiento / Taller</option>
                  <option value="Repuestos / Cauchos">Repuestos / Cauchos</option>
                  <option value="Cambio de Aceite / Filtros">Cambio de Aceite / Filtros</option>
                  <option value="Tránsito / Permisología">Tránsito / Permisología</option>
                  <option value="Otros Gastos Operativos">Otros Gastos Operativos</option>
                </select>
              </div>

              {/* Filtro Agente / Destino */}
              <div>
                <select
                  className="form-select"
                  style={{ width: '100%' }}
                  value={filtroAgente}
                  onChange={e => setFiltroAgente(e.target.value)}
                >
                  <option value="">Todos los Destinos</option>
                  <option value="__SIN_AGENTE__">🏢 Solo Flota General</option>
                  <option value="__CON_AGENTE__">👤 Con Agente Asignado</option>
                  {agentes.map(ag => (
                    <option key={ag.id} value={ag.id}>👤 {ag.nombre}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Fila 2: Presets de Fechas y Totales Resumidos */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
              
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="radio-tabs" style={{ borderRadius: '6px', overflow: 'hidden' }}>
                  <div className={`radio-tab ${presetFecha === 'todo' ? 'active' : ''}`} style={{ padding: '0 12px', fontSize: '11px' }} onClick={() => cambiarPresetFecha('todo')}>Todo</div>
                  <div className={`radio-tab ${presetFecha === 'este-mes' ? 'active' : ''}`} style={{ padding: '0 12px', fontSize: '11px' }} onClick={() => cambiarPresetFecha('este-mes')}>Este Mes</div>
                  <div className={`radio-tab ${presetFecha === 'mes-anterior' ? 'active' : ''}`} style={{ padding: '0 12px', fontSize: '11px' }} onClick={() => cambiarPresetFecha('mes-anterior')}>Mes Ant.</div>
                  <div className={`radio-tab ${presetFecha === 'personalizado' ? 'active' : ''}`} style={{ padding: '0 12px', fontSize: '11px' }} onClick={() => setPresetFecha('personalizado')}>Pers.</div>
                </div>

                {presetFecha === 'personalizado' && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input type="date" className="form-input" style={{ width: '130px' }} value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                    <span style={{ color: 'var(--outline)' }}>-</span>
                    <input type="date" className="form-input" style={{ width: '130px' }} value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                  </div>
                )}
              </div>

              {/* KPIs Resumidos */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px', background: 'var(--surface-container-low)', padding: '6px 12px', border: '1px solid var(--outline-variant)' }}>
                <div>
                  <span style={{ color: 'var(--outline)' }}>Total: </span>
                  <strong style={{ color: 'var(--tertiary)', fontFamily: 'var(--font-mono)' }}>{formatUSD(stats.totalMonto)}</strong>
                </div>
                <div style={{ width: '1px', height: '14px', background: 'var(--outline-variant)' }} />
                <div>
                  <span style={{ color: 'var(--outline)' }}>Registros: </span>
                  <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{stats.cantidad}</strong>
                </div>
              </div>

            </div>
          </div>

          {/* TABLA DE GASTOS */}
          <div className="table-container" style={{ maxHeight: '460px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Unidad / Destino</th>
                  <th>Descripción</th>
                  <th>Monto ($)</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--primary)' }}>
                      <span className="material-symbols-outlined spinning" style={{ fontSize: '24px', verticalAlign: 'middle', marginRight: '8px' }}>sync</span>
                      Cargando gastos de taller...
                    </td>
                  </tr>
                ) : gastosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--outline)' }}>
                      No se encontraron gastos con los filtros aplicados.
                    </td>
                  </tr>
                ) : gastosFiltrados.map(ge => {
                  const unidadLabel = (() => {
                    if (!ge.id_gandola) return null;
                    const found = (catalogos.gandolas || []).find(g => String(g.placa) === String(ge.id_gandola));
                    return found ? formatGandolaLabel(found) : `Unidad N° ${ge.id_gandola}`;
                  })();

                  const agenteNombre = ge.id_agente ? (agentMap[ge.id_agente] || `Agente #${ge.id_agente}`) : null;

                  return (
                    <tr key={ge.id} style={{ background: gastoForm.id === ge.id ? 'rgba(90, 240, 179, 0.08)' : 'transparent' }}>
                      <td className="mono">{ge.fecha}</td>
                      <td><span className="badge badge-amber">{ge.categoria}</span></td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          {unidadLabel ? (
                            <span className="badge badge-blue mono">{unidadLabel}</span>
                          ) : (
                            <span className="badge" style={{ background: 'var(--surface-container-high)', color: 'var(--outline)' }}>Flota General</span>
                          )}
                          {agenteNombre && (
                            <span className="badge badge-emerald" title="Deducido de Saldos de Agentes" style={{ fontSize: '10px' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '11px', marginRight: '2px' }}>person</span>
                              {agenteNombre}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{ge.descripcion || <span style={{ color: 'var(--outline)', fontStyle: 'italic' }}>Sin descripción</span>}</td>
                      <td className="mono" style={{ color: 'var(--tertiary)', fontWeight: 700 }}>
                        {formatUSD(ge.monto)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button className="btn btn-secondary btn-sm" title="Editar gasto" onClick={() => iniciarEdicion(ge)}>
                            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span>
                          </button>
                          <button className="btn btn-danger btn-sm" title="Eliminar gasto" onClick={() => setGastoAEliminar(ge)}>
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

        </div>

      </div>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {gastoAEliminar && (
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
              ¿Está seguro que desea eliminar este gasto de <strong>{gastoAEliminar.categoria}</strong> por un monto de <strong style={{ color: 'var(--tertiary)' }}>{formatUSD(gastoAEliminar.monto)}</strong>?
              {gastoAEliminar.id_agente && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#f87171' }}>
                  ⚠️ Este gasto está asignado a un agente; al eliminarlo, se reintegrará a su saldo disponible.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setGastoAEliminar(null)}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={() => ejecutarEliminacion(gastoAEliminar.id)}>
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span> Confirmar y Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default GastosExtraView;
