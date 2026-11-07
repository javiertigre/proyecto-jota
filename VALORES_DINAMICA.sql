-- Ejecutar en Supabase: SQL Editor.
-- Crea la tabla para el módulo "Valor Dinámica" (Configuración).
-- Cada dinámica tiene un nombre único y su valor/precio.

CREATE TABLE IF NOT EXISTS valores_dinamica (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  valor numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Acceso total para usuarios logueados (igual que el resto del sistema)
ALTER TABLE valores_dinamica ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full" ON valores_dinamica;
CREATE POLICY "auth_full" ON valores_dinamica FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Refresca la caché de esquema que usa la API
NOTIFY pgrst, 'reload schema';
