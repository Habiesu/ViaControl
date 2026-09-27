---
name: code-review-gatekeeper
description: >-
  Lista de verificación automatizada de calidad, sintaxis y rendimiento previa a finalizar un ciclo de trabajo.
---

# Skill: Code Review Gatekeeper

Esta habilidad establece una lista de verificación obligatoria que el agente debe validar antes de reportar un módulo o característica como completada.

## Checklist de Validación

1. **Sintaxis y Build**:
   - Ejecutar comprobación de build (`npx vite build`) y validación de sintaxis Node.js (`node --check`).
   - Verificar que no queden errores en consola ni advertencias críticas de módulos no encontrados.

2. **Integridad de Estilos**:
   - Verificar que los componentes utilicen tokens de diseño estándar del proyecto (fuente Inter, colores HSL/Variables CSS).
   - Evitar estilos hardcodeados dispersos o incompatibilidades entre modos de pantalla.

3. **Optimización de Imports**:
   - Eliminar dependencias o variables sin usar.
   - Mantener las rutas de importación ordenadas y relativas dentro de `src/`.

4. **Verificación de Ejecución en Vivo**:
   - Garantizar que la app levante sin pantallas blancas o excepciones de renderizado inicial (`npm start`).
