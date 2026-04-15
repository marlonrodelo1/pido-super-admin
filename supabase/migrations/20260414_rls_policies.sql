-- Row Level Security (RLS) Policies for Pidoo
-- Created: 2026-04-14
-- Purpose: Implement role-based data access control across core tables

-- ============================================================================
-- TABLE: pedidos
-- Descripción: Tabla de pedidos del sistema Pidoo
-- ============================================================================

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- POLÍTICA 1: Clientes pueden ver solo sus propios pedidos (usuario_id = auth.uid())
CREATE POLICY "clientes_ver_propios_pedidos" ON pedidos
  FOR SELECT
  USING (
    auth.uid() = usuario_id OR usuario_id IS NULL
  );

-- POLÍTICA 2: Clientes pueden insertar pedidos (cualquier usuario autenticado o anónimo)
-- Nota: Para soporte de tienda pública sin login, usar anon role de Supabase
CREATE POLICY "clientes_crear_pedidos" ON pedidos
  FOR INSERT
  WITH CHECK (true);

-- POLÍTICA 3: Restaurantes pueden ver pedidos de su establecimiento
CREATE POLICY "restaurantes_ver_pedidos_suyos" ON pedidos
  FOR SELECT
  USING (
    -- Verificar que el usuario es un restaurante con acceso al establecimiento
    EXISTS (
      SELECT 1 FROM establecimientos e
      WHERE e.id = pedidos.establecimiento_id
      AND e.user_id = auth.uid()
    )
  );

-- POLÍTICA 4: Restaurantes pueden actualizar solo pedidos de su establecimiento (estado, etc.)
CREATE POLICY "restaurantes_actualizar_pedidos_suyos" ON pedidos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM establecimientos e
      WHERE e.id = pedidos.establecimiento_id
      AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM establecimientos e
      WHERE e.id = pedidos.establecimiento_id
      AND e.user_id = auth.uid()
    )
  );

