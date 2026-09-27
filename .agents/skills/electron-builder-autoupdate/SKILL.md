---
name: electron-builder-autoupdate
description: >-
  Guía para configurar instaladores profesionales (NSIS/.exe) y actualizaciones automáticas con electron-builder y GitHub Releases.
---

# Skill: Electron Packaging & Auto-Updater

Esta habilidad guía al agente en la preparación de paquetes ejecutables e instaladores profesionales.

## Estructura y Configuración (`package.json` / `electron-builder.yml`)

1. **Instalador NSIS**:
   - Generar instalador ejecutable (`Setup.exe`) en lugar de binario portable.
   - Permitir al usuario elegir directorio de instalación y crear acceso directo en Escritorio y Menú Inicio.

2. **Auto-updater (`electron-updater`)**:
   - Configurar el proveedor de publicación (`provider: github`, `owner`, `repo`).
   - Integrar `autoUpdater.checkForUpdatesAndNotify()` en `main.js` durante la inicialización de la app.
   - Enviar eventos de progreso de descarga al Renderer a través de IPC para mostrar una barra de progreso limpia en la UI.

3. **Verificación de Build**:
   - Verificar la inclusión de `dist-renderer/` en los `files` del empaquetado final.
