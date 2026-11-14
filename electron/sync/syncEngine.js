const { dbAll, dbRun, dbGet, dbTransaction, SYNC_TABLES } = require('../db/database');
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
  'Propietarios': ['nombre', 'contacto', 'id_grupo', 'id_agente', 'agente_uuid', 'grupo_uuid'],
  'Agentes': ['nombre', 'contacto', 'id_propietario_vinculado', 'notas'],
  'Rutas': ['origen', 'destino', 'precio_base', 'activo'],
  'Choferes': ['nombre', 'cedula', 'telefono', 'porcentaje_comision', 'id_propietario', 'propietario_uuid', 'activo'],
  'Gandolas': ['placa', 'modelo', 'marca', 'año', 'capacidad', 'id_propietario', 'propietario_uuid', 'activo'],
  'Viajes': [
    'fecha', 'contenedor', 'origen', 'destino', 'id_gandola', 'id_chofer',
    'id_propietario', 'propietario_uuid', 'precio_viaje', 'pago_chofer', 'peajes', 'viaticos',
    'gasoil', 'total_gastos', 'ganancia', 'estado', 'notas', 'entregado', 'pagado'
  ],
  'Gastos_Extra': [
    'fecha', 'id_chofer', 'id_gandola', 'id_viaje', 'id_propietario',
    'id_agente', 'propietario_uuid', 'agente_uuid', 'viaje_uuid', 'categoria', 'tipo', 'descripcion', 'monto'
  ],
  'Aportes_Propietarios': [
    'fecha', 'id_propietario', 'id_agente', 'propietario_uuid', 'agente_uuid', 'monto', 'concepto',
    'metodo_pago', 'referencia', 'notas'
  ]
};

async function resolveLocalForeignKeys(localTable, remote) {
  const row = { ...remote };
  try {
    if (row.propietario_uuid) {
      const p = await dbGet("SELECT id FROM Propietarios WHERE uuid = ?", [row.propietario_uuid]);
      if (p && p.id) row.id_propietario = p.id;
    }
    if (row.agente_uuid) {
      const a = await dbGet("SELECT id FROM Agentes WHERE uuid = ?", [row.agente_uuid]);
      if (a && a.id) row.id_agente = a.id;
    }
    if (row.viaje_uuid) {
      const v = await dbGet("SELECT id FROM Viajes WHERE uuid = ?", [row.viaje_uuid]);
      if (v && v.id) row.id_viaje = v.id;
    }
  } catch (resErr) {
    console.warn('[SyncEngine] Advertencia al resolver FKs locales:', resErr.message);
  }
  return row;
}

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

        // Asegurar que si la fila local tiene id local pero no UUID relacional, se resuelva antes del push
        if (!payload.propietario_uuid && row.id_propietario) {
          const p = await dbGet("SELECT uuid FROM Propietarios WHERE id = ?", [row.id_propietario]);
          if (p?.uuid) payload.propietario_uuid = p.uuid;
        }
        if (!payload.agente_uuid && row.id_agente) {
          const a = await dbGet("SELECT uuid FROM Agentes WHERE id = ?", [row.id_agente]);
          if (a?.uuid) payload.agente_uuid = a.uuid;
        }
        if (!payload.viaje_uuid && row.id_viaje) {
          const v = await dbGet("SELECT uuid FROM Viajes WHERE id = ?", [row.id_viaje]);
          if (v?.uuid) payload.viaje_uuid = v.uuid;
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
/**
 * Gandolas tiene placa UNIQUE local: si llega de la nube una gandola cuya placa ya existe aquí
 * con otro uuid (se registró por separado en dos PCs), se fusionan en vez de fallar el INSERT.
 * Devuelve true si la fila quedó resuelta.
 */
async function fusionarGandolaPorPlaca(remote, columns) {
  if (!remote.placa) return false;
  const existente = await dbGet('SELECT * FROM Gandolas WHERE placa = ?', [remote.placa]);
  if (!existente) return false;

  if (existente.sync_status !== 'pending_insert') {
    // Ambas ya están en la nube con uuids distintos: no se puede fusionar desde aquí; se conserva la local.
    console.warn(`[SyncEngine] Gandola placa "${remote.placa}" duplicada en la nube (uuids ${existente.uuid} / ${remote.uuid}); se conserva la local.`);
    return true;
  }

  // La local nunca se subió: adopta el uuid de la nube (Viajes/Gastos la referencian por placa, no por uuid).
  const remoteTime = new Date(remote.updated_at || 0).getTime();
  const localTime = new Date(existente.updated_at || 0).getTime();
  if (localTime > remoteTime) {
    // La versión local es más reciente: se queda con sus datos y se sube como actualización de la fila de la nube.
    await dbRun(`UPDATE Gandolas SET uuid = ?, sync_status = 'pending_update' WHERE id = ?`, [remote.uuid, existente.id]);
  } else {
    const setClauses = columns.map(c => `${c} = ?`);
    setClauses.push('uuid = ?', 'updated_at = ?', 'deleted_at = ?', "sync_status = 'synced'");
    const params = columns.map(c => remote[c] !== undefined ? remote[c] : null);
    params.push(remote.uuid, remote.updated_at, remote.deleted_at || null, existente.id);
    await dbRun(`UPDATE Gandolas SET ${setClauses.join(', ')} WHERE id = ?`, params);
  }
  return true;
}

/**
 * Trae todas las filas de una tabla remota por páginas (Supabase devuelve como máximo 1000 por consulta;
 * sin paginar, una tabla con más de 1000 viajes se descargaría incompleta). Lanza error si falla.
 */
const PAGINA = 1000;
async function traerFilasRemotas(supabase, remoteTable, userId, lastSync) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    let query = supabase.from(remoteTable).select('*').eq('user_id', userId);
    if (lastSync) query = query.gt('updated_at', lastSync);
    const { data, error } = await query.order('uuid').range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`${remoteTable}: ${error.message}`);
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) return filas;
  }
}

