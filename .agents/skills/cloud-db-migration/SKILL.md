---
name: cloud-db-migration
description: >-
  Protocolo de arquitectura híbrida para migrar o sincronizar SQLite local con bases de datos en la nube (Supabase / PostgreSQL).
---

# Skill: Cloud Database Migration & Sync

Esta habilidad proporciona el protocolo técnico para migrar la arquitectura de datos local (SQLite) a un modelo de base de datos en la nube manteniendo resiliencia offline.

## Estrategia Híbrida (Offline-First + Sync)

1. **Capa de Abstracción de Base de Datos**:
   - Encapsular todas las consultas (`SELECT`, `INSERT`, `UPDATE`) detrás de una interfaz unificada de repositorio (`Repository Pattern`).
   - El Renderer nunca debe saber si los datos provienen de SQLite local o de la nube.

2. **Estrategia de Sincronización**:
   - **Local First**: Guardar cambios inmediatamente en SQLite local para respuesta instantánea de la UI.
   - **Background Queue**: Colocar operaciones en una cola de sincronización persistente.
   - **Cloud Sync**: Enviar mutaciones pendientes al backend (Supabase / PostgreSQL) cuando exista conexión activa a Internet.

3. **Autenticación y RLS (Row Level Security)**:
   - Implementar tokens JWT para sesiones de cliente/propietario.
   - Enforce RLS en PostgreSQL para garantizar que cada usuario solo acceda a los datos de sus vehículos/liquidaciones.
