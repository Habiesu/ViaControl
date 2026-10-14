---
name: token-saver
description: >-
  Metodología de trabajo modular y eficiente para reducir el consumo de tokens,
  evitar desbordamiento de contexto y ejecutar cambios grandes de forma limpia y por partes.
---

# Skill: Token Saver

## Reglas de Respuesta (SIEMPRE aplicar)

1. **Respuestas cortas por defecto**: Máximo 5 líneas de texto libre. Sin explicaciones redundantes ni re-sintetizar lo que ya se hizo.
2. **Sin bloques de código en respuesta** a menos que el usuario pida ver el código explícitamente.
3. **Resumen ejecutivo post-edición**: Solo listar qué archivos se tocaron y el efecto neto. Ejemplo: `✅ database.js — migración añadida`.
4. **No repetir el plan antes de ejecutarlo**: Ejecutar directamente y reportar resultado.
5. **Tablas solo si hay 3+ ítems comparables**. Evitar tablas de 1-2 filas.

## Estrategia de Edición

1. **Modular**: Un archivo/módulo por turno. Verificar sintaxis antes de continuar.
2. **Scripts en `scratch/`**: Para transformaciones masivas (>50 líneas cambiadas), crear un script Node.js temporal en lugar de enviar bloques enormes de texto.
3. **`multi_replace_file_content`**: Preferir sobre reemplazos de archivo completo. Apuntar a rangos de ≤30 líneas por chunk.
4. **Leer antes de editar**: Siempre `grep_search` o `view_file` del rango exacto antes de hacer un reemplazo.

## Estrategia de Investigación

- Usar `grep_search` antes de `view_file` para localizar exactamente qué líneas leer.
- Leer rangos pequeños (≤80 líneas) en lugar de archivos completos.
- Si el archivo es grande, leer solo la función/sección relevante.

## Comunicación Ejecutiva

- ✅ Correcto: `Fix aplicado en saldosIPC.js — sort usa real_id numérico.`
- ❌ Incorrecto: Párrafos explicando qué hace el sort, por qué es mejor, y re-mostrando el código.
