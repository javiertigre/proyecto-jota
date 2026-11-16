-- Tabla de ciudades y destinos (Configuración -> Registro de Destinos)
-- Ejecutar en Supabase: SQL Editor.

CREATE TABLE IF NOT EXISTS ciudades (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ciudad text NOT NULL,
  departamento text,
  detalle text,
  created_at timestamptz DEFAULT now()
);

-- Índice para búsquedas rápidas por ciudad
CREATE INDEX IF NOT EXISTS ciudades_ciudad_idx ON ciudades (ciudad);

-- Acceso total para usuarios autenticados
ALTER TABLE ciudades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full" ON ciudades;
CREATE POLICY "auth_full" ON ciudades FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Notificar a PostgREST para recargar la caché de esquema
NOTIFY pgrst, 'reload schema';
