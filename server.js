require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Parseo mínimo de cookies (sin dependencias extra)
app.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    header.split(';').forEach(c => {
      const i = c.indexOf('=');
      if (i > -1) req.cookies[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
    });
  }
  next();
});

function setAuthCookies(res, session) {
  if (!session) return;
  const opts = { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 };
  res.cookie('sb-access-token', session.access_token, opts);
  if (session.refresh_token) {
    res.cookie('sb-refresh-token', session.refresh_token, opts);
  }
}

function clearAuthCookies(res) {
  res.clearCookie('sb-access-token', { path: '/' });
  res.clearCookie('sb-refresh-token', { path: '/' });
}

// Auth para API: responde 401 JSON en vez de redirect
async function requireAuth(req, res, next) {
  const access_token = req.cookies['sb-access-token'];
  const refresh_token = req.cookies['sb-refresh-token'];
  if (!access_token) return res.status(401).json({ error: 'No autenticado.' });

  let { data: { user }, error } = await supabase.auth.getUser(access_token);

  if ((error || !user) && refresh_token) {
    const { data, error: refreshError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (!refreshError && data.session) {
      setAuthCookies(res, data.session);
      user = data.session.user;
    }
  }

  if (!user) return res.status(401).json({ error: 'Sesión expirada.' });
  req.user = user;
  next();
}

// Subida de fotos (memoria, solo imágenes, máx 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Solo se permiten imágenes.'));
  }
});

// Comprimir foto al mínimo: máx 800px, JPEG calidad 60
async function comprimirFoto(buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 60 })
      .toBuffer();
  } catch (e) {
    return buffer;
  }
}

// Siguiente correlativo de un fardo (máx existente + 1)
async function siguienteCorrelativo(fardo_id) {
  const { data, error } = await supabase
    .from('productos_fardo')
    .select('correlativo')
    .eq('fardo_id', fardo_id)
    .order('correlativo', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data.length ? data[0].correlativo : 0) + 1;
}

function fotoUrl(ruta) {
  return ruta ? supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl : null;
}

// ---------- Auth ----------
app.post('/api/register', async (req, res) => {
  const { email, password, full_name } = req.body;
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name } }
  });
  if (error) return res.status(400).json({ error: error.message });
  if (data.session) setAuthCookies(res, data.session);
  res.json({ ok: true, user: data.user });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  setAuthCookies(res, data.session);
  res.json({ ok: true, user: data.user });
});

app.post('/api/logout', async (req, res) => {
  await supabase.auth.signOut();
  clearAuthCookies(res);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', req.user.id).single();
  res.json({ user: req.user, profile: profile || {} });
});

// ---------- Fardos ----------
app.get('/api/fardos', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('fardos').select('*').order('fecha_creacion', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ fardos: data || [] });
});

app.post('/api/fardos', requireAuth, async (req, res) => {
  const { codigo_fardo, nombre_fardo, valor_total_fardo, cantidad_productos_fardo } = req.body;
  if (!codigo_fardo || !nombre_fardo || valor_total_fardo === undefined || !cantidad_productos_fardo) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  const { data, error } = await supabase.from('fardos').insert({
    codigo_fardo: String(codigo_fardo).trim(),
    nombre_fardo: String(nombre_fardo).trim(),
    valor_total_fardo: Number(valor_total_fardo),
    cantidad_productos_fardo: parseInt(cantidad_productos_fardo, 10)
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, fardo: data });
});

app.get('/api/fardos/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('fardos').select('*').eq('id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Fardo no encontrado.' });
  res.json({ fardo: data });
});

app.put('/api/fardos/:id', requireAuth, async (req, res) => {
  const { codigo_fardo, nombre_fardo, valor_total_fardo, cantidad_productos_fardo } = req.body;
  if (!codigo_fardo || !nombre_fardo || valor_total_fardo === undefined || !cantidad_productos_fardo) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  const { data, error } = await supabase.from('fardos').update({
    codigo_fardo: String(codigo_fardo).trim(),
    nombre_fardo: String(nombre_fardo).trim(),
    valor_total_fardo: Number(valor_total_fardo),
    cantidad_productos_fardo: parseInt(cantidad_productos_fardo, 10)
  }).eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos (falta policy UPDATE).' });
  res.json({ ok: true, fardo: data[0] });
});

