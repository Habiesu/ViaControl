const { ipcMain, dialog, app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const crypto = require('crypto');
const { dbAll, dbRun, dbTransaction } = require('../db/database');
const { redondear2 } = require('../utils/numUtils');
const {
  COMISION_POR_DEFECTO, mapearFilasExcel, crearContexto, analizarFila, analizarFilas, resumir,
  normalizarNombre, normalizarPlaca
} = require('../import/viajesImport');
const { leerHojasRutas, analizarRutas, resumirRutas } = require('../import/rutasImport');

const MAX_FILAS = 5000;
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
      ['  ORIGEN    -> Texto libre (ej: Puerto Cabello). Si se deja vacio se usa Puerto Cabello'],
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
      ['  PAGO CHOFER -> Si se omite se calcula con la comision del chofer'],
      ['  PROPIETARIO -> Nombre exacto del propietario (opcional)'],
      ['  NOTAS       -> Observaciones libres'],
      [''],
      ['NOTAS IMPORTANTES:'],
      ['  - Antes de guardar, ViaControl muestra una lista de verificacion con todas las filas.'],
      ['  - En esa lista puedes corregir cada dato, descartar filas y elegir o crear choferes y gandolas que no existan.'],
      ['  - Los nombres se comparan sin importar mayusculas ni tildes (Juan Perez = juan pérez).'],
      ['  - Si falta el FLETE se usa la tarifa de la ruta; si falta el PAGO CHOFER se calcula con la comision del chofer.'],
      ['  - Los viajes que ya existen (mismo contenedor, o misma fecha, gandola, chofer y destino) se marcan como duplicados.']
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

// Seleccionar archivo: lee el Excel y devuelve las filas con los campos internos (no guarda nada)
ipcMain.handle('import:seleccionarArchivo', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow();
    const openOptions = {
      title: 'Seleccionar archivo de importación',
      filters: [{ name: 'Hoja de cálculo', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile']
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, openOptions)
      : await dialog.showOpenDialog(openOptions);
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true };

    const wb = XLSX.readFile(filePaths[0]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (rows.length === 0) return { ok: false, error: 'El archivo está vacío.' };

    const { filas, faltantes } = mapearFilasExcel(rows);
    if (faltantes.length > 0) {
      return { ok: false, error: 'Columnas obligatorias faltantes: ' + faltantes.join(', ') };
    }
    if (filas.length === 0) return { ok: false, error: 'El archivo no tiene filas con datos.' };
    if (filas.length > MAX_FILAS) {
      return { ok: false, error: `El archivo tiene ${filas.length} filas; el máximo por importación es ${MAX_FILAS}.` };
    }

    return { ok: true, filas, total: filas.length, filePath: filePaths[0] };
  } catch (err) {
    console.error('[importIPC] seleccionarArchivo:', err);
    return { ok: false, error: err.message };
  }
});

async function cargarContexto() {
  const [choferes, gandolas, propietarios, rutas, viajes] = await Promise.all([
    dbAll('SELECT id, nombre, porcentaje_comision, id_propietario FROM Choferes WHERE activo = 1 AND deleted_at IS NULL'),
    dbAll('SELECT id, placa, id_propietario FROM Gandolas WHERE activo = 1 AND deleted_at IS NULL'),
    dbAll('SELECT id, nombre, uuid FROM Propietarios WHERE deleted_at IS NULL'),
    dbAll('SELECT origen, destino, precio_base, activo FROM Rutas WHERE deleted_at IS NULL'),
    dbAll('SELECT fecha, contenedor, id_gandola, id_chofer, destino FROM Viajes WHERE deleted_at IS NULL')
  ]);
  return crearContexto({ choferes, gandolas, propietarios, rutas, viajes });
}

function validarEntrada(filas) {
  if (!Array.isArray(filas)) throw new Error('Formato de filas inválido.');
  if (filas.length > MAX_FILAS) throw new Error(`Máximo ${MAX_FILAS} filas por importación.`);
  return filas.map(f => ({
    fila: Number(f && f.fila) || 0,
    datos: (f && typeof f.datos === 'object' && f.datos) || {},
    crear: { chofer: !!(f && f.crear && f.crear.chofer), gandola: !!(f && f.crear && f.crear.gandola) }
  }));
}

// Analizar: valida todas las filas y devuelve estado, errores, avisos y sugerencias (no guarda nada)
ipcMain.handle('import:analizarViajes', async (event, { filas }) => {
  try {
    const ctx = await cargarContexto();
    const analisis = analizarFilas(validarEntrada(filas), ctx);
    return {
      ok: true,
      analisis,
      resumen: resumir(analisis),
      opciones: {
        choferes: ctx.choferes.map(c => c.nombre).sort((a, b) => a.localeCompare(b)),
        gandolas: ctx.gandolas.map(g => g.placa).sort((a, b) => a.localeCompare(b)),
        propietarios: ctx.propietarios.map(p => p.nombre).sort((a, b) => a.localeCompare(b))
      }
    };
  } catch (err) {
    console.error('[importIPC] analizarViajes:', err);
    return { ok: false, error: err.message };
  }
});

// Confirmar: vuelve a validar las filas aprobadas y las guarda todas juntas o ninguna
ipcMain.handle('import:confirmarViajes', async (event, { filas }) => {
  try {
    const entrada = validarEntrada(filas);
    if (entrada.length === 0) return { ok: false, error: 'No hay filas seleccionadas para importar.' };

    const ctx = await cargarContexto();
    // Se analizan juntas para no marcar como duplicadas entre sí filas que el usuario aprobó a propósito
    const analisis = entrada.map(f => analizarFila(f, ctx));
    const conError = analisis.filter(a => a.errores.length > 0);
    if (conError.length > 0) {
      return {
        ok: false,
        error: `Hay ${conError.length} fila(s) con errores (por ejemplo, la fila ${conError[0].fila}: ${conError[0].errores[0].mensaje}). Corrígelas o desmárcalas.`
      };
    }

    const now = new Date().toISOString();
    const resultado = await dbTransaction(async () => {
      const choferesCreados = new Map();
      const gandolasCreadas = new Map();

      for (const a of analisis) {
        const ch = a.resuelto.chofer;
        if (ch && ch.nuevo) {
          const k = normalizarNombre(ch.nombre);
          if (!choferesCreados.has(k)) {
            await dbRun(
              "INSERT INTO Choferes (uuid, nombre, cedula, telefono, porcentaje_comision, activo, id_propietario, updated_at, sync_status) VALUES (?, ?, '', '', ?, 1, NULL, ?, 'pending_insert')",
              [crypto.randomUUID(), ch.nombre, COMISION_POR_DEFECTO, now]
            );
            choferesCreados.set(k, ch.nombre);
          }
          a.viaje.id_chofer = choferesCreados.get(k);
        }

        const g = a.resuelto.gandola;
        if (g && g.nueva) {
          const k = normalizarPlaca(g.placa);
          if (!gandolasCreadas.has(k)) {
            await dbRun(
              "INSERT INTO Gandolas (uuid, placa, modelo, capacidad, activo, id_propietario, updated_at, sync_status) VALUES (?, ?, ?, '', 1, NULL, ?, 'pending_insert')",
              [crypto.randomUUID(), g.placa, g.placa, now]
            );
            gandolasCreadas.set(k, g.placa);
          }
          a.viaje.id_gandola = gandolasCreadas.get(k);
        }

        const v = a.viaje;
        await dbRun(`
          INSERT INTO Viajes (
            uuid, fecha, contenedor, origen, destino, id_gandola, id_chofer, id_propietario, propietario_uuid,
            precio_viaje, pago_chofer, peajes, viaticos, gasoil,
            total_gastos, ganancia, notas, updated_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_insert')
        `, [
          crypto.randomUUID(), v.fecha, v.contenedor || '', v.origen, v.destino, v.id_gandola, v.id_chofer,
          v.id_propietario, v.propietario_uuid,
          v.precio_viaje, v.pago_chofer, v.peajes, v.viaticos, v.gasoil,
          v.total_gastos, v.ganancia, v.notas, now
        ]);
      }

      return {
        importados: analisis.length,
        choferesCreados: [...choferesCreados.values()],
        gandolasCreadas: [...gandolasCreadas.values()],
        totalFletes: redondear2(analisis.reduce((s, a) => s + a.viaje.precio_viaje, 0))
      };
    });

    return { ok: true, ...resultado };
  } catch (err) {
    console.error('[importIPC] confirmarViajes:', err);
    return { ok: false, error: 'No se importó nada. ' + err.message };
  }
});


// ─── Rutas y tarifas ────────────────────────────────────────────────────────

function rutaExcelIncluido() {
  const candidatos = [
    path.join(process.resourcesPath || '', 'Listas_de_Precios_Fletes.xlsx'),
    path.join(app.getAppPath ? app.getAppPath() : __dirname, 'Listas_de_Precios_Fletes.xlsx')
  ];
  return candidatos.find(p => p && fs.existsSync(p)) || null;
}

function validarEntradaRutas(filas) {
  if (!Array.isArray(filas)) throw new Error('Formato de filas inválido.');
  if (filas.length > MAX_FILAS) throw new Error(`Máximo ${MAX_FILAS} filas por importación.`);
  return filas.map(f => ({
    hoja: String((f && f.hoja) || ''),
    filaExcel: Number(f && f.filaExcel) || 0,
    datos: (f && typeof f.datos === 'object' && f.datos) || {}
  }));
}

async function cargarRutasExistentes() {
  return dbAll('SELECT id, origen, destino, precio_base, activo FROM Rutas WHERE deleted_at IS NULL');
}

// Seleccionar el Excel de tarifas (cada hoja es un origen) y devolver sus filas
ipcMain.handle('import:rutasSeleccionarArchivo', async () => {
  try {
    const incluido = rutaExcelIncluido();
    const win = BrowserWindow.getFocusedWindow();
    const openOptions = {
      title: 'Seleccionar lista de precios de fletes',
      defaultPath: incluido || app.getPath('downloads'),
      filters: [{ name: 'Libro de Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile']
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, openOptions)
      : await dialog.showOpenDialog(openOptions);
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true };

    const wb = XLSX.readFile(filePaths[0]);
    const hojas = wb.SheetNames.map(nombre => ({
      nombre,
      filas: XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '' })
    }));
    const filas = leerHojasRutas(hojas);
    if (filas.length === 0) return { ok: false, error: 'No se encontraron rutas. Cada hoja debe ser un origen, con DESTINO en la columna A y PRECIO en la B.' };
    if (filas.length > MAX_FILAS) return { ok: false, error: `El archivo tiene ${filas.length} rutas; el máximo es ${MAX_FILAS}.` };
    return { ok: true, filas, filePath: filePaths[0] };
  } catch (err) {
    console.error('[importIPC] rutasSeleccionarArchivo:', err);
    return { ok: false, error: err.message };
  }
});

