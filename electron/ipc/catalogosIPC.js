const { ipcMain } = require('electron');
const crypto = require('crypto');
const { dbAll, dbRun, dbGet } = require('../db/database');
const { importRutasFromExcel } = require('../db/seeds');

function registerCatalogosIPC() {
  ipcMain.handle('catalogos:obtener', async () => {
    try {
      const rutas = await dbAll("SELECT * FROM Rutas WHERE activo = 1 AND (deleted_at IS NULL) ORDER BY origen ASC, destino ASC");
      const origenesRows = await dbAll("SELECT DISTINCT origen FROM Rutas WHERE activo = 1 AND (deleted_at IS NULL) ORDER BY origen ASC");
      const choferes = await dbAll("SELECT * FROM Choferes WHERE activo = 1 AND (deleted_at IS NULL) ORDER BY nombre ASC");
      const gandolas = await dbAll("SELECT * FROM Gandolas WHERE activo = 1 AND (deleted_at IS NULL) ORDER BY placa ASC");
      const propietarios = await dbAll("SELECT * FROM Propietarios WHERE (deleted_at IS NULL) ORDER BY nombre ASC");
      return {
        ok: true,
        data: {
          rutas,
          origenes: origenesRows.map(r => r.origen),
          choferes,
          gandolas,
          propietarios
        }
      };
    } catch (error) {
      console.error('Error al obtener catálogos:', error);
      return { ok: false, error: error.message };
    }
  });

  // Propietarios CRUD
  ipcMain.handle('propietarios:listar', async () => {
    try {
      const propietarios = await dbAll("SELECT * FROM Propietarios WHERE (deleted_at IS NULL) ORDER BY id DESC");
      return { ok: true, data: propietarios };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('propietarios:guardar', async (event, propietario) => {
    try {
      const { id, nombre, contacto } = propietario;
      if (!nombre) throw new Error('El nombre del propietario es obligatorio.');
      const now = new Date().toISOString();

      if (id) {
        await dbRun(
          `UPDATE Propietarios SET
            nombre = ?, contacto = ?, updated_at = ?,
            sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
          WHERE id = ?`,
          [nombre.trim(), contacto || '', now, id]
        );
        return { ok: true, mensaje: 'Propietario actualizado' };
      } else {
        const uuid = crypto.randomUUID();
        const res = await dbRun(
          "INSERT INTO Propietarios (uuid, nombre, contacto, updated_at, sync_status) VALUES (?, ?, ?, ?, 'pending_insert')",
          [uuid, nombre.trim(), contacto || '', now]
        );
        return { ok: true, id: res.lastID, uuid, mensaje: 'Propietario creado' };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('propietarios:eliminar', async (event, id) => {
    try {
      const now = new Date().toISOString();
      await dbRun("UPDATE Propietarios SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete' WHERE id = ?", [now, now, id]);
      return { ok: true, mensaje: 'Propietario eliminado' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Rutas CRUD
  ipcMain.handle('rutas:importar-excel', async () => {
    return await importRutasFromExcel();
  });

  ipcMain.handle('rutas:listar', async () => {
    try {
      const rutas = await dbAll("SELECT * FROM Rutas WHERE (deleted_at IS NULL) ORDER BY id DESC");
      return { ok: true, data: rutas };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('rutas:guardar', async (event, ruta) => {
    try {
      const { id, origen, destino, precio_base, activo = 1 } = ruta;
      if (!origen || !destino || !precio_base) {
        throw new Error('Origen, destino y precio base son requeridos.');
      }
      const now = new Date().toISOString();

      if (id) {
        await dbRun(
          `UPDATE Rutas SET
            origen = ?, destino = ?, precio_base = ?, activo = ?, updated_at = ?,
            sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
          WHERE id = ?`,
          [origen.trim(), destino.trim(), Number(precio_base), activo ? 1 : 0, now, id]
        );
        return { ok: true, mensaje: 'Ruta actualizada con éxito' };
      } else {
        const uuid = crypto.randomUUID();
        const res = await dbRun(
          "INSERT INTO Rutas (uuid, origen, destino, precio_base, activo, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, 'pending_insert')",
          [uuid, origen.trim(), destino.trim(), Number(precio_base), activo ? 1 : 0, now]
        );
        return { ok: true, id: res.lastID, uuid, mensaje: 'Ruta creada con éxito' };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('rutas:eliminar', async (event, id) => {
    try {
      const now = new Date().toISOString();
      await dbRun("UPDATE Rutas SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete' WHERE id = ?", [now, now, id]);
      return { ok: true, mensaje: 'Ruta eliminada con éxito' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Choferes CRUD
  ipcMain.handle('choferes:listar', async () => {
    try {
      const choferes = await dbAll("SELECT * FROM Choferes WHERE (deleted_at IS NULL) ORDER BY id DESC");
      return { ok: true, data: choferes };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('choferes:guardar', async (event, chofer) => {
    try {
      const { id, nombre, cedula, telefono, porcentaje_comision = 10.0, activo = 1, id_propietario } = chofer;
      if (!nombre) throw new Error('El nombre del chofer es obligatorio.');
      const now = new Date().toISOString();

      if (id) {
        await dbRun(
          `UPDATE Choferes SET
            nombre = ?, cedula = ?, telefono = ?, porcentaje_comision = ?, activo = ?, id_propietario = ?, updated_at = ?,
            sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
          WHERE id = ?`,
          [nombre.trim(), cedula || '', telefono || '', Number(porcentaje_comision) || 10, activo ? 1 : 0, id_propietario || null, now, id]
        );
        return { ok: true, mensaje: 'Chofer actualizado' };
      } else {
        const uuid = crypto.randomUUID();
        const res = await dbRun(
          "INSERT INTO Choferes (uuid, nombre, cedula, telefono, porcentaje_comision, activo, id_propietario, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_insert')",
          [uuid, nombre.trim(), cedula || '', telefono || '', Number(porcentaje_comision) || 10, activo ? 1 : 0, id_propietario || null, now]
        );
        return { ok: true, id: res.lastID, uuid, mensaje: 'Chofer registrado' };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('choferes:eliminar', async (event, id) => {
    try {
      const now = new Date().toISOString();
      await dbRun("UPDATE Choferes SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete' WHERE id = ?", [now, now, id]);
      return { ok: true, mensaje: 'Chofer eliminado' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Gandolas CRUD
  ipcMain.handle('gandolas:listar', async () => {
    try {
      const gandolas = await dbAll("SELECT * FROM Gandolas WHERE (deleted_at IS NULL) ORDER BY id DESC");
      return { ok: true, data: gandolas };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('gandolas:guardar', async (event, gandola) => {
    try {
      const { id, placa, modelo, marca, año, capacidad, activo = 1, id_propietario } = gandola;
      const unidadVal = (modelo && modelo.trim()) ? modelo.trim() : (placa && placa.trim() ? placa.trim() : '');
      const placaClean = (placa && placa.trim()) ? placa.trim().toUpperCase() : unidadVal;
      const now = new Date().toISOString();

      const cols = await dbAll(`PRAGMA table_info(Gandolas)`);
      if (!cols.some(c => c.name === 'marca')) {
        await dbRun(`ALTER TABLE Gandolas ADD COLUMN marca TEXT`);
      }
      if (!cols.some(c => c.name === 'año')) {
        await dbRun(`ALTER TABLE Gandolas ADD COLUMN año TEXT`);
      }

      if (id) {
        await dbRun(
          `UPDATE Gandolas SET
            placa = ?, modelo = ?, marca = ?, año = ?, capacidad = ?, activo = ?, id_propietario = ?, updated_at = ?,
            sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
          WHERE id = ?`,
          [placaClean, unidadVal, marca || '', año || '', capacidad || '', activo ? 1 : 0, id_propietario || null, now, id]
        );
        return { ok: true, mensaje: 'Gandola/Unidad actualizada' };
      } else {
        const uuid = crypto.randomUUID();
        const res = await dbRun(
          "INSERT INTO Gandolas (uuid, placa, modelo, marca, año, capacidad, activo, id_propietario, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_insert')",
          [uuid, placaClean, unidadVal, marca || '', año || '', capacidad || '', activo ? 1 : 0, id_propietario || null, now]
        );
        return { ok: true, id: res.lastID, uuid, mensaje: 'Gandola/Unidad registrada' };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('gandolas:eliminar', async (event, id) => {
    try {
      const now = new Date().toISOString();
      await dbRun("UPDATE Gandolas SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete' WHERE id = ?", [now, now, id]);
      return { ok: true, mensaje: 'Gandola eliminada' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

module.exports = { registerCatalogosIPC };
