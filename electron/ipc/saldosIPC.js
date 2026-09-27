const { ipcMain } = require('electron');
const { dbAll, dbRun, dbGet } = require('../db/database');

function registerSaldosIPC() {
  // ─── GESTIÓN DE AGENTES ──────────────────────────────────────────────────
  ipcMain.handle('saldos:obtenerAgentes', async () => {
    try {
      const agentes = await dbAll("SELECT * FROM Agentes ORDER BY nombre ASC");
      const propietarios = await dbAll("SELECT id, nombre, contacto, id_agente FROM Propietarios ORDER BY nombre ASC");

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

      let agenteId = id;
      if (id) {
        await dbRun(`
          UPDATE Agentes SET
            nombre = ?, contacto = ?, id_propietario_vinculado = ?, notas = ?
          WHERE id = ?
        `, [nombre.trim(), contacto || '', id_propietario_vinculado ? Number(id_propietario_vinculado) : null, notas || '', id]);
      } else {
        const res = await dbRun(`
          INSERT INTO Agentes (nombre, contacto, id_propietario_vinculado, notas)
          VALUES (?, ?, ?, ?)
        `, [nombre.trim(), contacto || '', id_propietario_vinculado ? Number(id_propietario_vinculado) : null, notas || '']);
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
      await dbRun("UPDATE Propietarios SET id_agente = NULL WHERE id_agente = ?", [agenteId]);

      // Vincular los nuevos propietarios seleccionados
      if (finalPropIds.length > 0) {
        const ph = finalPropIds.map(() => '?').join(',');
        await dbRun(`UPDATE Propietarios SET id_agente = ? WHERE id IN (${ph})`, [agenteId, ...finalPropIds]);
      }

      return { ok: true, id: agenteId, mensaje: id ? 'Agente actualizado exitosamente' : 'Agente creado exitosamente' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('saldos:eliminarAgente', async (event, id) => {
    try {
      await dbRun("UPDATE Propietarios SET id_agente = NULL WHERE id_agente = ?", [id]);
      await dbRun("DELETE FROM Agentes WHERE id = ?", [id]);
      return { ok: true, mensaje: 'Agente eliminado exitosamente' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });


  // ─── RESUMEN DE SALDOS POR AGENTE ─────────────────────────────────────────
  ipcMain.handle('saldos:obtenerResumen', async () => {
    try {
      const agentes = await dbAll("SELECT * FROM Agentes ORDER BY nombre ASC");
      const propietarios = await dbAll("SELECT id, nombre, contacto, id_agente FROM Propietarios");

      const resumen = await Promise.all(agentes.map(async (ag) => {
        // Propietarios que maneja este agente (asignados por id_agente O por id_propietario_vinculado)
        const props = propietarios.filter(p => p.id_agente === ag.id || (ag.id_propietario_vinculado && p.id === ag.id_propietario_vinculado));
        const propIds = Array.from(new Set(props.map(p => p.id)));

        // 1. Total entregado (Aportes del Agente o de sus propietarios asignados)
        let aporteConds = ["id_agente = ?"];
        let aporteParams = [ag.id];
        if (propIds.length > 0) {
          const ph = propIds.map(() => '?').join(',');
          aporteConds.push(`id_propietario IN (${ph})`);
          aporteParams.push(...propIds);
        }
        const aporteRow = await dbGet(
          `SELECT COALESCE(SUM(monto), 0) AS total FROM Aportes_Propietarios WHERE (${aporteConds.join(' OR ')})`,
          aporteParams
        );
        const totalEntregado = aporteRow ? Number(aporteRow.total) : 0;

        // 2. Gandolas y Choferes asociados a los propietarios del agente
        let gandolas = [];
        let choferes = [];
        if (propIds.length > 0) {
          const ph = propIds.map(() => '?').join(',');
          gandolas = await dbAll(`SELECT placa, modelo, id_propietario FROM Gandolas WHERE id_propietario IN (${ph})`, propIds);
          choferes = await dbAll(`SELECT nombre, id_propietario FROM Choferes WHERE id_propietario IN (${ph})`, propIds);
        }

        const placas = gandolas.map(g => g.placa);
        const nombresChoferes = choferes.map(c => c.nombre);

        // 3. Gastos asociados al Agente (directos o de sus propietarios/gandolas/choferes)
        let gastosConds = ["id_agente = ?"];
        let gastosParams = [ag.id];

        if (propIds.length > 0) {
          const ph = propIds.map(() => '?').join(',');
          gastosConds.push(`id_propietario IN (${ph})`);
          gastosParams.push(...propIds);
        }

        if (placas.length > 0) {
          const ph = placas.map(() => '?').join(',');
          gastosConds.push(`id_gandola IN (${ph})`);
          gastosParams.push(...placas);
        }

        if (nombresChoferes.length > 0) {
          const ph = nombresChoferes.map(() => '?').join(',');
          gastosConds.push(`id_chofer IN (${ph})`);
          gastosParams.push(...nombresChoferes);
        }

        const gastosSql = `SELECT COALESCE(SUM(monto), 0) AS total FROM Gastos_Extra WHERE (${gastosConds.join(' OR ')})`;
        const gastosRow = await dbGet(gastosSql, gastosParams);
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


  // ─── HISTORIAL DE MOVIMIENTOS DETALLADOS ───────────────────────────────────
  ipcMain.handle('saldos:obtenerMovimientos', async (event, filtros = {}) => {
    try {
      const { id_agente, id_propietario, fecha_desde, fecha_hasta, tipo_movimiento } = filtros;

      const agentes = await dbAll("SELECT id, nombre, id_propietario_vinculado FROM Agentes");
      const agentMap = {};
      agentes.forEach(a => { agentMap[a.id] = a.nombre; });

      const propietarios = await dbAll("SELECT id, nombre, id_agente FROM Propietarios");
      const propMap = {};
      const propToAgent = {};
      propietarios.forEach(p => {
        propMap[p.id] = p.nombre;
        if (p.id_agente) propToAgent[p.id] = p.id_agente;
      });

      // Mapear también propietario vinculado como agente
      agentes.forEach(a => {
        if (a.id_propietario_vinculado) {
          propToAgent[a.id_propietario_vinculado] = a.id;
        }
      });

      let movimientos = [];

      // 1. Obtener Aportes (Ingresos)
      if (!tipo_movimiento || tipo_movimiento === 'INGRESO') {
        let aportesSql = "SELECT * FROM Aportes_Propietarios WHERE 1=1";
        const aportesParams = [];

        if (id_agente) {
          // Filtrar aportes del agente o de sus propietarios asignados
          const propsOfAgent = propietarios.filter(p => p.id_agente === Number(id_agente) || (agentes.find(a => a.id === Number(id_agente))?.id_propietario_vinculado === p.id)).map(p => p.id);
          if (propsOfAgent.length > 0) {
            const ph = propsOfAgent.map(() => '?').join(',');
            aportesSql += ` AND (id_agente = ? OR id_propietario IN (${ph}))`;
            aportesParams.push(id_agente, ...propsOfAgent);
          } else {
            aportesSql += " AND id_agente = ?";
            aportesParams.push(id_agente);
          }
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
          const finalAgentId = a.id_agente || (a.id_propietario && propToAgent[a.id_propietario]);
          movimientos.push({
            id: `aporte-${a.id}`,
            real_id: a.id,
            tipo_registro: 'aporte',
            tipo_movimiento: 'INGRESO',
            fecha: a.fecha,
            id_agente: finalAgentId,
            agente_nombre: agentMap[finalAgentId] || (finalAgentId ? 'Agente #' + finalAgentId : 'Fondo General'),
            id_propietario: a.id_propietario,
            propietario_nombre: a.id_propietario ? propMap[a.id_propietario] : '—',
            concepto: a.concepto || 'Entrega de Fondos',
            monto: Number(a.monto),
            metodo_pago: a.metodo_pago || 'Efectivo',
            referencia: a.referencia || '—',
            notas: a.notas || ''
          });
        });
      }

      // 2. Obtener Gastos (Egresos)
      if (!tipo_movimiento || tipo_movimiento === 'EGRESO') {
        let sql = "SELECT * FROM Gastos_Extra WHERE 1=1";
        const params = [];

        if (fecha_desde) {
          sql += " AND fecha >= ?";
          params.push(fecha_desde);
        }
        if (fecha_hasta) {
          sql += " AND fecha <= ?";
          params.push(fecha_hasta);
        }

        const allGastos = await dbAll(sql, params);

        const gandolas = await dbAll("SELECT placa, id_propietario FROM Gandolas WHERE id_propietario IS NOT NULL");
        const choferes = await dbAll("SELECT nombre, id_propietario FROM Choferes WHERE id_propietario IS NOT NULL");
        const gandolaToProp = {};
        gandolas.forEach(g => { gandolaToProp[g.placa] = g.id_propietario; });
        const choferToProp = {};
        choferes.forEach(c => { choferToProp[c.nombre] = c.id_propietario; });

        allGastos.forEach(g => {
          const propId = g.id_propietario || (g.id_gandola && gandolaToProp[g.id_gandola]) || (g.id_chofer && choferToProp[g.id_chofer]);
          const agentId = g.id_agente || (propId && propToAgent[propId]);

          // Filtrado por agente o propietario
          if (id_agente && String(agentId) !== String(id_agente)) {
            return;
          }
          if (id_propietario && String(propId) !== String(id_propietario)) {
            return;
          }

          let detalle = '';
          if (g.id_gandola) detalle = `Gandola: ${g.id_gandola}`;
          else if (g.id_chofer) detalle = `Chofer: ${g.id_chofer}`;

          movimientos.push({
            id: `gasto-${g.id}`,
            real_id: g.id,
            tipo_registro: 'gasto',
            tipo_movimiento: 'EGRESO',
            fecha: g.fecha,
            id_agente: agentId,
            agente_nombre: agentMap[agentId] || (agentId ? 'Agente #' + agentId : 'Gasto General'),
            id_propietario: propId,
            propietario_nombre: propId ? (propMap[propId] || 'Propietario #' + propId) : '—',
            concepto: g.descripcion || g.categoria || 'Gasto de operación / taller',
            monto: Number(g.monto),
            metodo_pago: 'Gasto / Débito',
            referencia: detalle || g.categoria || 'Gasto',
            notas: g.descripcion || ''
          });
        });
      }

      // Ordenar cronológicamente descendente
      movimientos.sort((a, b) => {
        if (b.fecha === a.fecha) return (b.id > a.id ? 1 : -1);
        return b.fecha.localeCompare(a.fecha);
      });

      return { ok: true, data: movimientos };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });


  // ─── GUARDAR APORTE / ENTREGA DE FONDOS ───────────────────────────────────
  ipcMain.handle('saldos:guardarAporte', async (event, aporte) => {
    try {
      const { id, fecha, id_agente, id_propietario, monto, concepto, metodo_pago, referencia, notas } = aporte;
      if (!fecha || (!id_agente && !id_propietario) || !monto || Number(monto) <= 0) {
        throw new Error('Fecha, agente o propietario, y un monto mayor a 0 son obligatorios');
      }

      if (id) {
        await dbRun(`
          UPDATE Aportes_Propietarios SET
            fecha = ?, id_agente = ?, id_propietario = ?, monto = ?,
            concepto = ?, metodo_pago = ?, referencia = ?, notas = ?
          WHERE id = ?
        `, [fecha, id_agente ? Number(id_agente) : null, id_propietario ? Number(id_propietario) : null, Number(monto), concepto || 'Entrega de Fondos', metodo_pago || 'Efectivo', referencia || '', notas || '', id]);
        return { ok: true, mensaje: 'Entrega de fondos actualizada exitosamente' };
      } else {
        const res = await dbRun(`
          INSERT INTO Aportes_Propietarios (fecha, id_agente, id_propietario, monto, concepto, metodo_pago, referencia, notas)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [fecha, id_agente ? Number(id_agente) : null, id_propietario ? Number(id_propietario) : null, Number(monto), concepto || 'Entrega de Fondos', metodo_pago || 'Efectivo', referencia || '', notas || '']);
        return { ok: true, id: res.lastID, mensaje: 'Entrega de fondos registrada exitosamente' };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // ─── ELIMINAR APORTE ──────────────────────────────────────────────────────
  ipcMain.handle('saldos:eliminarAporte', async (event, id) => {
    try {
      await dbRun("DELETE FROM Aportes_Propietarios WHERE id = ?", [id]);
      return { ok: true, mensaje: 'Registro de entrega eliminado' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

module.exports = { registerSaldosIPC };