app.delete('/api/fardos/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('fardos').delete().eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos (falta policy DELETE).' });
  res.json({ ok: true });
});

app.get('/api/fardos/:id/siguiente', requireAuth, async (req, res) => {
  try {
    const { data: fardo, error: fErr } = await supabase
      .from('fardos').select('id, codigo_fardo').eq('id', req.params.id).single();
    if (fErr || !fardo) return res.status(404).json({ error: 'Fardo no encontrado.' });
    const siguiente = await siguienteCorrelativo(req.params.id);
    res.json({ siguiente, codigo_fardo: fardo.codigo_fardo, nombre_foto: String(siguiente).padStart(3, '0') + '-' + fardo.codigo_fardo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Productos ----------
app.get('/api/productos', requireAuth, async (req, res) => {
  const { data: fardos } = await supabase.from('fardos').select('id, codigo_fardo, nombre_fardo');
  const mapa = {};
  (fardos || []).forEach(f => { mapa[f.id] = f; });
  const { data, error } = await supabase
    .from('productos_fardo').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message, productos: [] });
  res.json({
    productos: (data || []).map(p => ({
      ...p,
      codigo_fardo: mapa[p.fardo_id] ? mapa[p.fardo_id].codigo_fardo : ('#' + p.fardo_id),
      nombre_fardo: mapa[p.fardo_id] ? mapa[p.fardo_id].nombre_fardo : '—',
      foto_url: fotoUrl(p.foto_ruta)
    }))
  });
});

app.post('/api/productos', requireAuth, upload.single('foto'), async (req, res) => {
  try {
    const { fardo_id, precio } = req.body;
    if (!fardo_id || !precio) return res.status(400).json({ error: 'Elige el fardo, toma la foto y pon el precio.' });
    if (!req.file) return res.status(400).json({ error: 'Debes tomar la foto del producto.' });

    const { data: fardo, error: fErr } = await supabase
      .from('fardos').select('id, codigo_fardo').eq('id', fardo_id).single();
    if (fErr || !fardo) return res.status(404).json({ error: 'Fardo no encontrado.' });

    const siguiente = await siguienteCorrelativo(fardo_id);
    const nombre_foto = String(siguiente).padStart(3, '0') + '-' + fardo.codigo_fardo;
    const foto_ruta = fardo.codigo_fardo + '/' + nombre_foto + '.jpg';

    const { error: upErr } = await supabase.storage
      .from('fotos').upload(foto_ruta, await comprimirFoto(req.file.buffer), { contentType: 'image/jpeg', upsert: false });
    if (upErr) return res.status(500).json({ error: 'No se pudo subir la foto: ' + upErr.message });

    const { data: ins, error: insErr } = await supabase.from('productos_fardo').insert({
      fardo_id: fardo.id, correlativo: siguiente, nombre_foto,
      precio: Number(precio), foto_ruta
    }).select().single();
    if (insErr || !ins) {
      await supabase.storage.from('fotos').remove([foto_ruta]);
      return res.status(403).json({ error: 'No se pudo registrar: ' + (insErr ? insErr.message : 'sin permiso.') });
    }
    res.json({ ok: true, producto: { ...ins, foto_url: fotoUrl(foto_ruta) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/productos/:id', requireAuth, async (req, res) => {
  const { data: producto, error } = await supabase.from('productos_fardo').select('*').eq('id', req.params.id).single();
  if (error || !producto) return res.status(404).json({ error: 'Producto no encontrado.' });
  const { data: fardo } = await supabase.from('fardos').select('codigo_fardo').eq('id', producto.fardo_id).single();
  res.json({ producto, codigo_fardo: fardo ? fardo.codigo_fardo : ('#' + producto.fardo_id), foto_url: fotoUrl(producto.foto_ruta) });
});

app.put('/api/productos/:id', requireAuth, upload.single('foto'), async (req, res) => {
  try {
    const { precio } = req.body;
    const { data: producto } = await supabase.from('productos_fardo').select('*').eq('id', req.params.id).single();
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
    if (!precio) return res.status(400).json({ error: 'El precio es obligatorio.' });

    const cambios = { precio: Number(precio) };
    if (req.file) {
      const ruta = producto.foto_ruta || (producto.nombre_foto + '.jpg');
      const { error: upErr } = await supabase.storage
        .from('fotos').upload(ruta, await comprimirFoto(req.file.buffer), { contentType: 'image/jpeg', upsert: true });
      if (upErr) return res.status(500).json({ error: 'No se pudo subir la foto: ' + upErr.message });
      cambios.foto_ruta = ruta;
    }

    const { data, error } = await supabase.from('productos_fardo').update(cambios).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(403).json({ error: error ? error.message : 'Sin permiso en la base de datos.' });
    res.json({ ok: true, producto: { ...data, foto_url: fotoUrl(data.foto_ruta) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/productos/:id', requireAuth, async (req, res) => {
  const { data: prod } = await supabase.from('productos_fardo').select('*').eq('id', req.params.id).single();
  const { data, error } = await supabase.from('productos_fardo').delete().eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  if (prod && prod.foto_ruta) await supabase.storage.from('fotos').remove([prod.foto_ruta]);
  res.json({ ok: true });
});

// ---------- Clientes ----------
app.get('/api/clientes', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('clientes').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message, clientes: [] });
  res.json({ clientes: data || [] });
});

app.post('/api/clientes', requireAuth, async (req, res) => {
  const { nombre, apellido_paterno, apellido_materno, ciudad, celular } = req.body;
  if (!nombre || !apellido_paterno || !celular) {
    return res.status(400).json({ error: 'Nombre, apellido paterno y celular son obligatorios.' });
  }
  const cel = String(celular).trim();
  const { data: existe } = await supabase.from('clientes').select('id').eq('celular', cel).limit(1);
  if (existe && existe.length) {
    return res.status(400).json({ error: '¡El cliente ya se encuentra registrado!' });
  }
  const { data, error } = await supabase.from('clientes').insert({
    nombre: String(nombre).trim(),
    apellido_paterno: String(apellido_paterno).trim(),
    apellido_materno: apellido_materno ? String(apellido_materno).trim() : null,
    ciudad: ciudad ? String(ciudad).trim() : null,
    celular: cel
  }).select().single();
  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: '¡El cliente ya se encuentra registrado!' });
    return res.status(400).json({ error: error.message });
  }
  res.json({ ok: true, cliente: data });
});

app.put('/api/clientes/:id', requireAuth, async (req, res) => {
  const { nombre, apellido_paterno, apellido_materno, ciudad, celular } = req.body;
  if (!nombre || !apellido_paterno || !celular) {
    return res.status(400).json({ error: 'Nombre, apellido paterno y celular son obligatorios.' });
  }
  const cel = String(celular).trim();
  const { data: otro } = await supabase.from('clientes').select('id').eq('celular', cel).neq('id', req.params.id).limit(1);
  if (otro && otro.length) {
    return res.status(400).json({ error: '¡El cliente ya se encuentra registrado!' });
  }
  const { data, error } = await supabase.from('clientes').update({
    nombre: String(nombre).trim(),
    apellido_paterno: String(apellido_paterno).trim(),
    apellido_materno: apellido_materno ? String(apellido_materno).trim() : null,
    ciudad: ciudad ? String(ciudad).trim() : null,
    celular: cel
  }).eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true, cliente: data[0] });
});

app.delete('/api/clientes/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('clientes').delete().eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true });
});

// ---------- Buses (empresas con varios destinos) ----------
app.get('/api/buses', requireAuth, async (req, res) => {
  const { data: empresas, error } = await supabase
    .from('empresas_bus').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message, empresas: [] });
  const ids = (empresas || []).map((e) => e.id);
  const mapa = {};
  if (ids.length) {
    const { data: dests, error: dErr } = await supabase.from('destinos_bus').select('*').in('empresa_id', ids).order('destino');
    if (dErr) return res.status(500).json({ error: dErr.message, empresas: [] });
    (dests || []).forEach((d) => { (mapa[d.empresa_id] = mapa[d.empresa_id] || []).push(d); });
  }
  res.json({ empresas: (empresas || []).map((e) => ({ ...e, destinos: mapa[e.id] || [] })) });
});

