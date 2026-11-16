import { useEffect, useState } from 'react';
import html2canvas from 'html2canvas';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const POR_PAGINA = 10;

const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const fechaEnTexto = (iso) => {
  const [y, m, d] = String(iso || hoyISO()).split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  const texto = DIAS[fecha.getDay()] + ', ' + d + ' de ' + MESES[m - 1] + ' de ' + y;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

const normalizar = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const nombreCompleto = (c) => [c?.nombre, c?.apellido_paterno, c?.apellido_materno]
  .filter(Boolean)
  .join(' ');

const textoCliente = (c) => nombreCompleto(c) + (c?.celular ? ' — ' + c.celular : '');

const textoLugar = (l) => l
  ? l.lugar + ' — ' + l.ciudad + (l.detalle ? ' (' + l.detalle + ')' : '')
  : '';

const DESTINOS_INTERIOR = [
  'Cochabamba', 'Santa Cruz', 'Oruro', 'Potosí', 'Sucre', 'Tarija',
  'Trinidad', 'Cobija', 'Montero', 'Quillacollo', 'Sacaba', 'Riberalta',
  'Yacuiba', 'Villazón', 'Tupiza', 'Llallagua', 'Uyuni'
];

const formVacio = (tipo = 'LP') => ({
  id: null,
  tipo,
  destino: '',
  cliente_id: '',
  cliente_nombre: '',
  cliente_celular: '',
  lugar_entrega_id: '',
  lugar_texto: '',
  fecha_entrega: hoyISO(),
  estado: 'P',
  observacion: ''
});

export default function SolicitudesEntrega({ avisar }) {
  const [registros, setRegistros] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [lugares, setLugares] = useState([]);
  const [destinosLista, setDestinosLista] = useState(DESTINOS_INTERIOR);
  const [cargando, setCargando] = useState(false);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [clienteTexto, setClienteTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('LP');
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState(formVacio);
  const [guardando, setGuardando] = useState(false);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  async function cargar() {
    if (!fechaFiltro) {
      setRegistros([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.set('desde', fechaFiltro);
      params.set('hasta', fechaFiltro);
      const r = await api.get('/api/registro-entregas?' + params.toString());
      setRegistros(r.items || []);
      setFaltaTabla(false);
    } catch (err) {
      if (/registro_entregas/i.test(err.message)) {
        setFaltaTabla(true);
        setRegistros([]);
      } else {
        avisar('error', err.message);
      }
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let activo = true;
    Promise.all([
      api.get('/api/clientes'),
      api.get('/api/entregas'),
      api.get('/api/ciudades').catch(() => ({ ciudades: [] }))
    ])
      .then(([rc, rl, rci]) => {
        if (!activo) return;
        setClientes(rc.clientes || []);
        setLugares(rl.entregas || []);
        if (rci && rci.ciudades && rci.ciudades.length > 0) {
          const nombres = rci.ciudades.map((c) => c.ciudad || c.nombre).filter(Boolean);
          const unicos = [...new Set([...nombres, ...DESTINOS_INTERIOR])];
          setDestinosLista(unicos);
        }
      })
      .catch((err) => { if (activo) avisar('error', err.message); });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    if (fechaFiltro) {
      cargar();
    } else {
      setRegistros([]);
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaFiltro]);

  const lugarRecogidaDe = (r) => lugares.find((x) => String(x.id) === String(r.lugar_entrega_id));

  const textoRecogida = (r) => {
    const l = lugarRecogidaDe(r);
    return l ? textoLugar(l) : '';
  };

  const ciudadReporte = (r) => {
    const l = lugarRecogidaDe(r);
    const texto = normalizar([l?.lugar, l?.ciudad, l?.detalle].filter(Boolean).join(' '));
    if (texto.includes('el alto')) return 'elalto';
    if (texto.includes('la paz')) return 'lapaz';
    return '';
  };

  const esPaqueteria = (r) => {
    const l = lugarRecogidaDe(r);
    return normalizar([l?.lugar, l?.ciudad, l?.detalle].filter(Boolean).join(' '))
      .includes('paqueteria');
  };

  const colorReporte = (r) => {
    if (String(r.observacion || '').trim()) return 'naranja';
    if (!esPaqueteria(r)) return '';
    const ciudad = ciudadReporte(r);
    if (ciudad === 'elalto') return 'verde';
    if (ciudad === 'lapaz') return 'azul';
    return '';
  };

  const t = normalizar(busqueda.trim());
  const filtrados = registros.filter((r) => {
    if (filtroEstado && r.estado !== filtroEstado) return false;
    if (filtroTipo && (r.tipo || (r.destino ? 'INT' : 'LP')) !== filtroTipo) return false;
    if (!t) return true;
    return normalizar([
      r.cliente_nombre,
      r.cliente_celular,
      r.lugar_texto,
      r.destino,
      r.tipo === 'INT' ? 'interior' : 'la paz',
      textoRecogida(r),
      r.observacion
    ].filter(Boolean).join(' ')).includes(t);
  });

  const paginados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const total = filtrados.length;
  const pendientes = filtrados.filter((r) => r.estado !== 'E').length;
  const entregadas = filtrados.filter((r) => r.estado === 'E').length;

  const clientesOrdenados = [...clientes].sort((a, b) =>
    normalizar(nombreCompleto(a)).localeCompare(normalizar(nombreCompleto(b)), 'es', { numeric: true })
  );

  useEffect(() => { setPagina(1); }, [fechaFiltro, busqueda, filtroEstado, filtroTipo]);
  useEffect(() => {
    setPagina((p) => Math.min(p, Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))));
  }, [filtrados.length]);

  const cambiar = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const abrirFormulario = (tipo) => {
    const f = formVacio(tipo);
    if (fechaFiltro) {
      f.fecha_entrega = fechaFiltro;
    }
    setForm(f);
    setClienteTexto('');
    setMostrarFormulario(true);
  };

  const cargarUbicacionCliente = async (cliente) => {
    if (!cliente) return;
    setBuscandoUbicacion(true);
    try {
      const params = new URLSearchParams();
      if (cliente.celular) params.set('celular', cliente.celular);
      else params.set('nombre', nombreCompleto(cliente));
      const r = await api.get('/api/solicitudes?' + params.toString());
      const ubicaciones = [];
      (r.items || []).forEach((it) => {
        const u = it.venta?.ubicacion;
        if (u && u !== '—' && !ubicaciones.includes(u)) ubicaciones.push(u);
      });
      setForm((f) => String(f.cliente_id) === String(cliente.id)
        ? { ...f, lugar_texto: ubicaciones.join(' / ') }
        : f);
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setBuscandoUbicacion(false);
    }
  };

  const cambiarClienteTexto = (e) => {
    const valor = e.target.value;
    setClienteTexto(valor);
    const c = clientes.find((x) => textoCliente(x) === valor);
    setForm((f) => ({
      ...f,
      cliente_id: c ? String(c.id) : '',
      cliente_nombre: c ? nombreCompleto(c) : '',
      cliente_celular: c ? (c.celular || '') : '',
      lugar_entrega_id: '',
      lugar_texto: ''
    }));
    if (c) cargarUbicacionCliente(c);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.cliente_nombre.trim()) {
      avisar('error', 'Escribe o selecciona el cliente.');
      return;
    }
    if (form.tipo === 'LP' && !form.lugar_entrega_id) {
      avisar('error', 'Selecciona el lugar donde recogerá su pedido.');
      return;
    }
    if (form.tipo === 'INT' && !form.destino.trim()) {
      avisar('error', 'Elige o escribe la ciudad de destino de la entrega.');
      return;
    }
    if (!form.lugar_texto.trim()) {
      avisar('error', 'El lugar donde se encuentra el pedido es obligatorio.');
      return;
    }
    if (!form.fecha_entrega) {
      avisar('error', 'Elige la fecha de entrega.');
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        ...form,
        cliente_id: form.cliente_id || null,
        lugar_entrega_id: form.tipo === 'LP' ? (form.lugar_entrega_id || null) : null,
        lugar_texto: form.lugar_texto.trim(),
        tipo: form.tipo || 'LP',
        destino: form.tipo === 'INT' ? form.destino.trim() : null
      };
      if (form.id) {
        await api.put('/api/registro-entregas/' + form.id, payload);
        avisar('exito', form.tipo === 'INT' ? 'Entrega al interior actualizada.' : 'Entrega actualizada.');
      } else {
        await api.post('/api/registro-entregas', payload);
        avisar('exito', form.tipo === 'INT' ? 'Entrega al interior agregada al listado.' : 'Entrega agregada al listado.');
      }
      const fechaGuardada = form.fecha_entrega;
      setForm(formVacio());
      setClienteTexto('');
      setMostrarFormulario(false);
      if (fechaGuardada) {
        if (fechaFiltro === fechaGuardada) {
          await cargar();
        } else {
          setFechaFiltro(fechaGuardada);
        }
      }
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setGuardando(false);
    }
  };

  const editar = (r) => {
    setMostrarFormulario(true);
    const cli = r.cliente_id ? clientes.find((c) => String(c.id) === String(r.cliente_id)) : null;
    setClienteTexto(cli ? textoCliente(cli) : '');
    setForm({
      id: r.id,
      tipo: r.tipo || (r.destino ? 'INT' : 'LP'),
      destino: r.destino || '',
      cliente_id: r.cliente_id ? String(r.cliente_id) : '',
      cliente_nombre: r.cliente_nombre || '',
      cliente_celular: r.cliente_celular || '',
      lugar_entrega_id: r.lugar_entrega_id ? String(r.lugar_entrega_id) : '',
      lugar_texto: r.lugar_texto || '',
      fecha_entrega: r.fecha_entrega || hoyISO(),
      estado: r.estado || 'P',
      observacion: r.observacion || ''
    });
  };

  const cancelar = () => {
    setForm(formVacio());
    setClienteTexto('');
  };

  const eliminar = async (r) => {
    if (!window.confirm('¿Eliminar la entrega de ' + r.cliente_nombre + '?')) return;
    try {
      await api.del('/api/registro-entregas/' + r.id);
      if (String(form.id) === String(r.id)) {
        setForm(formVacio());
        setMostrarFormulario(false);
      }
      avisar('exito', 'Entrega eliminada.');
      await cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const entregar = async (r) => {
    if (!window.confirm('¿Marcar como ENTREGADO a ' + r.cliente_nombre + '?')) return;
    try {
      await api.post('/api/registro-entregas/' + r.id + '/entregar', { fecha_entrega: r.fecha_entrega || hoyISO() });
      avisar('exito', 'Entrega marcada como entregada.');
      await cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const imprimirReporte = () => {
    const datosReporte = filtrados.filter((r) => (r.tipo || 'LP') !== 'INT');
    if (!datosReporte.length) {
      avisar('error', 'No hay entregas de La Paz para generar el reporte.');
      return;
    }
    const escH = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const colores = { verde: '#bbf7d0', azul: '#bfdbfe', naranja: '#fed7aa' };
    const filas = datosReporte.map((r, i) => {
      const fondo = colores[colorReporte(r)] || '';
      const ciudad = ciudadReporte(r);
      const lugar = escH(textoRecogida(r) || '—');
      const estilo = (c) => ciudad === c && fondo ? ` style="background:${fondo}"` : '';
      return `<tr>
        <td class="col-n">${i + 1}</td>
        <td class="col-cliente">${escH(r.cliente_nombre)}</td>
        <td class="col-lugar"${estilo('elalto')}>${ciudad === 'elalto' ? lugar : ''}</td>
        <td class="col-lugar"${estilo('lapaz')}>${ciudad === 'lapaz' ? lugar : ''}</td>
      </tr>`;
    }).join('');
    const fecha = fechaEnTexto(fechaFiltro || hoyISO());
    const totalElAlto = datosReporte.filter((r) => ciudadReporte(r) === 'elalto').length;
    const totalLaPaz = datosReporte.filter((r) => ciudadReporte(r) === 'lapaz').length;
    const totalObservaciones = datosReporte.filter((r) => String(r.observacion || '').trim()).length;
    const logoUrl = window.location.origin + '/JC.jpeg';
    const w = window.open('', '_blank');
    if (!w) {
      avisar('error', 'Permite las ventanas emergentes para imprimir el reporte.');
      return;
    }
    w.document.write(`<!doctype html><html><head><title>ENTREGAS DEPARTAMENTO DE LA PAZ</title><style>
      @page{size:A4 portrait;margin:14mm 13mm}
      *{box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;padding:18px 22px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#eef2f7}
      .reporte{max-width:980px;margin:0 auto;background:#fff;padding:26px 28px;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
      .cabecera{display:flex;align-items:center;gap:18px;padding-bottom:14px}
      .logo-box{width:88px;height:88px;border-radius:12px;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff;flex:0 0 auto}
      .logo-box img{display:block;max-width:100%;max-height:100%;width:auto;height:auto}
      .titulo{flex:1;text-align:center}
      .marca{margin:0 0 6px;font-size:10px;letter-spacing:.24em;color:#92400e;font-weight:700;text-transform:uppercase}
      h1{margin:0;font-size:22px;letter-spacing:.04em;color:#111827;font-weight:800;text-transform:uppercase}
      .fecha{margin:7px 0 0;font-size:13px;color:#4b5563;font-weight:600}
      .sello{flex:0 0 auto;width:88px;text-align:center;font-size:9px;letter-spacing:.14em;color:#92400e;font-weight:700;line-height:1.5;border:1px solid #f3d19c;border-radius:10px;padding:10px 6px;background:#fffbeb}
      .barra{height:4px;background:linear-gradient(90deg,#111827 0%,#d97706 45%,#f59e0b 100%);border-radius:999px;margin:0 0 16px}
      .resumen{display:flex;gap:10px;margin-bottom:16px}
      .dato{flex:1;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;padding:10px 12px}
      .dato span{display:block;font-size:9px;letter-spacing:.12em;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:4px}
      .dato strong{font-size:19px;color:#111827}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #d1d5db;padding:9px 10px;vertical-align:middle;text-align:left}
      thead th{background:#111827;color:#fff;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700}
      thead .grupo-lugar{background:#b45309;border-color:#92400e;text-align:center}
      thead .sub-lugar{background:#fef3c7;color:#78350f;text-align:center;border-color:#d97706}
      .col-n{width:52px;text-align:center;color:#6b7280;font-weight:700}
      .col-cliente{font-weight:600}
      thead .th-cliente{text-align:center;vertical-align:middle;font-size:15px;letter-spacing:.14em}
      .col-lugar{text-align:center;font-size:12px}
      thead{display:table-header-group}tr{page-break-inside:avoid}
      .pie{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:14px}
      .leyenda{display:flex;flex-wrap:wrap;gap:14px;font-size:10px;color:#4b5563}
      .leyenda span{display:flex;align-items:center;gap:6px}
      .leyenda i{display:inline-block;width:16px;height:11px;border:1px solid #9ca3af;border-radius:2px}
      .generado{font-size:9px;color:#9ca3af;text-align:right;line-height:1.4}
      .no-print{display:flex;justify-content:center;gap:10px;margin-top:22px}
      .no-print button{padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;border:0;border-radius:8px;background:#111827;color:#fff}
      .no-print button:disabled{opacity:.65;cursor:wait}
      .no-print .btn-imagen{background:#16a34a}
      @media print{.no-print{display:none}body{padding:0;background:#fff}.reporte{max-width:none;padding:0;border-radius:0;box-shadow:none}.cabecera{padding-bottom:10px}}
    </style></head><body>
      <main id="reporte" class="reporte">
      <header class="cabecera">
        <div class="logo-box"><img src="${logoUrl}" alt="Capricornio Detalles"></div>
        <div class="titulo">
          <p class="marca">Capricornio Detalles · JC</p>
          <h1>ENTREGAS DEPARTAMENTO DE LA PAZ</h1>
          <p class="fecha">${escH(fecha)}</p>
        </div>
        <div class="sello">REPORTE<br>OPERATIVO</div>
      </header>
      <div class="barra"></div>
      <div class="resumen">
        <div class="dato"><span>Total entregas</span><strong>${datosReporte.length}</strong></div>
        <div class="dato"><span>El Alto</span><strong>${totalElAlto}</strong></div>
        <div class="dato"><span>La Paz</span><strong>${totalLaPaz}</strong></div>
        <div class="dato"><span>Observaciones</span><strong>${totalObservaciones}</strong></div>
      </div>
      <table>
        <thead>
          <tr><th rowspan="2" class="col-n">N°</th><th rowspan="2" class="col-cliente th-cliente">BELLIT@S</th><th colspan="2" class="grupo-lugar">LUGAR DE ENTREGA</th></tr>
          <tr><th class="sub-lugar">EL ALTO</th><th class="sub-lugar">LA PAZ</th></tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="pie">
        <div class="leyenda">
          <span><i style="background:#bbf7d0"></i>Paquetería El Alto</span>
          <span><i style="background:#bfdbfe"></i>Paquetería La Paz</span>
          <span><i style="background:#fed7aa"></i>Pendientes</span>
        </div>
        <div class="generado">Documento generado automáticamente<br>Capricornio Detalles · JC</div>
      </div>
      </main>
      <div class="no-print">
        <button type="button" id="btn-imagen" class="btn-imagen">📲 Compartir / Descargar imagen</button>
        <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();

    const botonImagen = w.document.getElementById('btn-imagen');
    if (botonImagen) {
      botonImagen.addEventListener('click', async () => {
        const textoOriginal = botonImagen.textContent;
        botonImagen.disabled = true;
        botonImagen.textContent = 'Generando imagen...';
        try {
          const nodo = w.document.getElementById('reporte');
          await Promise.all(Array.from(w.document.images).map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolver) => {
              img.onload = resolver;
              img.onerror = resolver;
            });
          }));
          const canvas = await html2canvas(nodo, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
          });
          const blob = await new Promise((resolver, rechazar) => {
            canvas.toBlob((b) => b ? resolver(b) : rechazar(new Error('No se pudo crear la imagen.')), 'image/png', 1);
          });
          const fechaArchivo = fechaFiltro || hoyISO();
          const nombre = 'entregas-la-paz-' + fechaArchivo + '.png';
          const archivo = new File([blob], nombre, { type: 'image/png' });
          if (w.navigator.canShare && w.navigator.canShare({ files: [archivo] })) {
            try {
              await w.navigator.share({
                files: [archivo],
                title: 'Entregas Departamento de La Paz',
                text: 'Reporte de Entregas Departamento de La Paz'
              });
              return;
            } catch (err) {
              if (err && err.name === 'AbortError') return;
            }
          }
          const url = URL.createObjectURL(blob);
          const enlace = w.document.createElement('a');
          enlace.href = url;
          enlace.download = nombre;
          enlace.style.display = 'none';
          w.document.body.appendChild(enlace);
          enlace.click();
          enlace.remove();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
        } catch (err) {
          w.alert('No se pudo generar la imagen: ' + err.message);
        } finally {
          botonImagen.disabled = false;
          botonImagen.textContent = textoOriginal;
        }
      });
    }
  };

  const imprimirReporteInterior = () => {
    const datosReporte = filtrados.filter((r) => (r.tipo || (r.destino ? 'INT' : 'LP')) === 'INT');
    if (!datosReporte.length) {
      avisar('error', 'No hay entregas al interior para generar el reporte.');
      return;
    }
    const escH = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const filas = datosReporte.map((r, i) => `<tr>
      <td class="col-n">${i + 1}</td>
      <td class="col-cliente">${escH(r.cliente_nombre)}</td>
      <td class="col-cel">${escH(r.cliente_celular || '—')}</td>
      <td class="col-destino"><strong>${escH(r.destino || '—')}</strong></td>
    </tr>`).join('');
    const fecha = fechaEnTexto(fechaFiltro || hoyISO());
    const destinosUnicos = [...new Set(datosReporte.map((r) => r.destino).filter(Boolean))].length;
    const totalEntregadas = datosReporte.filter((r) => r.estado === 'E').length;
    const totalPendientes = datosReporte.filter((r) => r.estado !== 'E').length;
    const logoUrl = window.location.origin + '/JC.jpeg';
    const w = window.open('', '_blank');
    if (!w) {
      avisar('error', 'Permite las ventanas emergentes para imprimir el reporte.');
      return;
    }
    w.document.write(`<!doctype html><html><head><title>ENTREGAS AL INTERIOR</title><style>
      @page{size:A4 portrait;margin:14mm 13mm}
      *{box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;padding:18px 22px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#eef2f7}
      .reporte{max-width:980px;margin:0 auto;background:#fff;padding:26px 28px;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
      .cabecera{display:flex;align-items:center;gap:18px;padding-bottom:14px}
      .logo-box{width:88px;height:88px;border-radius:12px;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff;flex:0 0 auto}
      .logo-box img{display:block;max-width:100%;max-height:100%;width:auto;height:auto}
      .titulo{flex:1;text-align:center}
      .marca{margin:0 0 6px;font-size:10px;letter-spacing:.24em;color:#0d9488;font-weight:700;text-transform:uppercase}
      h1{margin:0;font-size:22px;letter-spacing:.04em;color:#111827;font-weight:800;text-transform:uppercase}
      .fecha{margin:7px 0 0;font-size:13px;color:#4b5563;font-weight:600}
      .sello{flex:0 0 auto;width:88px;text-align:center;font-size:9px;letter-spacing:.14em;color:#0d9488;font-weight:700;line-height:1.5;border:1px solid #99f6e4;border-radius:10px;padding:10px 6px;background:#f0fdfa}
      .barra{height:4px;background:linear-gradient(90deg,#111827 0%,#0d9488 45%,#14b8a6 100%);border-radius:999px;margin:0 0 16px}
      .resumen{display:flex;gap:10px;margin-bottom:16px}
      .dato{flex:1;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;padding:10px 12px}
      .dato span{display:block;font-size:9px;letter-spacing:.12em;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:4px}
      .dato strong{font-size:19px;color:#111827}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #d1d5db;padding:9px 10px;vertical-align:middle;text-align:left}
      thead th{background:#111827;color:#fff;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700}
      thead .th-dest{background:#0d9488;text-align:center}
      .col-n{width:48px;text-align:center;color:#6b7280;font-weight:700}
      .col-cliente{font-weight:700;font-size:14px}
      .col-cel{width:130px;text-align:center;font-size:13px;font-weight:600}
      .col-destino{width:180px;text-align:center;color:#0f766e;font-size:14px;font-weight:700}
      thead{display:table-header-group}tr{page-break-inside:avoid}
      .pie{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:14px}
      .generado{font-size:9px;color:#9ca3af;text-align:right;line-height:1.4}
      .no-print{display:flex;justify-content:center;gap:10px;margin-top:22px}
      .no-print button{padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;border:0;border-radius:8px;background:#111827;color:#fff}
      .no-print button:disabled{opacity:.65;cursor:wait}
      .no-print .btn-imagen{background:#16a34a}
      @media print{.no-print{display:none}body{padding:0;background:#fff}.reporte{max-width:none;padding:0;border-radius:0;box-shadow:none}.cabecera{padding-bottom:10px}}
    </style></head><body>
      <main id="reporte" class="reporte">
      <header class="cabecera">
        <div class="logo-box"><img src="${logoUrl}" alt="Capricornio Detalles"></div>
        <div class="titulo">
          <p class="marca">Capricornio Detalles · JC</p>
          <h1>ENTREGAS AL INTERIOR</h1>
          <p class="fecha">${escH(fecha)}</p>
        </div>
        <div class="sello">REPORTE<br>INTERIOR</div>
      </header>
      <div class="barra"></div>
      <div class="resumen">
        <div class="dato"><span>Total entregas</span><strong>${datosReporte.length}</strong></div>
        <div class="dato"><span>Ciudades</span><strong>${destinosUnicos}</strong></div>
        <div class="dato"><span>Pendientes</span><strong>${totalPendientes}</strong></div>
        <div class="dato"><span>Entregadas</span><strong>${totalEntregadas}</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="col-n">N°</th>
            <th>BELLIT@S (CLIENTE)</th>
            <th>CELULAR</th>
            <th class="th-dest">DESTINO</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="pie">
        <div style="font-size:10px;color:#6b7280 ">Capricornio Detalles · Envíos y entregas a nivel nacional</div>
        <div class="generado">Documento generado automáticamente<br>Capricornio Detalles · JC</div>
      </div>
      </main>
      <div class="no-print">
        <button type="button" id="btn-imagen" class="btn-imagen">📲 Compartir / Descargar imagen</button>
        <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();

    const botonImagen = w.document.getElementById('btn-imagen');
    if (botonImagen) {
      botonImagen.addEventListener('click', async () => {
        const textoOriginal = botonImagen.textContent;
        botonImagen.disabled = true;
        botonImagen.textContent = 'Generando imagen...';
        try {
          const nodo = w.document.getElementById('reporte');
          await Promise.all(Array.from(w.document.images).map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolver) => {
              img.onload = resolver;
              img.onerror = resolver;
            });
          }));
          const canvas = await html2canvas(nodo, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
          });
          const blob = await new Promise((resolver, rechazar) => {
            canvas.toBlob((b) => b ? resolver(b) : rechazar(new Error('No se pudo crear la imagen.')), 'image/png', 1);
          });
          const fechaArchivo = fechaFiltro || hoyISO();
          const nombre = 'entregas-interior-' + fechaArchivo + '.png';
          const archivo = new File([blob], nombre, { type: 'image/png' });
          if (w.navigator.canShare && w.navigator.canShare({ files: [archivo] })) {
            try {
              await w.navigator.share({
                files: [archivo],
                title: 'Entregas al Interior',
                text: 'Reporte de Entregas al Interior'
              });
              return;
            } catch (err) {
              if (err && err.name === 'AbortError') return;
            }
          }
          const url = URL.createObjectURL(blob);
          const enlace = w.document.createElement('a');
          enlace.href = url;
          enlace.download = nombre;
          enlace.style.display = 'none';
          w.document.body.appendChild(enlace);
          enlace.click();
          enlace.remove();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
        } catch (err) {
          w.alert('No se pudo generar la imagen: ' + err.message);
        } finally {
          botonImagen.disabled = false;
          botonImagen.textContent = textoOriginal;
        }
      });
    }
  };

  if (faltaTabla) {
    return (
      <div className="card">
        <h2>🚚 Registro de Entregas</h2>
        <p className="error">
          Falta crear la tabla <strong>registro_entregas</strong> en Supabase.
        </p>
        <p className="hint">
          Ejecuta el archivo <strong>auth-supabase/REGISTRO_ENTREGAS.sql</strong> en el SQL Editor de Supabase y recarga la página.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2>🚚 Registro de Entregas</h2>
        <p className="hint">
          Crea entregas para La Paz o el interior del país, o filtra el listado existente por fecha, estado y lugar.
        </p>

        <div className="btn-grupo-entregas" style={{ marginTop: 10, marginBottom: 16 }}>
          <button
            type="button"
            className="btn-modo-entrega lp-inactivo"
            onClick={() => abrirFormulario('LP')}
          >
            <span className="btn-ico">🏙️</span>
            <span className="btn-txt">
              <strong>Registrar Entregas</strong>
              <small>La Paz y El Alto</small>
            </span>
          </button>
          <button
            type="button"
            className="btn-modo-entrega int-inactivo"
            onClick={() => abrirFormulario('INT')}
          >
            <span className="btn-ico">🌎</span>
            <span className="btn-txt">
              <strong>Entregas Interior</strong>
              <small>Departamentos de Bolivia</small>
            </span>
          </button>
        </div>

        <div style={{ maxWidth: 420, margin: '10px 0 16px' }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
            📅 Fecha de entrega
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              style={{ flex: 1, minHeight: 44 }}
            />
            <button
              type="button"
              className="btn-secundario"
              onClick={() => setFechaFiltro(hoyISO())}
              title="Seleccionar la fecha de hoy"
              style={{ minHeight: 44, padding: '0 14px', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}
            >
              ⚡ Hoy
            </button>
            {fechaFiltro && (
              <button
                type="button"
                className="btn-secundario"
                onClick={() => setFechaFiltro('')}
                title="Limpiar fecha"
                style={{ minHeight: 44, padding: '0 12px', fontSize: 13, color: '#ef4444' }}
              >
                ✕ Limpiar
              </button>
            )}
          </div>
        </div>

        {!fechaFiltro ? (
          <div style={{
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: 8,
            padding: '16px 20px',
            color: '#475569',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <span style={{ fontSize: 20 }}>👉</span>
            <span>Selecciona una <strong>fecha de entrega</strong> para ver los filtros y el listado de pedidos.</span>
          </div>
        ) : (
          <>
            <form className="filtros-entregas-grid" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label>Tipo de entrega</label>
                <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                  <option value="LP">🏙️ Entregas La Paz</option>
                  <option value="INT">🌎 Entregas Interior</option>
                  <option value="">Todas (La Paz e Interior)</option>
                </select>
              </div>
              <div>
                <label>🔍 Buscar cliente o lugar</label>
                <input
                  type="search"
                  placeholder="Ej: Juan, 77712345 o Terminal"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
              <div>
                <label>Estado</label>
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="P">⏳ Pendientes</option>
                  <option value="E">✅ Entregadas</option>
                </select>
              </div>
            </form>

            <div className="resumen-analisis">
              <div className="resumen-item"><span>Total listado</span><strong>{total}</strong></div>
              <div className="resumen-item"><span>Pendientes</span><strong>{pendientes}</strong></div>
              <div className="resumen-item"><span>Entregadas</span><strong>{entregadas}</strong></div>
            </div>
          </>
        )}
      </div>

      {mostrarFormulario && (
        <div className="modal-fondo" onClick={() => { cancelar(); setMostrarFormulario(false); }}>
          <div className="modal-entrega" onClick={(e) => e.stopPropagation()}>
            <div className="modal-entrega-cabecera">
              <div>
                <h2>
                  {form.id
                    ? (form.tipo === 'INT' ? '✏️ Editar Entrega al Interior' : '✏️ Editar Entrega')
                    : (form.tipo === 'INT' ? '🌎 Nueva Entrega al Interior' : '🏙️ Registrar Entrega La Paz')}
                </h2>
                <p className="sub">
                  {form.tipo === 'INT'
                    ? 'Registro de despacho y entrega a otros departamentos de Bolivia'
                    : 'Registro de entrega local para La Paz y El Alto'}
                </p>
              </div>
              <button
                type="button"
                className="modal-entrega-cerrar"
                onClick={() => { cancelar(); setMostrarFormulario(false); }}
                title="Cerrar ventana"
              >
                ✕
              </button>
            </div>

            <div className="modal-entrega-cuerpo">
              <form onSubmit={guardar}>
                <div className="grid2">
                  <div>
                    <label>Cliente registrado</label>
                    <input
                      list="clientes-registrados"
                      placeholder="Buscar por nombre o celular..."
                      value={clienteTexto}
                      onChange={cambiarClienteTexto}
                      autoComplete="off"
                    />
                    <datalist id="clientes-registrados">
                      {clientesOrdenados.map((c) => (
                        <option key={c.id} value={textoCliente(c)} />
                      ))}
                    </datalist>
                    <small className="hint">Escribe nombre o celular y elige de la lista.</small>
                  </div>
                  <div>
                    <label>Nombre del cliente *</label>
                    <input
                      name="cliente_nombre"
                      placeholder="Ej: Juan Pérez"
                      value={form.cliente_nombre}
                      onChange={cambiar}
                      required
                    />
                  </div>
                  <div>
                    <label>Celular</label>
                    <input
                      name="cliente_celular"
                      placeholder="Ej: 77712345"
                      value={form.cliente_celular}
                      onChange={cambiar}
                    />
                  </div>
                  {form.tipo === 'INT' ? (
                    <div>
                      <label>Destino (Ciudad) *</label>
                      <input
                        name="destino"
                        list="destinos-interior"
                        placeholder="Elige o escribe la ciudad de destino"
                        value={form.destino}
                        onChange={cambiar}
                        required
                        autoFocus
                      />
                      <datalist id="destinos-interior">
                        {destinosLista.map((destino) => (
                          <option key={destino} value={destino} />
                        ))}
                      </datalist>
                      <small className="hint">Selecciona una ciudad de la lista o escribe una nueva.</small>
                    </div>
                  ) : (
                    <div>
                      <label>Lugar donde recogerá *</label>
                      <select name="lugar_entrega_id" value={form.lugar_entrega_id} onChange={cambiar} required>
                        <option value="">— Selecciona un lugar del listado —</option>
                        {lugares.map((l) => (
                          <option key={l.id} value={l.id}>{textoLugar(l)}</option>
                        ))}
                      </select>
                      {lugares.length === 0 && (
                        <small className="hint">
                          No hay lugares registrados. Agrégalos en Configuración → Lugares de Entrega.
                        </small>
                      )}
                    </div>
                  )}
                  <div className="full">
                    <label>Lugar donde se encuentra el pedido *</label>
                    <input
                      name="lugar_texto"
                      placeholder={buscandoUbicacion ? 'Buscando ubicación del producto...' : 'Se completa al seleccionar el cliente'}
                      value={form.lugar_texto}
                      onChange={cambiar}
                      required
                    />
                    <small className="hint">
                      {buscandoUbicacion
                        ? 'Buscando la ubicación del producto del cliente...'
                        : 'Se completa automáticamente con la ubicación del producto al seleccionar el cliente.'}
                    </small>
                  </div>
                  <div>
                    <label>Fecha de entrega</label>
                    <input
                      type="date"
                      name="fecha_entrega"
                      value={form.fecha_entrega}
                      onChange={cambiar}
                      required
                    />
                  </div>
                  <div>
                    <label>Estado</label>
                    <select name="estado" value={form.estado} onChange={cambiar}>
                      <option value="P">⏳ Pendiente</option>
                      <option value="E">✅ Entregado</option>
                    </select>
                  </div>
                  <div className="full">
                    <label>Observación / detalle del pedido</label>
                    <input
                      name="observacion"
                      placeholder="Ej: 2 prendas, llamar antes de entregar"
                      value={form.observacion}
                      onChange={cambiar}
                    />
                  </div>
                </div>

                <div className="form-acciones-responsive" style={{ marginTop: 18 }}>
                  <button
                    type="submit"
                    className={`btn-submit-entrega ${form.id ? 'btn-submit-edit' : (form.tipo === 'INT' ? 'btn-submit-int' : 'btn-submit-lp')}`}
                    disabled={guardando}
                  >
                    {guardando
                      ? 'Guardando...'
                      : (form.id
                        ? '💾 Guardar cambios'
                        : (form.tipo === 'INT' ? '🌎 Guardar Entrega Interior' : '➕ Guardar Entrega'))}
                  </button>
                  <button
                    type="button"
                    className="btn-cancelar"
                    onClick={() => { cancelar(); setMostrarFormulario(false); }}
                    disabled={guardando}
                  >
                    ✕ Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {fechaFiltro && (
        <div className="card">
          <h2>📋 Listado de entregas ({filtrados.length})</h2>
          <div className="btn-grupo-reportes">
            <button type="button" className="btn-reporte btn-reporte-lapaz" onClick={imprimirReporte}>
              📄 Reporte Entregas La Paz / El Alto
            </button>
            <button type="button" className="btn-reporte btn-reporte-interior" onClick={imprimirReporteInterior}>
              🌎 Reporte Entregas al Interior
            </button>
          </div>
          {cargando ? (
            <p className="empty">Cargando entregas...</p>
          ) : filtrados.length === 0 ? (
            <p className="empty">No hay entregas para los filtros seleccionados.</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Celular</th>
                    <th>Lugar donde recogerá</th>
                    <th>Lugar del pedido</th>
                    <th>Destino</th>
                    <th>Estado</th>
                    <th>Observación</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginados.map((r) => (
                    <tr key={r.id} className={r.estado === 'E' ? 'estado-E' : 'estado-P'}>
                      <td data-label="Fecha">{r.fecha_entrega || '—'}</td>
                      <td data-label="Cliente">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{r.cliente_nombre}</span>
                          {(r.tipo === 'INT' || r.destino) && (
                            <span style={{ fontSize: 10, background: '#ccfbf1', color: '#0f766e', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                              INTERIOR
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Celular">{r.cliente_celular || '—'}</td>
                      <td data-label="Lugar donde recogerá">{textoRecogida(r) || (r.tipo === 'INT' ? '—' : '—')}</td>
                      <td data-label="Lugar del pedido">{r.lugar_texto}</td>
                      <td data-label="Destino">{r.destino ? <strong>{r.destino}</strong> : '—'}</td>
                      <td data-label="Estado">
                        {r.estado === 'E' ? '✅ Entregado' : '⏳ Pendiente'}
                      </td>
                      <td data-label="Observación">{r.observacion || '—'}</td>
                      <td data-label="Acciones" className="actions">
                        {r.estado !== 'E' && (
                          <button className="btn-lila" onClick={() => entregar(r)}>Entregar</button>
                        )}
                        <button className="btn-edit" onClick={() => editar(r)}>Editar</button>
                        <button className="btn-del" onClick={() => eliminar(r)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion total={filtrados.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
        </div>
      )}
    </>
  );
}
