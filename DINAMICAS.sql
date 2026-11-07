-- Ejecutar en Supabase: SQL Editor.
-- Crea/actualiza la tabla para el módulo "Dinámicas" (Configuración).

CREATE TABLE IF NOT EXISTS dinamicas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  celular_cliente text NOT NULL,
  nombre_completo text NOT NULL,
  monto_compra numeric,
  n_ticket text,
  fecha_compra date,
  dinamica_nombre text,
  valor_dinamica numeric,
  numero_desde integer,
  numero_hasta integer,
  ticket_entregado text DEFAULT 'Pendiente',
  created_at timestamptz DEFAULT now()
);

-- Por si la tabla ya existía sin las nuevas columnas
ALTER TABLE dinamicas ADD COLUMN IF NOT EXISTS dinamica_nombre text;
ALTER TABLE dinamicas ADD COLUMN IF NOT EXISTS valor_dinamica numeric;
ALTER TABLE dinamicas ADD COLUMN IF NOT EXISTS numero_desde integer;
ALTER TABLE dinamicas ADD COLUMN IF NOT EXISTS numero_hasta integer;
ALTER TABLE dinamicas ADD COLUMN IF NOT EXISTS ticket_entregado text DEFAULT 'Pendiente';

-- Acceso total para usuarios logueados (igual que el resto del sistema)
ALTER TABLE dinamicas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full" ON dinamicas;
CREATE POLICY "auth_full" ON dinamicas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Refresca la caché de esquema que usa la API
NOTIFY pgrst, 'reload schema';