app.post('/api/buses', requireAuth, async (req, res) => {
  const { nombre, direccion, telefono, celular } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio.' });
  const { data, error } = await supabase.from('empresas_bus').insert({
    nombre: String(nombre).trim(),
    direccion: direccion ? String(direccion).trim() : null,
    telefono: telefono ? String(telefono).trim() : null,
    celular: celular ? String(celular).trim() : null
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, empresa: { ...data, destinos: [] } });
});

app.put('/api/buses/:id', requireAuth, async (req, res) => {
  const { nombre, direccion, telefono, celular } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio.' });
  const { data, error } = await supabase.from('empresas_bus').update({
    nombre: String(nombre).trim(),
    direccion: direccion ? String(direccion).trim() : null,
    telefono: telefono ? String(telefono).trim() : null,
    celular: celular ? String(celular).trim() : null
  }).eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true, empresa: data[0] });
});

app.delete('/api/buses/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('empresas_bus').delete().eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true });
});

app.post('/api/buses/:id/destinos', requireAuth, async (req, res) => {
  const { destino } = req.body;
  if (!destino || !String(destino).trim()) return res.status(400).json({ error: 'Escribe el destino.' });
  const { data, error } = await supabase.from('destinos_bus').insert({
    empresa_id: req.params.id,
    destino: String(destino).trim()
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, destino: data });
});