-- POLÍTICA 5: Socios pueden ver pedidos asignados a ellos (socio_id)
CREATE POLICY "socios_ver_pedidos_asignados" ON pedidos
  FOR SELECT
  USING (
    socio_id = (
      SELECT id FROM socios
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- POLÍTICA 6: Socios pueden actualizar estado de pedidos asignados a ellos
CREATE POLICY "socios_actualizar_pedidos_asignados" ON pedidos
  FOR UPDATE
  USING (
    socio_id = (
      SELECT id FROM socios
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    socio_id = (
      SELECT id FROM socios
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- POLÍTICA 7: Superadmin puede ver y modificar todos los pedidos
-- TODO: Verificar que el rol 'superadmin' está en user_metadata o en tabla usuarios
CREATE POLICY "superadmin_acceso_total_pedidos" ON pedidos
  FOR ALL
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- ============================================================================
-- TABLE: establecimientos
-- Descripción: Tabla de restaurantes y negocios
-- ============================================================================

ALTER TABLE establecimientos ENABLE ROW LEVEL SECURITY;

-- POLÍTICA 1: Lectura pública - cualquiera puede ver establecimientos activos
CREATE POLICY "publico_ver_establecimientos_activos" ON establecimientos
  FOR SELECT
  USING (activo = true);

-- POLÍTICA 2: El dueño restaurante puede ver su propio establecimiento
CREATE POLICY "restaurante_ver_propio_establecimiento" ON establecimientos
  FOR SELECT
  USING (user_id = auth.uid());

-- POLÍTICA 3: El dueño restaurante puede actualizar su establecimiento (datos básicos)
-- Permite actualizar: nombre, descripcion, telefono, horario, logo_url, banner_url, etc.
CREATE POLICY "restaurante_actualizar_propio_establecimiento" ON establecimientos
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- POLÍTICA 4: Solo superadmin puede crear establecimientos
CREATE POLICY "superadmin_crear_establecimientos" ON establecimientos
  FOR INSERT
  WITH CHECK (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- POLÍTICA 5: Solo superadmin puede eliminar establecimientos
CREATE POLICY "superadmin_eliminar_establecimientos" ON establecimientos
  FOR DELETE
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- POLÍTICA 6: Superadmin acceso total (actualizar cualquier establecimiento)
CREATE POLICY "superadmin_actualizar_establecimientos" ON establecimientos
  FOR UPDATE
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  )
  WITH CHECK (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- ============================================================================
-- TABLE: socios (Repartidores)
-- Descripción: Perfil de socios repartidores
-- ============================================================================

ALTER TABLE socios ENABLE ROW LEVEL SECURITY;

-- POLÍTICA 1: Un socio puede ver su propio perfil
CREATE POLICY "socio_ver_propio_perfil" ON socios
  FOR SELECT
  USING (user_id = auth.uid());

-- POLÍTICA 2: Un socio puede actualizar su propio perfil
CREATE POLICY "socio_actualizar_propio_perfil" ON socios
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- POLÍTICA 3: Un socio puede insertar su propio perfil (durante registro)
CREATE POLICY "socio_crear_propio_perfil" ON socios
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- POLÍTICA 4: Superadmin puede ver todos los socios
CREATE POLICY "superadmin_ver_todos_socios" ON socios
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- POLÍTICA 5: Superadmin puede modificar socios
CREATE POLICY "superadmin_modificar_socios" ON socios
  FOR ALL
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- ============================================================================
-- TABLE: usuarios
-- Descripción: Tabla de usuarios del sistema
-- ============================================================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- POLÍTICA 1: Un usuario puede ver su propio registro
CREATE POLICY "usuario_ver_propio_registro" ON usuarios
  FOR SELECT
  USING (id = auth.uid());

-- POLÍTICA 2: Un usuario puede actualizar su propio registro
CREATE POLICY "usuario_actualizar_propio_registro" ON usuarios
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- POLÍTICA 3: Superadmin puede ver todos los usuarios
CREATE POLICY "superadmin_ver_todos_usuarios" ON usuarios
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- POLÍTICA 4: Superadmin puede modificar usuarios
CREATE POLICY "superadmin_modificar_usuarios" ON usuarios
  FOR ALL
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- POLÍTICA 5: Cualquier usuario autenticado puede insertar su propio registro (durante signup)
CREATE POLICY "usuario_crear_propio_registro" ON usuarios
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- TABLE: comisiones
-- Descripción: Comisiones de la plataforma por pedidos
-- ============================================================================

ALTER TABLE comisiones ENABLE ROW LEVEL SECURITY;

-- POLÍTICA 1: Un socio puede ver sus propias comisiones
-- TODO: Verificar que la columna socio_id existe en la tabla comisiones
CREATE POLICY "socio_ver_propias_comisiones" ON comisiones
  FOR SELECT
  USING (
    socio_id = (
      SELECT id FROM socios
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- POLÍTICA 2: Un restaurante puede ver sus propias comisiones
-- TODO: Verificar que la columna establecimiento_id o similar existe
CREATE POLICY "restaurante_ver_propias_comisiones" ON comisiones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM establecimientos e
      WHERE e.id = comisiones.establecimiento_id
      AND e.user_id = auth.uid()
    )
  );

-- POLÍTICA 3: Superadmin puede ver todas las comisiones
CREATE POLICY "superadmin_ver_todas_comisiones" ON comisiones
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- POLÍTICA 4: Superadmin puede modificar comisiones
CREATE POLICY "superadmin_modificar_comisiones" ON comisiones
  FOR ALL
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'superadmin'
    OR
    (auth.jwt() ->> 'user_metadata' ->> 'rol') = 'superadmin'
  );

-- ============================================================================
-- NOTAS Y TODOs
-- ============================================================================
-- TODO: Verificar nombres exactos de columnas en cada tabla:
--   - pedidos: usuario_id, socio_id, establecimiento_id
--   - establecimientos: user_id, activo
--   - socios: user_id
--   - usuarios: id, rol
--   - comisiones: socio_id, establecimiento_id
--
-- TODO: Después de aplicar RLS, probar flujos:
--   1. Cliente sin login puede crear pedido (anon role)
--   2. Cliente logueado ve solo sus pedidos
--   3. Restaurante ve solo sus pedidos
--   4. Socio ve solo sus pedidos asignados
--   5. Superadmin ve todo
--
-- TODO: Si alguna tabla usa JWT claims custom, ajustar las políticas
--   al sistema de roles que uses (metadata vs tabla usuarios)