/**
 * @param prefetched opcional { [tablaLocal]: filas[] } ya descargadas (usado por "Reemplazar con la nube")
 */
async function pullChanges(supabase, userId, lastSync, prefetched = null) {
  let pulledCount = 0;
  let failedCount = 0;

  for (const localTable of SYNC_TABLES) {
    const remoteTable = TABLE_MAPPING[localTable];
    const columns = TABLE_COLUMNS[localTable];

    try {
      let remoteRows;
      try {
        remoteRows = prefetched ? (prefetched[localTable] || []) : await traerFilasRemotas(supabase, remoteTable, userId, lastSync);
      } catch (fetchErr) {
        failedCount++;
        console.warn(`[SyncEngine] Error en pull para ${remoteTable}:`, fetchErr.message);
        continue;
      }

      if (!remoteRows || remoteRows.length === 0) continue;

      for (const rawRemote of remoteRows) {
       // Cada fila por separado: un error ya no corta la descarga del resto de la tabla
       try {
        const remote = await resolveLocalForeignKeys(localTable, rawRemote);
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
        } else if (localTable === 'Gandolas' && await fusionarGandolaPorPlaca(remote, columns)) {
          pulledCount++;
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
       } catch (rowErr) {
        failedCount++;
        console.warn(`[SyncEngine] Error al descargar fila de ${localTable} (uuid: ${rawRemote.uuid}):`, rowErr.message);
       }
      }
    } catch (tblErr) {
      failedCount++;
      console.warn(`[SyncEngine] Excepción en pull de tabla ${localTable}:`, tblErr.message);
    }
  }

  return { pulledCount, failedCount };
}

// ─── Primera sincronización de una PC con datos propios ──────────────────────
const CLAVE_DECISION = 'primera_sync_resuelta';
// Rutas no cuenta para decidir si preguntar: la app crea ~100 rutas de ejemplo en cada PC nueva.
const TABLAS_QUE_DISPARAN = SYNC_TABLES.filter(t => t !== 'Rutas');

/**
 * Devuelve un resumen si esta PC nunca sincronizó, tiene datos propios sin subir y la nube también tiene datos;
 * en ese caso hay que preguntar al usuario si mezclar o reemplazar. Si no, devuelve null.
 */
async function analizarPrimeraSincronizacion(supabase, userId) {
  if (await getLastSync()) return null;
  if (await dbGet('SELECT value FROM SyncMeta WHERE key = ?', [CLAVE_DECISION])) return null;

  const local = {}; const nube = {};
  for (const t of SYNC_TABLES) {
    const r = await dbGet(`SELECT COUNT(*) as cnt FROM ${t} WHERE deleted_at IS NULL AND sync_status IN ('pending_insert', 'pending_update')`);
    local[t] = r?.cnt || 0;
    const { count, error } = await supabase
      .from(TABLE_MAPPING[t]).select('uuid', { count: 'exact', head: true })
      .eq('user_id', userId).is('deleted_at', null);
    if (error) throw new Error(error.message);
    nube[t] = count || 0;
  }
  const totalLocal = TABLAS_QUE_DISPARAN.reduce((s, t) => s + local[t], 0);
  const totalNube = SYNC_TABLES.reduce((s, t) => s + nube[t], 0);
  if (totalLocal === 0 || totalNube === 0) return null;
  return { local, nube, totalLocal, totalNube };
}

