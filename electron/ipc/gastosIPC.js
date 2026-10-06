const { ipcMain } = require('electron');
const crypto = require('crypto');
const { dbAll, dbRun, dbGet } = require('../db/database');

function registerGastosIPC() {
  ipcMain.handle('gastos-extra:listar', async (event, filtros = {}) => {
    try {
      const { id_chofer, id_gandola, tipo, fecha_desde, fecha_hasta } = filtros;
      let sql = "SELECT * FROM Gastos_Extra WHERE (deleted_at IS NULL)";
      const params = [];

      if (id_chofer) {
        sql += " AND id_chofer = ?";
        params.push(id_chofer);
      }
      if (id_gandola) {
        sql += " AND id_gandola = ?";
        params.push(id_gandola);
      }
      if (tipo) {
        sql += " AND tipo = ?";
        params.push(tipo);
      }
      if (fecha_desde) {
        sql += " AND fecha >= ?";
        params.push(fecha_desde);
      }
      if (fecha_hasta) {
        sql += " AND fecha <= ?";
        params.push(fecha_hasta);
      }

      sql += " ORDER BY fecha DESC, id DESC";
      const gastos = await dbAll(sql, params);
      return { ok: true, data: gastos };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('gastos-extra:guardar', async (event, gasto) => {
    try {
      const { id, fecha, id_chofer, id_gandola, id_viaje, id_propietario, id_agente, categoria, tipo, descripcion, monto } = gasto;
      if (!fecha || !monto) {
        throw new Error('Fecha y monto son requeridos');
      }
      const tipoVal = tipo || (categoria && categoria.includes('Chofer') ? 'Deduccion_Chofer' : 'Gasto_Empresa');
      const descVal = (descripcion && descripcion.trim()) ? descripcion.trim() : (categoria || 'Gasto de mantenimiento');
      const now = new Date().toISOString();

      if (id) {
        await dbRun(`
          UPDATE Gastos_Extra SET
            fecha = ?, id_chofer = ?, id_gandola = ?, id_viaje = ?, id_propietario = ?, id_agente = ?,
            categoria = ?, tipo = ?, descripcion = ?, monto = ?,
            updated_at = ?,
            sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
          WHERE id = ?
        `, [fecha, id_chofer || null, id_gandola || null, id_viaje || null, id_propietario || null, id_agente ? Number(id_agente) : null, categoria || 'General', tipoVal, descVal, Number(monto), now, id]);
        return { ok: true, mensaje: 'Gasto extra actualizado' };
      } else {
        const uuid = crypto.randomUUID();
        const res = await dbRun(`
          INSERT INTO Gastos_Extra (
            uuid, fecha, id_chofer, id_gandola, id_viaje, id_propietario, id_agente,
            categoria, tipo, descripcion, monto, updated_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_insert')
        `, [uuid, fecha, id_chofer || null, id_gandola || null, id_viaje || null, id_propietario || null, id_agente ? Number(id_agente) : null, categoria || 'General', tipoVal, descVal, Number(monto), now]);
        return { ok: true, id: res.lastID, uuid, mensaje: 'Gasto extra registrado' };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('gastos-extra:eliminar', async (event, id) => {
    try {
      const now = new Date().toISOString();
      await dbRun("UPDATE Gastos_Extra SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete' WHERE id = ?", [now, now, id]);
      return { ok: true, mensaje: 'Gasto extra eliminado' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

module.exports = { registerGastosIPC };
