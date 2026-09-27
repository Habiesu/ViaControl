# Token Saver & Modular Execution Protocol

Este proyecto utiliza el protocolo **Token Saver** para maximizar la eficiencia en el uso de tokens y evitar límites de contexto o interrupciones.

## Directivas de Ejecución

1. **Ejecución por Partes (Modular)**:
   - Dividir refactorizaciones grandes o cambios extensos en sub-tareas pequeñas e independientes.
   - Ejecutar un módulo o vista a la vez.

2. **Edición Eficiente y Scripts de Scratch**:
   - Para cambios repetitivos o ediciones en bloques dispersos, utilizar scripts auxiliares temporales en la carpeta `scratch/` en lugar de enviar bloques masivos de reemplazo de texto.
   - Apuntar a rangos de líneas reducidos y precisos al utilizar herramientas de edición.

3. **Respuestas Concisas y Directas**:
   - Resumir de forma breve y ejecutiva los cambios realizados.
   - Evitar explicaciones redundantes o re-sintetizar grandes fragmentos de código.

4. **Verificación Rápida por Paso**:
   - Validar la sintaxis (`node --check`, etc.) al finalizar cada paso antes de continuar con el siguiente.