app.put('/api/destinos/:id', requireAuth, async (req, res) => {
  const { destino } = req.body;
  if (!destino || !String(destino).trim()) return res.status(400).json({ error: 'Escribe el destino.' });
  const { data, error } = await supabase.from('destinos_bus').update({ destino: String(destino).trim() }).eq('id', req.params.id).select().single();
  if (error || !data) return res.status(400).json({ error: error ? error.message : 'Sin permiso en la base de datos.' });
  res.json({ ok: true, destino: data });
});

app.delete('/api/destinos/:id', requireAuth, async (req, res) => {  const { data, error } = await supabase.from('destinos_bus').delete().eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true });
});

// ---------- Ubicaciones ----------
app.get('/api/ubicaciones', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('ubicaciones').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message, ubicaciones: [] });
  res.json({ ubicaciones: data || [] });
});

app.post('/api/ubicaciones', requireAuth, async (req, res) => {
  const { lugar, detalle } = req.body;
  if (!lugar || !String(lugar).trim()) return res.status(400).json({ error: 'El lugar es obligatorio.' });
  const { data, error } = await supabase.from('ubicaciones').insert({
    lugar: String(lugar).trim(),
    detalle: detalle ? String(detalle).trim() : null
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, ubicacion: data });
});

app.put('/api/ubicaciones/:id', requireAuth, async (req, res) => {
  const { lugar, detalle } = req.body;
  if (!lugar || !String(lugar).trim()) return res.status(400).json({ error: 'El lugar es obligatorio.' });
  const { data, error } = await supabase.from('ubicaciones').update({
    lugar: String(lugar).trim(),
    detalle: detalle ? String(detalle).trim() : null
  }).eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true, ubicacion: data[0] });
});

app.delete('/api/ubicaciones/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('ubicaciones').delete().eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true });
});

// ---------- Lugares de entrega ----------
app.get('/api/entregas', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('lugares_entrega').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message, entregas: [] });
  res.json({ entregas: data || [] });
});

app.post('/api/entregas', requireAuth, async (req, res) => {
  const { lugar, ciudad, detalle } = req.body;
  if (!lugar || !String(lugar).trim()) return res.status(400).json({ error: 'El nombre del lugar es obligatorio.' });
  if (!ciudad || !String(ciudad).trim()) return res.status(400).json({ error: 'La ciudad es obligatoria.' });
  const { data, error } = await supabase.from('lugares_entrega').insert({
    lugar: String(lugar).trim(),
    ciudad: String(ciudad).trim(),
    detalle: detalle ? String(detalle).trim() : null
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, entrega: data });
});

app.put('/api/entregas/:id', requireAuth, async (req, res) => {
  const { lugar, ciudad, detalle } = req.body;
  if (!lugar || !String(lugar).trim()) return res.status(400).json({ error: 'El nombre del lugar es obligatorio.' });
  if (!ciudad || !String(ciudad).trim()) return res.status(400).json({ error: 'La ciudad es obligatoria.' });
  const { data, error } = await supabase.from('lugares_entrega').update({
    lugar: String(lugar).trim(),
    ciudad: String(ciudad).trim(),
    detalle: detalle ? String(detalle).trim() : null
  }).eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true, entrega: data[0] });
});

