---
name: supabase-rls
description: >-
  Guía experta para implementar Row Level Security (RLS) en Supabase/PostgreSQL.
  Úsala cuando el usuario necesite crear, revisar o depurar políticas RLS, diseñar
  esquemas multi-tenant seguros, optimizar el rendimiento de políticas, o auditar
  la seguridad de tablas en proyectos Supabase.
---

# Supabase Row Level Security (RLS)

RLS actúa como una cláusula `WHERE` automática que PostgreSQL añade a cada consulta,
garantizando que los usuarios sólo accedan a los datos que están autorizados a ver.

---

## 1. Reglas de Oro

| Regla | Descripción |
|-------|-------------|
| **Habilitar RLS por defecto** | Las tablas nuevas son públicas. Ejecuta siempre `ALTER TABLE tabla ENABLE ROW LEVEL SECURITY;` |
| **Nunca exponer `service_role`** | Esta clave bypasea RLS completamente. Sólo usa `anon` en el frontend. |
| **Mínimo privilegio** | Empieza con acceso cero (DEFAULT DENY) y añade políticas sólo cuando sean necesarias. |
| **Probar todo** | Verifica con usuarios autenticados Y anónimos que el acceso denegado realmente está bloqueado. |

---

## 2. Patrones de Políticas RLS

### A. El usuario posee sus propios datos
Ideal para perfiles, todos, configuraciones personales.

```sql
-- Habilitar RLS
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- Política completa (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "usuarios pueden gestionar sus propios datos"
ON todos
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### B. Lectura pública, escritura del propietario
Ideal para blogs, posts, contenido público.

```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer
CREATE POLICY "lectura publica"
ON posts FOR SELECT
USING (true);

-- Solo el propietario puede modificar
CREATE POLICY "propietario puede actualizar"
ON posts FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = author_id);

-- Solo el propietario puede eliminar
CREATE POLICY "propietario puede eliminar"
ON posts FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = author_id);
```

### C. Acceso por equipo (Multi-tenancy)
Ideal para SaaS, proyectos compartidos.

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "miembros del equipo pueden acceder al proyecto"
ON projects
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.team_id = projects.team_id
      AND team_members.user_id = (SELECT auth.uid())
  )
);
```

### D. Acceso basado en roles
Ideal para admin panels, dashboards.

```sql
-- Asumiendo que el rol está en los metadatos del JWT (app_metadata)
CREATE POLICY "solo admins pueden acceder"
ON admin_logs
FOR ALL
TO authenticated
USING (
  (SELECT auth.jwt() ->> 'role') = 'admin'
);

-- O usando una tabla de roles
CREATE POLICY "acceso por rol en tabla"
ON sensitive_data
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role IN ('admin', 'moderator')
  )
);
```

### E. Datos compartidos con acceso explícito
Ideal para documentos compartidos, archivos.

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "propietario y colaboradores pueden acceder"
ON documents
FOR SELECT
TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM document_shares
    WHERE document_shares.document_id = documents.id
      AND document_shares.user_id = (SELECT auth.uid())
  )
);
```

---

## 3. Optimización de Rendimiento

### ⚠️ Anti-patrón (lento) vs ✅ Patrón correcto (rápido)

```sql
-- ❌ MAL: auth.uid() se evalúa por cada fila
USING (auth.uid() = user_id)

-- ✅ BIEN: se evalúa una vez y se cachea
USING ((SELECT auth.uid()) = user_id)
```

### Índices recomendados

```sql
-- Siempre indexa las columnas usadas en políticas RLS
CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_projects_team_id ON projects(team_id);
CREATE INDEX idx_team_members_user_team ON team_members(user_id, team_id);
```

### Analizar rendimiento

```sql
-- Usar EXPLAIN ANALYZE para detectar cuellos de botella RLS
EXPLAIN ANALYZE SELECT * FROM todos WHERE id = 1;
```

---

## 4. Permisos de Base de Datos (GRANTS)

RLS controla las **filas**, pero los GRANTS controlan las **tablas**. Ambos son necesarios.

```sql
-- Dar permisos básicos a los roles de Supabase
GRANT SELECT, INSERT, UPDATE, DELETE ON todos TO authenticated;
GRANT SELECT ON todos TO anon; -- solo si es tabla pública

-- Revocar permisos por defecto (buena práctica)
REVOKE ALL ON todos FROM PUBLIC;
```

---

## 5. Funciones SECURITY DEFINER

Úsalas cuando necesites lógica compleja que no puede expresarse en políticas simples.

```sql
-- Función que corre con privilegios elevados pero de forma controlada
CREATE OR REPLACE FUNCTION get_my_team_projects()
RETURNS SETOF projects
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.* FROM projects p
  INNER JOIN team_members tm ON tm.team_id = p.team_id
  WHERE tm.user_id = auth.uid();
$$;
```

> ⚠️ **IMPORTANTE**: Siempre añade `SET search_path = public` a funciones SECURITY DEFINER para prevenir ataques de search path injection.

---

## 6. Testing de Políticas RLS

### En Supabase SQL Editor

```sql
-- Simular un usuario autenticado específico
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "user-uuid-aqui", "role": "authenticated"}';

-- Ahora las queries se ejecutan como ese usuario
SELECT * FROM todos; -- debe retornar solo los todos del usuario
```

### Verificar que RLS está habilitado

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

### Listar todas las políticas activas

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

## 7. Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `new row violates RLS policy` | `WITH CHECK` falla en INSERT/UPDATE | Verifica que los datos cumplen la política |
| Tabla vacía sin error | RLS activo sin políticas = 0 filas para todos | Añadir política `FOR SELECT` |
| Performance lenta | `auth.uid()` sin `SELECT` wrapper | Cambiar a `(SELECT auth.uid())` |
| `permission denied for table` | Faltan GRANTs | Ejecutar `GRANT` al rol correcto |
| Datos de otros usuarios visibles | Policy demasiado permisiva o RLS deshabilitado | Revisar políticas con `pg_policies` |

---

## 8. Checklist de Auditoría de Seguridad

Antes de ir a producción, verificar:

- [ ] ¿RLS habilitado en **todas** las tablas públicas?
- [ ] ¿No hay `service_role` expuesta en el frontend?
- [ ] ¿Las columnas filtradas en políticas tienen índices?
- [ ] ¿Se usa `(SELECT auth.uid())` en lugar de `auth.uid()` directamente?
- [ ] ¿Los GRANTs están configurados correctamente?
- [ ] ¿Las funciones SECURITY DEFINER tienen `SET search_path`?
- [ ] ¿Se probaron las políticas con usuarios reales (no solo en editor SQL)?
- [ ] ¿Existe una política DEFAULT DENY (no hay tabla sin políticas con RLS activo)?
