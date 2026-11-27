// Cliente directo a Supabase (sin backend Express).
// Misma interfaz que antes (/api/...) para no tocar los componentes.
// Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY + políticas RLS (ver RLS.sql).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_DEFAULT = 'https://weublsjmlnwuuragbofa.supabase.co';
const SUPABASE_KEY_DEFAULT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndldWJsc2ptbG53dXVyYWdib2ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1ODA4MzksImV4cCI6MjEwNjE1NjgzOX0.9xAhZd_5Wh3cmyegt00mLsNFbYKpCJUBZRQa4z2s4AQ';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = (envUrl && typeof envUrl === 'string' && envUrl.startsWith('http') && !envUrl.includes('SENSITIVE'))
  ? envUrl.trim()
  : SUPABASE_URL_DEFAULT;

const supabaseKey = (envKey && typeof envKey === 'string' && envKey.length > 20 && !envKey.includes('SENSITIVE'))
  ? envKey.trim()
  : SUPABASE_KEY_DEFAULT;

const supabase = createClient(supabaseUrl, supabaseKey);

function fotoUrl(ruta) {
  if (!ruta) return null;
  return supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl;
}

// ¿El error es porque todavía no existe una tabla en Supabase?
function esFaltaTabla(error) {
  const codigo = error && error.code;
  const msg = String((error && error.message) || '');
  return codigo === '42P01'
    || /relation .* does not exist|Could not find the table|no existe la relaci/i.test(msg);
}

const AVISO_TABLA_PAGOS = 'Falta crear la tabla de pagos (pagos_venta). Ejecuta auth-supabase/PAGOS_VENTA.sql en el SQL Editor de Supabase y vuelve a intentar.';
const AVISO_TABLA_REGISTRO_ENTREGAS = 'Falta crear la tabla de Registro de Entregas (registro_entregas). Ejecuta auth-supabase/REGISTRO_ENTREGAS.sql en el SQL Editor de Supabase y vuelve a intentar.';

const redondear2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Saldo pendiente: nunca negativo (si el depósito supera el precio, queda en 0)
const calcularSaldo = (precio, deposito, abonado) =>
  Math.max(0, redondear2((Number(precio) || 0) - (Number(deposito) || 0) - (Number(abonado) || 0)));


// Fecha local del dispositivo (evita que de noche se guarde el día siguiente por usar UTC)
function hoyLocalISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function payloadRegistroEntrega(body) {
  const { cliente_id, cliente_nombre, cliente_celular, lugar_entrega_id,
    lugar_texto, fecha_entrega, estado, observacion, tipo, destino } = body || {};
  const nombre = cliente_nombre ? String(cliente_nombre).trim() : '';
  const lugar = lugar_texto ? String(lugar_texto).trim() : '';
  const tipoEntrega = tipo === 'INT' ? 'INT' : 'LP';
  const destinoTexto = destino ? String(destino).trim() : '';
  if (!nombre) throw new Error('El nombre del cliente es obligatorio.');
  if (!lugar) throw new Error('El lugar donde se encuentra el pedido es obligatorio.');
  if (tipoEntrega === 'INT' && !destinoTexto) throw new Error('El destino es obligatorio para entregas al interior.');

  const cId = (cliente_id !== undefined && cliente_id !== null && cliente_id !== '' && !isNaN(Number(cliente_id)))
    ? Number(cliente_id)
    : null;
  const lId = (lugar_entrega_id !== undefined && lugar_entrega_id !== null && lugar_entrega_id !== '' && !isNaN(Number(lugar_entrega_id)))
    ? Number(lugar_entrega_id)
    : null;

  return {
    cliente_id: cId,
    cliente_nombre: nombre,
    cliente_celular: cliente_celular ? String(cliente_celular).trim() : null,
    lugar_entrega_id: lId,
    lugar_texto: lugar,
    fecha_entrega: fecha_entrega ? String(fecha_entrega).trim() : hoyLocalISO(),
    estado: estado === 'E' ? 'E' : 'P',
    observacion: observacion ? String(observacion).trim() : null,
    tipo: tipoEntrega,
    destino: destinoTexto || null
  };
}

// Clave del celular para detectar duplicados: solo dígitos, sin prefijo país (últimos 8).
function claveCelular(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length > 8 ? digitos.slice(-8) : digitos;
}

// Impide registrar dos veces el mismo celular: en la misma fecha o si ya tiene una entrega pendiente.
async function validarCelularUnico(payload, excluirId) {
  const clave = claveCelular(payload.cliente_celular);
  const mismoCliente = payload.cliente_id !== null && payload.cliente_id !== undefined
    ? String(payload.cliente_id)
    : '';
  if (clave.length < 7 && !mismoCliente) return;
  const { data, error } = await supabase
    .from('registro_entregas')
    .select('id, cliente_id, cliente_nombre, cliente_celular, fecha_entrega, estado')
    .order('fecha_entrega', { ascending: false })
    .limit(3000);
  if (error) return; // si no se puede verificar, no bloqueamos el guardado
  const duplicado = (data || []).find((r) => {
    if (String(r.id) === String(excluirId || '')) return false;
    const mismaFecha = String(r.fecha_entrega || '') === String(payload.fecha_entrega || '');
    const pendiente = r.estado !== 'E';
    const mismoCelular = claveCelular(r.cliente_celular) === clave;
    const mismoIdCliente = mismoCliente && String(r.cliente_id || '') === mismoCliente;
    return (mismoCelular || mismoIdCliente) && (mismaFecha || pendiente);
  });
  if (duplicado) {
    throw new Error(
      'Ya existe una entrega registrada con el celular ' + String(payload.cliente_celular).trim() +
      (duplicado.cliente_nombre ? ' (' + duplicado.cliente_nombre + ')' : '') +
      (String(duplicado.fecha_entrega || '') === String(payload.fecha_entrega || '')
        ? ' en esta fecha.'
        : ' con estado pendiente (fecha ' + String(duplicado.fecha_entrega || '') + ').') +
      ' No se puede registrar dos veces el mismo celular.'
    );
  }
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

// Supabase devuelve como máximo 1000 filas por petición: recorre por páginas
// hasta traer todo (evita que un fardo con muchos productos quede incompleto).
async function traerTodas(construirConsulta) {
  const TAM = 1000;
  const filas = [];
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await construirConsulta().range(desde, desde + TAM - 1);
    if (error) throw new Error(error.message);
    const lote = data || [];
    filas.push(...lote);
    if (lote.length < TAM) break;
  }
  return filas;
}

async function siguienteCorrelativo(fardo_id) {
  const { data, error } = await supabase
    .from('productos_fardo').select('correlativo')
    .eq('fardo_id', fardo_id).order('correlativo', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return (data && data.length ? data[0].correlativo : 0) + 1;
}

const esLaPaz = (ciudad) => String(ciudad || '').trim().toUpperCase() === 'LA PAZ';

// Mensaje único cuando el usuario no tiene una cuenta autorizada en el sistema.
const MSG_SIN_ACCESO = 'Usted no tiene Acceso para ingresar al Sistema, comuníquese con el Administrador del Sistema.';

// ---------- Auth ----------
async function me() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  // Verificar que el usuario autenticado tenga una cuenta autorizada (fila en profiles).
  // Solo el Administrador del Sistema puede crear cuentas (módulo Administrar Cuentas).
  const { data: filas, error: perfilError } = await supabase
    .from('profiles').select('*').eq('id', user.id).limit(1);
  if (perfilError) throw new Error(perfilError.message);

  const profile = (filas && filas[0]) || null;
  if (!profile) {
    // Sin cuenta autorizada: cerrar la sesión y negar el ingreso.
    try { await supabase.auth.signOut(); } catch { /* silencioso */ }
    throw new Error(MSG_SIN_ACCESO);
  }

  // Asegurar que la cuenta administradora o de Javier tenga rol 'admin' y no quede bloqueada en 'registro'
  const emailLower = String(user.email || '').toLowerCase();
  if (profile.rol === 'registro' || !profile.rol) {
    if (emailLower.includes('javier') || emailLower.includes('admin') || !profile.rol) {
      profile.rol = 'admin';
      try {
        supabase.from('profiles').update({ rol: 'admin' }).eq('id', user.id).then();
      } catch { /* silencioso */ }
    }
  }

  return { user, profile };
}

