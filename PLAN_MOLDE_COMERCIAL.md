# Plan: convertir ViaControl en un molde vendible a empresas

> Versión de partida: ViaControl v1.4.3 (Electron + React + SQLite local + sincronización con Supabase).
> Objetivo: que una sola base de código sirva para muchas empresas de transporte, cada una con su
> marca, sus datos aislados, sus usuarios y su licencia, sin tener que tocar el código por cliente.

---

## 1. Diagnóstico: qué hay hoy

### Fortalezas (lo que ya vale dinero)
| Área | Estado |
|---|---|
| Módulos de negocio | Completos: viajes, historial, liquidación semanal, rentabilidad por unidad, IER, saldos de agentes/propietarios, rutas y tarifas, gastos de taller, importación desde Excel. |
| Arquitectura offline-first | SQLite local + sincronización bidireccional con Supabase (LWW, soft delete, UUIDs). Funciona sin internet: es un argumento de venta fuerte. |
| Distribución | Instalador NSIS, icono propio y auto-actualización por GitHub Releases. |
| Seguridad en la nube | RLS activado en todas las tablas de Supabase. |

### Bloqueos para venderlo como molde
| # | Problema | Dónde | Por qué bloquea |
|---|---|---|---|
| 1 | **Datos aislados por usuario, no por empresa.** Todas las tablas usan `user_id = auth.uid()`. | `supabase_schema.sql` | Si una empresa tiene 3 empleados, cada uno ve datos distintos. No hay concepto de "empresa" ni de roles (dueño, operador, contador). |
| 2 | **Credenciales de Supabase fijas en el código.** | `electron/auth/authManager.js:6-7` | Todos los clientes usarían tu proyecto Supabase; no se puede dar a una empresa su propia instancia ni cambiar de proyecto sin recompilar. |
| 3 | **Marca fija.** "ViaControl" aparece 21 veces en 13 archivos, más iconos, colores, nombre del instalador, `appId` y repo de actualizaciones. | `package.json`, `main.js`, `index.html`, vistas | Cada cliente marca blanca requeriría editar a mano. |
| 4 | **Vocabulario y moneda fijos.** "Gandola" (513 apariciones), `formatUSD`, tarifas y categorías de gasto en el código; restos del nombre anterior "kengo". | `src/utils/helpers.js`, vistas, `electron/db/database.js` | Limita el mercado a Venezuela/gandolas; otras empresas dicen "camión", "tractomula", "unidad", y usan otras monedas. |
| 5 | **Seguridad de Electron débil.** `nodeIntegration: true` y `contextIsolation: false`. | `main.js:54-55, 97-98` | Es lo primero que revisa un cliente corporativo o un auditor; un XSS se convierte en control total del PC. |
| 6 | **Sin licencias.** Cualquiera que tenga el `.exe` puede registrarse y usarlo. | `LoginView`, `authManager` | No hay forma de cobrar, limitar usuarios/equipos ni cortar el acceso por impago. |
| 7 | **Sin pruebas automáticas.** `"test": "echo No tests"`. | `package.json` | Cada cambio para un cliente puede romper a los demás; el cálculo de liquidaciones y saldos es dinero. |
| 8 | **Esquema duplicado a mano** entre SQLite (`database.js`) y Supabase (`supabase_schema.sql`), con migraciones dentro del arranque. | `electron/db`, `electron/sync` | Difícil de mantener con varios clientes en versiones distintas. |
| 9 | **Solo Windows, sin firma digital.** | `package.json` (`build.win`) | Advertencia de "editor desconocido" al instalar; mala primera impresión. |

---

## 2. Decisión de modelo de negocio (antes de programar)

Hay tres formas de vender el molde. La recomendada es la **A**, porque el código ya está a medio camino.

