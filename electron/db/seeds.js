const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { dbRun, dbGet } = require('./database');

async function importRutasFromExcel() {
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'Listas_de_Precios_Fletes.xlsx'),
    path.join(process.resourcesPath || '', 'Listas_de_Precios_Fletes.xlsx'),
    path.join(app.getAppPath ? app.getAppPath() : __dirname, 'Listas_de_Precios_Fletes.xlsx')
  ];

  let excelPath = possiblePaths.find(p => p && fs.existsSync(p));
  if (!excelPath) {
    console.log('No se encontró archivo Excel en las rutas probadas:', possiblePaths);
    return { ok: false, error: 'Archivo Excel Listas_de_Precios_Fletes.xlsx no encontrado' };
  }

  try {
    const xlsx = require('xlsx');
    const wb = xlsx.readFile(excelPath);
    let totalImportados = 0;
    let totalActualizados = 0;

    await dbRun("BEGIN TRANSACTION");
    try {
      for (const sheetName of wb.SheetNames) {
        const origen = sheetName.trim();
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;
          const destinoRaw = String(row[0]).trim();
          if (destinoRaw === 'DESTINO' || destinoRaw.includes('TARIFAS')) continue;

          const precio = Number(row[1]);
          if (destinoRaw && !isNaN(precio) && precio > 0) {
            const existing = await dbGet(
              "SELECT id FROM Rutas WHERE UPPER(TRIM(origen)) = UPPER(TRIM(?)) AND UPPER(TRIM(destino)) = UPPER(TRIM(?))",
              [origen, destinoRaw]
            );

            if (existing) {
              await dbRun(
                "UPDATE Rutas SET precio_base = ?, activo = 1 WHERE id = ?",
                [precio, existing.id]
              );
              totalActualizados++;
            } else {
              await dbRun(
                "INSERT INTO Rutas (origen, destino, precio_base, activo) VALUES (?, ?, ?, 1)",
                [origen, destinoRaw, precio]
              );
              totalImportados++;
            }
          }
        }
      }
      await dbRun("COMMIT");
    } catch (txErr) {
      await dbRun("ROLLBACK");
      throw txErr;
    }

    console.log(`Excel procesado: ${totalImportados} rutas nuevas agregadas, ${totalActualizados} actualizadas.`);
    return { ok: true, totalImportados, totalActualizados };
  } catch (err) {
    console.error('Error al importar Excel:', err);
    return { ok: false, error: err.message };
  }
}

