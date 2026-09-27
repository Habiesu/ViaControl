const { ipcMain } = require('electron');
const { dbAll, dbRun, dbGet } = require('../db/database');

function registerViajesIPC() {
  ipcMain.handle('viajes:guardar', async (event, datosViaje) => {
    try {
      let {
        id,
        fecha,
        contenedor,
        origen = 'Puerto Cabello',
        destino,
        id_gandola,
        id_chofer,
        precio_viaje,
        peajes = 0,
        viaticos = 0,
        gasoil = 0,
        notas = ''
      } = datosViaje;

      if (!fecha) throw new Error('La fecha del viaje es obligatoria.');
      if (!destino) throw new Error('El destino del viaje es obligatorio.');
      if (!id_chofer) throw new Error('El chofer asignado es obligatorio.');
      if (!id_gandola) throw new Error('La gandola asignada es obligatoria.');

      let precioFinal = Number(precio_viaje);
      if (!precioFinal || isNaN(precioFinal) || precioFinal <= 0) {
        let ruta = await dbGet(
          "SELECT precio_base FROM Rutas WHERE UPPER(TRIM(origen)) = UPPER(TRIM(?)) AND UPPER(TRIM(destino)) = UPPER(TRIM(?)) AND activo = 1",
          [origen, destino]
        );
        if (!ruta) {
          ruta = await dbGet(
            "SELECT precio_base FROM Rutas WHERE UPPER(TRIM(destino)) = UPPER(TRIM(?)) AND activo = 1",
            [destino]
          );
        }
        if (ruta && ruta.precio_base) {
          precioFinal = Number(ruta.precio_base);
        } else {
          throw new Error(`No se encontró una tarifa configurada para la ruta "${origen}" ➔ "${destino}". Especifique un monto o registre la ruta.`);
        }
      }

      let comisionPct = 10.0;
      const chofer = await dbGet("SELECT porcentaje_comision FROM Choferes WHERE nombre = ?", [id_chofer]);
      if (chofer && chofer.porcentaje_comision !== null && chofer.porcentaje_comision !== undefined) {
        comisionPct = Number(chofer.porcentaje_comision);
      }

      const pagoChofer = Math.round(precioFinal * (comisionPct / 100) * 100) / 100;
      const peajesNum = Math.round(Number(peajes || 0) * 100) / 100;
      const viaticosNum = Math.round(Number(viaticos || 0) * 100) / 100;
      const gasoilNum = Math.round(Number(gasoil || 0) * 100) / 100;

      const totalGastos = Math.round((pagoChofer + peajesNum + viaticosNum + gasoilNum) * 100) / 100;
      const ganancia = Math.round((precioFinal - totalGastos) * 100) / 100;

      let idPropFinal = datosViaje.id_propietario || null;
      if (!idPropFinal && id_chofer) {
        const choferDb = await dbGet("SELECT id_propietario FROM Choferes WHERE nombre = ? OR id = ?", [id_chofer, id_chofer]);
        if (choferDb && choferDb.id_propietario) idPropFinal = choferDb.id_propietario;
      }
      if (!idPropFinal && id_gandola) {
        const gandolaDb = await dbGet("SELECT id_propietario FROM Gandolas WHERE placa = ? OR id = ?", [id_gandola, id_gandola]);
        if (gandolaDb && gandolaDb.id_propietario) idPropFinal = gandolaDb.id_propietario;
      }

      if (id) {
        await dbRun(`
          UPDATE Viajes SET
            fecha = ?, contenedor = ?, origen = ?, destino = ?,
            id_gandola = ?, id_chofer = ?, id_propietario = ?, precio_viaje = ?, pago_chofer = ?,
            peajes = ?, viaticos = ?, gasoil = ?, total_gastos = ?,
            ganancia = ?, notas = ?
          WHERE id = ?
        `, [
          fecha, contenedor || '', origen, destino,
          id_gandola, id_chofer, idPropFinal, precioFinal, pagoChofer,
          peajesNum, viaticosNum, gasoilNum, totalGastos,
          ganancia, notas, id
        ]);
        return {
          ok: true,
          mensaje: 'Viaje actualizado exitosamente',
          calculos: { precio_viaje: precioFinal, pago_chofer: pagoChofer, total_gastos: totalGastos, ganancia }
        };
      } else {
        const res = await dbRun(`
          INSERT INTO Viajes (
            fecha, contenedor, origen, destino, id_gandola, id_chofer, id_propietario,
            precio_viaje, pago_chofer, peajes, viaticos, gasoil,
            total_gastos, ganancia, notas
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          fecha, contenedor || '', origen, destino, id_gandola, id_chofer, idPropFinal,
          precioFinal, pagoChofer, peajesNum, viaticosNum, gasoilNum,
          totalGastos, ganancia, notas
        ]);
        return {
          ok: true,
          id: res.lastID,
          mensaje: 'Viaje registrado exitosamente en SQLite',
          calculos: { precio_viaje: precioFinal, pago_chofer: pagoChofer, total_gastos: totalGastos, ganancia }
        };
      }
    } catch (error) {
      console.error('Error en guardar-viaje:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('viajes:listar', async (event, filtros = {}) => {
    try {
      const { fecha_desde, fecha_hasta, id_chofer, id_gandola, id_propietario, busqueda } = filtros;
      let sql = "SELECT * FROM Viajes WHERE 1=1";
      const params = [];

      if (fecha_desde) {
        sql += " AND fecha >= ?";
        params.push(fecha_desde);
      }
      if (fecha_hasta) {
        sql += " AND fecha <= ?";
        params.push(fecha_hasta);
      }
      if (id_chofer) {
        sql += " AND id_chofer = ?";
        params.push(id_chofer);
      }
      if (id_gandola) {
        sql += " AND id_gandola = ?";
        params.push(id_gandola);
      }
      if (id_propietario) {
        sql += " AND id_propietario = ?";
        params.push(id_propietario);
      }
      if (busqueda && busqueda.trim()) {
        const q = `%${busqueda.trim()}%`;
        sql += " AND (contenedor LIKE ? OR destino LIKE ? OR origen LIKE ? OR id_chofer LIKE ? OR id_gandola LIKE ?)";
        params.push(q, q, q, q, q);
      }

      sql += " ORDER BY fecha DESC, id DESC";
      const viajes = await dbAll(sql, params);
      return { ok: true, data: viajes };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('viajes:eliminar', async (event, id) => {
    try {
      await dbRun("DELETE FROM Viajes WHERE id = ?", [id]);
      return { ok: true, mensaje: 'Viaje eliminado' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('ier:actualizarEstado', async (event, { id, campo, valor }) => {
    try {
      if (!['entregado', 'pagado'].includes(campo)) throw new Error('Campo no válido');
      await dbRun(`UPDATE Viajes SET ${campo} = ? WHERE id = ?`, [valor ? 1 : 0, id]);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

module.exports = { registerViajesIPC };
