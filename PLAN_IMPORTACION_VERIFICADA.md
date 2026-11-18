# Plan: importación desde Excel con lista de verificación

> Estado: fases 1, 2 y 3 implementadas (pendiente de probar en Windows con datos reales). La fase 4 queda opcional.
> Idea: antes de guardar nada, la app abre un modal con todas las filas del Excel. En cada fila
> decides si se añade tal cual, si la corriges o si la descartas. Solo se guarda lo que apruebes.

---

## 1. Cómo funciona hoy

ViaControl tiene dos importaciones desde Excel:

| Importación | Dónde se lanza | Código | Qué hace |
|---|---|---|---|
| **Viajes** | Historial de viajes, botón Importar | `src/views/HistorialViajesView.jsx:559-735` y `electron/ipc/importIPC.js` | Eliges el archivo, ves las 5 primeras filas sin poder tocarlas y pulsas Importar. Las filas con error se saltan y aparecen en un listado al final. |
| **Rutas y tarifas** | Rutas, botón "Sincronizar / Reimportar Excel" | `src/views/RutasView.jsx:25-42` y `electron/db/seeds.js` (`importRutasFromExcel`) | Lee un archivo fijo, `Listas_de_Precios_Fletes.xlsx`, y crea o sobrescribe precios sin enseñar nada antes. |

### Errores encontrados en la importación de viajes (hay que corregirlos primero)
Revisando el código creo que **la importación de viajes falla hoy en cualquier archivo**. Hay que comprobarlo con la app en el ordenador:

1. **Consulta a una columna que no existe.** `importIPC.js` busca `Propietarios WHERE activo=1`, pero la tabla `Propietarios` no tiene columna `activo`. Esa línea está fuera del `try`, así que todo el proceso termina con error.
2. **Inserta en una columna que no existe.** El `INSERT INTO Viajes (..., activo)` usa la columna `activo`, que la tabla `Viajes` no tiene, así que cada fila fallaría.
3. **Usa una tabla que no existe.** `Gandola_Propietario` no se crea en ninguna parte del código.
4. **Guarda los datos de forma distinta al registro manual.** El registro manual (`viajesIPC.js:98`) guarda en `id_chofer` el **nombre** del chofer y en `id_gandola` la **placa**. La importación guarda los IDs numéricos, así que los viajes importados no aparecerían bien en la liquidación semanal ni en los saldos.
5. **No marca bien los viajes para la sincronización.** Faltan `updated_at` e `id_propietario`, y tampoco se guarda `propietario_uuid`.
6. **Pone datos inventados por defecto.** Si falta el origen pone "Puerto Cabello" y si falta el pago del chofer calcula un 10 % fijo, sin avisar al usuario.

La nueva lista de verificación soluciona el punto 6 porque esos valores se muestran y se pueden corregir. Los puntos 1 a 5 se arreglan en la fase 1.

---

## 2. Cómo se verá

### Flujo
```
[Importar Excel] → eliges el archivo
      ↓
Modal "Verificar importación" (pantalla casi completa)
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 48 filas · ✅ 40 listas · ⚠️ 5 con avisos · ❌ 3 con errores · ⧉ 2 duplicadas │
  │ [Todas] [Listas] [Avisos] [Errores] [Duplicadas]     🔍 Buscar...     │
  ├──────────────────────────────────────────────────────────────────────┤
  │ ☑ │ Fila │ Fecha      │ Origen  │ Destino │ Gandola │ Chofer   │ Flete │ Estado │
  │ ☑ │  2   │ 2026-01-15 │ P.Cab.  │ Caracas │ ABC-123 │ Juan P.  │ 1500  │ ✅      │
  │ ☑ │  3   │ 2026-01-16 │ P.Cab.  │ Valencia│ ABX-999 │ Pedro R. │ 1200  │ ❌ Gandola no existe │
  │   │      │  → [Elegir gandola existente ▼]  [Crear gandola ABX-999]  [Descartar] │
  │ ☐ │  4   │ ...        │         │         │         │          │       │ ⧉ Ya importado │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Se importarán 42 viajes · Total fletes $63.400   [Cancelar] [Importar 42] │
  └──────────────────────────────────────────────────────────────────────┘
      ↓
Resumen final: importadas, descartadas y por qué
```

