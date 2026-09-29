// Cliente directo a Supabase (sin backend Express).
// Misma interfaz que antes (/api/...) para no tocar los componentes.
// Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY + políticas RLS (ver RLS.sql).
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function fotoUrl(ruta) {
  if (!ruta) return null;
  return supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl;
}

// Comprimir foto en el navegador: máx 800px, JPEG calidad 0.6 (antes lo hacía sharp)
async function comprimirFoto(file) {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const max = 800;
    const escala = Math.min(1, max / img.width);
    const w = Math.round(img.width * escala);
    const h = Math.round(img.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.6));
    return blob || file;
  } catch {
    return file;
  }
}

async function siguienteCorrelativo(fardo_id) {
  const { data, error } = await supabase
    .from('productos_fardo').select('correlativo')
    .eq('fardo_id', fardo_id).order('correlativo', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return (data && data.length ? data[0].correlativo : 0) + 1;
}

const esLaPaz = (ciudad) => String(ciudad || '').trim().toUpperCase() === 'LA PAZ';

// ---------- Auth ----------
async function me() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return { user, profile: profile || {} };
}

// ---------- Router: misma interfaz /api/... ----------
async function route(method, rawPath, body) {
  const u = new URL(rawPath, 'http://x');
  const path = u.pathname;
  const q = u.searchParams;
  let m;

  // ----- Auth -----
  if (method === 'POST' && path === '/api/register') {
    const { email, password, full_name } = body || {};
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name } }
    });
    if (error) throw new Error(error.message);
    return { ok: true, user: data.user };
  }
  if (method === 'POST' && path === '/api/login') {
    const { email, password } = body || {};
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { ok: true, user: data.user };
  }
  if (method === 'POST' && path === '/api/logout') {
    await supabase.auth.signOut();
    return { ok: true };
  }
  if (method === 'GET' && path === '/api/me') return me();

  // ----- Fardos -----
  if (method === 'GET' && path === '/api/fardos') {
    const { data, error } = await supabase.from('fardos').select('*').order('fecha_creacion', { ascending: false });
    if (error) throw new Error(error.message);
    return { fardos: data || [] };
  }
  if (method === 'POST' && path === '/api/fardos') {
    const { codigo_fardo, nombre_fardo, valor_total_fardo, cantidad_productos_fardo } = body || {};
    if (!codigo_fardo || !nombre_fardo || valor_total_fardo === undefined || !cantidad_productos_fardo) {
      throw new Error('Todos los campos son obligatorios.');
    }
    const { data, error } = await supabase.from('fardos').insert({
      codigo_fardo: String(codigo_fardo).trim(),
      nombre_fardo: String(nombre_fardo).trim(),
      valor_total_fardo: Number(valor_total_fardo),
      cantidad_productos_fardo: parseInt(cantidad_productos_fardo, 10)
    }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, fardo: data };
  }
  if ((m = path.match(/^\/api\/fardos\/([^/]+)\/siguiente$/)) && method === 'GET') {
    const { data: fardo, error: fErr } = await supabase
      .from('fardos').select('id, codigo_fardo').eq('id', m[1]).single();
    if (fErr || !fardo) throw new Error('Fardo no encontrado.');
    const siguiente = await siguienteCorrelativo(m[1]);
    return { siguiente, codigo_fardo: fardo.codigo_fardo, nombre_foto: String(siguiente).padStart(3, '0') + '-' + fardo.codigo_fardo };
  }
  if ((m = path.match(/^\/api\/fardos\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('fardos').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa las políticas RLS).');
      return { ok: true };
    }
    const { codigo_fardo, nombre_fardo, valor_total_fardo, cantidad_productos_fardo } = body || {};
    if (!codigo_fardo || !nombre_fardo || valor_total_fardo === undefined || !cantidad_productos_fardo) {
      throw new Error('Todos los campos son obligatorios.');
    }
    const { data, error } = await supabase.from('fardos').update({
      codigo_fardo: String(codigo_fardo).trim(),
      nombre_fardo: String(nombre_fardo).trim(),
      valor_total_fardo: Number(valor_total_fardo),
      cantidad_productos_fardo: parseInt(cantidad_productos_fardo, 10)
    }).eq('id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa las políticas RLS).');
    return { ok: true, fardo: data[0] };
  }

  // ----- Productos -----
  if (method === 'GET' && path === '/api/productos') {
    const { data: fardos } = await supabase.from('fardos').select('id, codigo_fardo, nombre_fardo');
    const mapa = {};
    (fardos || []).forEach((f) => { mapa[f.id] = f; });
    const { data, error } = await supabase
      .from('productos_fardo').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return {
      productos: (data || []).map((p) => ({
        ...p,
        codigo_fardo: mapa[p.fardo_id] ? mapa[p.fardo_id].codigo_fardo : ('#' + p.fardo_id),
        nombre_fardo: mapa[p.fardo_id] ? mapa[p.fardo_id].nombre_fardo : '—',
        foto_url: fotoUrl(p.foto_ruta)
      }))
    };
  }
  if (method === 'POST' && path === '/api/productos') {
    // body es FormData: fardo_id, precio, foto
    const fardo_id = body.get('fardo_id');
    const precio = body.get('precio');
    const foto = body.get('foto');
    if (!fardo_id || !precio) throw new Error('Elige el fardo, toma la foto y pon el precio.');
    if (!foto || !foto.size) throw new Error('Debes tomar la foto del producto.');
    const { data: fardo, error: fErr } = await supabase
      .from('fardos').select('id, codigo_fardo').eq('id', fardo_id).single();
    if (fErr || !fardo) throw new Error('Fardo no encontrado.');
    const siguiente = await siguienteCorrelativo(fardo_id);
    const nombre_foto = String(siguiente).padStart(3, '0') + '-' + fardo.codigo_fardo;
    const foto_ruta = fardo.codigo_fardo + '/' + nombre_foto + '.jpg';
    const { error: upErr } = await supabase.storage
      .from('fotos').upload(foto_ruta, await comprimirFoto(foto), { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error('No se pudo subir la foto: ' + upErr.message);
    const { data: ins, error: insErr } = await supabase.from('productos_fardo').insert({
      fardo_id: fardo.id, correlativo: siguiente, nombre_foto,
      precio: Number(precio), foto_ruta
    }).select().single();
    if (insErr || !ins) {
      await supabase.storage.from('fotos').remove([foto_ruta]);
      throw new Error('No se pudo registrar: ' + (insErr ? insErr.message : 'sin permiso (revisa RLS).'));
    }
    return { ok: true, producto: { ...ins, foto_url: fotoUrl(foto_ruta) } };
  }
  if ((m = path.match(/^\/api\/productos\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    const id = m[1];
    if (method === 'DELETE') {
      const { data: prod } = await supabase.from('productos_fardo').select('*').eq('id', id).single();
      const { data, error } = await supabase.from('productos_fardo').delete().eq('id', id).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      if (prod && prod.foto_ruta) await supabase.storage.from('fotos').remove([prod.foto_ruta]);
      return { ok: true };
    }
    // PUT con FormData: precio (+ foto opcional)
    const precio = body.get('precio');
    const foto = body.get('foto');
    const { data: producto } = await supabase.from('productos_fardo').select('*').eq('id', id).single();
    if (!producto) throw new Error('Producto no encontrado.');
    if (!precio) throw new Error('El precio es obligatorio.');
    const cambios = { precio: Number(precio) };
    if (foto && foto.size) {
      const ruta = producto.foto_ruta || (producto.nombre_foto + '.jpg');
      const { error: upErr } = await supabase.storage
        .from('fotos').upload(ruta, await comprimirFoto(foto), { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw new Error('No se pudo subir la foto: ' + upErr.message);
      cambios.foto_ruta = ruta;
    }
    const { data, error } = await supabase.from('productos_fardo').update(cambios).eq('id', id).select().single();
    if (error || !data) throw new Error(error ? error.message : 'Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, producto: { ...data, foto_url: fotoUrl(data.foto_ruta) } };
  }

  // ----- Clientes -----
  if (method === 'GET' && path === '/api/clientes') {
    const { data, error } = await supabase
      .from('clientes').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { clientes: data || [] };
  }
  if (method === 'POST' && path === '/api/clientes') {
    const { nombre, apellido_paterno, apellido_materno, ciudad, celular } = body || {};
    if (!nombre || !apellido_paterno || !celular) {
      throw new Error('Nombre, apellido paterno y celular son obligatorios.');
    }
    const cel = String(celular).trim();
    const { data: existe } = await supabase.from('clientes').select('id').eq('celular', cel).limit(1);
    if (existe && existe.length) throw new Error('¡El cliente ya se encuentra registrado!');
    const { data, error } = await supabase.from('clientes').insert({
      nombre: String(nombre).trim(),
      apellido_paterno: String(apellido_paterno).trim(),
      apellido_materno: apellido_materno ? String(apellido_materno).trim() : null,
      ciudad: ciudad ? String(ciudad).trim() : null,
      celular: cel
    }).select().single();
    if (error) {
      if (error.code === '23505') throw new Error('¡El cliente ya se encuentra registrado!');
      throw new Error(error.message);
    }
    return { ok: true, cliente: data };
  }
  if ((m = path.match(/^\/api\/clientes\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('clientes').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      return { ok: true };
    }
    const { nombre, apellido_paterno, apellido_materno, ciudad, celular } = body || {};
    if (!nombre || !apellido_paterno || !celular) {
      throw new Error('Nombre, apellido paterno y celular son obligatorios.');
    }
    const cel = String(celular).trim();
    const { data: otro } = await supabase.from('clientes').select('id').eq('celular', cel).neq('id', m[1]).limit(1);
    if (otro && otro.length) throw new Error('¡El cliente ya se encuentra registrado!');
    const { data, error } = await supabase.from('clientes').update({
      nombre: String(nombre).trim(),
      apellido_paterno: String(apellido_paterno).trim(),
      apellido_materno: apellido_materno ? String(apellido_materno).trim() : null,
      ciudad: ciudad ? String(ciudad).trim() : null,
      celular: cel
    }).eq('id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, cliente: data[0] };
  }

  // ----- Buses -----
  if (method === 'GET' && path === '/api/buses') {
    const { data: empresas, error } = await supabase
      .from('empresas_bus').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const ids = (empresas || []).map((e) => e.id);
    const mapa = {};
    if (ids.length) {
      const { data: dests, error: dErr } = await supabase.from('destinos_bus').select('*').in('empresa_id', ids).order('destino');
      if (dErr) throw new Error(dErr.message);
      (dests || []).forEach((d) => { (mapa[d.empresa_id] = mapa[d.empresa_id] || []).push(d); });
    }
    return { empresas: (empresas || []).map((e) => ({ ...e, destinos: mapa[e.id] || [] })) };
  }
  if (method === 'POST' && path === '/api/buses') {
    const { nombre, direccion, telefono, celular } = body || {};
    if (!nombre) throw new Error('El nombre de la empresa es obligatorio.');
    const { data, error } = await supabase.from('empresas_bus').insert({
      nombre: String(nombre).trim(),
      direccion: direccion ? String(direccion).trim() : null,
      telefono: telefono ? String(telefono).trim() : null,
      celular: celular ? String(celular).trim() : null
    }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, empresa: { ...data, destinos: [] } };
  }
  if ((m = path.match(/^\/api\/buses\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('empresas_bus').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      return { ok: true };
    }
    const { nombre, direccion, telefono, celular } = body || {};
    if (!nombre) throw new Error('El nombre de la empresa es obligatorio.');
    const { data, error } = await supabase.from('empresas_bus').update({
      nombre: String(nombre).trim(),
      direccion: direccion ? String(direccion).trim() : null,
      telefono: telefono ? String(telefono).trim() : null,
      celular: celular ? String(celular).trim() : null
    }).eq('id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, empresa: data[0] };
  }
  if ((m = path.match(/^\/api\/buses\/([^/]+)\/destinos$/)) && method === 'POST') {
    const { destino } = body || {};
    if (!destino || !String(destino).trim()) throw new Error('Escribe el destino.');
    const { data, error } = await supabase.from('destinos_bus').insert({
      empresa_id: m[1], destino: String(destino).trim()
    }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, destino: data };
  }
  if ((m = path.match(/^\/api\/destinos\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('destinos_bus').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      return { ok: true };
    }
    const { destino } = body || {};
    if (!destino || !String(destino).trim()) throw new Error('Escribe el destino.');
    const { data, error } = await supabase.from('destinos_bus').update({ destino: String(destino).trim() }).eq('id', m[1]).select().single();
    if (error || !data) throw new Error(error ? error.message : 'Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, destino: data };
  }

  // ----- Ubicaciones -----
  if (method === 'GET' && path === '/api/ubicaciones') {
    const { data, error } = await supabase
      .from('ubicaciones').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { ubicaciones: data || [] };
  }
  if (method === 'POST' && path === '/api/ubicaciones') {
    const { lugar, detalle } = body || {};
    if (!lugar || !String(lugar).trim()) throw new Error('El lugar es obligatorio.');
    const { data, error } = await supabase.from('ubicaciones').insert({
      lugar: String(lugar).trim(),
      detalle: detalle ? String(detalle).trim() : null
    }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, ubicacion: data };
  }
  if ((m = path.match(/^\/api\/ubicaciones\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('ubicaciones').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      return { ok: true };
    }
    const { lugar, detalle } = body || {};
    if (!lugar || !String(lugar).trim()) throw new Error('El lugar es obligatorio.');
    const { data, error } = await supabase.from('ubicaciones').update({
      lugar: String(lugar).trim(),
      detalle: detalle ? String(detalle).trim() : null
    }).eq('id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, ubicacion: data[0] };
  }

  // ----- Lugares de entrega -----
  if (method === 'GET' && path === '/api/entregas') {
    const { data, error } = await supabase
      .from('lugares_entrega').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { entregas: data || [] };
  }
  if (method === 'POST' && path === '/api/entregas') {
    const { lugar, ciudad, detalle } = body || {};
    if (!lugar || !String(lugar).trim()) throw new Error('El nombre del lugar es obligatorio.');
    if (!ciudad || !String(ciudad).trim()) throw new Error('La ciudad es obligatoria.');
    const { data, error } = await supabase.from('lugares_entrega').insert({
      lugar: String(lugar).trim(),
      ciudad: String(ciudad).trim(),
      detalle: detalle ? String(detalle).trim() : null
    }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, entrega: data };
  }
  if ((m = path.match(/^\/api\/entregas\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('lugares_entrega').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      return { ok: true };
    }
    const { lugar, ciudad, detalle } = body || {};
    if (!lugar || !String(lugar).trim()) throw new Error('El nombre del lugar es obligatorio.');
    if (!ciudad || !String(ciudad).trim()) throw new Error('La ciudad es obligatoria.');
    const { data, error } = await supabase.from('lugares_entrega').update({
      lugar: String(lugar).trim(),
      ciudad: String(ciudad).trim(),
      detalle: detalle ? String(detalle).trim() : null
    }).eq('id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, entrega: data[0] };
  }

  // ----- Ventas -----
  if (method === 'GET' && path === '/api/ventas') {
    const fardo_id = q.get('fardo_id');
    if (!fardo_id) return { items: [] };
    const { data: prods, error } = await supabase
      .from('productos_fardo').select('*').eq('fardo_id', fardo_id).order('correlativo');
    if (error) throw new Error(error.message);
    const ids = (prods || []).map((p) => p.id);
    const mapaV = {};
    if (ids.length) {
      const [{ data: ventas }, { data: ubis }] = await Promise.all([
        supabase.from('ventas').select('*').in('producto_id', ids),
        supabase.from('ubicaciones').select('id, lugar, detalle').limit(500)
      ]);
      const mapaU = {};
      (ubis || []).forEach((x) => { mapaU[x.id] = x.detalle ? x.lugar + ' — ' + x.detalle : x.lugar; });
      (ventas || []).forEach((v) => {
        mapaV[v.producto_id] = { ...v, ubicacion: v.ubicacion_id ? (mapaU[v.ubicacion_id] || '—') : '—' };
      });
    }
    return {
      items: (prods || []).map((p) => ({ ...p, foto_url: fotoUrl(p.foto_ruta), venta: mapaV[p.id] || null }))
    };
  }
  if (method === 'POST' && path === '/api/ventas') {
    const { producto_id, fecha_venta, precio_venta, deposito_cliente, celular_cliente,
      nombre_cliente, ciudad, fecha_entrega, observacion, estado, ubicacion_id } = body || {};
    if (!producto_id) throw new Error('Falta el producto.');
    if (!['P', 'D', 'E'].includes(estado)) throw new Error('Estado inválido (P, D o E).');
    const payload = {
      producto_id,
      fecha_venta: fecha_venta || null,
      precio_venta: precio_venta ? Number(precio_venta) : null,
      deposito_cliente: deposito_cliente ? Number(deposito_cliente) : null,
      celular_cliente: celular_cliente || null,
      nombre_cliente: nombre_cliente || null,
      ciudad: ciudad || null,
      fecha_entrega: fecha_entrega || null,
      observacion: observacion || null,
      estado,
      ubicacion_id: ubicacion_id || null
    };
    const { data, error } = await supabase.from('ventas').upsert(payload, { onConflict: 'producto_id' }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, venta: data };
  }
  if (method === 'GET' && path === '/api/ventas/por-celular') {
    const celular = q.get('celular');
    if (!celular) return { venta: null };
    const { data, error } = await supabase
      .from('ventas').select('*').eq('celular_cliente', String(celular).trim())
      .neq('estado', 'E').order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    if (!data || !data.length) return { venta: null };
    const v = data[0];
    let ubicacion = '—';
    if (v.ubicacion_id) {
      const { data: x } = await supabase.from('ubicaciones').select('lugar, detalle').eq('id', v.ubicacion_id).single();
      if (x) ubicacion = x.detalle ? x.lugar + ' — ' + x.detalle : x.lugar;
    }
    return { venta: { ...v, ubicacion } };
  }

  // ----- Solicitudes de entrega -----
  if (method === 'GET' && path === '/api/solicitudes') {
    const cel = (q.get('celular') || '').trim();
    const nom = (q.get('nombre') || '').trim();
    const fec = (q.get('fecha_entrega') || '').trim();
    if (!cel && !nom && !fec) return { items: [] };
    let qq = supabase.from('ventas').select('*');
    if (cel) qq = qq.eq('celular_cliente', cel);
    if (nom) qq = qq.ilike('nombre_cliente', '%' + nom + '%');
    if (fec && !cel && !nom) qq = qq.eq('fecha_entrega', fec);
    const { data: ventasQ, error: vErr } = await qq.order('created_at', { ascending: false }).limit(200);
    if (vErr) throw new Error(vErr.message);
    if (!ventasQ || !ventasQ.length) return { items: [] };
    const ventas = (fec && (cel || nom)) ? ventasQ.filter((v) => !v.fecha_entrega || v.fecha_entrega === fec) : ventasQ;
    if (!ventas.length) return { items: [] };
    const prodIds = ventas.map((v) => v.producto_id);
    const [{ data: prods }, { data: sols }, { data: ubis }] = await Promise.all([
      supabase.from('productos_fardo').select('*').in('id', prodIds),
      supabase.from('solicitudes_entrega').select('*').in('producto_id', prodIds),
      supabase.from('ubicaciones').select('id, lugar, detalle').limit(500)
    ]);
    const mapaP = {};
    (prods || []).forEach((p) => { mapaP[p.id] = p; });
    const mapaS = {};
    (sols || []).forEach((s) => { mapaS[s.producto_id] = s; });
    const mapaU = {};
    (ubis || []).forEach((x) => { mapaU[x.id] = x.detalle ? x.lugar + ' — ' + x.detalle : x.lugar; });
    const fardoIds = [...new Set((prods || []).map((p) => p.fardo_id))];
    const lugarIds = [...new Set((sols || []).map((s) => s.lugar_entrega_id).filter(Boolean))];
    const empIds = [...new Set((sols || []).map((s) => s.empresa_bus_id).filter(Boolean))];
    const destIds = [...new Set((sols || []).map((s) => s.destino_bus_id).filter(Boolean))];
    const [rFardos, rLugares, rEmps, rDests] = await Promise.all([
      fardoIds.length ? supabase.from('fardos').select('id, codigo_fardo, nombre_fardo').in('id', fardoIds) : { data: [] },
      lugarIds.length ? supabase.from('lugares_entrega').select('id, lugar, ciudad, detalle').in('id', lugarIds) : { data: [] },
      empIds.length ? supabase.from('empresas_bus').select('id, nombre').in('id', empIds) : { data: [] },
      destIds.length ? supabase.from('destinos_bus').select('id, destino').in('id', destIds) : { data: [] }
    ]);
    const mapaF = {};
    ((rFardos || {}).data || []).forEach((f) => { mapaF[f.id] = f; });
    const mapaL = {};
    ((rLugares || {}).data || []).forEach((l) => { mapaL[l.id] = (l.lugar || '') + ' — ' + (l.ciudad || '') + (l.detalle ? ' (' + l.detalle + ')' : ''); });
    const mapaE = {};
    ((rEmps || {}).data || []).forEach((e) => { mapaE[e.id] = e.nombre; });
    const mapaD = {};
    ((rDests || {}).data || []).forEach((d) => { mapaD[d.id] = d.destino; });
    return {
      items: ventas.map((v) => {
        const p = mapaP[v.producto_id] || {};
        const f = mapaF[p.fardo_id] || {};
        const s = mapaS[v.producto_id] || null;
        let entrega_texto = '—';
        if (s) {
          if (s.tipo === 'LA_PAZ') entrega_texto = mapaL[s.lugar_entrega_id] || '—';
          else entrega_texto = (mapaE[s.empresa_bus_id] || '—') + ' → ' + (mapaD[s.destino_bus_id] || '—');
        }
        return {
          producto_id: v.producto_id,
          correlativo: p.correlativo,
          nombre_foto: p.nombre_foto,
          precio: p.precio,
          foto_url: fotoUrl(p.foto_ruta),
          codigo_fardo: f.codigo_fardo || '',
          nombre_fardo: f.nombre_fardo || '',
          venta: { ...v, ubicacion: v.ubicacion_id ? (mapaU[v.ubicacion_id] || '—') : '—' },
          entrega: s,
          entrega_texto
        };
      })
    };
  }
  if (method === 'POST' && path === '/api/solicitudes') {
    const { producto_id, tipo, lugar_entrega_id, empresa_bus_id, destino_bus_id, detalle } = body || {};
    if (!producto_id) throw new Error('Falta el producto.');
    if (!['LA_PAZ', 'PROVINCIA'].includes(tipo)) throw new Error('Tipo inválido.');
    if (tipo === 'LA_PAZ' && !lugar_entrega_id) throw new Error('Elige el lugar de entrega.');
    if (tipo === 'PROVINCIA' && (!empresa_bus_id || !destino_bus_id)) {
      throw new Error('Elige la empresa y el destino.');
    }
    const { data: venta } = await supabase.from('ventas').select('celular_cliente').eq('producto_id', producto_id).single();
    const payload = {
      producto_id,
      celular_cliente: venta ? venta.celular_cliente : null,
      tipo,
      lugar_entrega_id: tipo === 'LA_PAZ' ? lugar_entrega_id : null,
      empresa_bus_id: tipo === 'PROVINCIA' ? empresa_bus_id : null,
      destino_bus_id: tipo === 'PROVINCIA' ? destino_bus_id : null,
      detalle: detalle ? String(detalle).trim() : null
    };
    const { data, error } = await supabase.from('solicitudes_entrega').upsert(payload, { onConflict: 'producto_id' }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, solicitud: data };
  }
  if ((m = path.match(/^\/api\/solicitudes\/([^/]+)\/entregar$/)) && method === 'POST') {
    const fecha = body && body.fecha_entrega && String(body.fecha_entrega).trim()
      ? String(body.fecha_entrega).trim()
      : new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from('ventas').update({ estado: 'E', fecha_entrega: fecha }).eq('producto_id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Venta no encontrada.');
    return { ok: true, venta: data[0] };
  }

  // ----- Reporte de ventas por fechas -----
  if (method === 'GET' && path === '/api/reportes/ventas') {
    const d = (q.get('desde') || '').trim();
    const h = (q.get('hasta') || '').trim() || d;
    if (!d) return { items: [], total_deposito: 0, total_venta: 0 };
    const { data: ventas, error: vErr } = await supabase
      .from('ventas').select('*').gte('fecha_venta', d).lte('fecha_venta', h).order('fecha_venta').limit(1000);
    if (vErr) throw new Error(vErr.message);
    if (!ventas || !ventas.length) return { items: [], total_deposito: 0, total_venta: 0 };
    const prodIds = [...new Set(ventas.map((v) => v.producto_id))];
    const [{ data: prods }, { data: ubis }] = await Promise.all([
      supabase.from('productos_fardo').select('*').in('id', prodIds),
      supabase.from('ubicaciones').select('id, lugar, detalle').limit(500)
    ]);
    const mapaP = {};
    (prods || []).forEach((p) => { mapaP[p.id] = p; });
    const mapaU = {};
    (ubis || []).forEach((x) => { mapaU[x.id] = x.detalle ? x.lugar + ' — ' + x.detalle : x.lugar; });
    const fardoIds = [...new Set((prods || []).map((p) => p.fardo_id))];
    const { data: fardos } = fardoIds.length
      ? await supabase.from('fardos').select('id, codigo_fardo, nombre_fardo').in('id', fardoIds)
      : { data: [] };
    const mapaF = {};
    (fardos || []).forEach((f) => { mapaF[f.id] = f; });
    const items = ventas.map((v) => {
      const p = mapaP[v.producto_id] || {};
      const f = mapaF[p.fardo_id] || {};
      return {
        fecha_venta: v.fecha_venta,
        codigo: p.nombre_foto || '',
        fardo: f.codigo_fardo ? (f.codigo_fardo + ' — ' + (f.nombre_fardo || '')) : '',
        precio_original: p.precio ?? '',
        precio_venta: v.precio_venta,
        deposito: v.deposito_cliente,
        cliente: v.nombre_cliente || '',
        celular: v.celular_cliente || '',
        ciudad: v.ciudad || '',
        estado: v.estado || '',
        ubicacion: v.ubicacion_id ? (mapaU[v.ubicacion_id] || '') : '',
        observacion: v.observacion || '',
        fecha_entrega: v.fecha_entrega || '',
        foto_url: fotoUrl(p.foto_ruta)
      };
    });
    return {
      items,
      total_deposito: ventas.reduce((s, v) => s + (Number(v.deposito_cliente) || 0), 0),
      total_venta: ventas.reduce((s, v) => s + (Number(v.precio_venta) || 0), 0)
    };
  }

  throw new Error('Ruta no soportada: ' + method + ' ' + path);
}

async function run(method, path, body) {
  try {
    return await route(method, path, body);
  } catch (e) {
    // Sin conexión a Supabase (red caída/DNS) → mensaje claro
    if (e instanceof TypeError || /Failed to fetch|NetworkError|fetch failed/i.test(e.message || '')) {
      throw new Error('No se pudo conectar con Supabase. Revisa tu internet.');
    }
    throw e;
  }
}

export const api = {
  get: (path) => run('GET', path),
  post: (path, body) => run('POST', path, body),
  put: (path, body) => run('PUT', path, body),
  del: (path) => run('DELETE', path),
  // multipart (fotos): sin Content-Type manual
  postForm: (path, formData) => run('POST', path, formData),
  putForm: (path, formData) => run('PUT', path, formData)
};

export { supabase };