async function seedInitialData() {
  const countRutas = await dbGet("SELECT COUNT(*) as count FROM Rutas");
  if (countRutas.count === 0) {
    const rutasIniciales = [
      ["La Guaira", "ACARIGUA", 1000],
      ["La Guaira", "ANZOATEGUI", 1000],
      ["La Guaira", "APURE", 1200],
      ["La Guaira", "ARAGUA", 500],
      ["La Guaira", "BARCELONA", 1000],
      ["La Guaira", "BARINAS", 1300],
      ["La Guaira", "BARQUISIMETO", 1100],
      ["La Guaira", "CALABOZO", 1000],
      ["La Guaira", "CARACAS", 350],
      ["La Guaira", "CATIA LA MAR -GUAIRA", 200],
      ["La Guaira", "CHARALLAVE", 380],
      ["La Guaira", "CIUDAD BOLIVAR", 1900],
      ["La Guaira", "COJEDES", 800],
      ["La Guaira", "EL DORADO", 2600],
      ["La Guaira", "EL TIGRE", 1100],
      ["La Guaira", "FALCON", 1200],
      ["La Guaira", "GUANARE", 1000],
      ["La Guaira", "GUARENAS", 380],
      ["La Guaira", "GUARICO", 700],
      ["La Guaira", "GUATIRE", 380],
      ["La Guaira", "HIGUEROTE", 420],
      ["La Guaira", "LA VICTORIA", 450],
      ["La Guaira", "LOS TEQUES", 370],
      ["La Guaira", "MARACAY", 500],
      ["La Guaira", "MARICHE", 360],
      ["La Guaira", "MATURIN", 1200],
      ["La Guaira", "MERIDA", 1900],
      ["La Guaira", "MIRANDA", 380],
      ["La Guaira", "PORTUGUESA", 1000],
      ["La Guaira", "PUERTO LA CRUZ", 1000],
      ["La Guaira", "PUERTO ORDAZ", 1900],
      ["La Guaira", "SAN CRISTOBAL", 1900],
      ["La Guaira", "TACHIRA", 1900],
      ["La Guaira", "TRUJILLO", 1600],
      ["La Guaira", "VALENCIA", 600],
      ["La Guaira", "YARACUY", 850],
      ["La Guaira", "ZARAZA", 1100],
      ["La Guaira", "ZULIA", 2000],
      ["La Guaira", "CARUPANO", 600],
      ["Puerto Cabello", "VALENCIA", 350],
      ["Puerto Cabello", "MARACAY - ARAGUA", 500],
      ["Puerto Cabello", "LA VICTORIA", 500],
      ["Puerto Cabello", "LOS TEQUES", 550],
      ["Puerto Cabello", "CARACAS", 750],
      ["Puerto Cabello", "MARICHE", 750],
      ["Puerto Cabello", "LA GUAIRA", 850],
      ["Puerto Cabello", "MIRANDA", 850],
      ["Puerto Cabello", "GUARENAS - GUATIRE", 850],
      ["Puerto Cabello", "CHARALLAVE", 850],
      ["Puerto Cabello", "HIGUEROTE", 850],
      ["Puerto Cabello", "ANZOATEGUI", 1500],
      ["Puerto Cabello", "PUERTO LA CRUZ", 1500],
      ["Puerto Cabello", "BARCELONA", 1500],
      ["Puerto Cabello", "EL TIGRE", 1600],
      ["Puerto Cabello", "MATURIN", 1800],
      ["Puerto Cabello", "CIUDAD BOLIVAR", 2500],
      ["Puerto Cabello", "PUERTO ORDAZ", 2500],
      ["Puerto Cabello", "EL DORADO", 3300],
      ["Puerto Cabello", "YARACUY", 500],
      ["Puerto Cabello", "BARQUISIMETO", 600],
      ["Puerto Cabello", "GUARICO", 600],
      ["Puerto Cabello", "COJEDES", 700],
      ["Puerto Cabello", "PORTUGUESA", 750],
      ["Puerto Cabello", "ACARIGUA", 750],
      ["Puerto Cabello", "GUANARE", 750],
      ["Puerto Cabello", "CALABOZO", 750],
      ["Puerto Cabello", "BARINAS", 900],
      ["Puerto Cabello", "FALCON - CORO", 900],
      ["Puerto Cabello", "ZARAZA", 1000],
      ["Puerto Cabello", "APURE", 1000],
      ["Puerto Cabello", "TRUJILLO", 1000],
      ["Puerto Cabello", "MERIDA", 1500],
      ["Puerto Cabello", "TACHIRA", 1500],
      ["Puerto Cabello", "ZULIA", 1500],
      ["Guanta", "ACARIGUA", 1500],
      ["Guanta", "ANACO", 300],
      ["Guanta", "BARCELONA", 200],
      ["Guanta", "BARINAS", 1900],
      ["Guanta", "BARQUISIMETO", 1700],
      ["Guanta", "BOLIVAR", 900],
      ["Guanta", "CARACAS", 900],
      ["Guanta", "CCS - SAN ANTONIO", 950],
      ["Guanta", "CIUDAD BOLIVAR", 950],
      ["Guanta", "EL DORADO", 1750],
      ["Guanta", "GUARENAS", 700],
      ["Guanta", "GUASIPATI", 1300],
      ["Guanta", "LA GUAIRA", 950],
      ["Guanta", "LOS TEQUES", 950],
      ["Guanta", "MARACAIBO", 2600],
      ["Guanta", "MARACAY", 1100],
      ["Guanta", "MATURIN", 600],
      ["Guanta", "MIRANDA ZAMORA", 700],
      ["Guanta", "PORTUGUESA", 1500],
      ["Guanta", "PTO LA CRUZ", 200],
      ["Guanta", "SAN CRISTOBAL", 2900],
      ["Guanta", "SAN FELIX", 1300],
      ["Guanta", "TIGRE", 500],
      ["Guanta", "TUMEREMO", 1450],
      ["Guanta", "TURMERO", 1100],
      ["Guanta", "VALENCIA", 1200]
    ];
    await dbRun("BEGIN TRANSACTION");
    for (const [origen, destino, precio] of rutasIniciales) {
      await dbRun(
        "INSERT INTO Rutas (origen, destino, precio_base, activo) VALUES (?, ?, ?, 1)",
        [origen, destino, precio]
      );
    }
    await dbRun("COMMIT");
  }
}

module.exports = {
  importRutasFromExcel,
  seedInitialData
};
