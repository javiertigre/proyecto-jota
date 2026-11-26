-- ============================================================
-- MÓDULO DE CUADRE: extractos bancarios (PDF)
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cuadre_registros (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha date NOT NULL,
  hora text,
  descripcion text,
  detalle text,
  transaccion text,
  ingreso numeric(14,2),
  gasto numeric(14,2),
  celular text,
  nombre_cliente text,
  cliente_id bigint,
  comprobado boolean NOT NULL DEFAULT false,
  archivo text,
  created_at timestamp with time zone DEFAULT now()
);

-- Evita duplicados al volver a subir el mismo extracto (no pisa lo ya editado)
CREATE UNIQUE INDEX IF NOT EXISTS cuadre_registros_unico
  ON public.cuadre_registros (fecha, hora, transaccion);

CREATE INDEX IF NOT EXISTS idx_cuadre_archivo ON public.cuadre_registros (archivo);

ALTER TABLE public.cuadre_registros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuadre lectura"    ON public.cuadre_registros;
DROP POLICY IF EXISTS "cuadre insertar"   ON public.cuadre_registros;
DROP POLICY IF EXISTS "cuadre actualizar" ON public.cuadre_registros;
DROP POLICY IF EXISTS "cuadre eliminar"   ON public.cuadre_registros;

CREATE POLICY "cuadre lectura" ON public.cuadre_registros
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "cuadre insertar" ON public.cuadre_registros
  AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "cuadre actualizar" ON public.cuadre_registros
  AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "cuadre eliminar" ON public.cuadre_registros
  AS PERMISSIVE FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.cuadre_registros TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cuadre_registros_id_seq TO anon, authenticated, service_role;
