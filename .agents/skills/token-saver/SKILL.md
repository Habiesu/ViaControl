---
name: token-saver
description: >-
  Metodología de trabajo modular y eficiente para reducir el consumo de tokens,
  evitar desbordamiento de contexto y ejecutar cambios grandes de forma limpia y por partes.
---

# Skill: Token Saver (Estrategia de Optimización de Tokens)

Esta habilidad le enseña al agente a trabajar con el máximo ahorro de tokens en cualquier desarrollo o refactorización.

## Estrategia de Trabajo

1. **Descomposición Modular de Tareas**:
   - Cuando una solicitud abarque múltiples componentes, módulos o vistas, dividir el trabajo en iteraciones pequeñas.
   - Completar un módulo a la vez, verificar sintaxis/correcto funcionamiento, y reportar avances muy brevemente.

2. **Uso de Scripts Auxiliares (`scratch/`)**:
   - Para transformaciones de código masivas (ej. reemplazo de iconos, limpieza de textos, refactorización de estilos), ejecutar scripts rápidos de Node.js creados en `scratch/` que operen sobre el disco.
   - Esto evita transmitir miles de líneas de código dentro del contexto del modelo.

3. **Ediciones de Archivo Focalizadas**:
   - Limitar `replace_file_content` a bloques pequeños y específicos.
   - Evitar reemplazar archivos completos cuando solo cambian partes aisladas.

4. **Comunicación Ejecutiva**:
   - Mantener las respuestas cortas, estructuradas en viñetas y centradas en los resultados tangibles.