### Qué puedes hacer en cada fila
| Acción | Cómo |
|---|---|
| **Añadir tal cual** | La casilla viene marcada en las filas sin errores. |
| **Modificar** | Clic en una celda para editarla en la propia tabla. Fecha con selector de fecha, montos numéricos, y gandola, chofer y propietario con lista desplegable de los existentes. Al cambiar un dato, la fila se vuelve a validar al momento. |
| **Descartar** | Desmarcar la casilla. La fila sigue visible, en gris. |
| **Resolver lo que no existe** | Si una gandola, chofer o propietario no existe: elegir uno parecido de la lista (se sugiere el más parecido, por ejemplo "Juan Perez" → "Juan Pérez") o crearlo en ese momento. |
| **Aplicar a todas** | "Usar *Juan Pérez* para todas las filas con *Juan Perez*". Así no corriges lo mismo 20 veces. |
| **Acciones en bloque** | Marcar todas, desmarcar todas, descartar las que tienen errores y descartar las duplicadas. |

### Estados de cada fila
| Estado | Significado | ¿Se puede importar? |
|---|---|---|
| ✅ Lista | Todo correcto. | Sí |
| ⚠️ Aviso | Valor calculado o dudoso: pago del chofer calculado al % del chofer, origen vacío, flete en 0, fecha futura. | Sí, pero el aviso se muestra. |
| ❌ Error | Falta un dato obligatorio, fecha inválida o gandola/chofer inexistente sin resolver. | No, hasta que se corrija. |
| ⧉ Duplicada | Ya existe un viaje con la misma fecha, gandola, chofer y destino (o el mismo contenedor), o está repetida dentro del propio Excel. | Desmarcada por defecto; se puede marcar. |

El botón **Importar** solo cuenta las filas marcadas sin errores, y muestra el total de fletes para revisarlo antes de confirmar.

---

## 3. Diseño técnico

La idea clave es **separar "analizar" de "guardar"**. El proceso principal de Electron analiza y valida sin escribir nada; la pantalla deja editar; y al final se guarda todo en una sola transacción.

### Proceso principal (`electron/ipc/importIPC.js`)
| Canal IPC | Qué hace |
|---|---|
| `import:seleccionarArchivo` (ya existe) | Lee el Excel y devuelve las filas normalizadas. Sin cambios importantes. |
| `import:analizarViajes` **(nuevo)** | Recibe las filas y devuelve cada una con: valores interpretados (fecha en formato ISO, montos numéricos), estado, lista de errores y avisos, coincidencias encontradas (`chofer` → id y nombre) y sugerencias para lo que no se encuentra. También detecta duplicados contra la base de datos y dentro del propio archivo. **No escribe nada.** |
| `import:validarFila` **(nuevo, o reutilizar el anterior con una sola fila)** | Vuelve a validar una fila después de editarla. |
| `import:confirmarViajes` **(sustituye a `procesarViajes`)** | Recibe solo las filas aprobadas y ya resueltas. Las vuelve a validar (no se confía en lo que llega de la pantalla), crea primero las entidades nuevas que se aprobaron (gandolas, choferes) e inserta los viajes **en una sola transacción** con `dbTransaction`. Usa el mismo formato que `viajes:guardar` (nombre/placa, `id_propietario`, `propietario_uuid`, `updated_at`, `sync_status`). Al terminar lanza la sincronización. |

La lógica de cálculo y validación de un viaje (pago del chofer, total de gastos, ganancia) debe quedar en **una sola función compartida** entre el registro manual y la importación, por ejemplo `electron/utils/viajeCalculo.js`. Así los viajes importados quedan exactamente igual que los que se registran a mano.

### Pantalla (React)
| Archivo | Contenido |
|---|---|
| `src/components/import/ImportVerificacionModal.jsx` **(nuevo)** | El modal genérico: barra de resumen, filtros, tabla y pie de página con el botón de confirmar. Recibe la definición de columnas, así que sirve para viajes y para rutas. |
| `src/components/import/FilaVerificacion.jsx` **(nuevo)** | Una fila con celdas editables, estado y acciones de resolución. |
| `src/components/import/useImportVerificacion.js` **(nuevo)** | Estado: filas, selección, ediciones, filtros, reglas "aplicar a todas" y nueva validación. |
| `src/views/HistorialViajesView.jsx` | Quitar el modal actual (líneas 559-735) y abrir el nuevo. |
| `src/views/RutasView.jsx` | Fase 3: mismo modal para rutas. |

