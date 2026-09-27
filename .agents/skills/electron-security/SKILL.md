---
name: electron-security
description: >-
  Guía de mejores prácticas de seguridad para aplicaciones Electron: aislamiento de contexto, CSP, sanitización y manejo seguro de canales IPC.
---

# Skill: Electron Security & IPC Hardening

Esta habilidad proporciona directrices rigurosas para auditar y mantener la seguridad en aplicaciones Electron.

## Principios Fundamentales

1. **Aislamiento de Contexto (`contextIsolation`)**:
   - `contextIsolation: true` debe estar siempre habilitado en `webPreferences`.
   - `nodeIntegration: false` debe estar deshabilitado en el proceso de renderizado.
   - El puente de comunicación se realiza **únicamente** a través de `preload.js` con `contextBridge.exposeInMainWorld`.

2. **Seguridad en Canales IPC**:
   - Evitar exponer métodos genéricos como `ipcRenderer.send` o `ipcRenderer.on` directamente al Renderer.
   - Validar y sanitizar todos los argumentos recibidos en `ipcMain.handle(...)` antes de procesarlos o pasarlos a la base de datos (prevención de Inyección SQL/Comandos).
   - Utilizar funciones específicas y con tipos/validaciones explícitas en `preload.js`.

3. **Content Security Policy (CSP)**:
   - Configurar encabezados HTTP o etiquetas `<meta>` CSP estrictas en `index.html`.
   - Restringir la ejecución de scripts remotos no autorizados (`script-src 'self'`).

4. **Prevención de Navegación Externa**:
   - Interceptar eventos de navegación (`will-navigate` y `setWindowOpenHandler`) para evitar que la ventana abra URLs externas no deseadas dentro de la app Electron.