| Modelo | Qué vendes | Ingresos | Esfuerzo técnico |
|---|---|---|---|
| **A. SaaS multiempresa (recomendado)** | Suscripción mensual por empresa o por unidad de flota; un solo Supabase con aislamiento por empresa. | Recurrente | Medio: multiempresa + licencias + panel de administración. |
| B. Marca blanca por cliente | Una compilación con el logo y nombre del cliente, y su propio Supabase. | Pago único + mantenimiento anual | Medio: configuración por cliente y pipeline de compilación. |
| C. Licencia del código fuente | El molde completo para que otra software house lo revenda. | Pago único alto | Bajo, pero pierdes control y clientes futuros. |

Se pueden combinar: **A** como producto estándar y **B** como plan "Enterprise" para quien quiera su marca y su servidor.

---

## 3. Plan por fases

### Fase 0 — Limpieza y base segura (1 semana)
1. Sacar `SUPABASE_URL` y `SUPABASE_ANON_KEY` del código a un archivo de configuración (`config/tenant.json` empaquetado + variables de compilación).
2. Activar `contextIsolation: true`, `nodeIntegration: false` y crear un `preload.js` que exponga solo los canales IPC necesarios (`window.api.viajes.crear(...)`, etc.).
3. Eliminar la migración "kengo" y otros restos del cliente original.
4. Añadir Vitest y pruebas de las funciones de dinero: cálculo de viaje, liquidación semanal, saldos de agentes/propietarios, rentabilidad mensual.
5. Corregir la licencia del `package.json` (hoy dice ISC, que permite copiar libremente) por una licencia propietaria.

**Resultado:** código que se puede enseñar a un cliente técnico sin vergüenza.

### Fase 1 — Multiempresa y roles (2–3 semanas)
1. Nuevas tablas en Supabase:
   - `empresas` (id, nombre, plan, estado, fecha_vencimiento, configuración).
   - `miembros_empresa` (empresa_id, user_id, rol: `dueño` | `admin` | `operador` | `contador` | `solo_lectura`).
2. Añadir `empresa_id` a las 9 tablas de negocio y cambiar las políticas RLS de `auth.uid() = user_id` a "el usuario es miembro de la empresa del registro". Mantener `user_id` como "creado por" para auditoría.
3. Script de migración que convierta los datos actuales: cada usuario existente pasa a ser dueño de su propia empresa.
4. En la app: pantalla de invitar empleados por correo, selector de empresa (si un usuario pertenece a varias) y ocultar módulos según rol (por ejemplo, el operador registra viajes pero no ve rentabilidad).
5. Ajustar `syncEngine.js` para filtrar y escribir por `empresa_id`.

**Resultado:** varias personas de la misma empresa trabajan sobre los mismos datos, cada una con su permiso.

### Fase 2 — Configuración por cliente: marca, vocabulario y moneda (1–2 semanas)
1. Archivo de configuración por empresa (guardado en la tabla `empresas` y en caché local):
   - Nombre comercial, logo, colores principales.
   - Vocabulario: `unidad` = "Gandola" / "Camión" / "Tractomula"; `conductor` = "Chofer" / "Conductor"; etc.
   - Moneda y formato (`USD`, `VES`, `COP`, `MXN`…), separadores decimales, zona horaria.
   - Categorías de gasto y porcentaje de comisión por defecto.
2. Reemplazar textos fijos por una función `t('unidad')` y `formatMoneda()` leídas de esa configuración.
3. Sustituir el Excel fijo `Listas_de_Precios_Fletes.xlsx` por una plantilla vacía descargable desde la app.
4. Encabezado de los informes impresos (IER, saldos, liquidaciones) con el logo y datos fiscales de la empresa cliente.

**Resultado:** el mismo instalador sirve para una empresa venezolana de gandolas y para una colombiana de tractomulas.

