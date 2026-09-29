-- Ejecutar en Supabase: SQL Editor. Habilita acceso directo del frontend (sin backend).
-- Da acceso total a usuarios logueados en todas las tablas del sistema.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','fardos','productos_fardo','clientes','empresas_bus','destinos_bus','ubicaciones','lugares_entrega','ventas','solicitudes_entrega']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_full" ON %I', t);
    EXECUTE format('CREATE POLICY "auth_full" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Fotos: lectura pública (links públicos) + escritura para logueados
DROP POLICY IF EXISTS "fotos_read" ON storage.objects;
CREATE POLICY "fotos_read" ON storage.objects FOR SELECT USING (bucket_id = 'fotos');

DROP POLICY IF EXISTS "fotos_insert" ON storage.objects;
CREATE POLICY "fotos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fotos');

DROP POLICY IF EXISTS "fotos_update" ON storage.objects;
CREATE POLICY "fotos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'fotos');

DROP POLICY IF EXISTS "fotos_delete" ON storage.objects;
CREATE POLICY "fotos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'fotos');
