-- Ejecutar en Supabase: SQL Editor. Roles de usuario para Administrar Cuentas.
-- Roles: admin (Administrador, todo), registro (Cuenta de Registro), entregas (Cuenta de Entregas).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'registro';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- Las cuentas actuales pasan a ser Administrador
UPDATE profiles SET rol = 'admin' WHERE rol IS NULL OR rol = 'registro';
