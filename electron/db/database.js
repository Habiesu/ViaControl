const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db;

function getDatabasePath() {
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'gandolas_data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbFile = path.join(dataDir, 'gandolas_db.sqlite');

  // Si no existe en la carpeta actual pero existe en 'kengo', migrar los datos automáticamente
  if (!fs.existsSync(dbFile)) {
    const legacyPath = path.join(path.dirname(userDataPath), 'kengo', 'gandolas_data', 'gandolas_db.sqlite');
    if (fs.existsSync(legacyPath)) {
      try {
        fs.copyFileSync(legacyPath, dbFile);
        console.log('Base de datos migrada exitosamente desde kengo a ViaControl');
      } catch (e) {
        console.warn('No se pudo migrar BD legacy:', e);
      }
    }
  }

  return dbFile;
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function initDatabase() {
  const dbPath = getDatabasePath();
  console.log('Ruta de Base de Datos SQLite:', dbPath);
  db = new sqlite3.Database(dbPath);

  // Optimizaciones de rendimiento SQLite
  try {
    await dbRun("PRAGMA journal_mode = WAL");
    await dbRun("PRAGMA synchronous = NORMAL");
    await dbRun("PRAGMA busy_timeout = 5000");
    await dbRun("PRAGMA cache_size = -64000");
    await dbRun("PRAGMA temp_store = MEMORY");
  } catch (e) {
    console.warn('Advertencia pragma SQLite:', e.message);
  }

  // CreaciÃ³n de tablas
  await dbRun(`
    CREATE TABLE IF NOT EXISTS Rutas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origen TEXT NOT NULL,
      destino TEXT NOT NULL,
      precio_base REAL NOT NULL,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Choferes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      cedula TEXT,
      telefono TEXT,
      porcentaje_comision REAL DEFAULT 10.0,
      id_propietario INTEGER,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Gandolas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      placa TEXT NOT NULL UNIQUE,
      modelo TEXT,
      capacidad TEXT,
      id_propietario INTEGER,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Propietarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      contacto TEXT,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Viajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      contenedor TEXT,
      origen TEXT NOT NULL,
      destino TEXT NOT NULL,
      id_gandola TEXT NOT NULL,
      id_chofer TEXT NOT NULL,
      id_propietario INTEGER,
      precio_viaje REAL NOT NULL,
      pago_chofer REAL NOT NULL,
      peajes REAL DEFAULT 0,
      viaticos REAL DEFAULT 0,
      gasoil REAL DEFAULT 0,
      total_gastos REAL NOT NULL,
      ganancia REAL NOT NULL,
      estado TEXT DEFAULT 'Completado',
      notas TEXT,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Gastos_Extra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      id_chofer TEXT,
      id_gandola TEXT,
      id_viaje INTEGER,
      id_propietario INTEGER,
      categoria TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      monto REAL NOT NULL,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Grupos_Propietarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Agentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      contacto TEXT,
      id_propietario_vinculado INTEGER,
      notas TEXT,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Aportes_Propietarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      id_propietario INTEGER,
      id_agente INTEGER,
      monto REAL NOT NULL,
      concepto TEXT DEFAULT 'Entrega de Fondos',
      metodo_pago TEXT,
      referencia TEXT,
      notas TEXT,
      creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migraciones de columnas
  const propCols = await dbAll(`PRAGMA table_info(Propietarios)`);
  if (!propCols.some(c => c.name === 'id_grupo')) {
    await dbRun(`ALTER TABLE Propietarios ADD COLUMN id_grupo INTEGER`);
  }
  if (!propCols.some(c => c.name === 'id_agente')) {
    await dbRun(`ALTER TABLE Propietarios ADD COLUMN id_agente INTEGER`);
  }
  const choferCols = await dbAll(`PRAGMA table_info(Choferes)`);
  if (!choferCols.some(c => c.name === 'id_propietario')) {
    await dbRun(`ALTER TABLE Choferes ADD COLUMN id_propietario INTEGER`);
  }
  const gandolaCols = await dbAll(`PRAGMA table_info(Gandolas)`);
  if (!gandolaCols.some(c => c.name === 'id_propietario')) {
    await dbRun(`ALTER TABLE Gandolas ADD COLUMN id_propietario INTEGER`);
  }
  const viajeCols = await dbAll(`PRAGMA table_info(Viajes)`);
  if (!viajeCols.some(c => c.name === 'id_propietario')) {
    await dbRun(`ALTER TABLE Viajes ADD COLUMN id_propietario INTEGER`);
  }
  if (!viajeCols.some(c => c.name === 'entregado')) {
    await dbRun(`ALTER TABLE Viajes ADD COLUMN entregado INTEGER DEFAULT 0`);
  }
  if (!viajeCols.some(c => c.name === 'pagado')) {
    await dbRun(`ALTER TABLE Viajes ADD COLUMN pagado INTEGER DEFAULT 0`);
  }
  const gastoCols = await dbAll(`PRAGMA table_info(Gastos_Extra)`);
  if (!gastoCols.some(c => c.name === 'id_propietario')) {
    await dbRun(`ALTER TABLE Gastos_Extra ADD COLUMN id_propietario INTEGER`);
  }
  if (!gastoCols.some(c => c.name === 'id_agente')) {
    await dbRun(`ALTER TABLE Gastos_Extra ADD COLUMN id_agente INTEGER`);
  }
  const aporteCols = await dbAll(`PRAGMA table_info(Aportes_Propietarios)`);
  if (!aporteCols.some(c => c.name === 'id_agente')) {
    await dbRun(`ALTER TABLE Aportes_Propietarios ADD COLUMN id_agente INTEGER`);
  }

  // Tabla de metadatos de sincronización
  await dbRun(`
    CREATE TABLE IF NOT EXISTS SyncMeta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Migraciones de columnas para Offline-First y Sincronización en todas las tablas
  const crypto = require('crypto');
  const SYNC_TABLES = [
    'Grupos_Propietarios',
    'Propietarios',
    'Agentes',
    'Rutas',
    'Choferes',
    'Gandolas',
    'Viajes',
    'Gastos_Extra',
    'Aportes_Propietarios'
  ];

  for (const tabla of SYNC_TABLES) {
    const cols = await dbAll(`PRAGMA table_info(${tabla})`);
    if (!cols.some(c => c.name === 'uuid')) {
      await dbRun(`ALTER TABLE ${tabla} ADD COLUMN uuid TEXT`);
    }
    if (!cols.some(c => c.name === 'user_id')) {
      await dbRun(`ALTER TABLE ${tabla} ADD COLUMN user_id TEXT`);
    }
    if (!cols.some(c => c.name === 'updated_at')) {
      await dbRun(`ALTER TABLE ${tabla} ADD COLUMN updated_at TEXT`);
    }
    if (!cols.some(c => c.name === 'deleted_at')) {
      await dbRun(`ALTER TABLE ${tabla} ADD COLUMN deleted_at TEXT`);
    }
    if (!cols.some(c => c.name === 'sync_status')) {
      await dbRun(`ALTER TABLE ${tabla} ADD COLUMN sync_status TEXT DEFAULT 'pending_insert'`);
    }

    // Inicializar UUIDs y timestamps para registros históricos locales existentes
    const unassigned = await dbAll(`SELECT id FROM ${tabla} WHERE uuid IS NULL OR uuid = ''`);
    for (const row of unassigned) {
      const newUuid = crypto.randomUUID();
      const now = new Date().toISOString();
      await dbRun(
        `UPDATE ${tabla} SET uuid = ?, updated_at = ?, sync_status = 'pending_insert' WHERE id = ?`,
        [newUuid, now, row.id]
      );
    }

    // Índices de sincronización
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_${tabla.toLowerCase()}_uuid ON ${tabla}(uuid)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_${tabla.toLowerCase()}_sync ON ${tabla}(sync_status)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_${tabla.toLowerCase()}_updated ON ${tabla}(updated_at)`);
  }

  // Índices generales
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_propietarios_grupo ON Propietarios(id_grupo)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_propietarios_agente ON Propietarios(id_agente)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_viajes_fecha ON Viajes(fecha)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_viajes_chofer ON Viajes(id_chofer)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_viajes_gandola ON Viajes(id_gandola)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_viajes_propietario ON Viajes(id_propietario)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON Gastos_Extra(fecha)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_gastos_propietario ON Gastos_Extra(id_propietario)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_gastos_agente ON Gastos_Extra(id_agente)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_gandolas_propietario ON Gandolas(id_propietario)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_choferes_propietario ON Choferes(id_propietario)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_aportes_propietario ON Aportes_Propietarios(id_propietario)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_aportes_agente ON Aportes_Propietarios(id_agente)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_aportes_fecha ON Aportes_Propietarios(fecha)`);

  // ─── MIGRACIÓN DE DATOS v1.3.1 ───────────────────────────────────────────
  // Reclasifica gastos creados desde "Saldo de Agentes" que quedaron con
  // tipo='Gasto_Empresa'. Son identificables: tienen id_agente pero SIN
  // id_gandola ni id_chofer (deducciones directas sin unidad de flota).
  try {
    const migResult = await dbRun(`
      UPDATE Gastos_Extra
      SET tipo = 'Gasto_Solo_Saldo',
          sync_status = CASE WHEN sync_status = 'pending_insert' THEN 'pending_insert' ELSE 'pending_update' END
      WHERE tipo = 'Gasto_Empresa'
        AND id_agente IS NOT NULL
        AND (id_gandola IS NULL OR id_gandola = '')
        AND (id_chofer IS NULL OR id_chofer = '')
        AND (deleted_at IS NULL)
    `);
    if (migResult.changes > 0) {
      console.log(`[DB Migration] ${migResult.changes} gastos de agente reclasificados a Gasto_Solo_Saldo`);
    }
  } catch (migErr) {
    console.warn('[DB Migration] Error en migración de tipos de gasto:', migErr.message);
  }

  const { seedInitialData, importRutasFromExcel } = require('./seeds');
  await seedInitialData();
  await importRutasFromExcel();
}

module.exports = {
  initDatabase,
  dbRun,
  dbGet,
  dbAll,
  getDatabasePath,
  SYNC_TABLES: [
    'Grupos_Propietarios',
    'Propietarios',
    'Agentes',
    'Rutas',
    'Choferes',
    'Gandolas',
    'Viajes',
    'Gastos_Extra',
    'Aportes_Propietarios'
  ]
};


