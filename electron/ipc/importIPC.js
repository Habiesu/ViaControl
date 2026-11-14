const { ipcMain, dialog, app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const crypto = require('crypto');
const { dbAll, dbRun, dbGet } = require('../db/database');
const { parseMonto, redondear2 } = require('../utils/numUtils');

const COLUMNAS_OBLIGATORIAS = ['FECHA', 'ORIGEN', 'DESTINO', 'GANDOLA', 'CHOFER'];
const COLUMNAS_OPCIONALES = ['CONTENEDOR', 'FLETE', 'GASOIL', 'PEAJES', 'VIATICOS', 'PAGO CHOFER', 'PROPIETARIO', 'NOTAS'];

// Descargar plantilla
ipcMain.handle('import:descargarPlantilla', async () => {
  try {
    const wb = XLSX.utils.book_new();
    const encabezado = [...COLUMNAS_OBLIGATORIAS, ...COLUMNAS_OPCIONALES];
    const filaEjemplo = [
      '2024-01-15', 'Puerto Cabello', 'Caracas', 'ABC-123', 'Juan Perez',
      'CONT-2024-001', 1500, 80, 25, 20, 150, 'Maria Lopez', 'Viaje de prueba'
    ];
    const ws = XLSX.utils.aoa_to_sheet([encabezado, filaEjemplo]);
    ws['!cols'] = encabezado.map(col => ({ wch: Math.max(col.length + 4, 18) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Viajes');

    const instrucciones = [
      ['INSTRUCCIONES DE USO'], [''],
      ['COLUMNAS OBLIGATORIAS:'],
      ['  FECHA     -> Formato ISO: AAAA-MM-DD  o  DD/MM/AAAA'],
      ['  ORIGEN    -> Texto libre (ej: Puerto Cabello)'],
      ['  DESTINO   -> Texto libre (ej: Caracas)'],
      ['  GANDOLA   -> Placa exacta registrada en el sistema (ej: ABC-123)'],
      ['  CHOFER    -> Nombre exacto del chofer registrado en el sistema'],
      [''],
      ['COLUMNAS OPCIONALES:'],
      ['  CONTENEDOR  -> Codigo del contenedor'],
      ['  FLETE       -> Monto del flete en USD (solo numeros)'],
      ['  GASOIL      -> Gasto de gasoil en USD'],
      ['  PEAJES      -> Gasto de peajes en USD'],
      ['  VIATICOS    -> Gasto de viaticos en USD'],
      ['  PAGO CHOFER -> Si se omite se calcula al 10% del flete'],
      ['  PROPIETARIO -> Nombre exacto del propietario (opcional)'],
      ['  NOTAS       -> Observaciones libres'],
      [''],
      ['NOTAS IMPORTANTES:'],
      ['  - Los nombres de CHOFER, GANDOLA y PROPIETARIO deben coincidir exactamente con los registrados en ViaControl.'],
      ['  - Los montos deben ser numeros sin puntos de miles ni simbolos de moneda.'],
      ['  - Las filas con errores seran saltadas y reportadas al finalizar.']
    ];
    const wsI = XLSX.utils.aoa_to_sheet(instrucciones);
    wsI['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsI, 'Instrucciones');

    const downloadsDir = app.getPath('downloads');
    const win = BrowserWindow.getFocusedWindow();
    const saveOptions = {
      title: 'Guardar Plantilla de Importación de Viajes',
      defaultPath: path.join(downloadsDir, 'Plantilla_Importacion_Viajes.xlsx'),
      filters: [{ name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] }]
    };

    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, saveOptions)
      : await dialog.showSaveDialog(saveOptions);

    if (canceled || !filePath) return { ok: false, canceled: true };

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    try {
      fs.writeFileSync(filePath, buf);
    } catch (writeErr) {
      if (writeErr.code === 'EBUSY' || writeErr.code === 'EACCES') {
        throw new Error('El archivo está abierto en Excel o protegido por otro programa. Ciérrelo o guarde con otro nombre.');
      }
      throw writeErr;
    }

    return { ok: true, path: filePath };
  } catch (err) {
    console.error('[importIPC] descargarPlantilla:', err);
    return { ok: false, error: err.message };
  }
});

// Seleccionar y previsualizar archivo
ipcMain.handle('import:seleccionarArchivo', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Seleccionar archivo de importacion',
      filters: [{ name: 'Hoja de calculo', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true };

    const wb = XLSX.readFile(filePaths[0]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (rows.length === 0) return { ok: false, error: 'El archivo esta vacio.' };

    const cols = Object.keys(rows[0]).map(c => c.trim().toUpperCase());
    const faltantes = COLUMNAS_OBLIGATORIAS.filter(c => !cols.includes(c));
    if (faltantes.length > 0) {
      return { ok: false, error: 'Columnas obligatorias faltantes: ' + faltantes.join(', ') };
    }

    const rowsNorm = rows.map(r => {
      const n = {};
      for (const k of Object.keys(r)) n[k.trim().toUpperCase()] = r[k];
      return n;
    });
    return { ok: true, filas: rowsNorm, total: rowsNorm.length, filePath: filePaths[0] };
  } catch (err) {
    console.error('[importIPC] seleccionarArchivo:', err);
    return { ok: false, error: err.message };
  }
});

// Procesar e importar
ipcMain.handle('import:procesarViajes', async (event, { filas }) => {
  const exitosos = [];
  const errores = [];

  const choferes = await dbAll('SELECT id, nombre FROM Choferes WHERE activo=1');
  const gandolas = await dbAll('SELECT id, placa FROM Gandolas WHERE activo=1');
  const propietarios = await dbAll('SELECT id, nombre FROM Propietarios WHERE activo=1');

  const mapChofer = new Map(choferes.map(c => [c.nombre.trim().toLowerCase(), c.id]));
  const mapGandola = new Map(gandolas.map(g => [g.placa.trim().toUpperCase(), g.id]));
  const mapProp = new Map(propietarios.map(p => [p.nombre.trim().toLowerCase(), p.id]));

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numFila = i + 2;
    try {
      let fechaRaw = String(fila['FECHA'] || '').trim();
      let fecha = '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
        fecha = fechaRaw;
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fechaRaw)) {
        const [d, m, a] = fechaRaw.split('/');
        fecha = a + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
      } else {
        const num = Number(fechaRaw);
        if (!isNaN(num) && num > 40000) {
          const parsed = XLSX.SSF.parse_date_code(num);
          fecha = parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0');
        } else {
          errores.push({ fila: numFila, error: 'Fecha invalida: ' + fechaRaw });
          continue;
        }
      }

      const origen = String(fila['ORIGEN'] || '').trim() || 'Puerto Cabello';
      const destino = String(fila['DESTINO'] || '').trim();
      const gandolaPlaca = String(fila['GANDOLA'] || '').trim().toUpperCase();
      const choferNombre = String(fila['CHOFER'] || '').trim();

      if (!destino) { errores.push({ fila: numFila, error: 'DESTINO vacio' }); continue; }
      if (!gandolaPlaca) { errores.push({ fila: numFila, error: 'GANDOLA vacia' }); continue; }
      if (!choferNombre) { errores.push({ fila: numFila, error: 'CHOFER vacio' }); continue; }

      const id_gandola = mapGandola.get(gandolaPlaca);
      if (!id_gandola) { errores.push({ fila: numFila, error: 'Gandola no encontrada: ' + gandolaPlaca }); continue; }

      const id_chofer = mapChofer.get(choferNombre.toLowerCase());
      if (!id_chofer) { errores.push({ fila: numFila, error: 'Chofer no encontrado: ' + choferNombre }); continue; }

      const contenedor = String(fila['CONTENEDOR'] || '').trim();
      const notas = String(fila['NOTAS'] || '').trim();
      const flete = parseMonto(fila['FLETE'] || 0);
      const gasoil = parseMonto(fila['GASOIL'] || 0);
      const peajes = parseMonto(fila['PEAJES'] || 0);
      const viaticos = parseMonto(fila['VIATICOS'] || 0);
      const propNombre = String(fila['PROPIETARIO'] || '').trim();

      let pagoChofer = parseMonto(fila['PAGO CHOFER'] || 0);
      if (pagoChofer <= 0 && flete > 0) pagoChofer = redondear2(flete * 0.10);

      const totalGastos = redondear2(gasoil + peajes + viaticos + pagoChofer);
      const ganancia = redondear2(flete - totalGastos);

      let id_propietario = null;
      if (propNombre) {
        id_propietario = mapProp.get(propNombre.toLowerCase()) || null;
        if (!id_propietario) {
          errores.push({ fila: numFila, error: 'Propietario no encontrado: ' + propNombre + ' (importado sin propietario)' });
        }
      }

      const uuid = crypto.randomUUID();
      await dbRun(
        'INSERT INTO Viajes (uuid, fecha, contenedor, origen, destino, id_gandola, id_chofer, precio_viaje, gasoil, peajes, viaticos, pago_chofer, total_gastos, ganancia, notas, activo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
        [uuid, fecha, contenedor, origen, destino, id_gandola, id_chofer,
         flete, gasoil, peajes, viaticos, pagoChofer, totalGastos, ganancia, notas]
      );

      if (id_propietario) {
        const rel = await dbGet(
          'SELECT id FROM Gandola_Propietario WHERE id_gandola=? AND id_propietario=? AND activo=1',
          [id_gandola, id_propietario]
        );
        if (!rel) {
          await dbRun(
            'INSERT OR IGNORE INTO Gandola_Propietario (id_gandola, id_propietario, activo) VALUES (?,?,1)',
            [id_gandola, id_propietario]
          );
        }
      }

      exitosos.push(numFila);
    } catch (err) {
      errores.push({ fila: numFila, error: err.message });
    }
  }

  return { ok: true, exitosos: exitosos.length, errores };
});

function registerImportIPC() { }
module.exports = { registerImportIPC };
