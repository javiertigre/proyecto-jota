-- Ejecutar en Supabase: SQL Editor.
-- Agrega el precio de remate a los productos para la pestaña Análisis.

ALTER TABLE productos_fardo
  ADD COLUMN IF NOT EXISTS precio_remate numeric;

-- Refresca la caché de esquema que usa la API (evita el error
-- "Could not find the 'precio_remate' column ... in the schema cache")
NOTIFY pgrst, 'reload schema';