// ---------- Router: misma interfaz /api/... ----------
async function route(method, rawPath, body) {
  const u = new URL(rawPath, 'http://x');
  const path = u.pathname;
  const q = u.searchParams;
  let m;

  // ----- Auth -----
  if (method === 'POST' && path === '/api/register') {
    // El registro público está deshabilitado: las cuentas las crea el Administrador del Sistema.
    throw new Error(MSG_SIN_ACCESO);
  }
  if (method === 'POST' && path === '/api/login') {
    const { email, password } = body || {};
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // Si las credenciales no corresponden a una cuenta autorizada, se niega el acceso.
    if (error) throw new Error(MSG_SIN_ACCESO);
    return { ok: true, user: data.user };
  }
  if (method === 'POST' && path === '/api/logout') {
    await supabase.auth.signOut();
    return { ok: true };
  }
  if (method === 'GET' && path === '/api/me') return me();

  // ----- Cuentas (administración de usuarios) -----
  if (method === 'GET' && path === '/api/cuentas') {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { cuentas: data || [] };
  }
  if (method === 'POST' && path === '/api/cuentas') {
    const { email, password, full_name, rol } = body || {};
    if (!email || !password || !full_name) throw new Error('Correo, contraseña y nombre son obligatorios.');
    if (rol && !['admin', 'registro', 'entregas'].includes(rol)) throw new Error('Rol inválido.');
    // Guardar sesión actual: crear el usuario no debe sacarnos de nuestra cuenta
    const { data: { session: actual } } = await supabase.auth.getSession();
    const { data, error } = await supabase.auth.signUp({
      email: String(email).trim(), password, options: { data: { full_name: String(full_name).trim() } }
    });
    if (error) throw new Error(error.message);
    try {
      if (actual) {
        await supabase.auth.setSession({ access_token: actual.access_token, refresh_token: actual.refresh_token });
      } else {
        await supabase.auth.signOut();
      }
    } catch { /* sigue: la cuenta ya fue creada */ }
    // Asegurar fila en profiles (por si no hay trigger automático)
    let perfilOk = true;
    let perfilError = '';
    try {
      if (data.user && data.user.id) {
        const r = await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: String(full_name).trim(),
          email: String(email).trim(),
          rol: rol || 'registro'
        }).select().single();
        if (r.error) throw r.error;
      }
    } catch (e) {
      // Reintento sin columnas nuevas (por si falta ejecutar CUENTAS_ROL.sql)
      try {
        if (data.user && data.user.id) {
          const r2 = await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: String(full_name).trim()
          }).select().single();
          if (r2.error) throw r2.error;
        }
      } catch (e2) {
        perfilOk = false;
        perfilError = e2.message || 'sin permiso';
      }
    }
    return { ok: true, perfilOk, perfilError };
  }
  if ((m = path.match(/^\/api\/cuentas\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('profiles').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      return { ok: true };
    }
    const { full_name, rol } = body || {};
    if (!full_name || !String(full_name).trim()) throw new Error('El nombre es obligatorio.');
    if (rol && !['admin', 'registro', 'entregas'].includes(rol)) throw new Error('Rol inválido.');
    const cambios = { full_name: String(full_name).trim() };
    if (rol) cambios.rol = rol;
    const { data, error } = await supabase.from('profiles').update(cambios).eq('id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, cuenta: data[0] };
  }

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
    const fardo_id = q.get('fardo_id');
    const { data: fardos } = await supabase.from('fardos').select('id, codigo_fardo, nombre_fardo');
    const mapa = {};
    (fardos || []).forEach((f) => { mapa[f.id] = f; });
    const data = await traerTodas(() => {
      let consulta = supabase.from('productos_fardo').select('*');
      if (fardo_id) {
        consulta = consulta.eq('fardo_id', fardo_id).order('correlativo');
      } else {
        consulta = consulta.order('created_at', { ascending: false }).order('id', { ascending: false });
      }
      return consulta;
    });
    return {
      productos: data.map((p) => ({
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
  if (method === 'POST' && path === '/api/productos/lote') {
    // body es FormData: fardo_id, precio, cantidad, foto
    // Registra el MISMO producto varias veces con correlativos consecutivos.
    const fardo_id = body.get('fardo_id');
    const precio = body.get('precio');
    const cantidad = parseInt(body.get('cantidad'), 10);
    const foto = body.get('foto');
    if (!fardo_id || !precio) throw new Error('Elige el fardo y pon el precio.');
    if (!foto || !foto.size) throw new Error('Debes tomar la foto del producto.');
    if (!Number.isFinite(cantidad) || cantidad < 2) throw new Error('La cantidad debe ser de 2 o más.');
    if (cantidad > 100) throw new Error('Puedes registrar como máximo 100 productos de una vez.');
    const { data: fardo, error: fErr } = await supabase
      .from('fardos').select('id, codigo_fardo').eq('id', fardo_id).single();
    if (fErr || !fardo) throw new Error('Fardo no encontrado.');

    const inicio = await siguienteCorrelativo(fardo_id);
    // Comprimir una sola vez y reutilizar la misma imagen en cada copia
    const imagen = await comprimirFoto(foto);
    const rutas = [];
    const ids = [];
    try {
      for (let i = 0; i < cantidad; i++) {
        const correlativo = inicio + i;
        const nombre_foto = String(correlativo).padStart(3, '0') + '-' + fardo.codigo_fardo;
        const foto_ruta = fardo.codigo_fardo + '/' + nombre_foto + '.jpg';
        const { error: upErr } = await supabase.storage
          .from('fotos').upload(foto_ruta, imagen, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw new Error('No se pudo subir la foto: ' + upErr.message);
        rutas.push(foto_ruta);
        const { data: ins, error: insErr } = await supabase.from('productos_fardo').insert({
          fardo_id: fardo.id, correlativo, nombre_foto,
          precio: Number(precio), foto_ruta
        }).select().single();
        if (insErr || !ins) throw new Error('No se pudo registrar: ' + (insErr ? insErr.message : 'sin permiso (revisa RLS).'));
        ids.push(ins.id);
      }
    } catch (e) {
      // Deshacer lo creado para no dejar productos incompletos
      if (ids.length) await supabase.from('productos_fardo').delete().in('id', ids);
      if (rutas.length) await supabase.storage.from('fotos').remove(rutas);
      throw e;
    }
    return { ok: true, cantidad, desde: inicio, hasta: inicio + cantidad - 1 };
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
  if ((m = path.match(/^\/api\/productos\/([^/]+)\/remate$/)) && method === 'PUT') {
    const valor = body ? body.precio_remate : null;
    let precio_remate = null;
    if (valor !== '' && valor !== null && valor !== undefined) {
      precio_remate = Number(valor);
      if (!Number.isFinite(precio_remate) || precio_remate < 0) throw new Error('Precio de remate inválido.');
    }
    const { data, error } = await supabase
      .from('productos_fardo').update({ precio_remate }).eq('id', m[1]).select().single();
    if (error || !data) {
      if (error && /precio_remate/i.test(error.message)) {
        throw new Error('Falta la columna precio_remate. Ejecuta auth-supabase/REMATE.sql en el SQL Editor de Supabase y vuelve a intentar.');
      }
      throw new Error(error ? error.message : 'Sin permiso en la base de datos (revisa RLS).');
    }
    return { ok: true, producto: { ...data, foto_url: fotoUrl(data.foto_ruta) } };
  }

  // ----- Análisis: resumen de productos vendidos/faltantes por fardo -----
  if (method === 'GET' && path === '/api/analisis/fardos') {
    const desde = (q.get('desde') || '').trim().slice(0, 10);
    const hasta = (q.get('hasta') || '').trim().slice(0, 10);
    const productos = await traerTodas(() =>
      supabase.from('productos_fardo').select('id, fardo_id, precio').order('id')
    );
    let ventas = [];
    try {
      ventas = await traerTodas(() =>
        supabase.from('ventas').select('producto_id, fecha_venta').order('id')
      );
    } catch {
      ventas = [];
    }
    // El rango de fechas filtra las ventas (fecha_venta); el inventario total no cambia.
    const ventasRango = (desde || hasta)
      ? (ventas || []).filter((v) => {
          const f = String(v.fecha_venta || '').slice(0, 10);
          if (!f) return false;
          if (desde && f < desde) return false;
          if (hasta && f > hasta) return false;
          return true;
        })
      : (ventas || []);
    const vendidosSet = new Set(ventasRango.map((v) => String(v.producto_id)));
    const mapa = {};
    productos.forEach((p) => {
      const k = String(p.fardo_id);
      const m = mapa[k] || (mapa[k] = { fardo_id: p.fardo_id, total: 0, vendidos: 0, faltantes: 0, valor_total: 0, valor_vendido: 0 });
      const precio = Number(p.precio) || 0;
      m.total += 1;
      m.valor_total += precio;
      if (vendidosSet.has(String(p.id))) {
        m.vendidos += 1;
        m.valor_vendido += precio;
      }
    });
    const lista = Object.values(mapa).map((m) => ({
      ...m,
      faltantes: m.total - m.vendidos,
      valor_total: redondear2(m.valor_total),
      valor_vendido: redondear2(m.valor_vendido)
    }));
    const resumen = lista.reduce((s, m) => ({
      total: s.total + m.total,
      vendidos: s.vendidos + m.vendidos,
      faltantes: s.faltantes + m.faltantes,
      valor_total: redondear2(s.valor_total + m.valor_total),
      valor_vendido: redondear2(s.valor_vendido + m.valor_vendido)
    }), { total: 0, vendidos: 0, faltantes: 0, valor_total: 0, valor_vendido: 0 });
    return { fardos: lista, resumen };
  }

  // ----- Análisis: ranking de clientes que más compran -----
  if (method === 'GET' && path === '/api/analisis/clientes') {
    let ventas = [];
    try {
      ventas = await traerTodas(() =>
        supabase.from('ventas')
          .select('id, producto_id, precio_venta, deposito_cliente, fecha_venta, nombre_cliente, celular_cliente')
          .order('id')
      );
    } catch {
      ventas = [];
    }
    const claveCelular = (v) => {
      const d = String(v || '').replace(/\D/g, '');
      return d.length > 8 ? d.slice(-8) : d;
    };
    const mapa = {};
    (ventas || []).forEach((v) => {
      const cel = claveCelular(v.celular_cliente);
      const nom = String(v.nombre_cliente || '').trim();
      const clave = cel ? 'c:' + cel : ('n:' + nom.toLowerCase());
      if (clave === 'n:') return;
      const m = mapa[clave] || (mapa[clave] = {
        clave, nombre: nom, celular: v.celular_cliente || '',
        compras: 0, total_compra: 0, total_deposito: 0, ultima_compra: ''
      });
      m.compras += 1;
      m.total_compra += Number(v.precio_venta) || 0;
      m.total_deposito += Number(v.deposito_cliente) || 0;
      if (nom && !m.nombre) m.nombre = nom;
      const f = String(v.fecha_venta || '').slice(0, 10);
      if (f > m.ultima_compra) m.ultima_compra = f;
    });
    const ranking = Object.values(mapa)
      .map((m) => ({
        ...m,
        total_compra: redondear2(m.total_compra),
        total_deposito: redondear2(m.total_deposito)
      }))
      .sort((a, b) => b.total_compra - a.total_compra || b.compras - a.compras);
    const resumen = ranking.reduce((s, m) => ({
      clientes: s.clientes + 1,
      compras: s.compras + m.compras,
      total_compra: redondear2(s.total_compra + m.total_compra),
      total_deposito: redondear2(s.total_deposito + m.total_deposito)
    }), { clientes: 0, compras: 0, total_compra: 0, total_deposito: 0 });
    return { ranking, resumen };
  }

  // ----- Clientes -----
  if (method === 'GET' && path === '/api/clientes') {
    const data = await traerTodas(() =>
      supabase.from('clientes').select('*').order('created_at', { ascending: false })
    );
    return { clientes: data || [] };
  }

  // ----- Historial completo de un cliente (compras, deudas y pagos) -----
  if (method === 'GET' && path === '/api/clientes/historial') {
    const celular = (q.get('celular') || '').trim();
    const nombre = (q.get('nombre') || '').trim();
    const vacio = {
      cliente: null, items: [], pagos: [],
      totales: { compras: 0, total_venta: 0, total_deposito: 0, total_abonado: 0, total_saldo: 0, deudas: 0, pagos: 0 }
    };
    if (!celular && !nombre) return vacio;

    // 1) Localizar la ficha del cliente
    let cliente = null;
    if (celular) {
      const { data } = await supabase.from('clientes').select('*').eq('celular', celular).limit(1);
      cliente = (data && data[0]) || null;
    }
    if (!cliente && nombre) {
      const { data } = await supabase.from('clientes').select('*').ilike('nombre', '%' + nombre + '%').limit(1);
      cliente = (data && data[0]) || null;
    }

    // 2) Traer todas sus ventas (por celular; si no hay, por nombre)
    let consulta = supabase.from('ventas').select('*');
    if (celular) consulta = consulta.eq('celular_cliente', celular);
    else consulta = consulta.ilike('nombre_cliente', '%' + nombre + '%');
    const { data: ventas, error: vErr } = await consulta.order('fecha_venta', { ascending: false }).limit(1000);
    if (vErr) throw new Error(vErr.message);
    const listaVentas = ventas || [];
    if (!listaVentas.length) return { ...vacio, cliente };

    // 3) Productos, fardos y pagos relacionados
    const ventaIds = listaVentas.map((v) => v.id);
    const prodIds = [...new Set(listaVentas.map((v) => v.producto_id).filter(Boolean))];
    const [rProds, rPagos] = await Promise.all([
      prodIds.length ? supabase.from('productos_fardo').select('*').in('id', prodIds) : { data: [] },
      supabase.from('pagos_venta').select('*').in('venta_id', ventaIds).order('fecha_pago', { ascending: false }).order('id', { ascending: false })
    ]);
    if (rPagos.error && !esFaltaTabla(rPagos.error)) throw new Error(rPagos.error.message);
    const prods = rProds.data || [];
    const pagos = rPagos.error ? [] : (rPagos.data || []);

    const mapaP = {};
    prods.forEach((p) => { mapaP[p.id] = p; });
    const fardoIds = [...new Set(prods.map((p) => p.fardo_id).filter(Boolean))];
    const { data: fardos } = fardoIds.length
      ? await supabase.from('fardos').select('id, codigo_fardo, nombre_fardo').in('id', fardoIds)
      : { data: [] };
    const mapaF = {};
    (fardos || []).forEach((f) => { mapaF[f.id] = f; });

    const mapaPagos = {};
    pagos.forEach((p) => { (mapaPagos[p.venta_id] || (mapaPagos[p.venta_id] = [])).push(p); });

    const items = listaVentas.map((v) => {
      const pr = mapaP[v.producto_id] || {};
      const f = mapaF[pr.fardo_id] || {};
      const listaPagos = mapaPagos[v.id] || [];
      const abonado = redondear2(listaPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0));
      return {
        id: v.id,
        fecha_venta: v.fecha_venta,
        estado: v.estado || '',
        precio_venta: Number(v.precio_venta) || 0,
        deposito: Number(v.deposito_cliente) || 0,
        abonado,
        saldo: calcularSaldo(v.precio_venta, v.deposito_cliente, abonado),
        fecha_entrega: v.fecha_entrega || '',
        observacion: v.observacion || '',
        nombre_cliente: v.nombre_cliente || '',
        celular_cliente: v.celular_cliente || '',
        ciudad: v.ciudad || '',
        codigo: pr.nombre_foto || '',
        precio_original: Number(pr.precio) || 0,
        foto_url: fotoUrl(pr.foto_ruta),
        fardo: f.codigo_fardo ? (f.codigo_fardo + ' — ' + (f.nombre_fardo || '')) : '',
        pagos: listaPagos
      };
    });

    const pagosFlat = pagos.map((p) => {
      const v = listaVentas.find((x) => x.id === p.venta_id) || {};
      const pr = mapaP[v.producto_id] || {};
      const f = mapaF[pr.fardo_id] || {};
      return {
        id: p.id,
        venta_id: p.venta_id,
        fecha_pago: p.fecha_pago,
        monto: Number(p.monto) || 0,
        nota: p.nota || '',
        codigo: pr.nombre_foto || '',
        fardo: f.codigo_fardo ? (f.codigo_fardo + ' — ' + (f.nombre_fardo || '')) : ''
      };
    }).sort((a, b) => String(b.fecha_pago).localeCompare(String(a.fecha_pago)) || (b.id - a.id));

    return {
      cliente,
      items,
      pagos: pagosFlat,
      totales: {
        compras: items.length,
        total_venta: redondear2(items.reduce((s, i) => s + i.precio_venta, 0)),
        total_deposito: redondear2(items.reduce((s, i) => s + i.deposito, 0)),
        total_abonado: redondear2(items.reduce((s, i) => s + i.abonado, 0)),
        total_saldo: redondear2(items.reduce((s, i) => s + i.saldo, 0)),
        deudas: items.filter((i) => i.saldo > 0).length,
        pagos: pagosFlat.length
      }
    };
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

  // ----- Cuadre (extractos bancarios) -----
  const AVISO_TABLA_CUADRE = 'Falta crear la tabla de Cuadre (cuadre_registros). Ejecuta auth-supabase/CUADRE.sql en el SQL Editor de Supabase y vuelve a intentar.';

  if (method === 'GET' && path === '/api/cuadre') {
    const archivo = (q.get('archivo') || '').trim();
    const crearConsulta = () => {
      let consulta = supabase.from('cuadre_registros').select('*');
      if (archivo) consulta = consulta.eq('archivo', archivo);
      return consulta
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
        .order('id', { ascending: false });
    };
    try {
      const data = await traerTodas(crearConsulta);
      return { registros: data || [] };
    } catch (error) {
      if (esFaltaTabla(error)) throw new Error(AVISO_TABLA_CUADRE);
      throw new Error(error.message);
    }
  }

  if (method === 'POST' && path === '/api/cuadre/guardar') {
    const { archivo, registros } = body || {};
    const nombreArchivo = String(archivo || '').trim() || 'Extracto';
    const filas = (Array.isArray(registros) ? registros : [])
      .filter((r) => r && r.fecha)
      .map((r) => ({
        fecha: String(r.fecha).slice(0, 10),
        hora: r.hora ? String(r.hora).trim() : null,
        descripcion: r.descripcion ? String(r.descripcion).trim() : null,
        detalle: r.detalle ? String(r.detalle).trim() : null,
        transaccion: r.transaccion ? String(r.transaccion).trim() : null,
        ingreso: r.ingreso === null || r.ingreso === undefined || r.ingreso === '' ? null : Number(r.ingreso),
        gasto: r.gasto === null || r.gasto === undefined || r.gasto === '' ? null : Number(r.gasto),
        archivo: nombreArchivo
      }));
    if (!filas.length) throw new Error('El PDF no contiene movimientos reconocibles.');

    // Insertar por lotes e ignorar los movimientos ya cargados (no pisa ediciones).
    const TAM = 400;
    for (let i = 0; i < filas.length; i += TAM) {
      const lote = filas.slice(i, i + TAM);
      const { error } = await supabase
        .from('cuadre_registros')
        .upsert(lote, { onConflict: 'fecha,hora,transaccion', ignoreDuplicates: true });
      if (error) {
        if (esFaltaTabla(error)) throw new Error(AVISO_TABLA_CUADRE);
        throw new Error(error.message);
      }
    }
    return { ok: true, archivo: nombreArchivo, guardados: filas.length };
  }

  if ((m = path.match(/^\/api\/cuadre\/([^/]+)\/comprobar$/)) && method === 'PUT') {
    const { comprobado } = body || {};
    const { data, error } = await supabase
      .from('cuadre_registros')
      .update({ comprobado: !!comprobado })
      .eq('id', m[1])
      .select();
    if (error) {
      if (esFaltaTabla(error)) throw new Error(AVISO_TABLA_CUADRE);
      throw new Error(error.message);
    }
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, registro: data[0] };
  }

  if ((m = path.match(/^\/api\/cuadre\/([^/]+)$/)) && method === 'PUT') {
    const { celular, nombre_cliente, cliente_id } = body || {};
    const cambios = {
      celular: celular ? String(celular).trim() : null,
      nombre_cliente: nombre_cliente ? String(nombre_cliente).trim() : null,
      cliente_id: cliente_id ? Number(cliente_id) : null
    };
    const { data, error } = await supabase
      .from('cuadre_registros')
      .update(cambios)
      .eq('id', m[1])
      .select();
    if (error) {
      if (esFaltaTabla(error)) throw new Error(AVISO_TABLA_CUADRE);
      throw new Error(error.message);
    }
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, registro: data[0] };
  }

  // ----- Dinámicas -----
  // Sincronización en la nube para estados de tickets de dinámicas
  // (Permite que el estado "Entregado" persista en la nube para cualquier celular, PC y usuario)
  let cacheEstadosCloud = null;
  let ultimoFetchCloud = 0;

  async function obtenerEstadosEntregadosCloud(forzar = false) {
    const ahora = Date.now();
    if (!forzar && cacheEstadosCloud && ahora - ultimoFetchCloud < 2000) {
      return cacheEstadosCloud;
    }
    // 1. Fetch directo al archivo público con timestamp para romper caché de Cloudflare / Navegador
    try {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/fotos/tickets_entregados.json?t=${ahora}`;
      const res = await fetch(publicUrl, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === 'object') {
          cacheEstadosCloud = json;
          ultimoFetchCloud = ahora;
          return cacheEstadosCloud;
        }
      }
    } catch {
      // Ignorar y pasar al cliente de Supabase
    }

    // 2. Fallback usando el cliente oficial de Supabase
    try {
      const { data, error } = await supabase.storage.from('fotos').download('tickets_entregados.json');
      if (!error && data) {
        const texto = await data.text();
        cacheEstadosCloud = JSON.parse(texto || '{}');
        ultimoFetchCloud = ahora;
        return cacheEstadosCloud;
      }
    } catch (e) {
      console.warn('Leyendo tickets_entregados.json de la nube:', e);
    }
    return cacheEstadosCloud || {};
  }

  async function guardarEstadoEntregadoCloud(id, estado) {
    if (!id) return;
    try {
      const actuales = await obtenerEstadosEntregadosCloud(true);
      actuales[String(id)] = estado;
      cacheEstadosCloud = actuales;
      ultimoFetchCloud = Date.now();
      const blob = new Blob([JSON.stringify(actuales)], { type: 'application/json' });
      await supabase.storage.from('fotos').upload('tickets_entregados.json', blob, {
        upsert: true,
        cacheControl: '0',
        contentType: 'application/json'
      });
    } catch (e) {
      console.warn('Guardando tickets_entregados.json en la nube:', e);
    }
  }

  async function sincronizarEstadosEntregadosCloud(mapaLocal = {}) {
    try {
      const actuales = await obtenerEstadosEntregadosCloud(true);
      let huboCambios = false;
      // Si este dispositivo tiene tickets marcados como 'Entregado' que en la nube aún no están registrados,
      // subirlos para que se propaguen inmediatamente a celulares y demás dispositivos.
      if (mapaLocal && typeof mapaLocal === 'object') {
        for (const [k, v] of Object.entries(mapaLocal)) {
          if (v === 'Entregado' && actuales[String(k)] === undefined) {
            actuales[String(k)] = 'Entregado';
            huboCambios = true;
          }
        }
      }
      if (huboCambios) {
        cacheEstadosCloud = actuales;
        ultimoFetchCloud = Date.now();
        const blob = new Blob([JSON.stringify(actuales)], { type: 'application/json' });
        await supabase.storage.from('fotos').upload('tickets_entregados.json', blob, {
          upsert: true,
          cacheControl: '0',
          contentType: 'application/json'
        });
      }
      return actuales;
    } catch (e) {
      console.warn('Sincronizando estados en la nube:', e);
      return cacheEstadosCloud || mapaLocal || {};
    }
  }

  async function eliminarEstadoEntregadoCloud(id) {
    if (!id) return;
    try {
      const actuales = await obtenerEstadosEntregadosCloud(true);
      delete actuales[String(id)];
      cacheEstadosCloud = actuales;
      ultimoFetchCloud = Date.now();
      const blob = new Blob([JSON.stringify(actuales)], { type: 'application/json' });
      await supabase.storage.from('fotos').upload('tickets_entregados.json', blob, {
        upsert: true,
        cacheControl: '0',
        contentType: 'application/json'
      });
    } catch (e) {
      console.warn('Eliminando de tickets_entregados.json en la nube:', e);
    }
  }

  if (method === 'POST' && path === '/api/dinamicas/sync-estados') {
    const { locales } = body || {};
    const estados = await sincronizarEstadosEntregadosCloud(locales);
    return { ok: true, estados };
  }

  if (method === 'GET' && path === '/api/dinamicas') {
    const data = await traerTodas(() =>
      supabase.from('dinamicas').select('*').order('created_at', { ascending: false })
    );
    const cloudEstados = await obtenerEstadosEntregadosCloud(true);
    const dinamicasMapeadas = (data || []).map((d) => {
      const idStr = String(d.id);
      const estadoDb = d.ticket_entregado;
      let estadoFinal = 'Pendiente';
      if (cloudEstados[idStr]) {
        estadoFinal = cloudEstados[idStr];
      } else if (estadoDb && String(estadoDb).trim()) {
        estadoFinal = String(estadoDb).trim();
      }
      return {
        ...d,
        ticket_entregado: estadoFinal
      };
    });
    return { dinamicas: dinamicasMapeadas, cloudEstados };
  }
  if (method === 'GET' && path === '/api/dinamicas/siguiente') {
    const dinamica = (q.get('dinamica') || '').trim();
    const excluir = (q.get('excluir') || '').trim();
    if (!dinamica) return { siguiente: 1 };
    let consulta = supabase.from('dinamicas').select('*').eq('dinamica_nombre', dinamica);
    if (excluir) consulta = consulta.neq('id', excluir);
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    let max = 0;
    (data || []).forEach((d) => {
      if (d.numero_hasta !== null && d.numero_hasta !== undefined && d.numero_hasta !== '') {
        max = Math.max(max, Number(d.numero_hasta) || 0);
      } else if (d.n_ticket) {
        String(d.n_ticket).split(/[^0-9]+/).filter(Boolean).forEach((n) => {
          max = Math.max(max, Number(n) || 0);
        });
      }
    });
    return { siguiente: max + 1 };
  }
  if (method === 'POST' && path === '/api/dinamicas') {
    const { celular_cliente, nombre_completo, monto_compra, n_ticket, fecha_compra, dinamica_nombre, valor_dinamica, numero_desde, numero_hasta, ticket_entregado } = body || {};
    if (!celular_cliente || !String(celular_cliente).trim()) throw new Error('El celular del cliente es obligatorio.');
    if (!nombre_completo || !String(nombre_completo).trim()) throw new Error('El nombre completo es obligatorio.');
    if (monto_compra === undefined || monto_compra === null || monto_compra === '') {
      throw new Error('El monto de compra es obligatorio.');
    }
    const payload = {
      celular_cliente: String(celular_cliente).trim(),
      nombre_completo: String(nombre_completo).trim(),
      monto_compra: Number(monto_compra),
      n_ticket: n_ticket ? String(n_ticket).trim() : null,
      fecha_compra: fecha_compra ? String(fecha_compra).trim() : new Date().toISOString().slice(0, 10),
      dinamica_nombre: dinamica_nombre ? String(dinamica_nombre).trim() : null,
      valor_dinamica: valor_dinamica !== undefined && valor_dinamica !== null && valor_dinamica !== '' ? Number(valor_dinamica) : null,
      numero_desde: numero_desde !== undefined && numero_desde !== null && numero_desde !== '' ? parseInt(numero_desde, 10) : null,
      numero_hasta: numero_hasta !== undefined && numero_hasta !== null && numero_hasta !== '' ? parseInt(numero_hasta, 10) : null,
      ticket_entregado: ticket_entregado ? String(ticket_entregado).trim() : 'Pendiente'
    };
    let { data, error } = await supabase.from('dinamicas').insert(payload).select().single();
    if (error && error.message && error.message.includes('ticket_entregado')) {
      delete payload.ticket_entregado;
      const reintento = await supabase.from('dinamicas').insert(payload).select().single();
      data = reintento.data;
      error = reintento.error;
    }
    if (error) throw new Error(error.message);
    if (data && data.id && ticket_entregado) {
      await guardarEstadoEntregadoCloud(data.id, String(ticket_entregado).trim());
    }
    return { ok: true, dinamica: data };
  }
  if ((m = path.match(/^\/api\/dinamicas\/([^/]+)\/estado$/)) && (method === 'POST' || method === 'PATCH')) {
    const nuevoEstado = body && body.ticket_entregado ? String(body.ticket_entregado).trim() : 'Entregado';
    // Persistir en la nube para sincronización universal (todos los celulares, PCs y usuarios)
    await guardarEstadoEntregadoCloud(m[1], nuevoEstado);

    try {
      await supabase.from('dinamicas').update({ ticket_entregado: nuevoEstado }).eq('id', m[1]);
    } catch {
      // Si la columna aún no fue creada en PostgreSQL, se ignora silenciosamente
    }
    return { ok: true, dinamica: { id: m[1], ticket_entregado: nuevoEstado } };
  }
  if ((m = path.match(/^\/api\/dinamicas\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      await eliminarEstadoEntregadoCloud(m[1]);
      const { data, error } = await supabase.from('dinamicas').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      return { ok: true };
    }
    const { celular_cliente, nombre_completo, monto_compra, n_ticket, fecha_compra, dinamica_nombre, valor_dinamica, numero_desde, numero_hasta, ticket_entregado } = body || {};
    if (!celular_cliente || !String(celular_cliente).trim()) throw new Error('El celular del cliente es obligatorio.');
    if (!nombre_completo || !String(nombre_completo).trim()) throw new Error('El nombre completo es obligatorio.');
    if (monto_compra === undefined || monto_compra === null || monto_compra === '') {
      throw new Error('El monto de compra es obligatorio.');
    }
    const payload = {
      celular_cliente: String(celular_cliente).trim(),
      nombre_completo: String(nombre_completo).trim(),
      monto_compra: Number(monto_compra),
      n_ticket: n_ticket ? String(n_ticket).trim() : null,
      fecha_compra: fecha_compra ? String(fecha_compra).trim() : null,
      dinamica_nombre: dinamica_nombre ? String(dinamica_nombre).trim() : null,
      valor_dinamica: valor_dinamica !== undefined && valor_dinamica !== null && valor_dinamica !== '' ? Number(valor_dinamica) : null,
      numero_desde: numero_desde !== undefined && numero_desde !== null && numero_desde !== '' ? parseInt(numero_desde, 10) : null,
      numero_hasta: numero_hasta !== undefined && numero_hasta !== null && numero_hasta !== '' ? parseInt(numero_hasta, 10) : null,
      ticket_entregado: ticket_entregado ? String(ticket_entregado).trim() : 'Pendiente'
    };
    if (ticket_entregado) {
      await guardarEstadoEntregadoCloud(m[1], String(ticket_entregado).trim());
    }
    let { data, error } = await supabase.from('dinamicas').update(payload).eq('id', m[1]).select();
    if (error && error.message && error.message.includes('ticket_entregado')) {
      delete payload.ticket_entregado;
      const reintento = await supabase.from('dinamicas').update(payload).eq('id', m[1]).select();
      data = reintento.data;
      error = reintento.error;
    }
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, dinamica: data[0] };
  }

  // ----- Valores de dinámica -----
  if (method === 'GET' && path === '/api/valores-dinamica') {
    const { data, error } = await supabase
      .from('valores_dinamica').select('*').order('nombre').limit(200);
    if (error) throw new Error(error.message);
    return { valores: data || [] };
  }
  if (method === 'POST' && path === '/api/valores-dinamica') {
    const { nombre, valor } = body || {};
    if (!nombre || !String(nombre).trim()) throw new Error('El nombre de la dinámica es obligatorio.');
    if (valor === undefined || valor === null || valor === '') throw new Error('El valor de la dinámica es obligatorio.');
    const nom = String(nombre).trim();
    const { data: existe } = await supabase.from('valores_dinamica').select('id').ilike('nombre', nom).limit(1);
    if (existe && existe.length) throw new Error('¡Ya existe una dinámica con ese nombre!');
    const { data, error } = await supabase.from('valores_dinamica').insert({
      nombre: nom,
      valor: Number(valor)
    }).select().single();
    if (error) {
      if (error.code === '23505') throw new Error('¡Ya existe una dinámica con ese nombre!');
      throw new Error(error.message);
    }
    return { ok: true, valorDinamica: data };
  }
  if ((m = path.match(/^\/api\/valores-dinamica\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('valores_dinamica').delete().eq('id', m[1]).select();
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
      return { ok: true };
    }
    const { nombre, valor } = body || {};
    if (!nombre || !String(nombre).trim()) throw new Error('El nombre de la dinámica es obligatorio.');
    if (valor === undefined || valor === null || valor === '') throw new Error('El valor de la dinámica es obligatorio.');
    const nom = String(nombre).trim();
    const { data: otro } = await supabase
      .from('valores_dinamica').select('id').ilike('nombre', nom).neq('id', m[1]).limit(1);
    if (otro && otro.length) throw new Error('¡Ya existe una dinámica con ese nombre!');
    const { data, error } = await supabase.from('valores_dinamica').update({
      nombre: nom,
      valor: Number(valor)
    }).eq('id', m[1]).select();
    if (error) {
      if (error.code === '23505') throw new Error('¡Ya existe una dinámica con ese nombre!');
      throw new Error(error.message);
    }
    if (!data || !data.length) throw new Error('Sin permiso en la base de datos (revisa RLS).');
    return { ok: true, valorDinamica: data[0] };
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

  // ----- Registro de Destinos / Ciudades -----
  let cacheCiudadesCloud = null;
  let ultimoFetchCiudades = 0;

  async function obtenerCiudadesCloud(forzar = false) {
    const ahora = Date.now();
    if (!forzar && cacheCiudadesCloud && ahora - ultimoFetchCiudades < 3000) {
      return cacheCiudadesCloud;
    }
    try {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/fotos/ciudades_destinos.json?t=${ahora}`;
      const res = await fetch(publicUrl, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          cacheCiudadesCloud = json;
          ultimoFetchCiudades = ahora;
          return cacheCiudadesCloud;
        }
      }
    } catch {
      // Continuar con fallback
    }

    try {
      const { data, error } = await supabase.storage.from('fotos').download('ciudades_destinos.json');
      if (!error && data) {
        const texto = await data.text();
        const parsed = JSON.parse(texto || '[]');
        if (Array.isArray(parsed)) {
          cacheCiudadesCloud = parsed;
          ultimoFetchCiudades = ahora;
          return cacheCiudadesCloud;
        }
      }
    } catch {
      // Ignorar
    }

    try {
      const local = JSON.parse(localStorage.getItem('registro_ciudades_destinos') || '[]');
      if (Array.isArray(local) && local.length > 0) {
        cacheCiudadesCloud = local;
        return cacheCiudadesCloud;
      }
    } catch {}

    return cacheCiudadesCloud || [];
  }

  async function guardarCiudadesCloud(lista) {
    if (!Array.isArray(lista)) return;
    cacheCiudadesCloud = lista;
    ultimoFetchCiudades = Date.now();
    try {
      localStorage.setItem('registro_ciudades_destinos', JSON.stringify(lista));
    } catch {}
    try {
      const blob = new Blob([JSON.stringify(lista)], { type: 'application/json' });
      await supabase.storage.from('fotos').upload('ciudades_destinos.json', blob, {
        upsert: true,
        cacheControl: '0',
        contentType: 'application/json'
      });
    } catch (e) {
      console.warn('Guardando ciudades_destinos.json en la nube:', e);
    }
  }

  if (method === 'GET' && (path === '/api/ciudades' || path === '/api/destinos-ciudades')) {
    let listaDb = null;
    try {
      const { data, error } = await supabase
        .from('ciudades').select('*').order('ciudad');
      if (!error && data) listaDb = data;
    } catch {
      // La tabla no existe aún en PostgreSQL
    }

    if (listaDb !== null) {
      if (listaDb.length > 0) guardarCiudadesCloud(listaDb).catch(() => {});
      return { ciudades: listaDb };
    }

    const listaCloud = await obtenerCiudadesCloud();
    return { ciudades: listaCloud };
  }

  if (method === 'POST' && (path === '/api/ciudades' || path === '/api/destinos-ciudades')) {
    const { ciudad, departamento, detalle } = body || {};
    if (!ciudad || !String(ciudad).trim()) throw new Error('El nombre de la ciudad o destino es obligatorio.');
    const nomCiudad = String(ciudad).trim();
    const dep = departamento ? String(departamento).trim() : null;
    const det = detalle ? String(detalle).trim() : null;

    let nuevoItem = null;
    try {
      const { data, error } = await supabase.from('ciudades').insert({
        ciudad: nomCiudad,
        departamento: dep,
        detalle: det
      }).select().single();
      if (!error && data) nuevoItem = data;
    } catch {
      // Fallback si la tabla no existe
    }

    if (!nuevoItem) {
      nuevoItem = {
        id: Date.now(),
        ciudad: nomCiudad,
        departamento: dep,
        detalle: det,
        created_at: new Date().toISOString()
      };
    }

    const actuales = await obtenerCiudadesCloud(true);
    const actualizados = [nuevoItem, ...actuales.filter((c) => String(c.id) !== String(nuevoItem.id))];
    await guardarCiudadesCloud(actualizados);

    return { ok: true, ciudad: nuevoItem };
  }

  if (method === 'POST' && (path === '/api/ciudades/precargar' || path === '/api/destinos-ciudades/precargar')) {
    const { items } = body || {};
    const lote = Array.isArray(items) ? items : [];
    if (!lote.length) throw new Error('No hay ciudades para precargar.');

    try {
      const payload = lote.map((it) => ({
        ciudad: String(it.ciudad || it.nombre).trim(),
        departamento: it.departamento ? String(it.departamento).trim() : null,
        detalle: it.detalle ? String(it.detalle).trim() : null
      }));
      await supabase.from('ciudades').insert(payload);
    } catch {
      // Silencioso si la tabla aún no existe
    }

    const actuales = await obtenerCiudadesCloud(true);
    const mapa = {};
    actuales.forEach((c) => { mapa[c.ciudad.toLowerCase()] = c; });
    lote.forEach((it, idx) => {
      const cNom = String(it.ciudad || it.nombre).trim();
      if (!mapa[cNom.toLowerCase()]) {
        const itemObj = {
          id: Date.now() + idx,
          ciudad: cNom,
          departamento: it.departamento ? String(it.departamento).trim() : null,
          detalle: it.detalle ? String(it.detalle).trim() : null,
          created_at: new Date().toISOString()
        };
        mapa[cNom.toLowerCase()] = itemObj;
        actuales.push(itemObj);
      }
    });

    await guardarCiudadesCloud(actuales);
    return { ok: true, ciudades: actuales };
  }

  if ((m = path.match(/^\/api\/ciudades\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    const targetId = m[1];
    if (method === 'DELETE') {
      try {
        await supabase.from('ciudades').delete().eq('id', targetId);
      } catch {
        // Fallback
      }
      const actuales = await obtenerCiudadesCloud(true);
      const filtrados = actuales.filter((c) => String(c.id) !== String(targetId));
      await guardarCiudadesCloud(filtrados);
      return { ok: true };
    }

    const { ciudad, departamento, detalle } = body || {};
    if (!ciudad || !String(ciudad).trim()) throw new Error('El nombre de la ciudad o destino es obligatorio.');
    const nomCiudad = String(ciudad).trim();
    const dep = departamento ? String(departamento).trim() : null;
    const det = detalle ? String(detalle).trim() : null;

    let itemActualizado = null;
    try {
      const { data, error } = await supabase.from('ciudades').update({
        ciudad: nomCiudad,
        departamento: dep,
        detalle: det
      }).eq('id', targetId).select();
      if (!error && data && data.length) itemActualizado = data[0];
    } catch {
      // Fallback
    }

    if (!itemActualizado) {
      itemActualizado = {
        id: isNaN(Number(targetId)) ? targetId : Number(targetId),
        ciudad: nomCiudad,
        departamento: dep,
        detalle: det,
        created_at: new Date().toISOString()
      };
    }

    const actuales = await obtenerCiudadesCloud(true);
    const actualizados = actuales.map((c) => (String(c.id) === String(targetId) ? itemActualizado : c));
    await guardarCiudadesCloud(actualizados);
    return { ok: true, ciudad: itemActualizado };
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

  // ----- Registro de entregas (listado de clientes y lugares de recogida) -----
  if (method === 'GET' && path === '/api/registro-entregas') {
    const desde = (q.get('desde') || '').trim();
    const hasta = (q.get('hasta') || '').trim();
    let consulta = supabase.from('registro_entregas').select('*');
    if (desde) consulta = consulta.gte('fecha_entrega', desde);
    if (hasta) consulta = consulta.lte('fecha_entrega', hasta);
    const { data, error } = await consulta
      .order('fecha_entrega', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(esFaltaTabla(error) ? AVISO_TABLA_REGISTRO_ENTREGAS : error.message);
    const normalizados = (data || []).map((r) => {
      let tipo = r.tipo;
      let destino = r.destino;
      if (!tipo) {
        const match = String(r.observacion || '').match(/\[DESTINO:\s*([^\]]+)\]/i);
        if (match) {
          tipo = 'INT';
          destino = match[1].trim();
        } else {
          tipo = 'LP';
        }
      }
      return { ...r, tipo, destino };
    });
    return { items: normalizados };
  }
  if (method === 'POST' && path === '/api/registro-entregas') {
    let payload = payloadRegistroEntrega(body);
    await validarCelularUnico(payload, null);
    let res = await supabase.from('registro_entregas').insert(payload).select().single();
    let data = res.data;
    let error = res.error;

    // 1) Si falla por clave foránea inválida de cliente_id, reintentar con cliente_id: null
    if (error && (error.code === '23503' || /foreign key.*cliente_id/i.test(error.message))) {
      payload = { ...payload, cliente_id: null };
      res = await supabase.from('registro_entregas').insert(payload).select().single();
      data = res.data;
      error = res.error;
    }

    // 2) Si falla porque en Supabase aún no existen las columnas 'tipo' o 'destino'
    if (error && (/column.*tipo|column.*destino|schema cache/i.test(error.message) || error.code === '42703')) {
      const payloadFallback = { ...payload };
      if (payloadFallback.tipo === 'INT' || payloadFallback.destino) {
        payloadFallback.observacion = `[DESTINO: ${payloadFallback.destino || 'INTERIOR'}] ${payloadFallback.observacion || ''}`.trim();
      }
      delete payloadFallback.tipo;
      delete payloadFallback.destino;
      res = await supabase.from('registro_entregas').insert(payloadFallback).select().single();
      data = res.data;
      error = res.error;
    }

    // 3) Si falla por restricción NOT NULL en lugar_entrega_id (para entregas al interior)
    if (error && (error.code === '23502' || /violates not-null.*lugar_entrega_id/i.test(error.message))) {
      const { data: lugares } = await supabase.from('lugares_entrega').select('id').limit(1);
      const primerLugarId = lugares && lugares[0] ? lugares[0].id : null;
      if (primerLugarId) {
        const payloadConLugar = { ...payload, lugar_entrega_id: primerLugarId };
        delete payloadConLugar.tipo;
        delete payloadConLugar.destino;
        res = await supabase.from('registro_entregas').insert(payloadConLugar).select().single();
        data = res.data;
        error = res.error;
      }
    }

    if (error) {
      if (/tipo|destino/i.test(error.message) || error.code === '42703') {
        throw new Error('Faltan columnas en Supabase. Ejecuta: alter table registro_entregas add column if not exists tipo text not null default \'LP\', add column if not exists destino text; en el SQL Editor.');
      }
      throw new Error(esFaltaTabla(error) ? AVISO_TABLA_REGISTRO_ENTREGAS : (error.message || 'Error al guardar entrega en Supabase.'));
    }
    return { ok: true, registro: data };
  }
  if ((m = path.match(/^\/api\/registro-entregas\/([^/]+)\/entregar$/)) && method === 'POST') {
    const fecha = body && body.fecha_entrega && String(body.fecha_entrega).trim()
      ? String(body.fecha_entrega).trim()
      : hoyLocalISO();
    const { data, error } = await supabase
      .from('registro_entregas')
      .update({ estado: 'E', fecha_entrega: fecha })
      .eq('id', m[1])
      .select();
    if (error) throw new Error(esFaltaTabla(error) ? AVISO_TABLA_REGISTRO_ENTREGAS : error.message);
    if (!data || !data.length) throw new Error('Entrega no encontrada o sin permiso para actualizarla.');
    return { ok: true, registro: data[0] };
  }
  if ((m = path.match(/^\/api\/registro-entregas\/([^/]+)$/)) && (method === 'PUT' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const { data, error } = await supabase.from('registro_entregas').delete().eq('id', m[1]).select();
      if (error) throw new Error(esFaltaTabla(error) ? AVISO_TABLA_REGISTRO_ENTREGAS : error.message);
      if (!data || !data.length) throw new Error('Entrega no encontrada o sin permiso para eliminarla.');
      return { ok: true, registro: data[0] };
    }
    let payload = payloadRegistroEntrega(body);
    await validarCelularUnico(payload, m[1]);
    let res = await supabase.from('registro_entregas').update(payload).eq('id', m[1]).select();
    let data = res.data;
    let error = res.error;

    // 1) Si falla por clave foránea inválida de cliente_id
    if (error && (error.code === '23503' || /foreign key.*cliente_id/i.test(error.message))) {
      payload = { ...payload, cliente_id: null };
      res = await supabase.from('registro_entregas').update(payload).eq('id', m[1]).select();
      data = res.data;
      error = res.error;
    }

    // 2) Si faltan las columnas 'tipo' o 'destino'
    if (error && (/column.*tipo|column.*destino|schema cache/i.test(error.message) || error.code === '42703')) {
      const payloadFallback = { ...payload };
      if (payloadFallback.tipo === 'INT' || payloadFallback.destino) {
        payloadFallback.observacion = `[DESTINO: ${payloadFallback.destino || 'INTERIOR'}] ${payloadFallback.observacion || ''}`.trim();
      }
      delete payloadFallback.tipo;
      delete payloadFallback.destino;
      res = await supabase.from('registro_entregas').update(payloadFallback).eq('id', m[1]).select();
      data = res.data;
      error = res.error;
    }

    // 3) Si falla por restricción NOT NULL en lugar_entrega_id
    if (error && (error.code === '23502' || /violates not-null.*lugar_entrega_id/i.test(error.message))) {
      const { data: lugares } = await supabase.from('lugares_entrega').select('id').limit(1);
      const primerLugarId = lugares && lugares[0] ? lugares[0].id : null;
      if (primerLugarId) {
        const payloadConLugar = { ...payload, lugar_entrega_id: primerLugarId };
        delete payloadConLugar.tipo;
        delete payloadConLugar.destino;
        res = await supabase.from('registro_entregas').update(payloadConLugar).eq('id', m[1]).select();
        data = res.data;
        error = res.error;
      }
    }

    if (error) throw new Error(esFaltaTabla(error) ? AVISO_TABLA_REGISTRO_ENTREGAS : (error.message || 'Error al actualizar entrega.'));
    if (!data || !data.length) throw new Error('Entrega no encontrada o sin permiso para actualizarla.');
    return { ok: true, registro: data[0] };
  }

  // ----- Ventas -----
  if (method === 'GET' && path === '/api/ventas') {
    const fardo_id = q.get('fardo_id');
    if (!fardo_id) return { items: [], pagosTabla: true };
    const { data: prods, error } = await supabase
      .from('productos_fardo').select('*').eq('fardo_id', fardo_id).order('correlativo');
    if (error) throw new Error(error.message);
    const ids = (prods || []).map((p) => p.id);
    const mapaV = {};
    let pagosTabla = true;
    if (ids.length) {
      const [{ data: ventas }, { data: ubis }] = await Promise.all([
        supabase.from('ventas').select('*').in('producto_id', ids),
        supabase.from('ubicaciones').select('id, lugar, detalle').limit(500)
      ]);
      const mapaU = {};
      (ubis || []).forEach((x) => { mapaU[x.id] = x.detalle ? x.lugar + ' — ' + x.detalle : x.lugar; });

      // Historial de abonos (si la tabla aún no existe, la app sigue funcionando)
      const ventaIds = (ventas || []).map((v) => v.id);
      let pagos = [];
      if (ventaIds.length) {
        const { data: pagosData, error: pagosError } = await supabase
          .from('pagos_venta').select('*')
          .in('venta_id', ventaIds)
          .order('fecha_pago', { ascending: false })
          .order('id', { ascending: false });
        if (pagosError) {
          if (!esFaltaTabla(pagosError)) throw new Error(pagosError.message);
          pagosTabla = false;
        } else {
          pagos = pagosData || [];
        }
      }
      const mapaPagos = {};
      pagos.forEach((p) => { (mapaPagos[p.venta_id] || (mapaPagos[p.venta_id] = [])).push(p); });

      (ventas || []).forEach((v) => {
        const listaPagos = mapaPagos[v.id] || [];
        const abonado = redondear2(listaPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0));
        const saldo = calcularSaldo(v.precio_venta, v.deposito_cliente, abonado);
        mapaV[v.producto_id] = {
          ...v,
          ubicacion: v.ubicacion_id ? (mapaU[v.ubicacion_id] || '—') : '—',
          pagos: listaPagos,
          abonado,
          saldo
        };
      });
    }
    return {
      items: (prods || []).map((p) => ({ ...p, foto_url: fotoUrl(p.foto_ruta), venta: mapaV[p.id] || null })),
      pagosTabla
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

  // Cambiar únicamente el estado de una venta (P = Pendiente, D = Deuda, E = Entregado)
  if ((m = path.match(/^\/api\/ventas\/([^/]+)\/estado$/)) && (method === 'POST' || method === 'PATCH')) {
    const estado = body && body.estado;
    if (!['P', 'D', 'E'].includes(estado)) throw new Error('Estado inválido (P, D o E).');
    const cambios = { estado };
    if (estado === 'E') {
      const fecha = body && body.fecha_entrega && String(body.fecha_entrega).trim()
        ? String(body.fecha_entrega).trim()
        : hoyLocalISO();
      cambios.fecha_entrega = fecha;
    }
    const { data, error } = await supabase.from('ventas').update(cambios).eq('id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Venta no encontrada o sin permiso para actualizarla.');
    return { ok: true, venta: data[0] };
  }

  // ----- Abonos de ventas en deuda -----
  if (method === 'POST' && path === '/api/pagos-venta') {
    const { venta_id, fecha_pago, monto, nota } = body || {};
    if (!venta_id) throw new Error('Falta la venta a la que se aplicará el abono.');
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) throw new Error('El monto del abono debe ser mayor a 0.');
    const fecha = fecha_pago ? String(fecha_pago).trim() : hoyLocalISO();

    const { data: venta, error: vErr } = await supabase
      .from('ventas').select('*').eq('id', venta_id).single();
    if (vErr || !venta) throw new Error('Venta no encontrada.');

    const { data: pagosPrevios, error: pErr } = await supabase
      .from('pagos_venta').select('monto').eq('venta_id', venta_id);
    if (pErr) throw new Error(esFaltaTabla(pErr) ? AVISO_TABLA_PAGOS : pErr.message);

    const abonadoPrevio = (pagosPrevios || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const saldoPrevio = calcularSaldo(venta.precio_venta, venta.deposito_cliente, abonadoPrevio);
    if (saldoPrevio <= 0) throw new Error('Esta venta ya no tiene saldo pendiente.');
    // El monto del abono no tiene restricciones: puede ser menor o mayor al precio de venta.

    const { data, error } = await supabase.from('pagos_venta').insert({
      venta_id,
      producto_id: venta.producto_id ?? null,
      fecha_pago: fecha,
      monto: montoNum,
      nota: nota ? String(nota).trim() : null
    }).select().single();
    if (error) throw new Error(esFaltaTabla(error) ? AVISO_TABLA_PAGOS : error.message);

    return {
      ok: true,
      pago: data,
      abonado: redondear2(abonadoPrevio + montoNum),
      saldo: Math.max(0, redondear2(saldoPrevio - montoNum))
    };
  }

  if ((m = path.match(/^\/api\/pagos-venta\/([^/]+)$/)) && method === 'DELETE') {
    const { data, error } = await supabase.from('pagos_venta').delete().eq('id', m[1]).select();
    if (error) throw new Error(esFaltaTabla(error) ? AVISO_TABLA_PAGOS : error.message);
    if (!data || !data.length) throw new Error('Abono no encontrado o sin permiso para eliminarlo.');
    return { ok: true, pago: data[0] };
  }

  // Marcar producto como "Sin Vender": elimina la venta (y sus abonos por cascada)
  if ((m = path.match(/^\/api\/ventas\/producto\/([^/]+)$/)) && method === 'DELETE') {
    const { data, error } = await supabase.from('ventas').delete().eq('producto_id', m[1]).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('No se encontró una venta registrada para este producto.');
    return { ok: true, venta: data[0] };
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
    // Por celular/nombre: listar todo lo pendiente (P o D), sin filtrar por fecha
    if (cel || nom) {
      qq = qq.in('estado', ['P', 'D']);
    } else if (fec) {
      qq = qq.eq('fecha_entrega', fec);
    }
    const { data: ventasQ, error: vErr } = await qq.order('created_at', { ascending: false }).limit(200);
    if (vErr) throw new Error(vErr.message);
    if (!ventasQ || !ventasQ.length) return { items: [] };
    const ventas = ventasQ;
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

  // ----- Cobranza de deudas por fecha de pago -----
  if (method === 'GET' && path === '/api/reportes/pagos') {
    const d = (q.get('desde') || '').trim();
    const h = (q.get('hasta') || '').trim() || d;
    if (!d) return { items: [], total: 0, faltaTabla: false };
    const { data: pagos, error } = await supabase
      .from('pagos_venta').select('*')
      .gte('fecha_pago', d).lte('fecha_pago', h)
      .order('fecha_pago').order('id').limit(1000);
    if (error) {
      if (esFaltaTabla(error)) return { items: [], total: 0, faltaTabla: true };
      throw new Error(error.message);
    }
    const lista = pagos || [];
    if (!lista.length) return { items: [], total: 0, faltaTabla: false };

    const ventaIds = [...new Set(lista.map((p) => p.venta_id))];
    const { data: ventas } = await supabase.from('ventas').select('*').in('id', ventaIds);
    const mapaV = {};
    (ventas || []).forEach((v) => { mapaV[v.id] = v; });

    const prodIds = [...new Set((ventas || []).map((v) => v.producto_id).filter(Boolean))];
    const { data: prods } = prodIds.length
      ? await supabase.from('productos_fardo').select('*').in('id', prodIds)
      : { data: [] };
    const mapaP = {};
    (prods || []).forEach((p) => { mapaP[p.id] = p; });

    const fardoIds = [...new Set((prods || []).map((p) => p.fardo_id).filter(Boolean))];
    const { data: fardos } = fardoIds.length
      ? await supabase.from('fardos').select('id, codigo_fardo, nombre_fardo').in('id', fardoIds)
      : { data: [] };
    const mapaF = {};
    (fardos || []).forEach((f) => { mapaF[f.id] = f; });

    const items = lista.map((p) => {
      const v = mapaV[p.venta_id] || {};
      const pr = mapaP[v.producto_id] || {};
      const f = mapaF[pr.fardo_id] || {};
      return {
        id: p.id,
        venta_id: p.venta_id,
        fecha_pago: p.fecha_pago,
        monto: Number(p.monto) || 0,
        nota: p.nota || '',
        cliente: v.nombre_cliente || '',
        celular: v.celular_cliente || '',
        codigo: pr.nombre_foto || '',
        fardo: f.codigo_fardo ? (f.codigo_fardo + ' — ' + (f.nombre_fardo || '')) : ''
      };
    });
    return { items, total: redondear2(items.reduce((s, i) => s + i.monto, 0)), faltaTabla: false };
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
