const { dbAll, dbRun, dbGet, SYNC_TABLES } = require('../db/database');
const authManager = require('../auth/authManager');

const TABLE_MAPPING = {
  'Grupos_Propietarios': 'grupos_propietarios',
  'Propietarios': 'propietarios',
  'Agentes': 'agentes',
  'Rutas': 'rutas',
  'Choferes': 'choferes',
  'Gandolas': 'gandolas',
  'Viajes': 'viajes',
  'Gastos_Extra': 'gastos_extra',
  'Aportes_Propietarios': 'aportes_propietarios'
};

// Columnas de negocio específicas por tabla (excluyendo id, sync_status)
const TABLE_COLUMNS = {
  'Grupos_Propietarios': ['nombre', 'descripcion'],
  'Propietarios': ['nombre', 'contacto', 'id_grupo', 'id_agente'],
  'Agentes': ['nombre', 'contacto', 'id_propietario_vinculado', 'notas'],
  'Rutas': ['origen', 'destino', 'precio_base', 'activo'],
  'Choferes': ['nombre', 'cedula', 'telefono', 'porcentaje_comision', 'id_propietario', 'activo'],
  'Gandolas': ['placa', 'modelo', 'marca', 'año', 'capacidad', 'id_propietario', 'activo'],
  'Viajes': [
    'fecha', 'contenedor', 'origen', 'destino', 'id_gandola', 'id_chofer',
    'id_propietario', 'precio_viaje', 'pago_chofer', 'peajes', 'viaticos',
    'gasoil', 'total_gastos', 'ganancia', 'estado', 'notas', 'entregado', 'pagado'
  ],
  'Gastos_Extra': [
    'fecha', 'id_chofer', 'id_gandola', 'id_viaje', 'id_propietario',
    'id_agente', 'categoria', 'tipo', 'descripcion', 'monto'
  ],
  'Aportes_Propietarios': [
    'fecha', 'id_propietario', 'id_agente', 'monto', 'concepto',
    'metodo_pago', 'referencia', 'notas'
  ]
};

let isSyncing = false;

async function getLastSync() {
  const row = await dbGet("SELECT value FROM SyncMeta WHERE key = 'last_sync_timestamp'");
  return row ? row.value : null;
}

async function setLastSync(timestamp) {
  await dbRun(
    "INSERT INTO SyncMeta (key, value) VALUES ('last_sync_timestamp', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [timestamp]
  );
}

async function getPendingCount() {
  let count = 0;
  for (const tabla of SYNC_TABLES) {
    const row = await dbGet(`SELECT COUNT(*) as cnt FROM ${tabla} WHERE sync_status IN ('pending_insert', 'pending_update', 'pending_delete')`);
    count += (row?.cnt || 0);
  }
  return count;
}

/**
 * PUSH: Sube cambios locales pendientes a Supabase
 */
async function pushChanges(supabase, userId) {
  let pushedCount = 0;

  for (const localTable of SYNC_TABLES) {
    const remoteTable = TABLE_MAPPING[localTable];
    const columns = TABLE_COLUMNS[localTable];

    const pendingRows = await dbAll(
      `SELECT * FROM ${localTable} WHERE sync_status IN ('pending_insert', 'pending_update', 'pending_delete')`
    );

    for (const row of pendingRows) {
      try {
        const payload = {
          uuid: row.uuid,
          local_id: row.id,
          user_id: userId,
          updated_at: row.updated_at || new Date().toISOString(),
          deleted_at: row.deleted_at || null
        };

        // Copiar columnas de datos
        for (const col of columns) {
          payload[col] = row[col] !== undefined ? row[col] : null;
        }

        const { error } = await supabase
          .from(remoteTable)
          .upsert(payload, { onConflict: 'uuid' });

        if (error) {
          console.warn(`[SyncEngine] Error en push para ${localTable} (uuid: ${row.uuid}):`, error.message);
          continue;
        }

        // Marcar como sincronizado localmente
        await dbRun(
          `UPDATE ${localTable} SET sync_status = 'synced', user_id = ? WHERE id = ?`,
          [userId, row.id]
        );
        pushedCount++;
      } catch (rowErr) {
        console.warn(`[SyncEngine] Excepción en push para fila ${row.id}:`, rowErr.message);
      }
    }
  }

  return pushedCount;
}

