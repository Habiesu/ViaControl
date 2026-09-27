import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets, parseTelefono, buildTelefono, PREFIJOS_VZLA } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

function PropietariosView({ catalogos, onActualizar, showToast }) {
  const propietarios = catalogos.propietarios || [];
  const [propietarioSel, setPropietarioSel] = useState(null);
  const [vista, setVista] = useState('lista'); // 'lista' | 'detalle' | 'form-propietario' | 'form-chofer' | 'form-gandola'
  const [formProp, setFormProp] = useState({ nombre: '', telPrefijo: '0414', telNumero: '', notas: '' });
  const [formChofer, setFormChofer] = useState({ nombre: '', porcentaje_comision: 10, telPrefijo: '0414', telNumero: '' });
  const [formGandola, setFormGandola] = useState({ placa: '', marca: '', modelo: '' });
  const [editandoChofer, setEditandoChofer] = useState(null);
  const [editandoGandola, setEditandoGandola] = useState(null);
  const [saving, setSaving] = useState(false);

  const choferesDelProp = propietarioSel
    ? (catalogos.choferes || []).filter(c => String(c.id_propietario) === String(propietarioSel.id))
    : [];
  const gandolasDelProp = propietarioSel
    ? (catalogos.gandolas || []).filter(g => String(g.id_propietario) === String(propietarioSel.id))
    : [];

  const verDetalle = (p) => {
    setPropietarioSel(p);
    setVista('detalle');
  };

  const abrirFormProp = (p = null) => {
    if (p) {
      const parsed = parseTelefono(p.telefono);
      setFormProp({ nombre: p.nombre || '', telPrefijo: parsed.prefijo, telNumero: parsed.numero, notas: p.notas || '' });
    } else {
      setFormProp({ nombre: '', telPrefijo: '0414', telNumero: '', notas: '' });
    }
    setPropietarioSel(p || propietarioSel);
    setVista('form-propietario');
  };

  const guardarPropietario = async (e) => {
    e.preventDefault();
    if (!formProp.nombre.trim()) return showToast('El nombre es requerido', 'error');
    setSaving(true);
    try {
      const telefonoComb = buildTelefono(formProp.telPrefijo, formProp.telNumero);
      const payload = { nombre: formProp.nombre, telefono: telefonoComb, notas: formProp.notas };
      if (propietarioSel && vista === 'form-propietario' && propietarioSel.id) {
        payload.id = propietarioSel.id;
      }
      const res = await ipcRenderer.invoke('propietarios:guardar', payload);
      if (res.ok) {
        showToast(payload.id ? 'Propietario actualizado' : 'Propietario creado');
        await onActualizar();
        setVista('lista');
        setPropietarioSel(null);
      } else {
        showToast(res.error || 'Error al guardar', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const eliminarPropietario = async (p) => {
    if (!window.confirm('¿Eliminar el propietario ' + p.nombre + '? Sus choferes y gandolas quedarán sin propietario asignado.')) return;
    try {
      const res = await ipcRenderer.invoke('propietarios:eliminar', p.id);
      if (res.ok) {
        showToast('Propietario eliminado');
        await onActualizar();
        if (propietarioSel && propietarioSel.id === p.id) {
          setPropietarioSel(null);
          setVista('lista');
        }
      } else {
        showToast(res.error || 'Error al eliminar', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const abrirFormChofer = (c = null) => {
    if (c) {
      const parsed = parseTelefono(c.telefono);
      setFormChofer({ nombre: c.nombre || '', porcentaje_comision: c.porcentaje_comision || 10, telPrefijo: parsed.prefijo, telNumero: parsed.numero });
      setEditandoChofer(c);
    } else {
      setFormChofer({ nombre: '', porcentaje_comision: 10, telPrefijo: '0414', telNumero: '' });
      setEditandoChofer(null);
    }
    setVista('form-chofer');
  };

  const guardarChofer = async (e) => {
    e.preventDefault();
    if (!formChofer.nombre.trim()) return showToast('El nombre del chofer es requerido', 'error');
    setSaving(true);
    try {
      const telefonoComb = buildTelefono(formChofer.telPrefijo, formChofer.telNumero);
      const payload = {
        nombre: formChofer.nombre,
        porcentaje_comision: formChofer.porcentaje_comision,
        telefono: telefonoComb,
        id_propietario: propietarioSel.id
      };
      if (editandoChofer) payload.id = editandoChofer.id;
      const res = await ipcRenderer.invoke('choferes:guardar', payload);
      if (res.ok) {
        showToast(editandoChofer ? 'Chofer actualizado' : 'Chofer agregado');
        await onActualizar();
        setFormChofer({ nombre: '', porcentaje_comision: 10, telPrefijo: '0414', telNumero: '' });
        setEditandoChofer(null);
        setVista('detalle');
      } else {
        showToast(res.error || 'Error al guardar chofer', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const guardarGandola = async (e) => {
    e.preventDefault();
    if (!formGandola.modelo.trim()) return showToast('El nombre o número de la Unidad es requerido', 'error');
    setSaving(true);
    try {
      const payload = { ...formGandola, placa: formGandola.modelo.trim(), id_propietario: propietarioSel.id };
      if (editandoGandola) payload.id = editandoGandola.id;
      const res = await ipcRenderer.invoke('gandolas:guardar', payload);
      if (res.ok) {
        showToast(editandoGandola ? 'Unidad actualizada' : 'Unidad agregada');
        await onActualizar();
        setFormGandola({ placa: '', marca: '', modelo: '' });
        setEditandoGandola(null);
        setVista('detalle');
      } else {
        showToast(res.error || 'Error al guardar unidad', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const eliminarChofer = async (c) => {
    if (!window.confirm('¿Eliminar al chofer ' + c.nombre + '?')) return;
    try {
      const res = await ipcRenderer.invoke('choferes:eliminar', c.id);
      if (res.ok) { showToast('Chofer eliminado'); await onActualizar(); }
      else showToast(res.error || 'Error', 'error');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  const eliminarGandola = async (g) => {
    if (!window.confirm('¿Eliminar la gandola ' + g.placa + '?')) return;
    try {
      const res = await ipcRenderer.invoke('gandolas:eliminar', g.id);
      if (res.ok) { showToast('Gandola eliminada'); await onActualizar(); }
      else showToast(res.error || 'Error', 'error');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  const choferesSinProp = (catalogos.choferes || []).filter(c => !c.id_propietario);
  const gandolasSinProp = (catalogos.gandolas || []).filter(g => !g.id_propietario);

  const reasignarChofer = async (c, newPropId) => {
    if (!newPropId) return;
    try {
      const payload = { ...c, id_propietario: parseInt(newPropId) };
      const res = await ipcRenderer.invoke('choferes:guardar', payload);
      if (res.ok) { showToast('Chofer asignado'); await onActualizar(); }
      else showToast(res.error || 'Error al reasignar', 'error');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  const reasignarGandola = async (g, newPropId) => {
    if (!newPropId) return;
    try {
      const payload = { ...g, id_propietario: parseInt(newPropId) };
      const res = await ipcRenderer.invoke('gandolas:guardar', payload);
      if (res.ok) { showToast('Unidad asignada'); await onActualizar(); }
      else showToast(res.error || 'Error al reasignar', 'error');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  const eliminarTodosSinProp = async () => {
    if (!window.confirm('¿Eliminar todos los choferes y unidades sin propietario asignado?')) return;
    try {
      for (const c of choferesSinProp) {
        await ipcRenderer.invoke('choferes:eliminar', c.id);
      }
      for (const g of gandolasSinProp) {
        await ipcRenderer.invoke('gandolas:eliminar', g.id);
      }
      showToast('Registros sin propietario eliminados');
      await onActualizar();
    } catch (err) {
      showToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  // ── VISTA: Lista de Propietarios ───
  if (vista === 'lista') return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => { setPropietarioSel(null); setFormProp({ nombre: '', telefono: '', notas: '' }); setVista('form-propietario'); }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          Nuevo Propietario
        </button>
      </div>

      {(choferesSinProp.length > 0 || gandolasSinProp.length > 0) && (
        <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid var(--secondary)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>warning</span>
              Choferes y Unidades Sin Propietario ({choferesSinProp.length} choferes, {gandolasSinProp.length} unidades)
            </div>
            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tertiary)' }} onClick={eliminarTodosSinProp}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
              Eliminar Todos Sin Propietario
            </button>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', marginBottom: '12px' }}>
            Estos choferes o unidades se crearon sin estar vinculados a un propietario. Puedes reasignarlos a un propietario o eliminarlos individualmente o todos juntos.
          </div>

          {choferesSinProp.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>person</span> Choferes sin propietario:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {choferesSinProp.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-container-low)', padding: '6px 12px', borderRadius: '6px' }}>
                    <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>person</span>
                      {c.nombre} {c.telefono ? `(${c.telefono})` : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select className="form-control" style={{ padding: '4px 8px', fontSize: '12px' }} onChange={(e) => reasignarChofer(c, e.target.value)}>
                        <option value="">-- Asignar a Propietario --</option>
                        {propietarios.map(p => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
                      </select>
                      <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tertiary)', padding: '4px 8px' }} onClick={() => eliminarChofer(c)} title="Eliminar">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {gandolasSinProp.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_shipping</span> Unidades sin propietario:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {gandolasSinProp.map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-container-low)', padding: '6px 12px', borderRadius: '6px' }}>
                    <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_shipping</span>
                      {g.placa || g.modelo} {g.marca ? `(${g.marca})` : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select className="form-control" style={{ padding: '4px 8px', fontSize: '12px' }} onChange={(e) => reasignarGandola(g, e.target.value)}>
                        <option value="">-- Asignar a Propietario --</option>
                        {propietarios.map(p => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
                      </select>
                      <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tertiary)', padding: '4px 8px' }} onClick={() => eliminarGandola(g)} title="Eliminar">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {propietarios.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ marginBottom: '12px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--outline)' }}>domain</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>No hay propietarios registrados</div>
          <div style={{ color: 'var(--on-surface-variant)' }}>Agrega el primer propietario para asignarle choferes y gandolas.</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {propietarios.map(p => {
    const nChoferes = (catalogos.choferes || []).filter(c => String(c.id_propietario) === String(p.id)).length;
    const nGandolas = (catalogos.gandolas || []).filter(g => String(g.id_propietario) === String(p.id)).length;
    return (
            <div key={p.id} className="card" style={{ padding: '20px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div onClick={() => verDetalle(p)} style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--primary)' }}>domain</span>
                    {p.nombre}
                  </div>
                  {p.telefono && (
                    <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>call</span>
                      {p.telefono}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <span className="badge badge-blue">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px' }}>person</span>
                      {nChoferes} chofer{nChoferes !== 1 ? 'es' : ''}
                    </span>
                    <span className="badge badge-emerald">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px' }}>local_shipping</span>
                      {nGandolas} gandola{nGandolas !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => abrirFormProp(p)} title="Editar">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tertiary)' }} onClick={() => eliminarPropietario(p)} title="Eliminar">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                  </button>
                </div>
              </div>
            </div>
          );
  })}
      </div>
    </div>
  );

  // ── VISTA: Detalle del Propietario ────────────────────────────────────────
  if (vista === 'detalle') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setVista('lista'); setPropietarioSel(null); }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span> Volver
        </button>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '24px', color: 'var(--primary)' }}>domain</span>
          {propietarioSel.nombre}
        </h2>
        <button className="btn btn-secondary btn-sm" onClick={() => abrirFormProp(propietarioSel)}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span> Editar
        </button>
      </div>

      {/* CHOFERES */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--primary)' }}>person</span>
            Choferes Asignados
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => abrirFormChofer(null)}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
            Agregar Chofer
          </button>
        </div>
        {choferesDelProp.length === 0
      ? (<div style={{ color: 'var(--on-surface-variant)', padding: '16px 0', textAlign: 'center' }}>Sin choferes asignados</div>)
      : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Comisión</th>
                  <th>Teléfono</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {choferesDelProp.map(c => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td><span className="badge badge-amber">{c.porcentaje_comision || 10}%</span></td>
                    <td>{c.telefono || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirFormChofer(c)}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tertiary)' }} onClick={() => eliminarChofer(c)}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {/* GANDOLAS / UNIDADES */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--primary)' }}>local_shipping</span>
            Unidades Asignadas
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setFormGandola({ placa: '', marca: '', modelo: '' }); setEditandoGandola(null); setVista('form-gandola'); }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
            Agregar Unidad
          </button>
        </div>
        {gandolasDelProp.length === 0
      ? (<div style={{ color: 'var(--on-surface-variant)', padding: '16px 0', textAlign: 'center' }}>Sin unidades asignadas</div>)
      : (
            <table className="table">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Marca</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gandolasDelProp.map(g => (
                  <tr key={g.id}>
                    <td><span className="mono" style={{ fontWeight: 700 }}>{g.modelo || g.placa || '—'}</span></td>
                    <td>{g.marca || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditandoGandola(g); setFormGandola({ placa: g.placa || '', marca: g.marca || '', modelo: g.modelo || '' }); setVista('form-gandola'); }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tertiary)' }} onClick={() => eliminarGandola(g)}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );

  // ── VISTA: Formulario Propietario ─────────────────────────────────────────
  if (vista === 'form-propietario') return (
    <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--primary)' }}>
            {propietarioSel && propietarioSel.id ? 'edit' : 'add'}
          </span>
          {propietarioSel && propietarioSel.id ? 'Editar Propietario' : 'Nuevo Propietario'}
        </div>
      </div>
      <form onSubmit={guardarPropietario}>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <input className="form-input" type="text" placeholder="Nombre del propietario" value={formProp.nombre} onChange={e => setFormProp({ ...formProp, nombre: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono de Contacto</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                className="form-select"
                style={{ width: '100px', flexShrink: 0 }}
                value={formProp.telPrefijo || '0414'}
                onChange={e => setFormProp({ ...formProp, telPrefijo: e.target.value })}
              >
                {PREFIJOS_VZLA.map(pref => (<option key={pref} value={pref}>{pref}</option>))}
              </select>
              <input
                className="form-input mono"
                type="text"
                maxLength="7"
                placeholder="7654321"
                value={formProp.telNumero || ''}
                onChange={e => setFormProp({ ...formProp, telNumero: e.target.value.replace(/\D/g, '') })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notas</label>
            <input className="form-input" type="text" placeholder="Observaciones..." value={formProp.notas} onChange={e => setFormProp({ ...formProp, notas: e.target.value })} />
          </div>
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setVista(propietarioSel ? 'detalle' : 'lista')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );

  // ── VISTA: Formulario Chofer ──────────────────────────────────────────────
  if (vista === 'form-chofer') return (
    <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--primary)' }}>
            {editandoChofer ? 'edit' : 'add'}
          </span>
          {editandoChofer ? 'Editar Chofer' : 'Nuevo Chofer'}
        </div>
        <div style={{ color: 'var(--on-surface-variant)', fontSize: '13px' }}>Propietario: {propietarioSel.nombre}</div>
      </div>
      <form onSubmit={guardarChofer}>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <input className="form-input" type="text" placeholder="Nombre completo del chofer" value={formChofer.nombre} onChange={e => setFormChofer({ ...formChofer, nombre: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Comisión (%)</label>
            <input className="form-input mono" type="number" step="0.5" min="0" max="100" placeholder="10" value={formChofer.porcentaje_comision} onChange={e => setFormChofer({ ...formChofer, porcentaje_comision: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                className="form-select"
                style={{ width: '100px', flexShrink: 0 }}
                value={formChofer.telPrefijo || '0414'}
                onChange={e => setFormChofer({ ...formChofer, telPrefijo: e.target.value })}
              >
                {PREFIJOS_VZLA.map(pref => (<option key={pref} value={pref}>{pref}</option>))}
              </select>
              <input
                className="form-input mono"
                type="text"
                maxLength="7"
                placeholder="7654321"
                value={formChofer.telNumero || ''}
                onChange={e => setFormChofer({ ...formChofer, telNumero: e.target.value.replace(/\D/g, '') })}
              />
            </div>
          </div>
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => { setEditandoChofer(null); setVista('detalle'); }}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );

  // ── VISTA: Formulario Gandola / Unidad ─────────────────────────────────────
  if (vista === 'form-gandola') return (
    <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--primary)' }}>
            {editandoGandola ? 'edit' : 'add'}
          </span>
          {editandoGandola ? 'Editar Unidad' : 'Nueva Unidad'}
        </div>
        <div style={{ color: 'var(--on-surface-variant)', fontSize: '13px' }}>Propietario: {propietarioSel.nombre}</div>
      </div>
      <form onSubmit={guardarGandola}>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Identificador / Número de Unidad *</label>
            <input className="form-input" type="text" placeholder="Ej: 04, Unidad 12, Granelera 01..." value={formGandola.modelo} onChange={e => setFormGandola({ ...formGandola, modelo: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Marca</label>
            <input className="form-input" type="text" placeholder="Ej: Mack, Kenworth, Volvo" value={formGandola.marca} onChange={e => setFormGandola({ ...formGandola, marca: e.target.value })} />
          </div>
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => { setEditandoGandola(null); setVista('detalle'); }}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );

  return null;
}

// ==========================================================================
// MÓDULO 1: Registrar Viaje (Orígenes y Destinos Dinámicos del Excel)
// ==========================================================================

export default PropietariosView;
