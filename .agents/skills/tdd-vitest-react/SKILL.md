---
name: tdd-vitest-react
description: >-
  Metodología Test-Driven Development (TDD) para Vite + React 19 en el proyecto Kengo.
---

# Skill: TDD con Vitest y React 19

Esta habilidad define la estrategia de pruebas automatizadas en el frontend para garantizar refactorizaciones seguras sin romper funcionalidad existente.

## Flujo de Trabajo TDD

1. **Red (Fallo)**: Escribir una prueba unitaria corta antes de crear o modificar componentes de UI o helpers de cálculo.
2. **Green (Paso)**: Escribir el código mínimo necesario para que la prueba pase.
3. **Refactor (Mejora)**: Limpiar el código manteniendo la verdeidad de las pruebas.

## Reglas de Implementación

- **Componentes**: Probar renders de vistas (ej. `LiquidacionSemanalView`, `GastosExtraView`) simulando eventos de usuario (`@testing-library/user-event`).
- **Helpers y Módulos de Cálculo**: Pruebas unitarias directas sobre funciones puras (`src/utils/helpers.js`).
- **Mocks IPC**: Mockear la API expuesta por `preload.js` (`window.api`) para probar las vistas sin depender de SQLite en pruebas frontend.
