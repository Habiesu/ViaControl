# Contexto para continuar en otra conversación

> Pega esto al empezar: "Lee `CONTEXTO_SESION.md` y continúa desde ahí."
> Última actualización: 2026-11-18.

## Proyecto
**ViaControl** v1.4.3: app de escritorio (Electron + React 19 + Vite) para empresas de transporte de carga
(gandolas). SQLite local, que funciona sin internet, y sincronización con Supabase. Instalador NSIS para Windows con auto-actualización.

- Proceso principal: `main.js`, `electron/` (db, ipc, sync, auth).
- Pantallas: `src/views/*.jsx`. Componentes: `src/components/`. Estilos: `src/styles/app.css`.
- `nodeIntegration: true`: las vistas usan `window.require('electron').ipcRenderer`.
- En la tabla `Viajes`, `id_chofer` guarda el **nombre** del chofer e `id_gandola` la **placa** (no IDs numéricos).
- Para sincronizar, cada escritura debe poner `uuid`, `updated_at` y `sync_status` (`pending_insert` / `pending_update`).

## Estado del trabajo
Rama: `ccr-e094031b-gx01c4`. **Los commits no están en GitHub**: la sesión anterior no tenía permiso de escritura
(error 403). El usuario tiene el parche `importacion-verificada.patch` (se aplica con `git am`).
Para que una sesión en la nube pueda subir cambios, hay que conectar GitHub en https://claude.ai/connect-github e instalar la app de Claude en el repositorio.

| Commit | Contenido |
|---|---|
| `docs: plan para convertir ViaControl en un molde comercial multiempresa` | `PLAN_MOLDE_COMERCIAL.md` (en pausa) |
| `docs: plan de importación desde Excel con lista de verificación` | `PLAN_IMPORTACION_VERIFICADA.md` |
| `feat: importación desde Excel con lista de verificación (viajes y tarifas)` | Fases 1, 2 y 3 del plan anterior |

### Importación con verificación (hecho)
- **Viajes** (Historial → Importar): modal con todas las filas del Excel y su estado (lista, aviso, error,
  duplicada). Permite editar celdas, descartar filas, elegir el chofer o la gandola sugeridos o crearlos, y aplicar
  la corrección a todas las filas iguales. Al confirmar se guarda todo en **una sola transacción**.
- **Tarifas** (Rutas → Importar tarifas desde Excel): se elige el archivo y se ve el precio actual frente al nuevo
  (nueva / cambia / sin cambios / error).
- Se corrigió la importación antigua de viajes, que fallaba siempre: usaba columnas `activo` y una tabla
  `Gandola_Propietario` que no existen, y guardaba IDs en lugar de nombre y placa.
- Archivos:
  - Lógica pura, sin Electron: `electron/import/viajesImport.js` y `electron/import/rutasImport.js`.
  - Canales IPC en `electron/ipc/importIPC.js`: `import:seleccionarArchivo`, `import:analizarViajes`,
    `import:confirmarViajes`, `import:rutasSeleccionarArchivo`, `import:rutasAnalizar` e `import:rutasConfirmar`.
  - Modales: `src/components/import/ImportVerificacionViajes.jsx` y `ImportVerificacionRutas.jsx`, con estilos `.imp-*`.
  - Se eliminó el canal sin uso `rutas:importar-excel` de `catalogosIPC.js`.
- Pruebas: `npm test` (`node --test "tests/*.test.js"`), 16 pruebas en verde. Además se probó con SQLite real y
  en navegador, aunque **todavía no en Windows con datos reales**.

### Decisiones tomadas (el usuario puede cambiarlas)
1. Se pueden crear choferes (comisión 10 %, sin propietario) y gandolas desde el modal.
2. Si falta el pago del chofer, se calcula con su % de comisión (con aviso).
3. Duplicado = mismo contenedor, o misma fecha + gandola + chofer + destino (contra la base de datos y dentro del archivo).
4. Las filas con aviso vienen marcadas, las duplicadas desmarcadas y las de error no se pueden marcar.
5. Propietario vacío: se usa el del chofer y, si no tiene, el de la gandola. Si el propietario escrito no existe, es error.
6. Origen vacío: se usa "Puerto Cabello" (con aviso). Flete vacío: se usa la tarifa de la ruta, y si no hay tarifa es error.

## Pendiente / próximos pasos
1. **Probar en Windows** con un Excel real de viajes y con la lista de precios.
2. **Preguntar al usuario:** al arrancar, `initDatabase` ejecuta `importRutasFromExcel()` (`electron/db/seeds.js`) con el
   Excel incluido en el instalador. Sobrescribe precios sin preguntar y sin marcarlos para sincronizar.
   ¿Es intencionado (para repartir tarifas con cada versión) o se cambia?
3. Fase 4 opcional del plan: exportar filas con error a Excel, borrador si se cierra el modal y deshacer una importación.
4. `btn-ghost` se usa en 9 botones de la app pero no tiene estilo global (solo se definió dentro del modal).
5. Las skills del proyecto están en `.agents/skills/`, que Claude Code no lee. El usuario quiere usarlas: moverlas o
   copiarlas a `.claude/skills/`. También quiere sus skills globales y las del proyecto "Kakei". El único repositorio
   accesible, `Habiesu/Kakei-releases`, solo tiene un README; hay que preguntar dónde están.
6. Plan comercial (`PLAN_MOLDE_COMERCIAL.md`), en pausa. Bloqueos principales: aislamiento por usuario y no por empresa
   (RLS con `user_id`), credenciales de Supabase escritas en `electron/auth/authManager.js`, marca y vocabulario fijos,
   `contextIsolation: false` y falta de licencias.

## Preferencias del usuario
- Escribe en español y a veces desde el móvil: respuestas cortas y claras.
- Quiere trabajar desde el móvil sobre su ordenador. Opción: Remote Control en la app de escritorio de Claude
  (Ajustes → Claude Code → Remote Control, añadir la carpeta del proyecto).