### Fase 3 — Licencias, cobro y alta de clientes (1–2 semanas)
1. Campo `estado` y `fecha_vencimiento` en `empresas`; la app lo comprueba al sincronizar y mantiene un periodo de gracia sin conexión (por ejemplo, 7 días) antes de pasar a modo solo lectura.
2. Límites por plan: número de usuarios, de unidades de flota y de equipos.
3. Registro con **prueba gratuita de 14–30 días** y datos de demostración opcionales (reutilizar `seeds.js`).
4. Pasarela de pago (Stripe, o una local si el mercado es Venezuela: Zelle/Binance/pago móvil con activación manual al principio).
5. **Panel de superadministrador** (una web sencilla o una vista oculta en la app) para ver empresas, activar o suspender, extender pruebas y ver uso.

**Resultado:** puedes cobrar y dejar de dar servicio a quien no paga.

### Fase 4 — Pipeline de marca blanca y distribución (1 semana)
1. Script `npm run build:cliente -- --cliente=acme` que tome `clientes/acme/` (logo, icono, nombre, `appId`, URL de Supabase, canal de actualizaciones) y genere su instalador.
2. Separar el repositorio de actualizaciones por cliente marca blanca, o usar un servidor propio (S3/R2) con canales.
3. Comprar un certificado de firma de código para Windows.
4. Opcional: compilaciones para macOS.

**Resultado:** entregar un cliente "Enterprise" con su propia marca toma horas, no días.

### Fase 5 — Material de venta (en paralelo, desde la Fase 2)
1. Instancia de demostración con datos ficticios realistas.
2. Página web de una sola pantalla: problema, módulos, capturas, precios, botón "Probar gratis".
3. Vídeo corto (2–3 min) registrando un viaje y mostrando la liquidación semanal y la rentabilidad.
4. Documentos: manual de usuario, términos de servicio, política de privacidad y acuerdo de tratamiento de datos (piden esto las empresas grandes).
5. Proceso de incorporación: importar choferes, unidades y rutas desde Excel el primer día.

### Fase 6 — Crecimiento (después de los primeros clientes de pago)
- Versión web o app móvil para que el chofer registre gastos y el dueño consulte desde el celular (Supabase ya lo permite).
- Exportación contable (Excel/PDF) y respaldo descargable.
- Generalizar el molde a otros sectores logísticos (mudanzas, cisternas, distribución) usando la configuración de vocabulario.

---

## 4. Calendario resumido

| Fase | Duración | Acumulado | Entregable |
|---|---|---|---|
| 0. Limpieza y seguridad | 1 sem | 1 sem | Código seguro y con pruebas |
| 1. Multiempresa y roles | 2–3 sem | 4 sem | Equipos de trabajo por empresa |
| 2. Marca, vocabulario, moneda | 1–2 sem | 6 sem | Producto configurable |
| 3. Licencias y cobro | 1–2 sem | 8 sem | Producto que se puede cobrar |
| 4. Marca blanca y firma | 1 sem | 9 sem | Instaladores por cliente |
| 5. Material de venta | en paralelo | — | Demo, web, vídeo, contratos |

**Mínimo para el primer cliente de pago:** Fases 0, 1 y 3 (unas 5–6 semanas). La Fase 2 puede hacerse a mano para ese primer cliente.

---

## 5. Costes recurrentes estimados
| Concepto | Coste |
|---|---|
| Supabase Pro (todas las empresas en un proyecto) | ~25 USD/mes |
| Certificado de firma de código | ~100–300 USD/año |
| Dominio + web | ~15–20 USD/año + hosting gratuito (Vercel/Netlify) |
| Pasarela de pago | Comisión por transacción |

---

## 6. Preguntas que conviene decidir
1. ¿Modelo A (suscripción), B (marca blanca por cliente) o ambos?
2. ¿Mercado objetivo: solo Venezuela o también otros países (afecta a moneda, vocabulario y pasarela de pago)?
3. ¿Cada cliente marca blanca tendrá su propio Supabase o todos compartirán el tuyo?
4. ¿Hace falta una versión móvil/web para el primer cliente, o basta con escritorio?
5. ¿Qué roles necesita realmente una empresa típica (dueño, despachador, contador, chofer)?
