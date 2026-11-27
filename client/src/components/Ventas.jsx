import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';
import { dividirNombreCompleto } from '../nombreCliente.js';
const ESTADOS = { P: 'Pendiente de Entrega', D: 'Deuda', E: 'Entregado', S: 'Sin Vender' };

const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const dinero = (n) => (Number(n) || 0).toFixed(2);
const soloDigitos = (v) => String(v || '').replace(/\D/g, '');

const formVacio = {
  fecha_venta: '', precio_venta: '', deposito_cliente: '', celular_cliente: '',
  nombre_cliente: '', ciudad: '', fecha_entrega: '', observacion: '', estado: 'P', ubicacion_id: ''
};

export default function Ventas({ fardos, avisar }) {
  const [fardoId, setFardoId] = useState('');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [fTexto, setFTexto] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fCelular, setFCelular] = useState('');
  const [fNombre, setFNombre] = useState('');
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(formVacio);
  const [fechaVentaGlobal, setFechaVentaGlobal] = useState('');
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;
  const [clientes, setClientes] = useState([]);
  const [clienteHint, setClienteHint] = useState('');
  const [ubicaciones, setUbicaciones] = useState([]);
  const [pagosTabla, setPagosTabla] = useState(true);
  const [pagoFecha, setPagoFecha] = useState(hoyISO());
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoNota, setPagoNota] = useState('');
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [verImagenes, setVerImagenes] = useState(false);
  const [verProducto, setVerProducto] = useState(null);

  useEffect(() => {
    api.get('/api/clientes').then((r) => setClientes(r.clientes)).catch(() => {});
    api.get('/api/ubicaciones').then((r) => setUbicaciones(r.ubicaciones)).catch(() => {});
  }, []);

  const cargar = async (id, silencioso = false) => {
    if (!id) { setItems([]); return []; }
    if (!silencioso) setCargando(true);
    setFaltaTabla(false);
    try {
      const r = await api.get('/api/ventas?fardo_id=' + id);
      setItems(r.items);
      setPagosTabla(r.pagosTabla !== false);
      return r.items || [];
    } catch (err) {
      if (err.message.includes('ventas')) setFaltaTabla(true);
      else if (!silencioso) avisar('error', err.message);
      if (!silencioso) setItems([]);
      return [];
    } finally {
      if (!silencioso) setCargando(false);
    }
  };

  // Auto-recarga silenciosa del fardo abierto cada 20s (no pisa el formulario)
  useEffect(() => {
    if (!fardoId || editando) return;
    const id = setInterval(() => cargar(fardoId, true), 20000);
    return () => clearInterval(id);
  }, [fardoId, editando]);

  const elegir = (id) => {
    setFardoId(id);
    setEditando(null);
    cargar(id);
  };

  const abrirVenta = (item) => {
    const v = item.venta || {};
    const esNuevo = !item.venta;
    setEditando(item);
    setClienteHint('');
    setPagoFecha(hoyISO());
    setPagoMonto('');
    setPagoNota('');
    setForm({
      fecha_venta: v.fecha_venta || fechaVentaGlobal || '',
      // Al registrar: prellenar con el precio original del producto
      precio_venta: v.precio_venta ?? (esNuevo ? (item.precio ?? '') : ''),
      deposito_cliente: v.deposito_cliente ?? '',
      celular_cliente: v.celular_cliente || '',
      nombre_cliente: v.nombre_cliente || '',
      ciudad: v.ciudad || '',
      fecha_entrega: v.fecha_entrega || '',
      observacion: v.observacion || '',
      estado: v.estado || 'P',
      ubicacion_id: v.ubicacion_id ? String(v.ubicacion_id) : ''
    });
    setTimeout(() => document.getElementById('form-venta')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Al poner el celular: si existe en nuestras bases, autocompletar. Si no, dejar vacío.
  const cambiarCelular = async (valor) => {
    const celLimpio = soloDigitos(valor);
    setForm((f) => ({ ...f, celular_cliente: valor }));
    if (!celLimpio) {
      setForm((f) => ({ ...f, celular_cliente: valor, nombre_cliente: '', ciudad: '', ubicacion_id: '' }));
      setClienteHint('');
      return;
    }
    setClienteHint('Buscando...');
    try {
      const r = await api.get('/api/ventas/por-celular?celular=' + encodeURIComponent(valor.trim()));
      if (r.venta) {
        setForm((f) => ({
          ...f,
          celular_cliente: valor,
          nombre_cliente: r.venta.nombre_cliente || '',
          ciudad: r.venta.ciudad || '',
          ubicacion_id: r.venta.ubicacion_id ? String(r.venta.ubicacion_id) : ''
        }));
        setClienteHint('✓ Datos de venta anterior (pendiente/deuda).');
        return;
      }
    } catch {
      // sigue con el registro de clientes
    }
    const c = clientes.find((x) => soloDigitos(x.celular) === celLimpio);
    if (c) {
      setForm((f) => ({
        ...f,
        celular_cliente: valor,
        nombre_cliente: [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' '),
        ciudad: c.ciudad || ''
      }));
      setClienteHint('✓ Cliente encontrado en el registro.');
    } else {
      // No está en la base de datos: no arrastrar nombres ni ciudades de búsquedas previas
      setForm((f) => ({ ...f, celular_cliente: valor, nombre_cliente: '', ciudad: '', ubicacion_id: '' }));
      setClienteHint('Celular no registrado. Completa el nombre y la ciudad del nuevo cliente.');
    }
  };

  // Al vender, si el celular no está en Clientes, se registra automáticamente con
  // Nombre, Apellido Paterno y Apellido Materno separados para que el listado se vea bien.
  const registrarClienteDesdeVenta = async (datos) => {
    const cel = soloDigitos(datos.celular_cliente);
    const nombreCompleto = String(datos.nombre_cliente || '').trim();
    if (!cel || !nombreCompleto) return;
    if (clientes.some((c) => soloDigitos(c.celular) === cel)) return;

    try {
      const { nombre, apellido_paterno, apellido_materno } = dividirNombreCompleto(nombreCompleto);
      await api.post('/api/clientes', {
        nombre,
        apellido_paterno,
        apellido_materno,
        ciudad: datos.ciudad || '',
        celular: String(datos.celular_cliente || '').trim()
      });
      const r = await api.get('/api/clientes').catch(() => null);
      if (r && r.clientes) setClientes(r.clientes);
    } catch (err) {
      // Si el cliente ya estaba registrado en otro dispositivo, no se interrumpe la venta.
      if (/ya se encuentra registrado/i.test(err.message || '')) {
        const r = await api.get('/api/clientes').catch(() => null);
        if (r && r.clientes) setClientes(r.clientes);
      } else {
        console.warn('Registro automático en clientes:', err.message);
      }
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      if (form.estado === 'S') {
        if (!editando.venta) {
          setEditando(null);
          avisar('exito', 'El producto ya está Sin Vender.');
          return;
        }
        const abonos = editando.venta.pagos || [];
        const mensaje = abonos.length
          ? 'Este producto tiene ' + abonos.length + ' abono(s) registrado(s). Al marcarlo como Sin Vender se eliminará la venta y también sus abonos. ¿Deseas continuar?'
          : '¿Marcar este producto como Sin Vender? Se eliminará la venta registrada y el producto volverá a stock.';
        if (!window.confirm(mensaje)) return;
        await api.del('/api/ventas/producto/' + editando.id);
        avisar('exito', 'Producto marcado como Sin Vender. Venta eliminada.');
        setEditando(null);
        cargar(fardoId);
        return;
      }
      await api.post('/api/ventas', { producto_id: editando.id, ...form });
      await registrarClienteDesdeVenta(form);
      avisar('exito', 'Venta guardada.');
      setEditando(null);
      cargar(fardoId);
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const registrarAbono = async (e) => {
    e.preventDefault();
    const venta = editando && editando.venta;
    if (!venta) return;
    const montoNum = Number(pagoMonto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      avisar('error', 'Ingresa un monto de abono válido.');
      return;
    }
    setGuardandoPago(true);
    try {
      const r = await api.post('/api/pagos-venta', {
        venta_id: venta.id,
        fecha_pago: pagoFecha || hoyISO(),
        monto: montoNum,
        nota: pagoNota
      });
      setPagoMonto('');
      setPagoNota('');
      const lista = await cargar(fardoId, true);
      const actualizado = (lista || []).find((x) => x.id === editando.id);
      if (actualizado) setEditando(actualizado);
      if (Number(r.saldo) <= 0) {
        avisar('exito', 'Abono registrado. ¡Deuda saldada! Revisa el estado de la venta.');
      } else {
        avisar('exito', 'Abono registrado. Saldo pendiente: Bs ' + dinero(r.saldo));
      }
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setGuardandoPago(false);
    }
  };

  // Cierra la deuda por completo y deja la venta en estado "Pendiente de Entrega".
  const cerrarDeuda = async () => {
    const venta = editando && editando.venta;
    if (!venta) return;
    const saldo = Number(venta.saldo || 0);
    setGuardandoPago(true);
    try {
      if (saldo > 0) {
        await api.post('/api/pagos-venta', {
          venta_id: venta.id,
          fecha_pago: pagoFecha || hoyISO(),
          monto: saldo,
          nota: pagoNota || 'Cierre de deuda'
        });
      }
      await api.post('/api/ventas/' + venta.id + '/estado', { estado: 'P' });
      setPagoMonto('');
      setPagoNota('');
      setForm((f) => ({ ...f, estado: 'P' }));
      const lista = await cargar(fardoId, true);
      const actualizado = (lista || []).find((x) => x.id === editando.id);
      if (actualizado) setEditando(actualizado);
      avisar('exito', 'Deuda cerrada. Estado: Pendiente de Entrega.');
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setGuardandoPago(false);
    }
  };

  const eliminarAbono = async (pago) => {
    if (!window.confirm('¿Eliminar el abono de Bs ' + dinero(pago.monto) + ' del ' + pago.fecha_pago + '?')) return;
    try {
      await api.del('/api/pagos-venta/' + pago.id);
      const lista = await cargar(fardoId, true);
      const actualizado = (lista || []).find((x) => x.id === editando.id);
      if (actualizado) setEditando(actualizado);
      avisar('exito', 'Abono eliminado. Saldo actualizado.');
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const t = fTexto.trim().toLowerCase();
  const c = fCelular.trim().toLowerCase();
  const n = fNombre.trim().toLowerCase();
  const visibles = items.filter((p) => {
    if (t && !(String(p.correlativo).includes(t) || (p.nombre_foto || '').toLowerCase().includes(t))) return false;
    if (fEstado) {
      if (fEstado === 'S') {
        if (p.venta) return false;
      } else if ((p.venta?.estado || '') !== fEstado) {
        return false;
      }
    }
    if (c && !((p.venta?.celular_cliente || '').toLowerCase().includes(c))) return false;
    if (n && !((p.venta?.nombre_cliente || '').toLowerCase().includes(n))) return false;
    return true;
  });
  const paginados = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  useEffect(() => { setPagina(1); }, [fardoId, fTexto, fEstado, fCelular, fNombre]);

  // Si los datos se reducen (filtros/recarga), no dejar la página fuera de rango
  useEffect(() => {
    setPagina((p) => Math.min(p, Math.max(1, Math.ceil(visibles.length / POR_PAGINA))));
  }, [visibles.length]);

  const fardoSel = fardos.find((f) => String(f.id) === String(fardoId));

  const exportarExcel = () => {
    const cols = ['Código (correlativo-código fardo)', 'Fardo', 'Precio original', 'Fecha venta', 'Precio venta', 'Depósito', 'Abonado', 'Saldo', 'Celular', 'Cliente', 'Ciudad', 'F. entrega', 'Ubicación', 'Observación', 'Estado', 'Foto URL'];
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const ordenados = [...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0));
    const filas = ordenados.map((p) => [
      p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (fardoSel ? fardoSel.codigo_fardo : '')),
      fardoSel ? (fardoSel.codigo_fardo + ' — ' + fardoSel.nombre_fardo) : '',
      p.precio ?? '',
      p.venta?.fecha_venta || '',
      p.venta?.precio_venta ?? '',
      p.venta?.deposito_cliente ?? '',
      p.venta ? dinero(p.venta.abonado) : '',
      p.venta ? dinero(p.venta.saldo) : '',
      p.venta?.celular_cliente || '',
      p.venta?.nombre_cliente || '',
      p.venta?.ciudad || '',
      p.venta?.fecha_entrega || '',
      p.venta?.ubicacion || '',
      p.venta?.observacion || '',
      p.venta ? (ESTADOS[p.venta.estado] + ' (' + p.venta.estado + ')') : 'Sin Vender',
      p.foto_url || ''
    ]);
    const csv = '﻿' + [cols, ...filas].map((f) => f.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ventas_' + (fardoSel ? fardoSel.codigo_fardo : 'fardo') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    const titulo = 'Reporte de ventas — ' + (fardoSel ? (fardoSel.codigo_fardo + ' — ' + fardoSel.nombre_fardo) : 'fardo');
    const fecha = new Date().toLocaleString();
    const th = ['Código', 'Foto', 'Precio orig.', 'F. venta', 'Precio venta', 'Depósito', 'Abonado', 'Saldo', 'Celular', 'Cliente', 'Ciudad', 'F. entrega', 'Ubicación', 'Observación', 'Estado'];
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filas = [...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0)).map((p) => {
      const foto = p.foto_url ? '<img src="' + p.foto_url + '" style="width:60px;height:60px;object-fit:cover;" />' : '—';
      const codigo = p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (fardoSel ? fardoSel.codigo_fardo : ''));
      const resto = [
        p.precio ?? '',
        p.venta?.fecha_venta || '',
        p.venta?.precio_venta ?? '',
        p.venta?.deposito_cliente ?? '',
        p.venta ? dinero(p.venta.abonado) : '',
        p.venta ? dinero(p.venta.saldo) : '',
        p.venta?.celular_cliente || '',
        p.venta?.nombre_cliente || '',
        p.venta?.ciudad || '',
        p.venta?.fecha_entrega || '',
        p.venta?.ubicacion || '',
        p.venta?.observacion || '',
        p.venta ? (ESTADOS[p.venta.estado] + ' (' + p.venta.estado + ')') : 'Sin Vender'
      ].map(escH).map((c) => '<td>' + c + '</td>').join('');
      return '<tr><td>' + escH(codigo) + '</td><td>' + foto + '</td>' + resto + '</tr>';
    }).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write('<html><head><title>' + escH(titulo) + '</title><style>'
      + '@page{size:letter portrait;margin:12mm}'
      + 'body{font-family:sans-serif;padding:20px;color:#111}'
      + 'h2{margin:0 0 4px} p{color:#555;margin:0 0 12px;font-size:12px}'
      + '.logo-rep{width:80px;height:80px;object-fit:cover;border-radius:10px}'
      + '.cabecera{display:flex;align-items:center;gap:12px;margin-bottom:12px}'
      + '.cabecera .tit{flex:1;text-align:center} .cabecera h2{margin:0} .cabecera p{margin:4px 0 0}'
      + 'table{width:100%;border-collapse:collapse;font-size:11px}'
      + 'th,td{border:1px solid #999;padding:5px;text-align:left}'
      + 'th{background:#eab308;color:#422006}'
      + '@media print{.no-print{display:none}}'
      + '</style></head><body>'
      + '<div class="cabecera"><img class="logo-rep" src="/JC.jpeg" /><div class="tit"><h2>' + escH(titulo) + '</h2><p>' + escH(fecha) + ' · ' + visibles.length + ' producto(s)</p></div></div>'
      + '<table><thead><tr>' + th.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + filas + '</tbody></table>'
      + '<p class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>'
      + '</body></html>');
    w.document.close();
    w.focus();
  };

  return (
    <>
      <div className="card">
        <h2>💰 Ventas por fardo</h2>
        <form className="grid2" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label>Fardo</label>
            <select value={fardoId} onChange={(e) => elegir(e.target.value)}>
              <option value="">-- Selecciona un fardo --</option>
              {fardos.map((f) => (
                <option key={f.id} value={f.id}>{f.codigo_fardo} — {f.nombre_fardo}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Fecha de venta (se graba en cada registro)</label>
            <input type="date" value={fechaVentaGlobal} onChange={(e) => setFechaVentaGlobal(e.target.value)} />
          </div>
        </form>
      </div>

      {faltaTabla && (
        <div className="card">
          <p className="error">Falta crear la tabla de ventas en Supabase (Table Editor). Avísame y te guío.</p>
        </div>
      )}

      {fardoId && !faltaTabla && (
        <div className="card">
          <h2>🔍 Filtros</h2>
          <form className="grid2" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label>Código / correlativo</label>
              <input type="search" placeholder="Ej: 001 o 001-FAR-001" value={fTexto} onChange={(e) => setFTexto(e.target.value)} />
            </div>
            <div>
              <label>Estado</label>
              <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="P">P — Pendiente de Entrega</option>
                <option value="D">D — Deuda</option>
                <option value="E">E — Entregado</option>
                <option value="S">S — Sin Vender</option>
              </select>
            </div>
            <div>
              <label>Celular cliente</label>
              <input type="search" placeholder="Ej: 77712345" value={fCelular} onChange={(e) => setFCelular(e.target.value)} />
            </div>
            <div>
              <label>Nombre cliente</label>
              <input type="search" placeholder="Ej: Juan" value={fNombre} onChange={(e) => setFNombre(e.target.value)} />
            </div>
          </form>
        </div>
      )}

      {fardoId && !faltaTabla && (
        <div className="card">
          <h2>🧾 Productos del fardo: {fardoSel ? `${fardoSel.codigo_fardo} — ${fardoSel.nombre_fardo}` : ''}</h2>
          <p className="hint">{visibles.length} producto(s) · {visibles.filter((p) => p.venta).length} vendido(s) · {visibles.filter((p) => !p.venta).length} en almacén</p>
          {visibles.length > 0 && (
            <div className="actions">
              <button className="btn-entregar" onClick={exportarExcel}>📥 Reporte Excel</button>
              <button className="btn-edit" onClick={exportarPDF}>📄 Reporte PDF</button>
              <button className="btn-lila" onClick={() => setVerImagenes((v) => !v)}>
                {verImagenes ? '🙈 Ocultar imágenes' : '🖼️ Mostrar imágenes'}
              </button>
            </div>
          )}
          {cargando ? (
            <p className="empty">Cargando...</p>
          ) : visibles.length === 0 ? (
            <p className="empty">Sin resultados.</p>
          ) : (
            <div className="tabla tabla-ancha">
              <table>
                <thead>
                  <tr>
                    <th>Código</th><th>Foto</th><th>Precio</th><th>Fecha venta</th>
                    <th>Precio venta</th><th>Depósito</th><th>Abonado</th><th>Saldo</th><th>Celular</th><th>Cliente</th>
                    <th>Ciudad</th><th>Ubicación</th><th>Observación</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginados.map((p) => (
                    <tr key={p.id} className={p.venta ? 'estado-' + p.venta.estado : ''}>
                      <td data-label="Código">{p.nombre_foto}</td>
                      <td data-label="Foto">{p.foto_url ? <a href={p.foto_url} target="_blank" rel="noreferrer"><img className="thumb" src={p.foto_url} alt={p.nombre_foto} /></a> : '—'}</td>
                      <td data-label="Precio">{p.precio}</td>
                      <td data-label="Fecha venta">{p.venta?.fecha_venta || '—'}</td>
                      <td data-label="Precio venta">{p.venta?.precio_venta ?? '—'}</td>
                      <td data-label="Depósito">{p.venta?.deposito_cliente ?? '—'}</td>
                      <td data-label="Abonado">{p.venta ? dinero(p.venta.abonado) : '—'}</td>
                      <td data-label="Saldo">{p.venta ? dinero(p.venta.saldo) : '—'}</td>
                      <td data-label="Celular">{p.venta?.celular_cliente || '—'}</td>
                      <td data-label="Cliente">{p.venta?.nombre_cliente || '—'}</td>
                      <td data-label="Ciudad">{p.venta?.ciudad || '—'}</td>
                      <td data-label="Ubicación">{p.venta?.ubicacion || '—'}</td>
                      <td data-label="Observación">{p.venta?.observacion || '—'}</td>
                      <td data-label="Estado">{p.venta ? (ESTADOS[p.venta.estado] + ' (' + p.venta.estado + ')') : 'Sin Vender'}</td>
                      <td data-label="Acciones" className="actions">
                        <button className="btn-edit" onClick={() => abrirVenta(p)}>{p.venta ? 'Editar' : 'Registrar'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion total={visibles.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
        </div>
      )}

      {fardoId && !faltaTabla && verImagenes && (
        <div className="card">
          <h2>🖼️ Imágenes del fardo: {fardoSel ? `${fardoSel.codigo_fardo} — ${fardoSel.nombre_fardo}` : ''}</h2>
          <p className="hint">Desliza horizontalmente para ver más imágenes. Haz clic en una foto para ver el producto completo y decidir si deseas registrar o editar su venta.</p>
          {visibles.length === 0 ? (
            <p className="empty">Sin productos para mostrar.</p>
          ) : (
            <div className="galeria-productos">
              {[...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0)).map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={'galeria-item' + (p.venta ? ' estado-' + p.venta.estado : '')}
                  onClick={() => setVerProducto(p)}
                  title={'Ver producto — ' + p.nombre_foto}
                >
                  {p.foto_url
                    ? <img src={p.foto_url} alt={p.nombre_foto} loading="lazy" />
                    : <span className="sin-foto">📷</span>}
                  <span className="codigo">{p.nombre_foto}</span>
                  <span className="estado">{p.venta ? ESTADOS[p.venta.estado] : 'Sin Vender'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {editando && (
        <div className="card" id="form-venta">
          <h2>💰 {editando.venta ? 'Editar' : 'Registrar'} venta — {editando.nombre_foto}</h2>
          <p className="hint">Precio original del producto: <strong>{editando.precio}</strong></p>
          <form className="grid2" onSubmit={guardar}>
            <div>
              <label>Fecha de venta</label>
              <input type="date" name="fecha_venta" value={form.fecha_venta} onChange={cambiar} />
            </div>
            <div>
              <label>Precio de venta</label>
              <input type="number" name="precio_venta" min="0" step="0.01" value={form.precio_venta} onChange={cambiar} />
            </div>
            <div>
              <label>Depósito / enganche inicial</label>
              <input type="number" name="deposito_cliente" min="0" step="0.01" value={form.deposito_cliente} onChange={cambiar} />
              <small className="hint">Los pagos posteriores se registran en “Control de deuda”.</small>
            </div>
            <div>
              <label>Celular cliente</label>
              <input name="celular_cliente" value={form.celular_cliente} onChange={(e) => cambiarCelular(e.target.value)} />
              {clienteHint && <small className="hint">{clienteHint}</small>}
            </div>
            <div>
              <label>Nombre cliente</label>
              <input name="nombre_cliente" value={form.nombre_cliente} onChange={cambiar} />
            </div>
            <div>
              <label>Ciudad</label>
              <input name="ciudad" value={form.ciudad} onChange={cambiar} />
            </div>
            <div>
              <label>Estado</label>
              <select name="estado" value={form.estado} onChange={cambiar}>
                <option value="P">P — Pendiente de Entrega</option>
                <option value="D">D — Deuda</option>
                <option value="E">E — Entregado</option>
                <option value="S">S — Sin Vender</option>
              </select>
            </div>
            <div>
              <label>Ubicación del producto</label>
              <select name="ubicacion_id" value={form.ubicacion_id} onChange={cambiar}>
                <option value="">-- Sin ubicación --</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>{u.lugar}{u.detalle ? ' — ' + u.detalle : ''}</option>
                ))}
              </select>
            </div>
            <div className="full">
              <label>Observación</label>
              <input name="observacion" value={form.observacion} onChange={cambiar} />
            </div>
            <div className="full">
              <button className="btn-blue">Guardar venta</button>{' '}
              <button type="button" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </form>

          {editando.venta && (
            <div style={{ marginTop: 18, padding: 14, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10 }}>
              <h3 style={{ margin: '0 0 10px' }}>💳 Control de deuda — {editando.nombre_foto}</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 14px', minWidth: 130 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase' }}>Total venta</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>Bs {dinero(editando.venta.precio_venta)}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 14px', minWidth: 130 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase' }}>Enganche</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>Bs {dinero(editando.venta.deposito_cliente)}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #86efac', borderRadius: 8, padding: '8px 14px', minWidth: 130 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>Abonado</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#15803d' }}>Bs {dinero(editando.venta.abonado)}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid ' + (Number(editando.venta.saldo) > 0 ? '#fca5a5' : '#86efac'), borderRadius: 8, padding: '8px 14px', minWidth: 130 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: Number(editando.venta.saldo) > 0 ? '#991b1b' : '#166534', textTransform: 'uppercase' }}>Saldo pendiente</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: Number(editando.venta.saldo) > 0 ? '#b91c1c' : '#15803d' }}>Bs {dinero(editando.venta.saldo)}</div>
                </div>
              </div>

              {!pagosTabla && (
                <p className="error">Falta crear la tabla de pagos. Ejecuta <strong>auth-supabase/PAGOS_VENTA.sql</strong> en Supabase para registrar abonos.</p>
              )}

              {Number(editando.venta.saldo) > 0 ? (
                <form className="grid2" onSubmit={registrarAbono}>
                  <div>
                    <label>Fecha de pago</label>
                    <input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)} required />
                  </div>
                  <div>
                    <label>Monto a abonar</label>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={pagoMonto}
                      onChange={(e) => setPagoMonto(e.target.value)}
                      placeholder="Ej: 100.00"
                      required
                    />
                  </div>
                  <div className="full">
                    <label>Nota / comprobante (opcional)</label>
                    <input value={pagoNota} onChange={(e) => setPagoNota(e.target.value)} placeholder="Ej: pago parcial, recibo 015" />
                  </div>
                  <div className="full">
                    <button className="btn-entregar" disabled={guardandoPago || !pagosTabla}>
                      {guardandoPago ? 'Registrando...' : '💵 Registrar abono'}
                    </button>{' '}
                    <button type="button" className="btn-blue" disabled={guardandoPago || !pagosTabla} onClick={cerrarDeuda}>
                      🔒 Cerrar Deuda
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="success" style={{ margin: '6px 0' }}>
                    ✅ Deuda saldada.
                  </p>
                  {editando.venta.estado !== 'P' && (
                    <button type="button" className="btn-blue" disabled={guardandoPago} onClick={cerrarDeuda}>
                      🔒 Cerrar Deuda
                    </button>
                  )}
                </>
              )}

              {(editando.venta.pagos || []).length > 0 && (
                <div className="tabla" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr><th>Fecha de pago</th><th>Monto</th><th>Nota</th><th>Acciones</th></tr>
                    </thead>
                    <tbody>
                      {editando.venta.pagos.map((pg) => (
                        <tr key={pg.id}>
                          <td data-label="Fecha de pago">{pg.fecha_pago}</td>
                          <td data-label="Monto"><strong>Bs {dinero(pg.monto)}</strong></td>
                          <td data-label="Nota">{pg.nota || '—'}</td>
                          <td data-label="Acciones" className="actions">
                            <button type="button" className="btn-del" onClick={() => eliminarAbono(pg)}>Eliminar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {verProducto && (
        <div className="modal-fondo" onClick={() => setVerProducto(null)}>
          <div className="modal-producto" onClick={(e) => e.stopPropagation()}>
            <div className="modal-cabecera">
              <h3>👕 Producto {verProducto.nombre_foto}</h3>
              <button type="button" className="modal-cerrar" onClick={() => setVerProducto(null)}>✕ Cerrar</button>
            </div>
            <div className="modal-cuerpo">
              <div className="modal-foto">
                {verProducto.foto_url ? (
                  <>
                    <img
                      src={verProducto.foto_url}
                      alt={verProducto.nombre_foto}
                      title="Clic para ver la imagen completa"
                      onClick={() => window.open(verProducto.foto_url, '_blank')}
                    />
                    <a
                      className="ver-completa"
                      href={verProducto.foto_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      🔍 Ver imagen en tamaño completo
                    </a>
                  </>
                ) : (
                  <span className="sin-foto">📷</span>
                )}
              </div>
              <div className="modal-datos">
                <p><strong>Fardo</strong><br />{fardoSel ? `${fardoSel.codigo_fardo} — ${fardoSel.nombre_fardo}` : '—'}</p>
                <p><strong>Código</strong><br />{verProducto.nombre_foto || '—'}</p>
                <p><strong>Precio original</strong><br />Bs {dinero(verProducto.precio)}</p>
                <p><strong>Estado</strong><br />{verProducto.venta ? ESTADOS[verProducto.venta.estado] : 'Sin Vender'}</p>
                {verProducto.venta ? (
                  <>
                    <p><strong>Cliente</strong><br />{verProducto.venta.nombre_cliente || '—'}</p>
                    <p><strong>Celular</strong><br />{verProducto.venta.celular_cliente || '—'}</p>
                    <p><strong>Ciudad</strong><br />{verProducto.venta.ciudad || '—'}</p>
                    <p><strong>Fecha de venta</strong><br />{verProducto.venta.fecha_venta || '—'}</p>
                    <p><strong>Precio de venta</strong><br />Bs {dinero(verProducto.venta.precio_venta)}</p>
                    <p><strong>Depósito</strong><br />Bs {dinero(verProducto.venta.deposito_cliente)}</p>
                    <p><strong>Abonado</strong><br />Bs {dinero(verProducto.venta.abonado)}</p>
                    <p><strong>Saldo pendiente</strong><br />Bs {dinero(verProducto.venta.saldo)}</p>
                    <p><strong>Fecha de entrega</strong><br />{verProducto.venta.fecha_entrega || '—'}</p>
                    <p><strong>Ubicación</strong><br />{verProducto.venta.ubicacion || '—'}</p>
                    <p className="full"><strong>Observación</strong><br />{verProducto.venta.observacion || '—'}</p>
                  </>
                ) : (
                  <p className="full"><em>Este producto todavía no tiene una venta registrada.</em></p>
                )}
              </div>
            </div>
            <div className="modal-acciones">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const producto = verProducto;
                  setVerProducto(null);
                  abrirVenta(producto);
                }}
              >
                {verProducto.venta ? '✏️ ¿Desea editar la venta?' : '💰 ¿Desea registrar la venta?'}
              </button>
              <button type="button" onClick={() => setVerProducto(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
