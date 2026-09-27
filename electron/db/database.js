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
  return path.join(dataDir, 'gandolas_db.sqlite');
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

  // Creación de tablas
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

  // Índices
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

  const { seedInitialData, importRutasFromExcel } = require('./seeds');
  await seedInitialData();
  await importRutasFromExcel();
}

module.exports = {
  initDatabase,
  dbRun,
  dbGet,
  dbAll,
  getDatabasePath
};