app.delete('/api/entregas/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('lugares_entrega').delete().eq('id', req.params.id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(403).json({ error: 'Sin permiso en la base de datos.' });
  res.json({ ok: true });
});

// ---------- Ventas (una venta por producto) ----------
app.get('/api/ventas', requireAuth, async (req, res) => {
  const { fardo_id } = req.query;
  if (!fardo_id) return res.json({ items: [] });
  const { data: prods, error } = await supabase
    .from('productos_fardo').select('*').eq('fardo_id', fardo_id).order('correlativo');
  if (error) return res.status(500).json({ error: error.message });
  const ids = (prods || []).map((p) => p.id);
  const mapaV = {};
  if (ids.length) {
    const { data: ventas, error: vErr } = await supabase.from('ventas').select('*').in('producto_id', ids);
    if (vErr) return res.status(500).json({ error: vErr.message });
    (ventas || []).forEach((v) => { mapaV[v.producto_id] = v; });
  }
  const mapaU = {};
  const { data: ubis } = await supabase.from('ubicaciones').select('id, lugar, detalle');
  (ubis || []).forEach((u) => { mapaU[u.id] = u.detalle ? u.lugar + ' — ' + u.detalle : u.lugar; });
  res.json({
    items: (prods || []).map((p) => ({
      ...p,
      foto_url: fotoUrl(p.foto_ruta),
      venta: mapaV[p.id] ? { ...mapaV[p.id], ubicacion: mapaV[p.id].ubicacion_id ? (mapaU[mapaV[p.id].ubicacion_id] || '—') : '—' } : null
    }))
  });
});

app.post('/api/ventas', requireAuth, async (req, res) => {
  const { producto_id, fecha_venta, precio_venta, deposito_cliente, celular_cliente,
    nombre_cliente, ciudad, fecha_entrega, observacion, estado, ubicacion_id } = req.body;
  if (!producto_id) return res.status(400).json({ error: 'Falta el producto.' });
  if (!['P', 'D', 'E'].includes(estado)) return res.status(400).json({ error: 'Estado inválido (P, D o E).' });
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
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, venta: data });
});

// Última venta de un celular con estado distinto de Entregado (para autocompletar)
app.get('/api/ventas/por-celular', requireAuth, async (req, res) => {
  const { celular } = req.query;
  if (!celular) return res.json({ venta: null });
  const { data, error } = await supabase
    .from('ventas').select('*').eq('celular_cliente', String(celular).trim())
    .neq('estado', 'E').order('created_at', { ascending: false }).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !data.length) return res.json({ venta: null });
  const v = data[0];
  let ubicacion = '—';
  if (v.ubicacion_id) {
    const { data: u } = await supabase.from('ubicaciones').select('lugar, detalle').eq('id', v.ubicacion_id).single();
    if (u) ubicacion = u.detalle ? u.lugar + ' — ' + u.detalle : u.lugar;
  }
  res.json({ venta: { ...v, ubicacion } });
});

