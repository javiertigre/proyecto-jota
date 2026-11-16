-- Registro de entregas (listado manual de clientes y lugares de recogida)
-- Ejecutar en Supabase: SQL Editor.

create table if not exists registro_entregas (
  id bigint generated always as identity primary key,
  cliente_id bigint references clientes(id) on delete set null,
  cliente_nombre text not null,
  cliente_celular text,
  lugar_entrega_id bigint references lugares_entrega(id) on delete set null,
  lugar_texto text not null,
  fecha_entrega date not null default current_date,
  estado text not null default 'P' check (estado in ('P', 'E')),
  observacion text,
  tipo text not null default 'LP',
  destino text,
  created_at timestamptz default now()
);

-- Columnas para distinguir entregas de La Paz y entregas al interior.
alter table registro_entregas
  add column if not exists tipo text not null default 'LP',
  add column if not exists destino text;

-- Asegurar que lugar_entrega_id y cliente_id permitan valores nulos (para entregas al interior o clientes manuales)
alter table registro_entregas
  alter column lugar_entrega_id drop not null;

alter table registro_entregas
  alter column cliente_id drop not null;

alter table registro_entregas drop constraint if exists registro_entregas_tipo_check;
alter table registro_entregas
  add constraint registro_entregas_tipo_check check (tipo in ('LP', 'INT'));

create index if not exists registro_entregas_fecha_idx
  on registro_entregas (fecha_entrega);

create index if not exists registro_entregas_tipo_idx
  on registro_entregas (tipo);

create index if not exists registro_entregas_cliente_idx
  on registro_entregas (cliente_nombre);

alter table registro_entregas enable row level security;
drop policy if exists "auth_full" on registro_entregas;
create policy "auth_full" on registro_entregas
  for all to authenticated using (true) with check (true);