// Comparar con las rutas existentes (no guarda nada)
ipcMain.handle('import:rutasAnalizar', async (event, { filas }) => {
  try {
    const analisis = analizarRutas(validarEntradaRutas(filas), await cargarRutasExistentes());
    return { ok: true, analisis, resumen: resumirRutas(analisis) };
  } catch (err) {
    console.error('[importIPC] rutasAnalizar:', err);
    return { ok: false, error: err.message };
  }
});

// Guardar las rutas aprobadas: todas juntas o ninguna
ipcMain.handle('import:rutasConfirmar', async (event, { filas }) => {
  try {
    const entrada = validarEntradaRutas(filas);
    if (entrada.length === 0) return { ok: false, error: 'No hay rutas seleccionadas.' };
    const analisis = analizarRutas(entrada, await cargarRutasExistentes());
    const conError = analisis.find(a => a.estado === 'error');
    if (conError) return { ok: false, error: `Hay rutas con errores (${conError.errores[0]}). Corrígelas o desmárcalas.` };

    const now = new Date().toISOString();
    const res = await dbTransaction(async () => {
      let nuevas = 0;
      let actualizadas = 0;
      for (const a of analisis) {
        if (a.estado === 'nueva') {
          await dbRun(
            "INSERT INTO Rutas (uuid, origen, destino, precio_base, activo, updated_at, sync_status) VALUES (?, ?, ?, ?, 1, ?, 'pending_insert')",
            [crypto.randomUUID(), a.ruta.origen, a.ruta.destino, a.ruta.precio_base, now]
          );
          nuevas++;
        } else if (a.estado === 'cambia') {
          await dbRun(
            `UPDATE Rutas SET precio_base = ?, activo = 1, updated_at = ?,
              sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
             WHERE id = ?`,
            [a.ruta.precio_base, now, a.anterior.id]
          );
          actualizadas++;
        }
      }
      return { nuevas, actualizadas };
    });
    return { ok: true, ...res };
  } catch (err) {
    console.error('[importIPC] rutasConfirmar:', err);
    return { ok: false, error: 'No se importó nada. ' + err.message };
  }
});

function registerImportIPC() { }
module.exports = { registerImportIPC };
