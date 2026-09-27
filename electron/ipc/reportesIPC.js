const { ipcMain } = require('electron');
const { dbAll, dbGet, getDatabasePath } = require('../db/database');

function registerReportesIPC() {
  // Liquidación Semanal
  ipcMain.handle('liquidacion-semanal:obtener', async (event, { id_chofer, fecha_inicio, fecha_fin }) => {
    try {
      if (!id_chofer) throw new Error('Debe seleccionar un chofer.');

      let sqlViajes = "SELECT * FROM Viajes WHERE id_chofer = ?";
      const paramsViajes = [id_chofer];
      if (fecha_inicio) {
        sqlViajes += " AND fecha >= ?";
        paramsViajes.push(fecha_inicio);
      }
      if (fecha_fin) {
        sqlViajes += " AND fecha <= ?";
        paramsViajes.push(fecha_fin);
      }
      sqlViajes += " ORDER BY fecha ASC, id ASC";

      const viajes = await dbAll(sqlViajes, paramsViajes);

      let sqlGastos = "SELECT * FROM Gastos_Extra WHERE id_chofer = ? AND tipo = 'Deduccion_Chofer'";
      const paramsGastos = [id_chofer];
      if (fecha_inicio) {
        sqlGastos += " AND fecha >= ?";
        paramsGastos.push(fecha_inicio);
      }
      if (fecha_fin) {
        sqlGastos += " AND fecha <= ?";
        paramsGastos.push(fecha_fin);
      }
      sqlGastos += " ORDER BY fecha ASC, id ASC";

      const deducciones = await dbAll(sqlGastos, paramsGastos);
      const choferInfo = await dbGet("SELECT * FROM Choferes WHERE nombre = ?", [id_chofer]);

      const totalViajes = viajes.length;
      const fleteBrutoTotal = viajes.reduce((sum, v) => sum + (Number(v.precio_viaje) || 0), 0);
      const totalPagoChofer = viajes.reduce((sum, v) => sum + (Number(v.pago_chofer) || 0), 0);
      const totalViaticos = viajes.reduce((sum, v) => sum + (Number(v.viaticos) || 0), 0);
      const totalGasoil = viajes.reduce((sum, v) => sum + (Number(v.gasoil) || 0), 0);
      const totalPeajes = viajes.reduce((sum, v) => sum + (Number(v.peajes) || 0), 0);

      const totalDeducciones = deducciones.reduce((sum, d) => sum + (Number(d.monto) || 0), 0);
      const netoALiquidar = Math.round((totalPagoChofer - totalDeducciones) * 100) / 100;

      return {
        ok: true,
        data: {
          chofer: choferInfo || { nombre: id_chofer, porcentaje_comision: 10 },
          periodo: { fecha_inicio: fecha_inicio || 'Inicio', fecha_fin: fecha_fin || 'Hoy' },
          resumen: {
            totalViajes,
            fleteBrutoTotal: Math.round(fleteBrutoTotal * 100) / 100,
            totalPagoChofer: Math.round(totalPagoChofer * 100) / 100,
            totalViaticos: Math.round(totalViaticos * 100) / 100,
            totalGasoil: Math.round(totalGasoil * 100) / 100,
            totalPeajes: Math.round(totalPeajes * 100) / 100,
            totalDeducciones: Math.round(totalDeducciones * 100) / 100,
            netoALiquidar
          },
          viajes,
          deducciones
        }
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Resumen Propietario
  ipcMain.handle('resumen-propietario:obtener', async (event, { id_propietario, fecha_inicio, fecha_fin }) => {
    try {
      if (!id_propietario) throw new Error('Debe seleccionar un propietario.');

      const propietario = await dbGet("SELECT * FROM Propietarios WHERE id = ?", [id_propietario]);
      if (!propietario) throw new Error('Propietario no encontrado.');

      const gandolas = await dbAll("SELECT * FROM Gandolas WHERE id_propietario = ? AND activo = 1 ORDER BY placa ASC", [id_propietario]);

      const resumenGandolas = [];
      let totalGeneralFlete = 0;
      let totalGeneralViajes = 0;
      let totalGeneralGastosViaje = 0;
      let totalGeneralGastosTaller = 0;
      let totalGeneralGanancia = 0;

      for (const g of gandolas) {
        let sql = "SELECT * FROM Viajes WHERE id_gandola = ?";
        const params = [g.placa];
        if (fecha_inicio) { sql += " AND fecha >= ?"; params.push(fecha_inicio); }
        if (fecha_fin) { sql += " AND fecha <= ?"; params.push(fecha_fin); }
        sql += " ORDER BY fecha ASC";

        const viajes = await dbAll(sql, params);

        let sqlTaller = "SELECT * FROM Gastos_Extra WHERE (id_gandola = ? OR id_gandola = ?) AND tipo = 'Gasto_Empresa'";
        const paramsTaller = [g.placa, String(g.id)];
        if (fecha_inicio) { sqlTaller += " AND fecha >= ?"; paramsTaller.push(fecha_inicio); }
        if (fecha_fin) { sqlTaller += " AND fecha <= ?"; paramsTaller.push(fecha_fin); }
        sqlTaller += " ORDER BY fecha ASC";

        const gastosTallerRows = await dbAll(sqlTaller, paramsTaller);

        const totalFlete = viajes.reduce((s, v) => s + (Number(v.precio_viaje) || 0), 0);
        const totalGastosViaje = viajes.reduce((s, v) => s + (Number(v.total_gastos) || 0), 0);
        const totalGastosTaller = gastosTallerRows.reduce((s, ge) => s + (Number(ge.monto) || 0), 0);

        const totalGastos = Math.round((totalGastosViaje + totalGastosTaller) * 100) / 100;
        const totalGanancia = Math.round((totalFlete - totalGastos) * 100) / 100;

        totalGeneralFlete += totalFlete;
        totalGeneralViajes += viajes.length;
        totalGeneralGastosViaje += totalGastosViaje;
        totalGeneralGastosTaller += totalGastosTaller;
        totalGeneralGanancia += totalGanancia;

        resumenGandolas.push({
          gandola: g,
          totalViajes: viajes.length,
          totalFlete: Math.round(totalFlete * 100) / 100,
          totalGastosViaje: Math.round(totalGastosViaje * 100) / 100,
          totalGastosTaller: Math.round(totalGastosTaller * 100) / 100,
          totalGastos,
          totalGanancia,
          viajes,
          gastosTaller: gastosTallerRows
        });
      }

      return {
        ok: true,
        data: {
          propietario,
          periodo: { fecha_inicio: fecha_inicio || 'Inicio', fecha_fin: fecha_fin || 'Hoy' },
          resumenGandolas,
          totales: {
            totalViajes: totalGeneralViajes,
            totalFlete: Math.round(totalGeneralFlete * 100) / 100,
            totalGastosViaje: Math.round(totalGeneralGastosViaje * 100) / 100,
            totalGastosTaller: Math.round(totalGeneralGastosTaller * 100) / 100,
            totalGastos: Math.round((totalGeneralGastosViaje + totalGeneralGastosTaller) * 100) / 100,
            totalGanancia: Math.round(totalGeneralGanancia * 100) / 100
          }
        }
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Análisis Mensual
  ipcMain.handle('analisis-mensual:obtener', async (event, { mes, anio, fecha_inicio, fecha_fin }) => {
    try {
      let inicio = fecha_inicio;
      let fin = fecha_fin;

      if (!inicio || !fin) {
        const year = anio || new Date().getFullYear();
        const month = mes ? String(mes).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
        inicio = `${year}-${month}-01`;
        const lastDay = new Date(year, parseInt(month, 10), 0).getDate();
        fin = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      }

      const gandolas = await dbAll("SELECT * FROM Gandolas WHERE activo = 1 ORDER BY placa ASC");

      const viajes = await dbAll(
        "SELECT * FROM Viajes WHERE fecha >= ? AND fecha <= ? ORDER BY fecha ASC",
        [inicio, fin]
      );

      const gastosGandolas = await dbAll(
        "SELECT * FROM Gastos_Extra WHERE fecha >= ? AND fecha <= ? AND id_gandola IS NOT NULL AND tipo = 'Gasto_Empresa'",
        [inicio, fin]
      );

      const reporteGandolas = gandolas.map(g => {
        const viajesUnidad = viajes.filter(v => v.id_gandola === g.placa);
        const gastosTallerUnidad = gastosGandolas.filter(ge => ge.id_gandola === g.placa);

        const fleteBruto = viajesUnidad.reduce((sum, v) => sum + (Number(v.precio_viaje) || 0), 0);
        const gasoil = viajesUnidad.reduce((sum, v) => sum + (Number(v.gasoil) || 0), 0);
        const peajes = viajesUnidad.reduce((sum, v) => sum + (Number(v.peajes) || 0), 0);
        const viaticos = viajesUnidad.reduce((sum, v) => sum + (Number(v.viaticos) || 0), 0);
        const pagoChofer = viajesUnidad.reduce((sum, v) => sum + (Number(v.pago_chofer) || 0), 0);
        const gastosTaller = gastosTallerUnidad.reduce((sum, ge) => sum + (Number(ge.monto) || 0), 0);

        const gastosOperativos = Math.round((gasoil + peajes + viaticos + pagoChofer + gastosTaller) * 100) / 100;
        const gananciaNeta = Math.round((fleteBruto - gastosOperativos) * 100) / 100;
        const margenRentabilidad = fleteBruto > 0 ? Math.round((gananciaNeta / fleteBruto) * 1000) / 10 : 0;

        return {
          placa: g.placa,
          modelo: g.modelo,
          capacidad: g.capacidad,
          cantidadViajes: viajesUnidad.length,
          fleteBruto: Math.round(fleteBruto * 100) / 100,
          gasoil: Math.round(gasoil * 100) / 100,
          peajes: Math.round(peajes * 100) / 100,
          viaticos: Math.round(viaticos * 100) / 100,
          pagoChofer: Math.round(pagoChofer * 100) / 100,
          gastosTaller: Math.round(gastosTaller * 100) / 100,
          gastosOperativos,
          gananciaNeta,
          margenRentabilidad
        };
      });

      reporteGandolas.sort((a, b) => b.gananciaNeta - a.gananciaNeta);

      const totalFacturado = reporteGandolas.reduce((acc, g) => acc + g.fleteBruto, 0);
      const totalGastosOperativos = reporteGandolas.reduce((acc, g) => acc + g.gastosOperativos, 0);
      const totalGananciaFlota = Math.round((totalFacturado - totalGastosOperativos) * 100) / 100;
      const margenGlobalFlota = totalFacturado > 0 ? Math.round((totalGananciaFlota / totalFacturado) * 1000) / 10 : 0;
      const totalViajesFlota = reporteGandolas.reduce((acc, g) => acc + g.cantidadViajes, 0);
      const gandolaEstrella = reporteGandolas[0] || null;

      return {
        ok: true,
        data: {
          rango: { inicio, fin },
          kpis: {
            totalFacturado: Math.round(totalFacturado * 100) / 100,
            totalGastosOperativos: Math.round(totalGastosOperativos * 100) / 100,
            totalGananciaFlota,
            margenGlobalFlota,
            totalViajesFlota,
            gandolaEstrella
          },
          reporteGandolas
        }
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Sistema Info
  ipcMain.handle('sistema:info', async () => {
    const dbPath = getDatabasePath();
    const viajesCount = (await dbGet("SELECT COUNT(*) as c FROM Viajes")).c;
    const rutasCount = (await dbGet("SELECT COUNT(*) as c FROM Rutas")).c;
    const choferesCount = (await dbGet("SELECT COUNT(*) as c FROM Choferes")).c;
    const gandolasCount = (await dbGet("SELECT COUNT(*) as c FROM Gandolas")).c;
    return {
      ok: true,
      data: {
        dbPath,
        viajesCount,
        rutasCount,
        choferesCount,
        gandolasCount,
        version: '1.0.0'
      }
    };
  });
}

module.exports = { registerReportesIPC };