app.delete('/api/ventas/:producto_id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('ventas').delete().eq('producto_id', req.params.producto_id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ---------- Solicitudes de entrega (por celular) ----------
// Buscar productos vendidos a un celular + su solicitud de entrega
app.get('/api/solicitudes', requireAuth, async (req, res) => {
  const { celular, nombre, fecha_entrega } = req.query;
  const cel = celular ? String(celular).trim() : '';
  const nom = nombre ? String(nombre).trim() : '';
  const fec = fecha_entrega ? String(fecha_entrega).trim() : '';
  if (!cel && !nom && !fec) return res.json({ items: [] });
  let q = supabase.from('ventas').select('*');
  if (cel) q = q.eq('celular_cliente', cel);
  if (nom) q = q.ilike('nombre_cliente', '%' + nom + '%');
  // Búsqueda solo por fecha: fecha exacta (sin incluir vacías para no traer todo)
  if (fec && !cel && !nom) q = q.eq('fecha_entrega', fec);
  const { data: ventasQ, error: vErr } = await q.order('created_at', { ascending: false }).limit(200);
  if (vErr) return res.status(500).json({ error: vErr.message, items: [] });
  if (!ventasQ || !ventasQ.length) return res.json({ items: [] });
  // Con cliente + fecha: muestra los de esa fecha + los sin fecha (vacía)
  const ventas = (fec && (cel || nom)) ? ventasQ.filter((v) => !v.fecha_entrega || v.fecha_entrega === fec) : ventasQ;
  if (!ventas || !ventas.length) return res.json({ items: [] });

  const prodIds = ventas.map((v) => v.producto_id);
  // Paralelizar consultas independientes (antes eran 7 secuenciales)
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
  (ubis || []).forEach((u) => { mapaU[u.id] = u.detalle ? u.lugar + ' — ' + u.detalle : u.lugar; });

  const fardoIds = [...new Set((prods || []).map((p) => p.fardo_id))];
  // Resolver nombres de entrega en paralelo
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

  res.json({
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
  });
});

app.post('/api/solicitudes', requireAuth, async (req, res) => {
  const { producto_id, tipo, lugar_entrega_id, empresa_bus_id, destino_bus_id, detalle } = req.body;
  if (!producto_id) return res.status(400).json({ error: 'Falta el producto.' });
  if (!['LA_PAZ', 'PROVINCIA'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
  if (tipo === 'LA_PAZ' && !lugar_entrega_id) return res.status(400).json({ error: 'Elige el lugar de entrega.' });
  if (tipo === 'PROVINCIA' && (!empresa_bus_id || !destino_bus_id)) {
    return res.status(400).json({ error: 'Elige la empresa y el destino.' });
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
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, solicitud: data });
});

app.delete('/api/solicitudes/:producto_id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('solicitudes_entrega').delete().eq('producto_id', req.params.producto_id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Marcar venta como Entregada (E) grabando la fecha de entrega
app.post('/api/solicitudes/:producto_id/entregar', requireAuth, async (req, res) => {
  const { fecha_entrega } = req.body || {};
  const fecha = fecha_entrega && String(fecha_entrega).trim()
    ? String(fecha_entrega).trim()
    : new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('ventas').update({ estado: 'E', fecha_entrega: fecha }).eq('producto_id', req.params.producto_id).select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || !data.length) return res.status(404).json({ error: 'Venta no encontrada.' });
  res.json({ ok: true, venta: data[0] });
});

// ---------- Reporte de ventas por fechas (todos los fardos) ----------
app.get('/api/reportes/ventas', requireAuth, async (req, res) => {
  const { desde, hasta } = req.query;
  const d = desde ? String(desde).trim() : '';
  const h = hasta ? String(hasta).trim() : (d || '');
  if (!d) return res.json({ items: [], total_deposito: 0, total_venta: 0 });
  let q = supabase.from('ventas').select('*').gte('fecha_venta', d).lte('fecha_venta', h || d);
  const { data: ventas, error: vErr } = await q.order('fecha_venta').limit(1000);
  if (vErr) return res.status(500).json({ error: vErr.message, items: [] });
  if (!ventas || !ventas.length) return res.json({ items: [], total_deposito: 0, total_venta: 0 });

  const prodIds = [...new Set(ventas.map((v) => v.producto_id))];
  const [{ data: prods }, { data: ubis }] = await Promise.all([
    supabase.from('productos_fardo').select('*').in('id', prodIds),
    supabase.from('ubicaciones').select('id, lugar, detalle').limit(500)
  ]);
  const mapaP = {};
  (prods || []).forEach((p) => { mapaP[p.id] = p; });
  const mapaU = {};
  (ubis || []).forEach((u) => { mapaU[u.id] = u.detalle ? u.lugar + ' — ' + u.detalle : u.lugar; });
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
  const total_deposito = ventas.reduce((s, v) => s + (Number(v.deposito_cliente) || 0), 0);
  const total_venta = ventas.reduce((s, v) => s + (Number(v.precio_venta) || 0), 0);
  res.json({ items, total_deposito, total_venta });
});

// Errores de subida (multer) como JSON
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(400).json({ error: err.message });
  next(err);
});

// ---------- Frontend React (producción) ----------
app.use(express.static(path.join(__dirname, 'client', 'dist')));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`));
