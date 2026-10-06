const { ipcMain } = require('electron');
const crypto = require('crypto');
const { dbAll, dbRun, dbGet } = require('../db/database');

function registerSaldosIPC() {
  // ─── GESTIÓN DE AGENTES ──────────────────────────────────────────────────
  ipcMain.handle('saldos:obtenerAgentes', async () => {
    try {
      const agentes = await dbAll("SELECT * FROM Agentes WHERE (deleted_at IS NULL) ORDER BY nombre ASC");
      const propietarios = await dbAll("SELECT id, nombre, contacto, id_agente FROM Propietarios WHERE (deleted_at IS NULL) ORDER BY nombre ASC");

      const resultado = agentes.map(a => {
        const props = propietarios.filter(p => p.id_agente === a.id || (a.id_propietario_vinculado && p.id === a.id_propietario_vinculado));
        return {
          ...a,
          propietarios: props,
          total_propietarios: props.length
        };
      });

      return { ok: true, data: resultado, todosPropietarios: propietarios };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('saldos:guardarAgente', async (event, agente) => {
    try {
      const { id, nombre, contacto, id_propietario_vinculado, notas, propietariosIds = [] } = agente;
      if (!nombre || !nombre.trim()) {
        throw new Error('El nombre del agente es obligatorio');
      }
      const now = new Date().toISOString();

      let agenteId = id;
      if (id) {
        await dbRun(`
          UPDATE Agentes SET
            nombre = ?, contacto = ?, id_propietario_vinculado = ?, notas = ?,
            updated_at = ?,
            sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
          WHERE id = ?
        `, [nombre.trim(), contacto || '', id_propietario_vinculado ? Number(id_propietario_vinculado) : null, notas || '', now, id]);
      } else {
        const uuid = crypto.randomUUID();
        const res = await dbRun(`
          INSERT INTO Agentes (uuid, nombre, contacto, id_propietario_vinculado, notas, updated_at, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending_insert')
        `, [uuid, nombre.trim(), contacto || '', id_propietario_vinculado ? Number(id_propietario_vinculado) : null, notas || '', now]);
        agenteId = res.lastID;
      }

      // Asegurar que si el agente es un propietario en sí, se incluya en la lista de asignados
      let finalPropIds = (propietariosIds || []).map(Number);
      if (id_propietario_vinculado) {
        const vinculId = Number(id_propietario_vinculado);
        if (!finalPropIds.includes(vinculId)) {
          finalPropIds.push(vinculId);
        }
      }

      // Desvincular propietarios anteriores de este agente
      await dbRun("UPDATE Propietarios SET id_agente = NULL, updated_at = ?, sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END WHERE id_agente = ?", [now, agenteId]);

      // Vincular los nuevos propietarios seleccionados
      if (finalPropIds.length > 0) {
        const ph = finalPropIds.map(() => '?').join(',');
        await dbRun(`UPDATE Propietarios SET id_agente = ?, updated_at = ?, sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END WHERE id IN (${ph})`, [agenteId, now, ...finalPropIds]);
      }

      return { ok: true, id: agenteId, mensaje: id ? 'Agente actualizado exitosamente' : 'Agente creado exitosamente' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('saldos:eliminarAgente', async (event, id) => {
    try {
      const now = new Date().toISOString();
      await dbRun("UPDATE Propietarios SET id_agente = NULL, updated_at = ?, sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END WHERE id_agente = ?", [now, id]);
      await dbRun("UPDATE Agentes SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete' WHERE id = ?", [now, now, id]);
      return { ok: true, mensaje: 'Agente eliminado exitosamente' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });


  // ─── RESUMEN DE SALDOS POR AGENTE (CONTROL MANUAL) ────────────────────────
  ipcMain.handle('saldos:obtenerResumen', async () => {
    try {
      const agentes = await dbAll("SELECT * FROM Agentes WHERE (deleted_at IS NULL) ORDER BY nombre ASC");
      const propietarios = await dbAll("SELECT id, nombre, contacto, id_agente FROM Propietarios WHERE (deleted_at IS NULL)");

      const resumen = await Promise.all(agentes.map(async (ag) => {
        // Propietarios que maneja este agente
        const props = propietarios.filter(p => p.id_agente === ag.id || (ag.id_propietario_vinculado && p.id === ag.id_propietario_vinculado));
        const propIds = Array.from(new Set(props.map(p => p.id)));

        // 1. Total entregado (Aportes manuales del Agente)
        const aporteRow = await dbGet(
          "SELECT COALESCE(SUM(monto), 0) AS total FROM Aportes_Propietarios WHERE id_agente = ? AND (deleted_at IS NULL)",
          [ag.id]
        );
        const totalEntregado = aporteRow ? Number(aporteRow.total) : 0;

        // 2. Gandolas y Choferes de los propietarios administrados (Informativo)
        let gandolas = [];
        let choferes = [];
        if (propIds.length > 0) {
          const ph = propIds.map(() => '?').join(',');
          gandolas = await dbAll(`SELECT placa, modelo, id_propietario FROM Gandolas WHERE id_propietario IN (${ph}) AND (deleted_at IS NULL)`, propIds);
          choferes = await dbAll(`SELECT nombre, id_propietario FROM Choferes WHERE id_propietario IN (${ph}) AND (deleted_at IS NULL)`, propIds);
        }

        // 3. Gastos del Agente: SOLO gastos registrados MANUALMENTE para este agente
        const gastosRow = await dbGet(
          "SELECT COALESCE(SUM(monto), 0) AS total FROM Gastos_Extra WHERE id_agente = ? AND (deleted_at IS NULL)",
          [ag.id]
        );
        const totalGastos = gastosRow ? Number(gastosRow.total) : 0;

        const saldoActual = totalEntregado - totalGastos;

        return {
          id: ag.id,
          nombre: ag.nombre,
          contacto: ag.contacto,
          notas: ag.notas,
          id_propietario_vinculado: ag.id_propietario_vinculado,
          propietarios: props,
          propietarios_nombres: props.map(p => p.nombre).join(', ') || 'Sin propietarios asignados',
          total_propietarios: props.length,
          gandolas: gandolas,
          choferes: choferes,
          total_entregado: totalEntregado,
          total_gastos: totalGastos,
          saldo_actual: saldoActual,
          total_gandolas: gandolas.length,
          total_choferes: choferes.length
        };
      }));

      return { ok: true, data: resumen };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });


  // ─── HISTORIAL DE MOVIMIENTOS MANUALES DEL AGENTE ─────────────────────────
  ipcMain.handle('saldos:obtenerMovimientos', async (event, filtros = {}) => {
    try {
      const { id_agente, id_propietario, fecha_desde, fecha_hasta, tipo_movimiento } = filtros;

      const agentes = await dbAll("SELECT id, nombre, id_propietario_vinculado FROM Agentes WHERE (deleted_at IS NULL)");
      const agentMap = {};
      agentes.forEach(a => { agentMap[a.id] = a.nombre; });

      const propietarios = await dbAll("SELECT id, nombre, id_agente FROM Propietarios WHERE (deleted_at IS NULL)");
      const propMap = {};
      propietarios.forEach(p => { propMap[p.id] = p.nombre; });

      let movimientos = [];

      // 1. Obtener Aportes Manuales (Ingresos)
      if (!tipo_movimiento || tipo_movimiento === 'INGRESO') {
        let aportesSql = "SELECT * FROM Aportes_Propietarios WHERE id_agente IS NOT NULL AND (deleted_at IS NULL)";
        const aportesParams = [];

        if (id_agente) {
          aportesSql += " AND id_agente = ?";
          aportesParams.push(id_agente);
        }
        if (id_propietario) {
          aportesSql += " AND id_propietario = ?";
          aportesParams.push(id_propietario);
        }
        if (fecha_desde) {
          aportesSql += " AND fecha >= ?";
          aportesParams.push(fecha_desde);
        }
        if (fecha_hasta) {
          aportesSql += " AND fecha <= ?";
          aportesParams.push(fecha_hasta);
        }

        const aportes = await dbAll(aportesSql, aportesParams);
        aportes.forEach(a => {
          movimientos.push({
            id: `aporte-${a.id}`,
            real_id: a.id,
            updated_at: a.updated_at || a.fecha || '',
            tipo_registro: 'aporte',
            tipo_movimiento: 'INGRESO',
            fecha: a.fecha,
            id_agente: a.id_agente,
            agente_nombre: agentMap[a.id_agente] || (a.id_agente ? 'Agente #' + a.id_agente : 'Fondo General'),
            id_propietario: a.id_propietario,
            propietario_nombre: a.id_propietario ? (propMap[a.id_propietario] || '—') : '—',
            concepto: a.concepto || 'Entrega de Fondos',
            monto: Number(a.monto),
            metodo_pago: a.metodo_pago || 'Efectivo',
            referencia: a.referencia || '—',
            notas: a.notas || ''
          });
        });
      }

      // 2. Obtener Gastos Manuales del Agente (Egresos)
      if (!tipo_movimiento || tipo_movimiento === 'EGRESO') {
        let gastosSql = "SELECT * FROM Gastos_Extra WHERE id_agente IS NOT NULL AND (deleted_at IS NULL)";
        const gastosParams = [];

        if (id_agente) {
          gastosSql += " AND id_agente = ?";
          gastosParams.push(id_agente);
        }
        if (id_propietario) {
          gastosSql += " AND id_propietario = ?";
          gastosParams.push(id_propietario);
        }
        if (fecha_desde) {
          gastosSql += " AND fecha >= ?";
          gastosParams.push(fecha_desde);
        }
        if (fecha_hasta) {
          gastosSql += " AND fecha <= ?";
          gastosParams.push(fecha_hasta);
        }

        const gastos = await dbAll(gastosSql, gastosParams);
        gastos.forEach(g => {
          let detalle = '';
          if (g.id_gandola) detalle = `Gandola: ${g.id_gandola}`;
          else if (g.id_chofer) detalle = `Chofer: ${g.id_chofer}`;

          movimientos.push({
            id: `gasto-${g.id}`,
            real_id: g.id,
            updated_at: g.updated_at || g.fecha || '',
            tipo_registro: 'gasto',
            tipo_movimiento: 'EGRESO',
            fecha: g.fecha,
            id_agente: g.id_agente,
            agente_nombre: agentMap[g.id_agente] || (g.id_agente ? 'Agente #' + g.id_agente : 'Gasto General'),
            id_propietario: g.id_propietario,
            propietario_nombre: g.id_propietario ? (propMap[g.id_propietario] || 'Propietario #' + g.id_propietario) : '—',
            concepto: g.descripcion || g.categoria || 'Gasto / Viático manual',
            monto: Number(g.monto),
            metodo_pago: 'Gasto / Débito',
            referencia: detalle || g.categoria || 'Gasto',
            notas: g.descripcion || ''
          });
        });
      }

      // Ordenar: primero por fecha DESC, luego por updated_at DESC, luego por real_id DESC
      movimientos.sort((a, b) => {
        const fechaCmp = b.fecha.localeCompare(a.fecha);
        if (fechaCmp !== 0) return fechaCmp;
        const uaCmp = (b.updated_at || '').localeCompare(a.updated_at || '');
        if (uaCmp !== 0) return uaCmp;
        return (b.real_id || 0) - (a.real_id || 0);
      });

      return { ok: true, data: movimientos };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });


  // ─── GUARDAR APORTE MANUAL ────────────────────────────────────────────────
  ipcMain.handle('saldos:guardarAporte', async (event, aporte) => {
    try {
      const { id, fecha, id_agente, id_propietario, monto, concepto, metodo_pago, referencia, notas } = aporte;
      if (!fecha || !id_agente || !monto || Number(monto) <= 0) {
        throw new Error('Fecha, agente y un monto mayor a 0 son obligatorios');
      }
      const now = new Date().toISOString();

      if (id) {
        await dbRun(`
          UPDATE Aportes_Propietarios SET
            fecha = ?, id_agente = ?, id_propietario = ?, monto = ?,
            concepto = ?, metodo_pago = ?, referencia = ?, notas = ?,
            updated_at = ?,
            sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
          WHERE id = ?
        `, [fecha, Number(id_agente), id_propietario ? Number(id_propietario) : null, Number(monto), concepto || 'Entrega de Fondos', metodo_pago || 'Efectivo', referencia || '', notas || '', now, id]);
        return { ok: true, mensaje: 'Entrega de fondos actualizada exitosamente' };
      } else {
        const uuid = crypto.randomUUID();
        const res = await dbRun(`
          INSERT INTO Aportes_Propietarios (uuid, fecha, id_agente, id_propietario, monto, concepto, metodo_pago, referencia, notas, updated_at, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_insert')
        `, [uuid, fecha, Number(id_agente), id_propietario ? Number(id_propietario) : null, Number(monto), concepto || 'Entrega de Fondos', metodo_pago || 'Efectivo', referencia || '', notas || '', now]);
        return { ok: true, id: res.lastID, uuid, mensaje: 'Entrega de fondos registrada exitosamente' };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // ─── ELIMINAR APORTE ──────────────────────────────────────────────────────
  ipcMain.handle('saldos:eliminarAporte', async (event, id) => {
    try {
      const now = new Date().toISOString();
      await dbRun("UPDATE Aportes_Propietarios SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete' WHERE id = ?", [now, now, id]);
      return { ok: true, mensaje: 'Registro de entrega eliminado' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

module.exports = { registerSaldosIPC };