async function marcarDecisionTomada(modo) {
  await dbRun(
    "INSERT INTO SyncMeta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [CLAVE_DECISION, `${modo} ${new Date().toISOString()}`]
  );
}

/**
 * Borra los datos sincronizables de esta PC y los reemplaza por los de la nube.
 * Orden seguro: 1) descargar todo a memoria (si falla, no se toca nada), 2) copia de seguridad de la BD,
 * 3) borrar + insertar en una sola transacción (si alguna fila falla, se deshace todo).
 */
async function reemplazarConNube(supabase, userId, rutaCopia) {
  const prefetched = {};
  for (const t of SYNC_TABLES) {
    prefetched[t] = await traerFilasRemotas(supabase, TABLE_MAPPING[t], userId, null);
  }

  await dbRun('VACUUM INTO ?', [rutaCopia]);

  const inicio = new Date().toISOString();
  const pulled = await dbTransaction(async () => {
    for (const t of SYNC_TABLES) await dbRun(`DELETE FROM ${t}`);
    const { pulledCount, failedCount } = await pullChanges(supabase, userId, null, prefetched);
    if (failedCount > 0) throw new Error(`${failedCount} registro(s) de la nube no se pudieron cargar; no se cambió nada.`);
    return pulledCount;
  });
  await setLastSync(inicio);
  return pulled;
}

/**
 * Aplica la decisión del usuario ('mezclar' | 'reemplazar') y sincroniza.
 */
async function resolverPrimeraSincronizacion(modo, rutaCopia) {
  if (isSyncing) return { ok: false, error: 'Sincronización en curso', syncing: true };
  const user = authManager.getUser();
  if (!user || !user.id) return { ok: false, error: 'No hay usuario autenticado' };

  if (modo === 'reemplazar') {
    isSyncing = true;
    try {
      const pulled = await reemplazarConNube(authManager.getSupabaseClient(), user.id, rutaCopia);
      await marcarDecisionTomada(modo);
      return { ok: true, pulled, pushed: 0, lastSync: await getLastSync(), pendingCount: await getPendingCount(), reemplazado: true, rutaCopia };
    } catch (error) {
      console.warn('[SyncEngine] No se pudo reemplazar con la nube:', error.message);
      return { ok: false, error: error.message, pendingCount: await getPendingCount() };
    } finally {
      isSyncing = false;
    }
  }

  if (modo !== 'mezclar') return { ok: false, error: `Modo desconocido: ${modo}` };
  await marcarDecisionTomada(modo);
  return sync({ saltarAnalisis: true });
}

/**
 * Ejecutar Sincronización Completa Bidireccional
 */
async function sync({ saltarAnalisis = false } = {}) {
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
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        authManager.saveSessionToDisk(sessionData.session);
      }
    } catch (tokenErr) {
      console.warn('[SyncEngine] Advertencia al validar sesión proactiva:', tokenErr.message);
    }

    // 0. Primera sincronización con datos en ambos lados: no tocar nada hasta que el usuario decida
    if (!saltarAnalisis) {
      const resumen = await analizarPrimeraSincronizacion(supabase, user.id);
      if (resumen) {
        return { ok: false, requiereDecision: true, resumen, pendingCount: await getPendingCount() };
      }
    }

    const lastSync = await getLastSync();
    const syncStartTime = new Date().toISOString();

    // 1. PULL primero (trae datos nuevos de otras computadoras)
    const { pulledCount: pulled, failedCount } = await pullChanges(supabase, user.id, lastSync);

    // 2. PUSH segundo (sube cambios locales pendientes a la nube)
    const pushed = await pushChanges(supabase, user.id);

    // 3. Avanzar la marca solo si todo bajó bien; si no, las filas fallidas se reintentan la próxima vez
    if (failedCount === 0) {
      await setLastSync(syncStartTime);
    } else {
      console.warn(`[SyncEngine] ${failedCount} fila(s) no se pudieron descargar; se reintentarán en la próxima sincronización.`);
    }

    const pending = await getPendingCount();

    return {
      ok: true,
      pushed,
      pulled,
      lastSync: failedCount === 0 ? syncStartTime : lastSync,
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
  getPendingCount,
  resolverPrimeraSincronizacion
};
