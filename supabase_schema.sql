-- ==============================================================================
-- ESQUEMA COMPLETO PARA SUPABASE - VIACONTROL OFFLINE-FIRST
-- Ejecuta este script en Supabase Dashboard -> SQL Editor -> New Query
-- ==============================================================================

-- 1. EXTENSIÓN PARA UUIDs (gen_random_uuid está activo por defecto en Postgres moderno)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. FUNCIÓN PARA ACTUALIZAR AUTOMÁTICAMENTE 'updated_at'
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 3. TABLAS CON AUDITORÍA, MULTITENANCY (user_id) Y UUIDs
-- ------------------------------------------------------------------------------

-- Grupos_Propietarios
CREATE TABLE IF NOT EXISTS public.grupos_propietarios (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Propietarios
CREATE TABLE IF NOT EXISTS public.propietarios (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  contacto TEXT,
  id_grupo BIGINT,
  id_agente BIGINT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Agentes
CREATE TABLE IF NOT EXISTS public.agentes (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  contacto TEXT,
  id_propietario_vinculado BIGINT,
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Rutas
CREATE TABLE IF NOT EXISTS public.rutas (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  precio_base NUMERIC NOT NULL,
  activo INTEGER DEFAULT 1,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Choferes
CREATE TABLE IF NOT EXISTS public.choferes (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cedula TEXT,
  telefono TEXT,
  porcentaje_comision NUMERIC DEFAULT 10.0,
  id_propietario BIGINT,
  activo INTEGER DEFAULT 1,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Gandolas
CREATE TABLE IF NOT EXISTS public.gandolas (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  placa TEXT NOT NULL,
  modelo TEXT,
  marca TEXT,
  año TEXT,
  capacidad TEXT,
  id_propietario BIGINT,
  activo INTEGER DEFAULT 1,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Viajes
CREATE TABLE IF NOT EXISTS public.viajes (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  contenedor TEXT,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  id_gandola TEXT NOT NULL,
  id_chofer TEXT NOT NULL,
  id_propietario BIGINT,
  precio_viaje NUMERIC NOT NULL,
  pago_chofer NUMERIC NOT NULL,
  peajes NUMERIC DEFAULT 0,
  viaticos NUMERIC DEFAULT 0,
  gasoil NUMERIC DEFAULT 0,
  total_gastos NUMERIC NOT NULL,
  ganancia NUMERIC NOT NULL,
  estado TEXT DEFAULT 'Completado',
  notas TEXT,
  entregado INTEGER DEFAULT 0,
  pagado INTEGER DEFAULT 0,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Gastos_Extra
CREATE TABLE IF NOT EXISTS public.gastos_extra (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  id_chofer TEXT,
  id_gandola TEXT,
  id_viaje BIGINT,
  id_propietario BIGINT,
  id_agente BIGINT,
  categoria TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  monto NUMERIC NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Aportes_Propietarios
CREATE TABLE IF NOT EXISTS public.aportes_propietarios (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  id_propietario BIGINT,
  id_agente BIGINT,
  monto NUMERIC NOT NULL,
  concepto TEXT DEFAULT 'Entrega de Fondos',
  metodo_pago TEXT,
  referencia TEXT,
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- 4. TRIGGERS PARA UPDATED_AT
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'grupos_propietarios', 'propietarios', 'agentes', 'rutas',
    'choferes', 'gandolas', 'viajes', 'gastos_extra', 'aportes_propietarios'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) Y POLÍTICAS DE AISLAMIENTO POR USUARIO
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'grupos_propietarios', 'propietarios', 'agentes', 'rutas',
    'choferes', 'gandolas', 'viajes', 'gastos_extra', 'aportes_propietarios'
  ])
  LOOP
    -- Habilitar RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    
    -- Eliminar políticas previas si existen
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_policy', t);

    -- SELECT: solo los propios registros del usuario autenticado
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id)', t || '_select_policy', t);

    -- INSERT: el usuario autenticado solo puede insertar con su propio user_id
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t || '_insert_policy', t);

    -- UPDATE: solo puede actualizar sus propios registros
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t || '_update_policy', t);

    -- DELETE: solo puede eliminar sus propios registros
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id)', t || '_delete_policy', t);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. ÍNDICES DE RENDIMIENTO Y SINCRONIZACIÓN
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_grupos_user_updated ON public.grupos_propietarios(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_propietarios_user_updated ON public.propietarios(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_agentes_user_updated ON public.agentes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_rutas_user_updated ON public.rutas(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_choferes_user_updated ON public.choferes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_gandolas_user_updated ON public.gandolas(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_viajes_user_updated ON public.viajes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_gastos_user_updated ON public.gastos_extra(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_aportes_user_updated ON public.aportes_propietarios(user_id, updated_at);

-- ------------------------------------------------------------------------------
-- 7. PERMISOS DE TABLAS PARA LA API (ROLES ANON Y AUTHENTICATED)
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

