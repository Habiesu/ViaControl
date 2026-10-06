# ViaControl | Sistema Integral de Gestión de Flota y Carga Pesada

<div align="center">

![Versión](https://img.shields.io/badge/Versi%C3%B3n-1.3.0-blue?style=for-the-badge)
![Plataforma](https://img.shields.io/badge/Plataforma-Windows%20x64-0078D6?style=for-the-badge&logo=windows)
![Arquitectura](https://img.shields.io/badge/Arquitectura-Offline--First-10B981?style=for-the-badge)
![Estado](https://img.shields.io/badge/Estado-Producci%C3%B3n-success?style=for-the-badge)

**Plataforma de escritorio para el control operativo, financiero y logístico de empresas de transporte de carga y flotas de gandolas.**

</div>

---

## 🚀 Novedades y Mejoras de la Versión 1.3.0

La versión **1.3.0** representa un salto arquitectónico mayor, transformando a ViaControl en un sistema con capacidad **Offline-First y Sincronización Automática en la Nube**, diseñado específicamente para empresas que operan con múltiples computadoras y terminales.

### 🌐 1. Sincronización Automática en la Nube (Multi-computadora)
- **Operación entre múltiples equipos**: Trabaja en una computadora principal y continúa en otra estación de trabajo; todos los viajes, choferes, gandolas, tarifas y gastos se sincronizan automáticamente.
- **Flujo Bidireccional Inteligente (Pull & Push)**: Al abrir la aplicación, el sistema descarga de inmediato los cambios realizados en otros equipos y respalda automáticamente los registros creados localmente.
- **Resolución de Conflictos LWW (Last-Write-Wins)**: Comparación automática por marcas de tiempo de modificación para mantener siempre la versión más actualizada.

### 🛡️ 2. Arquitectura Offline-First (100% Funcional sin Internet)
- Los datos se almacenan de manera local y ultrarrápida en el equipo del cliente.
- Si no hay conexión a internet o la red falla, la aplicación **sigue funcionando al 100%**: permite registrar viajes, consultar saldos, generar liquidaciones y realizar cierres contables sin interrupciones.
- En cuanto se restablece la conexión, todos los cambios pendientes se envían a la nube de forma transparente en segundo plano.

### 🔐 3. Gestión de Cuentas y Control de Acceso
- **Pantalla de Acceso Corporativo**: Nueva interfaz moderna con soporte para inicio de sesión y registro de nuevas cuentas de empresa.
- **Sesión Persistente y Segura**: La sesión se mantiene abierta entre reinicios del equipo.
- **Control de Cierre de Sesión (Logout)**: Botón directo en la barra lateral y en Ajustes para cerrar sesión cuando sea necesario.

### 📊 4. Indicador de Estado de la Nube en Tiempo Real
- Nuevo chip de telemetría en la barra lateral y botón de acción en la cabecera:
  - 🟢 **Nube al día**: Todo el sistema sincronizado y respaldado.
  - 🔵 **Sincronizando...**: Animación visual durante transferencias de datos.
  - 🟡 **X pendientes**: Muestra cuántos registros se han creado sin conexión.
  - ⚪ **Modo sin conexión**: Aviso visual de trabajo puramente local.
- Botón **"Sincronizar Ahora"** para forzar actualización inmediata con un clic.

### 🗄️ 5. Auditoría e Integridad Contable (Soft Delete)
- Implementación de borrado suave en todos los registros contables: si un registro se elimina en una máquina, la eliminación se propaga a la nube y a los demás equipos sin corromper el historial ni duplicar datos.
- Identificadores únicos globales (UUID) para interoperabilidad total.

### 💼 6. Interfaz Corporativa Marca Blanca (White-Label)
- Rediseño de textos, notificaciones y fichas técnicas: la experiencia visual está orientada completamente a la operativa del negocio, manteniendo la estética oscura de alta gama (*Dark Theme* con acentos azul y cyan).

---

## 📦 Módulos Principales de la Plataforma

| Módulo | Descripción Operativa |
|---|---|
| **Registro de Viajes** | Despacho de fletes con cálculo automático de tarifas, porcentaje de choferes, peajes, viáticos y combustible. |
| **Historial & Bitácora** | Monitoreo histórico de viajes con filtros por fecha, contenedor, placa de unidad y conductor. |
| **Liquidación Semanal** | Resumen financiero para choferes con deducciones automáticas y cálculo neto por pagar. |
| **Rentabilidad de Flota** | Panel P&L mensual por unidad: ingresos brutos, gastos operativos y margen de rentabilidad neta. |
| **Gestión IER** | Control de entregas de recaudación y validación de estados de cobro. |
| **Saldos de Agentes y Propietarios** | Control hermético de cuentas corrientes, aportes manuales y egresos asignados. |
| **Catálogo de Rutas y Tarifas** | Matriz dinámica de fletes por origen y destino con actualización en tiempo real. |
| **Gastos de Taller y Mantenimiento** | Registro de compras de repuestos, servicios mecánicos y reparaciones de flota. |
| **Ajustes del Sistema** | Centro de control de cuenta, ubicación de base de datos local y actualizador automático. |

---

## 📥 Instalación y Actualizaciones

1. Descarga el instalador oficial más reciente desde la sección de **[Releases](https://github.com/Habiesu/ViaControl/releases)**.
2. Ejecuta `ViaControl-Setup-1.3.0.exe` y sigue el asistente de instalación.
3. La aplicación cuenta con un **sistema de actualización automática**: cada vez que se publica una nueva versión, ViaControl la detecta, la descarga en segundo plano y notifica al usuario para instalarla con un solo clic.

---

<div align="center">
<sub>Desarrollado para la gestión eficiente y profesional del transporte de carga pesada.</sub>
</div>