Rendimiento: un Excel puede tener cientos de filas. Hay que paginar (por ejemplo, 50 por página) o renderizar solo las filas visibles, y volver a validar únicamente la fila editada.

### Rutas y tarifas (fase 3)
- Permitir **elegir el archivo** en vez de usar el fijo.
- El análisis compara contra las rutas existentes y marca cada fila como **Nueva**, **Precio cambia** (muestra precio anterior → nuevo) o **Sin cambios** (desmarcada por defecto).
- Así se evita que un Excel antiguo sobrescriba precios sin que te des cuenta.

---

## 4. Fases de trabajo

| Fase | Contenido | Esfuerzo aprox. |
|---|---|---|
| **1. Arreglar la importación de viajes** | Reproducir el fallo con un Excel de prueba. Corregir los errores 1-5 del apartado 1 y extraer la función de cálculo compartida. Añadir Vitest con pruebas de interpretación de fechas, montos, cálculo y duplicados. | 1 sesión |
| **2. Lista de verificación de viajes** | `import:analizarViajes`, `import:confirmarViajes` con transacción, modal con edición, estados, filtros y resolución de entidades (elegir existente, crear nueva, aplicar a todas). | 2-3 sesiones |
| **3. Rutas con verificación** | Elegir archivo y ver el antes/después de los precios con el mismo modal. | 1 sesión |
| **4. Pulido** | Exportar las filas descartadas o con error a un Excel para corregirlas fuera, guardar la importación como borrador si cierras el modal, y deshacer la última importación (guardar un `lote_importacion` en cada viaje). | Opcional |

## 5. Cómo lo comprobaremos
- Excel de prueba con casos mezclados: filas correctas, fecha en 3 formatos (ISO, DD/MM/AAAA, número de Excel), chofer con tilde distinta, gandola inexistente, fila repetida, montos con símbolo `$` y celdas vacías.
- Comprobar que el viaje importado aparece igual que uno manual en Historial, Liquidación semanal, Rentabilidad y Saldos.
- Comprobar que si falla una fila a mitad de la confirmación no queda nada guardado a medias.
- Comprobar que los viajes importados suben a Supabase en la siguiente sincronización.

## 6. Decisiones tomadas al implementar (se pueden cambiar)
1. **Crear choferes y gandolas desde el modal:** sí, con botón "Crear" por fila o "Crear y usar en las N filas". Se crean con comisión del 10 % y sin propietario; hay que completar sus datos después.
2. **Pago del chofer vacío:** se calcula con el % de comisión de ese chofer (como en el registro manual) y se avisa. Si el Excel trae el pago, se respeta.
3. **Duplicado:** mismo contenedor, o misma fecha + gandola + chofer + destino. Vale contra los viajes guardados y dentro del propio archivo.
4. **Filas con aviso:** vienen marcadas. Las duplicadas vienen desmarcadas y las de error no se pueden marcar hasta corregirlas.
5. **Propietario:** si se deja vacío se toma el del chofer o, si no tiene, el de la gandola. Si se escribe uno que no existe es error.
6. **Deshacer una importación:** no implementado (fase 4).

## 7. Lo que se hizo
| Parte | Archivos |
|---|---|
| Lógica de análisis sin Electron ni BD (probada) | `electron/import/viajesImport.js`, `electron/import/rutasImport.js` |
| Canales IPC: analizar (no guarda) y confirmar (transacción) | `electron/ipc/importIPC.js` (`import:analizarViajes`, `import:confirmarViajes`, `import:rutasSeleccionarArchivo`, `import:rutasAnalizar`, `import:rutasConfirmar`) |
| Modales de verificación | `src/components/import/ImportVerificacionViajes.jsx`, `src/components/import/ImportVerificacionRutas.jsx`, estilos `.imp-*` en `src/styles/app.css` |
| Pantallas | `src/views/HistorialViajesView.jsx`, `src/views/RutasView.jsx` |
| Pruebas | `tests/*.test.js` (`npm test`, sin dependencias nuevas) |

Pendiente aparte: al arrancar, `initDatabase` sigue ejecutando `importRutasFromExcel()` con el Excel incluido en el instalador, que sobrescribe precios sin preguntar ni marcarlos para sincronizar. No se ha tocado porque puede que se use para distribuir tarifas con cada versión.
