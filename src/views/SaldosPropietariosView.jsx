import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatUSD, getTodayString } from '../utils/helpers';

const { ipcRenderer } = window.require('electron');

// ─── FORMULARIO INLINE: CREAR / EDITAR AGENTE Y ASIGNAR PROPIETARIOS ─────────
function SeccionFormAgente({ isOpen, onClose, agenteEnEdicion, todosPropietarios, onGuardado, mostrarToast }) {
  const [formData, setFormData] = useState({
    id: null,
    nombre: '',
    contacto: '',
    id_propietario_vinculado: '',
    notas: '',
    propietariosIds: []
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (agenteEnEdicion) {
        setFormData({
          id: agenteEnEdicion.id,
          nombre: agenteEnEdicion.nombre || '',
          contacto: agenteEnEdicion.contacto || '',
          id_propietario_vinculado: agenteEnEdicion.id_propietario_vinculado || '',
          notas: agenteEnEdicion.notas || '',
          propietariosIds: (agenteEnEdicion.propietarios || []).map(p => p.id)
        });
      } else {
        setFormData({
          id: null,
          nombre: '',
          contacto: '',
          id_propietario_vinculado: '',
          notas: '',
          propietariosIds: []
        });
      }
    }
  }, [isOpen, agenteEnEdicion]);

  if (!isOpen) return null;

  const togglePropietario = (idProp) => {
    setFormData(prev => {
      const exists = prev.propietariosIds.includes(idProp);
      const newIds = exists
        ? prev.propietariosIds.filter(id => id !== idProp)
        : [...prev.propietariosIds, idProp];
      return { ...prev, propietariosIds: newIds };
    });
  };

  const seleccionarTodosPropietarios = () => {
    setFormData(prev => ({
      ...prev,
      propietariosIds: todosPropietarios.map(p => p.id)
    }));
  };

  const deseleccionarTodos = () => {
    setFormData(prev => ({ ...prev, propietariosIds: [] }));
  };

  const handleSelectPropietarioBase = (propId) => {
    if (!propId) {
      setFormData(prev => ({ ...prev, id_propietario_vinculado: '' }));
      return;
    }
    const prop = todosPropietarios.find(p => String(p.id) === String(propId));
    if (prop) {
      setFormData(prev => ({
        ...prev,
        id_propietario_vinculado: prop.id,
        nombre: prev.nombre || prop.nombre,
        contacto: prev.contacto || prop.contacto || '',
        propietariosIds: prev.propietariosIds.includes(prop.id) ? prev.propietariosIds : [...prev.propietariosIds, prop.id]
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre || !formData.nombre.trim()) {
      if (mostrarToast) mostrarToast('Ingrese el nombre del agente', 'error');
      return;
    }

    setGuardando(true);
    try {
      const res = await ipcRenderer.invoke('saldos:guardarAgente', formData);
      if (res && res.ok) {
        if (mostrarToast) mostrarToast(res.mensaje || 'Agente guardado exitosamente', 'success');
        onClose();
        onGuardado();
      } else {
        if (mostrarToast) mostrarToast(res?.error || 'Error al guardar agente', 'error');
      }
    } catch (err) {
      if (mostrarToast) mostrarToast('Error de comunicación', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card" style={{
      marginBottom: '20px',
      border: '1px solid var(--primary)',
      background: 'var(--surface-container)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div className="card-header" style={{ borderBottom: '1px solid var(--outline-variant)', padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '24px' }}>
              {formData.id ? 'edit_square' : 'person_add'}
            </span>
            <div>
              <div className="card-title" style={{ fontSize: '15px', fontWeight: 700 }}>
                {formData.id ? `Editar Agente: ${formData.nombre}` : 'Crear Nuevo Agente Financiero'}
              </div>
              <div className="card-subtitle" style={{ fontSize: '12px' }}>
                Este agente aporta los fondos y asume los gastos de los propietarios que tenga asignados (incluyendo sus gandolas y choferes)
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            ✕ Ocultar
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label className="form-label">¿Es un Propietario Existente? (Opcional)</label>
            <select
              className="form-select"
              value={formData.id_propietario_vinculado}
              onChange={e => handleSelectPropietarioBase(e.target.value)}
            >
              <option value="">Ninguno (Agente Externo / Fondo)</option>
              {todosPropietarios.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Nombre del Agente *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej: Inversiones El Carmen, Juan Pérez (Agente)..."
              value={formData.nombre}
              onChange={e => setFormData({ ...formData, nombre: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="form-label">Contacto / Teléfono</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej: +58 414 1234567"
              value={formData.contacto}
              onChange={e => setFormData({ ...formData, contacto: e.target.value })}
            />
          </div>
        </div>

        {/* ASIGNACIÓN DE PROPIETARIOS A ESTE AGENTE */}
        <div style={{ marginBottom: '16px', background: 'var(--surface-container-high)', padding: '14px', borderRadius: '8px', border: '1px solid var(--outline-variant)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label className="form-label" style={{ marginBottom: 0, fontWeight: 700 }}>
              Propietarios que maneja / financia este Agente: ({formData.propietariosIds.length} seleccionados)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={seleccionarTodosPropietarios}>
                Marcar Todos
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={deseleccionarTodos}>
                Desmarcar Todos
              </button>
            </div>
          </div>

          {todosPropietarios.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
              No hay propietarios registrados en el sistema. Primero cree propietarios en el catálogo.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '8px',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '6px'
            }}>
              {todosPropietarios.map(p => {
                const checked = formData.propietariosIds.includes(p.id) || (formData.id_propietario_vinculado && String(p.id) === String(formData.id_propietario_vinculado));
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: checked ? 'rgba(74, 222, 128, 0.12)' : 'var(--surface-container)',
                      border: `1px solid ${checked ? 'rgba(74, 222, 128, 0.4)' : 'var(--outline-variant)'}`,
                      cursor: 'pointer',
                      fontSize: '12px',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePropietario(p.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: checked ? 600 : 400, color: checked ? '#4ade80' : 'var(--on-surface)' }}>
                      {p.nombre} {formData.id_propietario_vinculado && String(p.id) === String(formData.id_propietario_vinculado) ? '(Mismo Agente)' : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label className="form-label">Notas Adicionales</label>
          <input
            type="text"
            className="form-input"
            placeholder="Observaciones sobre acuerdos de pago o administración..."
            value={formData.notas}
            onChange={e => setFormData({ ...formData, notas: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>
            {guardando ? 'Guardando...' : (formData.id ? 'Guardar Cambios' : 'Crear Agente')}
          </button>
        </div>
      </form>
    </div>
  );
}


// ─── SECCIÓN FORMULARIO INLINE: REGISTRAR ENTREGA DE FONDOS (APORTE) ─────────
function SeccionAporteDirecto({ isOpen, onClose, initialAgenteId, agentes, onGuardado, mostrarToast }) {
  const [formData, setFormData] = useState({
    fecha: getTodayString(),
    id_agente: initialAgenteId || '',
    monto: '',
    concepto: 'Entrega de Fondos',
    metodo_pago: 'Efectivo',
    referencia: '',
    notas: ''
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        fecha: getTodayString(),
        id_agente: initialAgenteId || prev.id_agente || (agentes && agentes[0]?.id) || '',
        monto: '',
        concepto: 'Entrega de Fondos',
        referencia: '',
        notas: ''
      }));
    }
  }, [isOpen, initialAgenteId, agentes]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.id_agente) {
      if (mostrarToast) mostrarToast('Seleccione el agente que entrega el dinero', 'error');
      return;
    }
    if (!formData.monto || Number(formData.monto) <= 0) {
      if (mostrarToast) mostrarToast('Ingrese un monto válido mayor a 0', 'error');
      return;
    }

    setGuardando(true);
    try {
      const res = await ipcRenderer.invoke('saldos:guardarAporte', formData);
      if (res && res.ok) {
        if (mostrarToast) mostrarToast(res.mensaje || 'Entrega registrada exitosamente', 'success');
        onClose();
        onGuardado();
      } else {
        if (mostrarToast) mostrarToast(res?.error || 'Error al guardar entrega', 'error');
      }
    } catch (err) {
      if (mostrarToast) mostrarToast('Error de comunicación al guardar entrega', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card" style={{
      marginBottom: '20px',
      border: '1px solid rgba(34, 197, 94, 0.4)',
      background: 'var(--surface-container)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div className="card-header" style={{ borderBottom: '1px solid var(--outline-variant)', padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ color: '#4ade80', fontSize: '22px' }}>add_circle</span>
            <div>
              <div className="card-title" style={{ color: '#4ade80', fontSize: '15px', fontWeight: 700 }}>
                Registrar Entrega de Fondos (Aporte de Agente)
              </div>
              <div className="card-subtitle" style={{ fontSize: '12px' }}>
                Suma al saldo a favor disponible del agente para cubrir sus gastos asignados
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} title="Cerrar formulario">
            ✕ Ocultar
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label className="form-label">Agente que Entrega el Fondo *</label>
            <select
              className="form-select"
              value={formData.id_agente}
              onChange={e => setFormData({ ...formData, id_agente: e.target.value })}
              required
            >
              <option value="">Seleccione el agente...</option>
              {(agentes || []).map(a => (
                <option key={a.id} value={a.id}>
                  {a.nombre} {a.propietarios && a.propietarios.length > 0 ? `(${a.propietarios.length} propietarios)` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Fecha de Entrega *</label>
            <input
              type="date"
              className="form-input"
              value={formData.fecha}
              onChange={e => setFormData({ ...formData, fecha: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="form-label">Monto ($ USD) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="form-input mono"
              placeholder="0.00"
              value={formData.monto}
              onChange={e => setFormData({ ...formData, monto: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="form-label">Concepto / Motivo</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej: Anticipo para gastos, fondo semanal, aporte general..."
              value={formData.concepto}
              onChange={e => setFormData({ ...formData, concepto: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label className="form-label">Método de Pago</label>
            <select
              className="form-select"
              value={formData.metodo_pago}
              onChange={e => setFormData({ ...formData, metodo_pago: e.target.value })}
            >
              <option value="Efectivo">💵 Efectivo USD</option>
              <option value="Transferencia">🏦 Transferencia Bancaria</option>
              <option value="Zelle">⚡ Zelle</option>
              <option value="Pago Móvil">📱 Pago Móvil</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="form-label">Referencia / Comprobante</label>
            <input
              type="text"
              className="form-input"
              placeholder="Nro. referencia o recibo"
              value={formData.referencia}
              onChange={e => setFormData({ ...formData, referencia: e.target.value })}
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Notas Adicionales (Opcional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Observaciones adicionales sobre la entrega..."
              value={formData.notas}
              onChange={e => setFormData({ ...formData, notas: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ background: '#16a34a', borderColor: '#15803d' }}
            disabled={guardando}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_circle</span>
            {guardando ? 'Registrando...' : 'Registrar Entrega de Fondos'}
          </button>
        </div>
      </form>
    </div>
  );
}


// ─── SECCIÓN FORMULARIO INLINE: REGISTRAR GASTO DIRECTO (DEDUCCIÓN DE AGENTE)
function SeccionGastoDirecto({ isOpen, onClose, initialAgenteId, agentes, catalogos, onGuardado, mostrarToast }) {
  const [formData, setFormData] = useState({
    id_agente: initialAgenteId || '',
    id_propietario: '',
    fecha: getTodayString(),
    categoria: 'Viáticos / Anticipos de Ruta',
    id_gandola: '',
    id_chofer: '',
    monto: '',
    descripcion: ''
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const defaultAgenteId = initialAgenteId || (agentes && agentes[0]?.id) || '';
      setFormData(prev => ({
        ...prev,
        id_agente: defaultAgenteId,
        id_propietario: '',
        fecha: getTodayString(),
        monto: '',
        descripcion: ''
      }));
    }
  }, [isOpen, initialAgenteId, agentes]);

  // Propietarios que maneja el agente seleccionado
  const propietariosDelAgente = useMemo(() => {
    if (!formData.id_agente) return [];
    const ag = (agentes || []).find(a => String(a.id) === String(formData.id_agente));
    return (ag && ag.propietarios) ? ag.propietarios : [];
  }, [agentes, formData.id_agente]);

  // Gandolas y choferes según el propietario o agente seleccionado
  const gandolasDisponibles = useMemo(() => {
    const list = catalogos.gandolas || [];
    if (formData.id_propietario) {
      return list.filter(g => String(g.id_propietario) === String(formData.id_propietario));
    }
    if (propietariosDelAgente.length > 0) {
      const propIds = propietariosDelAgente.map(p => String(p.id));
      return list.filter(g => propIds.includes(String(g.id_propietario)));
    }
    return list;
  }, [catalogos.gandolas, formData.id_propietario, propietariosDelAgente]);

  const choferesDisponibles = useMemo(() => {
    const list = catalogos.choferes || [];
    if (formData.id_propietario) {
      return list.filter(c => String(c.id_propietario) === String(formData.id_propietario));
    }
    if (propietariosDelAgente.length > 0) {
      const propIds = propietariosDelAgente.map(p => String(p.id));
      return list.filter(c => propIds.includes(String(c.id_propietario)));
    }
    return list;
  }, [catalogos.choferes, formData.id_propietario, propietariosDelAgente]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.id_agente) {
      if (mostrarToast) mostrarToast('Seleccione el agente responsable', 'error');
      return;
    }
    if (!formData.monto || Number(formData.monto) <= 0) {
      if (mostrarToast) mostrarToast('Ingrese un monto válido mayor a 0', 'error');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        fecha: formData.fecha,
        id_agente: formData.id_agente,
        id_propietario: formData.id_propietario || null,
        id_gandola: formData.id_gandola || null,
        id_chofer: formData.id_chofer || null,
        categoria: formData.categoria,
        tipo: 'Gasto_Empresa',
        descripcion: formData.descripcion || `${formData.categoria} (Deducción directa)`,
        monto: Number(formData.monto)
      };

      const res = await ipcRenderer.invoke('gastos-extra:guardar', payload);
      if (res && res.ok) {
        if (mostrarToast) mostrarToast('Gasto / deducción registrada exitosamente', 'success');
        onClose();
        onGuardado();
      } else {
        if (mostrarToast) mostrarToast(res?.error || 'Error al registrar el gasto', 'error');
      }
    } catch (err) {
      if (mostrarToast) mostrarToast('Error de comunicación al guardar gasto', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card" style={{
      marginBottom: '20px',
      border: '1px solid rgba(239, 68, 68, 0.4)',
      background: 'var(--surface-container)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div className="card-header" style={{ borderBottom: '1px solid var(--outline-variant)', padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ color: '#f87171', fontSize: '22px' }}>build</span>
            <div>
              <div className="card-title" style={{ color: '#f87171', fontSize: '15px', fontWeight: 700 }}>
                Registrar Gasto Directo / Viático (Deducción a Agente)
              </div>
              <div className="card-subtitle" style={{ fontSize: '12px' }}>
                Este gasto se descontará automáticamente del saldo del agente y sus propietarios administrados
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} title="Cerrar formulario">
            ✕ Ocultar
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label className="form-label">Agente Responsable *</label>
            <select
              className="form-select"
              value={formData.id_agente}
              onChange={e => setFormData({ ...formData, id_agente: e.target.value, id_propietario: '', id_gandola: '', id_chofer: '' })}
              required
            >
              <option value="">Seleccione el agente...</option>
              {(agentes || []).map(a => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Propietario Asociado (Opcional)</label>
            <select
              className="form-select"
              value={formData.id_propietario}
              onChange={e => setFormData({ ...formData, id_propietario: e.target.value, id_gandola: '', id_chofer: '' })}
            >
              <option value="">Gasto General del Agente (Todos)</option>
              {propietariosDelAgente.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Fecha del Gasto *</label>
            <input
              type="date"
              className="form-input"
              value={formData.fecha}
              onChange={e => setFormData({ ...formData, fecha: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="form-label">Monto ($ USD) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="form-input mono"
              placeholder="0.00"
              value={formData.monto}
              onChange={e => setFormData({ ...formData, monto: e.target.value })}
              required
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label className="form-label">Categoría del Gasto *</label>
            <select
              className="form-select"
              value={formData.categoria}
              onChange={e => setFormData({ ...formData, categoria: e.target.value })}
            >
              <option value="Viáticos / Anticipos de Ruta">⛽ Viáticos / Anticipos de Ruta</option>
              <option value="Mantenimiento / Taller">🔧 Mantenimiento / Taller</option>
              <option value="Repuestos / Cauchos">⚙️ Repuestos / Cauchos</option>
              <option value="Cambio de Aceite / Filtros">🛢️ Cambio de Aceite / Filtros</option>
              <option value="Tránsito / Permisología">📑 Tránsito / Permisología / Peajes</option>
              <option value="Anticipo a Chofer">👤 Anticipo a Chofer</option>
              <option value="Otros Gastos Operativos">📦 Otros Gastos Operativos</option>
            </select>
          </div>

          <div>
            <label className="form-label">Unidad / Gandola (Opcional)</label>
            <select
              className="form-select"
              value={formData.id_gandola}
              onChange={e => setFormData({ ...formData, id_gandola: e.target.value })}
            >
              <option value="">(Sin unidad específica)</option>
              {gandolasDisponibles.map(g => (
                <option key={g.id} value={g.placa}>{g.placa} {g.modelo ? `(${g.modelo})` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Chofer Asociado (Opcional)</label>
            <select
              className="form-select"
              value={formData.id_chofer}
              onChange={e => setFormData({ ...formData, id_chofer: e.target.value })}
            >
              <option value="">(Sin chofer específico)</option>
              {choferesDisponibles.map(c => (
                <option key={c.id} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Descripción / Detalle</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej: Viático de viaje, compra de repuestos..."
              value={formData.descripcion}
              onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ background: '#dc2626', borderColor: '#b91c1c' }}
            disabled={guardando}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>remove_circle</span>
            {guardando ? 'Guardando Gasto...' : 'Registrar Gasto y Descontar'}
          </button>
        </div>
      </form>
    </div>
  );
}


// ─── VISTA PRINCIPAL: CONTROL DE SALDOS POR AGENTES ──────────────────────────
function SaldosPropietariosView({ catalogos = {}, onReloadCatalogos, mostrarToast }) {
  const [agentes, setAgentes] = useState([]);
  const [todosPropietarios, setTodosPropietarios] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMovimientos, setLoadingMovimientos] = useState(false);
  const [vistaActiva, setVistaActiva] = useState('resumen'); // 'resumen' | 'agentes' | 'movimientos'

  // Formularios Inline
  const [showAgenteForm, setShowAgenteForm] = useState(false);
  const [agenteEnEdicion, setAgenteEnEdicion] = useState(null);

  const [showAporteForm, setShowAporteForm] = useState(false);
  const [selectedAgenteId, setSelectedAgenteId] = useState('');

  const [showGastoForm, setShowGastoForm] = useState(false);
  const [gastoAgenteId, setGastoAgenteId] = useState('');

  const [filtros, setFiltros] = useState({
    id_agente: '',
    id_propietario: '',
    fecha_desde: '',
    fecha_hasta: '',
    tipo_movimiento: ''
  });

  const cargarAgentes = useCallback(async () => {
    try {
      const res = await ipcRenderer.invoke('saldos:obtenerAgentes');
      if (res && res.ok) {
        setAgentes(res.data || []);
        setTodosPropietarios(res.todosPropietarios || catalogos.propietarios || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [catalogos.propietarios]);

  const cargarResumen = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('saldos:obtenerResumen');
      if (res && res.ok) setResumen(res.data || []);
      await cargarAgentes();
    } catch (e) {
      if (mostrarToast) mostrarToast('Error al cargar resumen de saldos de agentes', 'error');
    } finally {
      setLoading(false);
    }
  }, [cargarAgentes, mostrarToast]);

  const cargarMovimientos = useCallback(async () => {
    setLoadingMovimientos(true);
    try {
      const res = await ipcRenderer.invoke('saldos:obtenerMovimientos', filtros);
      if (res && res.ok) setMovimientos(res.data || []);
    } catch (e) {
      if (mostrarToast) mostrarToast('Error al obtener movimientos', 'error');
    } finally {
      setLoadingMovimientos(false);
    }
  }, [filtros, mostrarToast]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  useEffect(() => {
    cargarMovimientos();
  }, [cargarMovimientos]);

  const handleEliminarAgente = async (agente) => {
    if (!window.confirm(`¿Está seguro de eliminar al agente "${agente.nombre}"? Los propietarios asociados quedarán sin agente asignado.`)) {
      return;
    }
    try {
      const res = await ipcRenderer.invoke('saldos:eliminarAgente', agente.id);
      if (res && res.ok) {
        if (mostrarToast) mostrarToast('Agente eliminado', 'success');
        cargarResumen();
        cargarMovimientos();
      } else {
        if (mostrarToast) mostrarToast(res?.error || 'Error al eliminar', 'error');
      }
    } catch (e) {
      if (mostrarToast) mostrarToast('Error al eliminar agente', 'error');
    }
  };

  const handleEliminarMovimiento = async (m) => {
    const isIngreso = m.tipo_movimiento === 'INGRESO';
    const msg = isIngreso
      ? '¿Está seguro de eliminar esta entrega de fondos (Aporte)?'
      : '¿Está seguro de eliminar este gasto / deducción?';

    if (!window.confirm(msg)) return;

    try {
      let res;
      if (m.tipo_registro === 'aporte') {
        res = await ipcRenderer.invoke('saldos:eliminarAporte', m.real_id);
      } else {
        res = await ipcRenderer.invoke('gastos-extra:eliminar', m.real_id);
      }

      if (res && res.ok) {
        if (mostrarToast) mostrarToast('Registro eliminado', 'success');
        cargarResumen();
        cargarMovimientos();
      } else {
        if (mostrarToast) mostrarToast(res?.error || 'Error al eliminar registro', 'error');
      }
    } catch (e) {
      if (mostrarToast) mostrarToast('Error al eliminar', 'error');
    }
  };

  const abrirAporteParaAgente = (idAgente) => {
    setSelectedAgenteId(idAgente);
    setShowGastoForm(false);
    setShowAgenteForm(false);
    setShowAporteForm(true);
  };

  const abrirGastoParaAgente = (idAgente) => {
    setGastoAgenteId(idAgente);
    setShowAporteForm(false);
    setShowAgenteForm(false);
    setShowGastoForm(true);
  };

  const abrirEdicionAgente = (agente) => {
    setAgenteEnEdicion(agente);
    setShowAporteForm(false);
    setShowGastoForm(false);
    setShowAgenteForm(true);
  };

  const verMovimientosAgente = (idAgente) => {
    setFiltros(prev => ({ ...prev, id_agente: idAgente, id_propietario: '' }));
    setVistaActiva('movimientos');
  };

  // KPIs Globales memoizados
  const { totalGlobalEntregado, totalGlobalGastos, saldoGlobalNeto } = useMemo(() => {
    const entregado = resumen.reduce((sum, r) => sum + (r.total_entregado || 0), 0);
    const gastos = resumen.reduce((sum, r) => sum + (r.total_gastos || 0), 0);
    return {
      totalGlobalEntregado: entregado,
      totalGlobalGastos: gastos,
      saldoGlobalNeto: entregado - gastos
    };
  }, [resumen]);

  // Imprimir reporte / Estado de cuenta
  const handlePrint = () => {
    const printWin = window.open('', '_blank');
    const selectedAg = agentes.find(a => String(a.id) === String(filtros.id_agente));
    const title = selectedAg ? `Estado de Cuenta — Agente ${selectedAg.nombre}` : 'Control de Saldos por Agentes';

    const rowsResumen = resumen.map(r => `
      <tr>
        <td><strong>${r.nombre}</strong></td>
        <td>${r.propietarios_nombres}</td>
        <td style="text-align:center">${r.total_gandolas} gandolas / ${r.total_choferes} choferes</td>
        <td style="text-align:right; color:#15803d; font-weight:600">${formatUSD(r.total_entregado)}</td>
        <td style="text-align:right; color:#dc2626; font-weight:600">${formatUSD(r.total_gastos)}</td>
        <td style="text-align:right; font-weight:700; color:${r.saldo_actual >= 0 ? '#15803d' : '#dc2626'}">
          ${formatUSD(r.saldo_actual)}
        </td>
      </tr>
    `).join('');

    const rowsMovs = movimientos.map(m => `
      <tr>
        <td style="text-align:center">${m.fecha}</td>
        <td><strong>${m.agente_nombre}</strong></td>
        <td>${m.propietario_nombre || '—'}</td>
        <td style="text-align:center">
          <span style="padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px; background:${m.tipo_movimiento === 'INGRESO' ? '#dcfce7; color:#15803d' : '#fee2e2; color:#dc2626'}">
            ${m.tipo_movimiento === 'INGRESO' ? '+ INGRESO' : '- GASTO'}
          </span>
        </td>
        <td>${m.concepto}</td>
        <td>${m.metodo_pago || '—'} ${m.referencia && m.referencia !== '—' ? '(' + m.referencia + ')' : ''}</td>
        <td style="text-align:right; font-weight:700; color:${m.tipo_movimiento === 'INGRESO' ? '#15803d' : '#dc2626'}">
          ${m.tipo_movimiento === 'INGRESO' ? '+' : '-'}${formatUSD(m.monto)}
        </td>
      </tr>
    `).join('');

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 11px; color: #111; margin: 24px; }
    h1 { font-size: 16px; margin: 0 0 4px; color: #003825; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; }
    .stats { display: flex; gap: 20px; margin-bottom: 20px; font-size: 12px; }
    .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 16px; }
    .stat strong { display: block; font-size: 16px; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #1e3a2f; color: #fff; padding: 6px 8px; font-size: 10px; text-transform: uppercase; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
    @media print { body { margin: 10px; } }
  </style>
</head>
<body>
  <h1>💰 ${title}</h1>
  <div class="subtitle">Generado el ${new Date().toLocaleDateString('es-VE', { dateStyle: 'long' })}</div>
  <div class="stats">
    <div class="stat"><strong style="color:#15803d">${formatUSD(totalGlobalEntregado)}</strong>Total Entregado</div>
    <div class="stat"><strong style="color:#dc2626">${formatUSD(totalGlobalGastos)}</strong>Total Gastos</div>
    <div class="stat"><strong style="color:${saldoGlobalNeto >= 0 ? '#15803d' : '#dc2626'}">${formatUSD(saldoGlobalNeto)}</strong>Saldo Global Neto</div>
  </div>

  <h3>📊 Resumen de Saldos por Agente</h3>
  <table>
    <thead>
      <tr>
        <th>Agente</th>
        <th>Propietarios que Maneja</th>
        <th style="text-align:center">Unidades / Choferes</th>
        <th style="text-align:right">Total Entregado (+)</th>
        <th style="text-align:right">Gastos Deducidos (-)</th>
        <th style="text-align:right">Saldo Actual</th>
      </tr>
    </thead>
    <tbody>${rowsResumen}</tbody>
  </table>

  ${movimientos.length > 0 ? `
    <h3>📋 Detalle de Movimientos Recientes</h3>
    <table>
      <thead>
        <tr>
          <th style="text-align:center">Fecha</th>
          <th>Agente</th>
          <th>Propietario</th>
          <th style="text-align:center">Tipo</th>
          <th>Concepto</th>
          <th>Método / Ref</th>
          <th style="text-align:right">Monto</th>
        </tr>
      </thead>
      <tbody>${rowsMovs}</tbody>
    </table>
  ` : ''}
</body>
</html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 400);
  };

  return (
    <div>
      {/* TARJETAS DE KPIS SUPERIORES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{
          background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.35)',
          borderRadius: '10px', padding: '14px 18px', display: 'flex', flexDirection: 'column'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Total Fondos Entregados (+)
          </span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: '#60a5fa', marginTop: '4px' }}>
            {formatUSD(totalGlobalEntregado)}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '2px' }}>
            Aportes entregados por los agentes
          </span>
        </div>

        <div style={{
          background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '10px', padding: '14px 18px', display: 'flex', flexDirection: 'column'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Total Gastos Descontados (-)
          </span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: '#f87171', marginTop: '4px' }}>
            {formatUSD(totalGlobalGastos)}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '2px' }}>
            Gastos de propietarios y unidades
          </span>
        </div>

        <div style={{
          background: saldoGlobalNeto >= 0 ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.14)',
          border: `1px solid ${saldoGlobalNeto >= 0 ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
          borderRadius: '10px', padding: '14px 18px', display: 'flex', flexDirection: 'column'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Saldo Global Disponible
          </span>
          <span style={{
            fontSize: '24px', fontWeight: 700,
            color: saldoGlobalNeto >= 0 ? '#4ade80' : '#f87171', marginTop: '4px'
          }}>
            {formatUSD(saldoGlobalNeto)}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '2px' }}>
            {saldoGlobalNeto >= 0 ? 'Saldo neto a favor' : 'Déficit / Saldo en contra'}
          </span>
        </div>

        <div style={{
          background: 'var(--surface-variant)', borderRadius: '10px', padding: '14px 18px',
          display: 'flex', flexDirection: 'column', border: '1px solid var(--outline-variant)'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Agentes Registrados
          </span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--on-surface)', marginTop: '4px' }}>
            {resumen.length}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '2px' }}>
            Cuentas financieras activas
          </span>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS Y PESTAÑAS */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${vistaActiva === 'resumen' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setVistaActiva('resumen')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>table_chart</span>
              Resumen por Agente
            </button>
            <button
              className={`btn btn-sm ${vistaActiva === 'agentes' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setVistaActiva('agentes')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>group</span>
              Gestión de Agentes ({agentes.length})
            </button>
            <button
              className={`btn btn-sm ${vistaActiva === 'movimientos' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setVistaActiva('movimientos')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>receipt_long</span>
              Historial de Movimientos ({movimientos.length})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handlePrint}
              title="Imprimir / Exportar reporte en PDF"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>print</span>
              Imprimir
            </button>

            <button
              className="btn btn-secondary btn-sm"
              style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}
              onClick={() => {
                setAgenteEnEdicion(null);
                setShowAporteForm(false);
                setShowGastoForm(false);
                setShowAgenteForm(prev => !prev);
              }}
              title="Crear un nuevo agente y asignarle propietarios"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>person_add</span>
              {showAgenteForm ? 'Ocultar Form Agente' : '+ Nuevo Agente'}
            </button>

            <button
              className="btn btn-secondary btn-sm"
              style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
              onClick={() => {
                setGastoAgenteId('');
                setShowAgenteForm(false);
                setShowAporteForm(false);
                setShowGastoForm(prev => !prev);
              }}
              title="Registrar un gasto directo o viático para descontar del saldo del agente"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>build</span>
              {showGastoForm ? 'Ocultar Gasto' : 'Registrar Gasto'}
            </button>

            <button
              className="btn btn-primary btn-sm"
              style={{ background: '#16a34a', borderColor: '#15803d' }}
              onClick={() => {
                setSelectedAgenteId('');
                setShowAgenteForm(false);
                setShowGastoForm(false);
                setShowAporteForm(prev => !prev);
              }}
              title="Registrar una nueva entrega de fondos de un agente"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>add_circle</span>
              {showAporteForm ? 'Ocultar Entrega' : 'Registrar Entrega de Fondos'}
            </button>
          </div>
        </div>
      </div>

      {/* SECCIÓN FORMULARIO CREAR / EDITAR AGENTE */}
      <SeccionFormAgente
        isOpen={showAgenteForm}
        onClose={() => setShowAgenteForm(false)}
        agenteEnEdicion={agenteEnEdicion}
        todosPropietarios={todosPropietarios}
        onGuardado={() => { cargarResumen(); cargarMovimientos(); }}
        mostrarToast={mostrarToast}
      />

      {/* SECCIÓN FORMULARIO APORTE / ENTREGA DE FONDOS */}
      <SeccionAporteDirecto
        isOpen={showAporteForm}
        onClose={() => setShowAporteForm(false)}
        initialAgenteId={selectedAgenteId}
        agentes={agentes}
        onGuardado={() => { cargarResumen(); cargarMovimientos(); }}
        mostrarToast={mostrarToast}
      />

      {/* SECCIÓN FORMULARIO GASTO DIRECTO */}
      <SeccionGastoDirecto
        isOpen={showGastoForm}
        onClose={() => setShowGastoForm(false)}
        initialAgenteId={gastoAgenteId}
        agentes={agentes}
        catalogos={catalogos}
        onGuardado={() => { cargarResumen(); cargarMovimientos(); }}
        mostrarToast={mostrarToast}
      />

      {/* VISTA 1: RESUMEN POR AGENTE */}
      {vistaActiva === 'resumen' && (
        <div>
          {resumen.length === 0 && !loading && (
            <div className="card" style={{ padding: '30px', textAlign: 'center', marginBottom: '16px', background: 'var(--surface-container)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--primary)', marginBottom: '12px' }}>
                support_agent
              </span>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>No hay agentes registrados aún</h3>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '13px', maxWidth: '520px', margin: '0 auto 16px auto' }}>
                Un agente es la persona o entidad que entrega los fondos (pone el dinero) y a quien se le asignan los gastos de los propietarios que maneja.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setAgenteEnEdicion(null);
                  setShowAgenteForm(true);
                }}
              >
                <span className="material-symbols-outlined">person_add</span>
                + Crear Primer Agente
              </button>
            </div>
          )}

          {resumen.length > 0 && (
            <div className="table-container" style={{ maxHeight: '560px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Agente</th>
                    <th style={{ textAlign: 'center' }}>Propietarios que Maneja</th>
                    <th style={{ textAlign: 'center' }}>Unidades / Choferes</th>
                    <th style={{ textAlign: 'center' }}>Total Entregado (+)</th>
                    <th style={{ textAlign: 'center' }}>Gastos Deducidos (-)</th>
                    <th style={{ textAlign: 'center' }}>Saldo Actual</th>
                    <th style={{ textAlign: 'center', whiteSpace: 'nowrap', minWidth: '110px' }}>Estado</th>
                    <th style={{ textAlign: 'center', whiteSpace: 'nowrap', minWidth: '220px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--primary)' }}>
                        <span className="material-symbols-outlined spinning" style={{ fontSize: '24px', verticalAlign: 'middle', marginRight: '8px' }}>sync</span>
                        Cargando saldos de agentes...
                      </td>
                    </tr>
                  ) : resumen.map(ag => {
                    const saldoPositivo = ag.saldo_actual >= 0;
                    return (
                      <tr key={ag.id}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '13px' }}>{ag.nombre}</div>
                          {ag.contacto && (
                            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>{ag.contacto}</div>
                          )}
                        </td>
                        <td>
                          {ag.propietarios && ag.propietarios.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {ag.propietarios.map(p => (
                                <span key={p.id} className="badge badge-gray" style={{ fontSize: '11px', fontWeight: 600 }}>
                                  👤 {p.nombre}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
                              Sin propietarios asignados
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          <span className="badge badge-gray mono" title={ag.gandolas?.map(g => g.placa).join(', ')}>
                            {ag.total_gandolas} gandolas / {ag.total_choferes} choferes
                          </span>
                        </td>
                        <td className="mono" style={{ textAlign: 'center', fontWeight: 600, color: '#4ade80' }}>
                          {formatUSD(ag.total_entregado)}
                        </td>
                        <td className="mono" style={{ textAlign: 'center', fontWeight: 600, color: '#f87171' }}>
                          {formatUSD(ag.total_gastos)}
                        </td>
                        <td className="mono" style={{
                          textAlign: 'center', fontWeight: 700, fontSize: '14px',
                          color: saldoPositivo ? '#4ade80' : '#f87171'
                        }}>
                          {formatUSD(ag.saldo_actual)}
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            background: saldoPositivo ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: saldoPositivo ? '#16a34a' : '#dc2626',
                            border: `1px solid ${saldoPositivo ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`
                          }}>
                            {saldoPositivo ? '✓ A Favor' : '⚠ Deudor'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', fontSize: '11px', color: '#4ade80' }}
                              onClick={() => abrirAporteParaAgente(ag.id)}
                              title="Registrar entrega de fondos de este agente"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                              Aporte
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', fontSize: '11px', color: '#f87171' }}
                              onClick={() => abrirGastoParaAgente(ag.id)}
                              title="Registrar gasto o viático asignado a este agente"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>build</span>
                              Gasto
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => verMovimientosAgente(ag.id)}
                              title="Ver extracto / bitácora de movimientos"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>visibility</span>
                              Extracto
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => abrirEdicionAgente(ag)}
                              title="Editar agente y asignar propietarios"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: GESTIÓN DE AGENTES */}
      {vistaActiva === 'agentes' && (
        <div className="table-container" style={{ maxHeight: '560px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Nombre del Agente</th>
                <th style={{ textAlign: 'center' }}>Contacto</th>
                <th style={{ textAlign: 'center' }}>Propietarios Asignados</th>
                <th style={{ textAlign: 'center' }}>Notas</th>
                <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {agentes.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '36px', color: 'var(--on-surface-variant)' }}>
                    No hay agentes creados. Pulse el botón "+ Nuevo Agente" para comenzar.
                  </td>
                </tr>
              ) : agentes.map(ag => (
                <tr key={ag.id}>
                  <td style={{ fontWeight: 700 }}>{ag.nombre}</td>
                  <td style={{ textAlign: 'center', color: 'var(--on-surface-variant)' }}>{ag.contacto || '—'}</td>
                  <td>
                    {ag.propietarios && ag.propietarios.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {ag.propietarios.map(p => (
                          <span key={p.id} className="badge badge-gray" style={{ fontSize: '11px' }}>
                            {p.nombre}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
                        Sin asignar
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>{ag.notas || '—'}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => abrirEdicionAgente(ag)}
                        title="Editar agente y propietarios"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>edit</span>
                        Editar
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#f87171' }}
                        onClick={() => handleEliminarAgente(ag)}
                        title="Eliminar agente"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VISTA 3: HISTORIAL DE MOVIMIENTOS */}
      {vistaActiva === 'movimientos' && (
        <div>
          <div className="card" style={{ marginBottom: '14px', padding: '12px 18px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <div style={{ minWidth: '180px' }}>
                <select
                  className="form-select"
                  value={filtros.id_agente}
                  onChange={e => setFiltros({ ...filtros, id_agente: e.target.value })}
                >
                  <option value="">Todos los agentes</option>
                  {agentes.map(a => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={{ minWidth: '180px' }}>
                <select
                  className="form-select"
                  value={filtros.id_propietario}
                  onChange={e => setFiltros({ ...filtros, id_propietario: e.target.value })}
                >
                  <option value="">Todos los propietarios</option>
                  {todosPropietarios.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={{ minWidth: '150px' }}>
                <select
                  className="form-select"
                  value={filtros.tipo_movimiento}
                  onChange={e => setFiltros({ ...filtros, tipo_movimiento: e.target.value })}
                >
                  <option value="">Todos los tipos</option>
                  <option value="INGRESO">🟢 Ingresos (Aportes)</option>
                  <option value="EGRESO">🔴 Egresos (Gastos)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="date"
                  className="form-input"
                  value={filtros.fecha_desde}
                  onChange={e => setFiltros({ ...filtros, fecha_desde: e.target.value })}
                  title="Desde"
                />
                <span style={{ color: 'var(--on-surface-variant)' }}>a</span>
                <input
                  type="date"
                  className="form-input"
                  value={filtros.fecha_hasta}
                  onChange={e => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
                  title="Hasta"
                />
              </div>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setFiltros({ id_agente: '', id_propietario: '', fecha_desde: '', fecha_hasta: '', tipo_movimiento: '' })}
              >
                Restablecer
              </button>
            </div>
          </div>

          <div className="table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Fecha</th>
                  <th style={{ textAlign: 'center' }}>Agente</th>
                  <th style={{ textAlign: 'center' }}>Propietario</th>
                  <th style={{ textAlign: 'center' }}>Tipo</th>
                  <th style={{ textAlign: 'center' }}>Concepto / Descripción</th>
                  <th style={{ textAlign: 'center' }}>Método / Ref</th>
                  <th style={{ textAlign: 'center' }}>Monto</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loadingMovimientos ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--primary)' }}>
                      <span className="material-symbols-outlined spinning" style={{ fontSize: '24px', verticalAlign: 'middle', marginRight: '8px' }}>sync</span>
                      Cargando movimientos...
                    </td>
                  </tr>
                ) : movimientos.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--on-surface-variant)' }}>
                      No se encontraron movimientos con los filtros seleccionados.
                    </td>
                  </tr>
                ) : movimientos.map(m => {
                  const isIngreso = m.tipo_movimiento === 'INGRESO';
                  return (
                    <tr
                      key={m.id}
                      style={{
                        background: isIngreso ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.06)',
                        borderLeft: `3px solid ${isIngreso ? '#22c55e' : '#ef4444'}`
                      }}
                    >
                      <td className="mono" style={{ textAlign: 'center', fontWeight: 600 }}>
                        {m.fecha}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {m.agente_nombre}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                        {m.propietario_nombre}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block',
                          whiteSpace: 'nowrap',
                          padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                          background: isIngreso ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: isIngreso ? '#4ade80' : '#f87171'
                        }}>
                          {isIngreso ? '+ INGRESO' : '- GASTO'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{m.concepto}</div>
                        {m.notas && m.notas !== m.concepto && (
                          <div style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85 }}>{m.notas}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '12px' }}>
                        <div>{m.metodo_pago || '—'}</div>
                        {m.referencia && m.referencia !== '—' && (
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--on-surface-variant)' }}>
                            {m.referencia}
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{
                        textAlign: 'center', fontWeight: 700, fontSize: '13px',
                        color: isIngreso ? '#4ade80' : '#f87171'
                      }}>
                        {isIngreso ? '+' : '-'}{formatUSD(m.monto)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 6px', color: '#f87171' }}
                          onClick={() => handleEliminarMovimiento(m)}
                          title={isIngreso ? 'Eliminar entrega de fondos' : 'Eliminar gasto'}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default SaldosPropietariosView;
