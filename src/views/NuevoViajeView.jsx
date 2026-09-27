import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets, parseTelefono, buildTelefono, PREFIJOS_VZLA } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

function NuevoViajeView({ catalogos, onViajeGuardado, onActualizarCatalogos, showToast }) {
  const origenesDisponibles = useMemo(() => {
    if (catalogos.origenes && catalogos.origenes.length > 0) return catalogos.origenes;
    // Extraer origenes unicos de rutas
    const setOrigenes = new Set(catalogos.rutas.map(r => r.origen));
    if (setOrigenes.size === 0) return ['Puerto Cabello', 'La Guaira', 'Guanta'];
    return Array.from(setOrigenes);
  }, [catalogos]);

  const [formData, setFormData] = useState({
    fecha: getTodayString(),
    contenedor: '',
    origen: origenesDisponibles[0] || 'Puerto Cabello',
    destino: '',
    id_propietario: '',
    id_chofer: '',
    id_gandola: '',
    precio_viaje: '',
    gasoil: '',
    peajes: '',
    viaticos: '',
    notas: ''
  });

  const [saving, setSaving] = useState(false);
  const [modalNuevaRuta, setModalNuevaRuta] = useState(false);
  const [nuevaRutaForm, setNuevaRutaForm] = useState({ origen: '', destino: '', precio_base: '' });

  const getPropName = (idProp) => {
    if (!idProp) return '';
    const p = (catalogos.propietarios || []).find(pr => String(pr.id) === String(idProp));
    return p ? p.nombre : '';
  };

  const choferesFiltrados = useMemo(() => {
    if (!formData.id_propietario) return catalogos.choferes || [];
    return (catalogos.choferes || []).filter(c => String(c.id_propietario) === String(formData.id_propietario));
  }, [catalogos.choferes, formData.id_propietario]);

  const gandolasFiltradas = useMemo(() => {
    if (!formData.id_propietario) return catalogos.gandolas || [];
    return (catalogos.gandolas || []).filter(g => String(g.id_propietario) === String(formData.id_propietario));
  }, [catalogos.gandolas, formData.id_propietario]);

  const handlePropietarioChange = (e) => {
    const propId = e.target.value;
    const choferesOwner = (catalogos.choferes || []).filter(c => String(c.id_propietario) === String(propId));
    const gandolasOwner = (catalogos.gandolas || []).filter(g => String(g.id_propietario) === String(propId));

    const newChofer = choferesOwner.length === 1 ? choferesOwner[0].nombre : (choferesOwner.some(c => c.nombre === formData.id_chofer) ? formData.id_chofer : '');
    const newGandola = gandolasOwner.length === 1 ? gandolasOwner[0].placa : (gandolasOwner.some(g => g.placa === formData.id_gandola) ? formData.id_gandola : '');

    setFormData(prev => ({
      ...prev,
      id_propietario: propId,
      id_chofer: newChofer,
      id_gandola: newGandola
    }));
  };

  const handleChoferChange = (e) => {
    const choferNombre = e.target.value;
    const choferObj = (catalogos.choferes || []).find(c => c.nombre === choferNombre);
    const choferPropId = choferObj ? choferObj.id_propietario : null;

    setFormData(prev => {
      let nextPropId = prev.id_propietario;
      if (choferPropId && !prev.id_propietario) {
        nextPropId = String(choferPropId);
      }
      return {
        ...prev,
        id_chofer: choferNombre,
        id_propietario: nextPropId
      };
    });
  };

  const handleGandolaChange = (e) => {
    const gandolaPlaca = e.target.value;
    const gandolaObj = (catalogos.gandolas || []).find(g => g.placa === gandolaPlaca);
    const gandolaPropId = gandolaObj ? gandolaObj.id_propietario : null;

    setFormData(prev => {
      let nextPropId = prev.id_propietario;
      if (gandolaPropId && !prev.id_propietario) {
        nextPropId = String(gandolaPropId);
      }
      return {
        ...prev,
        id_gandola: gandolaPlaca,
        id_propietario: nextPropId
      };
    });
  };

  // Filtrar destinos disponibles para el origen seleccionado
  const destinosParaOrigen = useMemo(() => {
    if (!formData.origen) return [];
    return catalogos.rutas.filter(
      r => r.origen.toLowerCase().trim() === formData.origen.toLowerCase().trim()
    );
  }, [catalogos.rutas, formData.origen]);

  // Al cambiar Origen, recalcular destinos y si el destino actual existe en ese origen, buscar precio
  const handleOrigenChange = (e) => {
    const nuevoOrigen = e.target.value;
    const rutaEncontrada = catalogos.rutas.find(
      r => r.origen.toLowerCase().trim() === nuevoOrigen.toLowerCase().trim() &&
        r.destino.toLowerCase().trim() === formData.destino.toLowerCase().trim()
    );

    setFormData(prev => ({
      ...prev,
      origen: nuevoOrigen,
      precio_viaje: rutaEncontrada ? rutaEncontrada.precio_base : prev.precio_viaje
    }));
  };

  // Al cambiar Destino, buscar precio base para (origen, destino)
  const handleDestinoChange = (e) => {
    const nuevoDestino = e.target.value;
    if (nuevoDestino === '__NUEVA_RUTA__') {
      setNuevaRutaForm({ origen: formData.origen, destino: '', precio_base: '' });
      setModalNuevaRuta(true);
      return;
    }

    const rutaEncontrada = catalogos.rutas.find(
      r => r.origen.toLowerCase().trim() === formData.origen.toLowerCase().trim() &&
        r.destino.toLowerCase().trim() === nuevoDestino.toLowerCase().trim()
    );

    setFormData(prev => ({
      ...prev,
      destino: nuevoDestino,
      precio_viaje: rutaEncontrada ? rutaEncontrada.precio_base : prev.precio_viaje
    }));
  };

  // Cálculos en vivo
  const calculosEnVivo = useMemo(() => {
    const precio = Number(formData.precio_viaje) || 0;
    const choferObj = catalogos.choferes.find(c => c.nombre === formData.id_chofer);
    const comisionPct = choferObj ? (Number(choferObj.porcentaje_comision) || 10) : 10;

    const pagoChofer = Math.round(precio * (comisionPct / 100) * 100) / 100;
    const gasoil = Number(formData.gasoil) || 0;
    const peajes = Number(formData.peajes) || 0;
    const viaticos = Number(formData.viaticos) || 0;

    const totalGastos = Math.round((pagoChofer + gasoil + peajes + viaticos) * 100) / 100;
    const ganancia = Math.round((precio - totalGastos) * 100) / 100;
    const margenPct = precio > 0 ? Math.round((ganancia / precio) * 1000) / 10 : 0;

    return { precio, comisionPct, pagoChofer, totalGastos, ganancia, margenPct };
  }, [formData, catalogos]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.origen) return showToast('Debe seleccionar un origen', 'error');
    if (!formData.destino) return showToast('Debe seleccionar un destino', 'error');
    if (!formData.id_chofer) return showToast('Debe seleccionar un chofer', 'error');
    if (!formData.id_gandola) return showToast('Debe seleccionar una gandola', 'error');
    if (!formData.precio_viaje || Number(formData.precio_viaje) <= 0) return showToast('El precio del viaje debe ser mayor a 0', 'error');

    setSaving(true);
    try {
      const res = await ipcRenderer.invoke('viajes:guardar', formData);
      if (res.ok) {
        onViajeGuardado();
        setFormData({
          fecha: getTodayString(),
          contenedor: '',
          origen: formData.origen,
          destino: '',
          id_propietario: '',
          id_chofer: '',
          id_gandola: '',
          precio_viaje: '',
          gasoil: '',
          peajes: '',
          viaticos: '',
          notas: ''
        });
      } else {
        showToast(res.error || 'Error al guardar el viaje', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const guardarNuevaRuta = async (e) => {
    e.preventDefault();
    if (!nuevaRutaForm.origen || !nuevaRutaForm.destino || !nuevaRutaForm.precio_base) {
      return showToast('Complete todos los campos de la nueva ruta', 'error');
    }
    try {
      const res = await ipcRenderer.invoke('rutas:guardar', nuevaRutaForm);
      if (res.ok) {
        showToast('Nueva ruta agregada al catálogo');
        await onActualizarCatalogos();
        setFormData(prev => ({
          ...prev,
          origen: nuevaRutaForm.origen,
          destino: nuevaRutaForm.destino,
          precio_viaje: nuevaRutaForm.precio_base
        }));
        setModalNuevaRuta(false);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title"><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit_note</span> Formulario de Registro de Viaje</div>
          <div className="card-subtitle">
            Seleccione el origen y destino para cargar la tarifa automáticamente del catálogo sincronizado.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
      setNuevaRutaForm({ origen: formData.origen, destino: '', precio_base: '' });
      setModalNuevaRuta(true);
    }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span> Agregar Nueva Ruta / Ciudad
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid-form-3col">
          <div className="form-group">
            <label className="form-label">Fecha del Viaje *</label>
            <input
              type="date"
              className="form-input"
              value={formData.fecha}
              onChange={e => setFormData({ ...formData, fecha: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">N° Contenedor / Guía</label>
            <input
              type="text"
              className="form-input mono"
              placeholder="Ej: MSKU-781920-4"
              value={formData.contenedor}
              onChange={e => setFormData({ ...formData, contenedor: e.target.value.toUpperCase() })}
            />
          </div>

          {/* ORIGEN DINÁMICO */}
          <div className="form-group">
            <label className="form-label">Origen *</label>
            <select
              className="form-select"
              value={formData.origen}
              onChange={handleOrigenChange}
              required
            >
              {origenesDisponibles.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* DESTINO DINÁMICO */}
          <div className="form-group">
            <label className="form-label">Destino ({destinosParaOrigen.length} tarifas configuradas) *</label>
            <select
              className="form-select"
              value={formData.destino}
              onChange={handleDestinoChange}
              required
            >
              <option value="">-- Seleccionar Destino --</option>
              {destinosParaOrigen.map(r => (
                <option key={r.id} value={r.destino}>
                  {r.destino} (Flete: {formatUSD(r.precio_base)})
                </option>
              ))}
              <option value="__NUEVA_RUTA__">+ [Agregar otro destino / ciudad...]</option>
            </select>
          </div>

          {/* PROPIETARIO FILTRO / ASIGNACIÓN */}
          <div className="form-group">
            <label className="form-label">Propietario / Cliente</label>
            <select
              className="form-select"
              value={formData.id_propietario}
              onChange={handlePropietarioChange}
            >
              <option value="">-- Todos los Propietarios --</option>
              {(catalogos.propietarios || []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Chofer Asignado *</label>
            <select
              className="form-select"
              value={formData.id_chofer}
              onChange={handleChoferChange}
              required
            >
              <option value="">-- Seleccionar Chofer --</option>
              {choferesFiltrados.map(c => {
      const pName = getPropName(c.id_propietario);
      return (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre} ({c.porcentaje_comision || 10}% com){pName ? ` — [ ${pName}]` : ''}
                  </option>
                );
    })}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Gandola / Unidad *</label>
            <select
              className="form-select"
              value={formData.id_gandola}
              onChange={handleGandolaChange}
              required
            >
              <option value="">-- Seleccionar Gandola --</option>
              {gandolasFiltradas.map(g => {
      const pName = getPropName(g.id_propietario);
      const hasPlaca = g.placa && !g.placa.startsWith('S/P-');
      const gLabel = hasPlaca
        ? (g.placa + (g.modelo ? ` - ${g.modelo}` : ''))
        : ([g.marca, g.modelo].filter(Boolean).join(' ') || `Gandola #${g.id}`);
      const valGandola = g.placa || `Gandola #${g.id}`;
      return (
                  <option key={g.id} value={valGandola}>
                    {gLabel}{pName ? ` — [ ${pName}]` : ''}
                  </option>
                );
    })}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tarifa de Flete ($) *</label>
            <input
              type="number"
              step="0.01"
              min="1"
              className="form-input mono"
              placeholder="0.00"
              value={formData.precio_viaje}
              onChange={e => setFormData({ ...formData, precio_viaje: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Gasto Gasoil / Combustible ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-input mono"
              placeholder="0.00"
              value={formData.gasoil}
              onChange={e => setFormData({ ...formData, gasoil: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Peajes ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-input mono"
              placeholder="0.00"
              value={formData.peajes}
              onChange={e => setFormData({ ...formData, peajes: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Viáticos Entregados ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-input mono"
              placeholder="0.00"
              value={formData.viaticos}
              onChange={e => setFormData({ ...formData, viaticos: e.target.value })}
            />
          </div>

          <div className="form-group col-span-3">
            <label className="form-label">Notas / Observaciones</label>
            <input
              type="text"
              className="form-input"
              placeholder="Detalles adicionales, número de precinto, tipo de carga..."
              value={formData.notas}
              onChange={e => setFormData({ ...formData, notas: e.target.value })}
            />
          </div>
        </div>

        {/* TARJETA EN VIVO CON CÁLCULOS AUTOMÁTICOS */}
        <div className="live-calc-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>bolt</span> Previsualización en Vivo de Finanzas
            </span>
            <span className="badge badge-emerald">
              Margen Estimado: {calculosEnVivo.margenPct}%
            </span>
          </div>

          <div className="live-calc-grid">
            <div className="calc-metric">
              <span className="calc-metric-label">Tarifa Flete</span>
              <span className="calc-metric-value blue">{formatUSD(calculosEnVivo.precio)}</span>
            </div>

            <div className="calc-metric">
              <span className="calc-metric-label">Pago Chofer ({calculosEnVivo.comisionPct}%)</span>
              <span className="calc-metric-value amber">{formatUSD(calculosEnVivo.pagoChofer)}</span>
            </div>

            <div className="calc-metric">
              <span className="calc-metric-label">Total Gastos Viaje</span>
              <span className="calc-metric-value rose">{formatUSD(calculosEnVivo.totalGastos)}</span>
            </div>

            <div className="calc-metric">
              <span className="calc-metric-label">Ganancia Neta</span>
              <span className="calc-metric-value emerald">{formatUSD(calculosEnVivo.ganancia)}</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setFormData({
      fecha: getTodayString(),
      contenedor: '',
      origen: origenesDisponibles[0] || 'Puerto Cabello',
      destino: '',
      id_propietario: '',
      id_chofer: '',
      id_gandola: '',
      precio_viaje: '',
      gasoil: '',
      peajes: '',
      viaticos: '',
      notas: ''
    })}
          >
            Limpiar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '💾 Registrar Viaje'}
          </button>
        </div>
      </form>

      {/* MODAL RÁPIDO PARA NUEVA RUTA */}
      {modalNuevaRuta && (
        <div className="modal-overlay" onClick={() => setModalNuevaRuta(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: '16px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span> Agregar Nueva Ruta al Catálogo
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalNuevaRuta(false)}>✕</button>
            </div>
            <form onSubmit={guardarNuevaRuta}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Origen *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Puerto Cabello, La Guaira, Guanta..."
                    value={nuevaRutaForm.origen}
                    onChange={e => setNuevaRutaForm({ ...nuevaRutaForm, origen: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Destino *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Maturín, Barinas, Calabozo..."
                    value={nuevaRutaForm.destino}
                    onChange={e => setNuevaRutaForm({ ...nuevaRutaForm, destino: e.target.value.toUpperCase() })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Precio Base Flete ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className="form-input mono"
                    placeholder="0.00"
                    value={nuevaRutaForm.precio_base}
                    onChange={e => setNuevaRutaForm({ ...nuevaRutaForm, precio_base: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalNuevaRuta(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Guardar y Seleccionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// MÓDULO 2: Historial de Viajes (Con Modificar <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span> y Eliminar <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>)
// ==========================================================================

export default NuevoViajeView;