/**
 * PULL: Descarga cambios remotos desde Supabase hacia SQLite
 */
async function pullChanges(supabase, userId, lastSync) {
  let pulledCount = 0;

  for (const localTable of SYNC_TABLES) {
    const remoteTable = TABLE_MAPPING[localTable];
    const columns = TABLE_COLUMNS[localTable];

    try {
      let query = supabase
        .from(remoteTable)
        .select('*')
        .eq('user_id', userId);

      if (lastSync) {
        query = query.gt('updated_at', lastSync);
      }

      const { data: remoteRows, error } = await query;

      if (error) {
        console.warn(`[SyncEngine] Error en pull para ${remoteTable}:`, error.message);
        continue;
      }

      if (!remoteRows || remoteRows.length === 0) continue;

      for (const remote of remoteRows) {
        const local = await dbGet(`SELECT * FROM ${localTable} WHERE uuid = ?`, [remote.uuid]);

        if (local) {
          // Resolución de conflictos: Last-Write-Wins (LWW)
          const remoteTime = new Date(remote.updated_at || 0).getTime();
          const localTime = new Date(local.updated_at || 0).getTime();

          // Si el remoto es más reciente o el local ya estaba sincronizado, aplicar remoto
          if (remoteTime >= localTime || local.sync_status === 'synced') {
            const setClauses = columns.map(c => `${c} = ?`);
            setClauses.push('updated_at = ?', 'deleted_at = ?', 'sync_status = ?');

            const params = columns.map(c => remote[c] !== undefined ? remote[c] : null);
            params.push(remote.updated_at, remote.deleted_at || null, 'synced', local.id);

            await dbRun(
              `UPDATE ${localTable} SET ${setClauses.join(', ')} WHERE id = ?`,
              params
            );
            pulledCount++;
          }
        } else {
          // No existe localmente: Insertar
          const allCols = ['uuid', 'user_id', 'updated_at', 'deleted_at', 'sync_status', ...columns];
          const placeholders = allCols.map(() => '?').join(', ');
          const values = [
            remote.uuid,
            userId,
            remote.updated_at || new Date().toISOString(),
            remote.deleted_at || null,
            'synced',
            ...columns.map(c => remote[c] !== undefined ? remote[c] : null)
          ];

          await dbRun(
            `INSERT INTO ${localTable} (${allCols.join(', ')}) VALUES (${placeholders})`,
            values
          );
          pulledCount++;
        }
      }
    } catch (tblErr) {
      console.warn(`[SyncEngine] Excepción en pull de tabla ${localTable}:`, tblErr.message);
    }
  }

  return pulledCount;
}

/**
 * Ejecutar Sincronización Completa Bidireccional
 */
async function sync() {
  if (isSyncing) {
    return { ok: false, error: 'Sincronización en curso', syncing: true };
  }

  isSyncing = true;
  try {
    const user = authManager.getUser();
    if (!user || !user.id) {
      return { ok: false, error: 'No hay usuario autenticado', offline: false };
    }

    const supabase = authManager.getSupabaseClient();
    const lastSync = await getLastSync();
    const syncStartTime = new Date().toISOString();

    // 1. PULL primero (trae datos nuevos de otras computadoras)
    const pulled = await pullChanges(supabase, user.id, lastSync);

    // 2. PUSH segundo (sube cambios locales pendientes a la nube)
    const pushed = await pushChanges(supabase, user.id);

    // 3. Actualizar timestamp de última sincronización
    await setLastSync(syncStartTime);

    const pending = await getPendingCount();

    return {
      ok: true,
      pushed,
      pulled,
      lastSync: syncStartTime,
      pendingCount: pending
    };
  } catch (error) {
    console.warn('[SyncEngine] Error durante la sincronización:', error.message);
    const pending = await getPendingCount();
    return {
      ok: false,
      error: error.message,
      pendingCount: pending,
      offline: true
    };
  } finally {
    isSyncing = false;
  }
}

module.exports = {
  sync,
  getLastSync,
  getPendingCount
};
