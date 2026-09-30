import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';
const ESTADOS = { P: 'Pendiente de Entrega', D: 'Deuda', E: 'Entregado' };

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

  useEffect(() => {
    api.get('/api/clientes').then((r) => setClientes(r.clientes)).catch(() => {});
    api.get('/api/ubicaciones').then((r) => setUbicaciones(r.ubicaciones)).catch(() => {});
  }, []);

  const cargar = async (id, silencioso = false) => {
    if (!id) { setItems([]); return; }
    if (!silencioso) setCargando(true);
    setFaltaTabla(false);
    try {
      const r = await api.get('/api/ventas?fardo_id=' + id);
      setItems(r.items);
    } catch (err) {
      if (err.message.includes('ventas')) setFaltaTabla(true);
      else if (!silencioso) avisar('error', err.message);
      if (!silencioso) setItems([]);
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

  // Al poner el celular: buscar venta anterior (estado != E) y autocompletar
  const cambiarCelular = async (valor) => {
    const cel = valor.trim();
    setForm({ ...form, celular_cliente: valor });
    if (!cel) { setClienteHint(''); return; }
    setClienteHint('Buscando...');
    try {
      const r = await api.get('/api/ventas/por-celular?celular=' + encodeURIComponent(cel));
      if (r.venta) {
        setForm((f) => ({
          ...f,
          celular_cliente: valor,
          nombre_cliente: r.venta.nombre_cliente || f.nombre_cliente,
          ciudad: r.venta.ciudad || f.ciudad,
          ubicacion_id: r.venta.ubicacion_id ? String(r.venta.ubicacion_id) : f.ubicacion_id
        }));
        setClienteHint('✓ Datos de venta anterior (pendiente/deuda).');
        return;
      }
    } catch {
      // sigue con el registro de clientes
    }
    const c = clientes.find((x) => x.celular === cel);
    if (c) {
      setForm((f) => ({
        ...f,
        celular_cliente: valor,
        nombre_cliente: [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' '),
        ciudad: c.ciudad || f.ciudad
      }));
      setClienteHint('✓ Cliente encontrado en el registro.');
    } else {
      setClienteHint('Celular no registrado.');
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/ventas', { producto_id: editando.id, ...form });
      avisar('exito', 'Venta guardada.');
      setEditando(null);
      cargar(fardoId);
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const t = fTexto.trim().toLowerCase();
  const c = fCelular.trim().toLowerCase();
  const n = fNombre.trim().toLowerCase();
  const visibles = items.filter((p) => {
    if (t && !(String(p.correlativo).includes(t) || (p.nombre_foto || '').toLowerCase().includes(t))) return false;
    if (fEstado && (p.venta?.estado || '') !== fEstado) return false;
    if (c && !((p.venta?.celular_cliente || '').toLowerCase().includes(c))) return false;
    if (n && !((p.venta?.nombre_cliente || '').toLowerCase().includes(n))) return false;
    return true;
  });
  const paginados = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  useEffect(() => { setPagina(1); }, [fardoId, fTexto, fEstado, fCelular, fNombre, items]);

  const fardoSel = fardos.find((f) => String(f.id) === String(fardoId));

  const exportarExcel = () => {
    const cols = ['Código (correlativo-código fardo)', 'Fardo', 'Precio original', 'Fecha venta', 'Precio venta', 'Depósito', 'Celular', 'Cliente', 'Ciudad', 'F. entrega', 'Ubicación', 'Observación', 'Estado', 'Foto URL'];
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
      p.venta?.celular_cliente || '',
      p.venta?.nombre_cliente || '',
      p.venta?.ciudad || '',
      p.venta?.fecha_entrega || '',
      p.venta?.ubicacion || '',
      p.venta?.observacion || '',
      p.venta ? (ESTADOS[p.venta.estado] + ' (' + p.venta.estado + ')') : 'Sin venta',
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
    const th = ['Código', 'Foto', 'Precio orig.', 'F. venta', 'Precio venta', 'Depósito', 'Celular', 'Cliente', 'Ciudad', 'F. entrega', 'Ubicación', 'Observación', 'Estado'];
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filas = [...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0)).map((p) => {
      const foto = p.foto_url ? '<img src="' + p.foto_url + '" style="width:60px;height:60px;object-fit:cover;" />' : '—';
      const codigo = p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (fardoSel ? fardoSel.codigo_fardo : ''));
      const resto = [
        p.precio ?? '',
        p.venta?.fecha_venta || '',
        p.venta?.precio_venta ?? '',
        p.venta?.deposito_cliente ?? '',
        p.venta?.celular_cliente || '',
        p.venta?.nombre_cliente || '',
        p.venta?.ciudad || '',
        p.venta?.fecha_entrega || '',
        p.venta?.ubicacion || '',
        p.venta?.observacion || '',
        p.venta ? (ESTADOS[p.venta.estado] + ' (' + p.venta.estado + ')') : 'Sin venta'
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
          <p className="hint">{visibles.length} producto(s)</p>
          {visibles.length > 0 && (
            <div className="actions">
              <button className="btn-entregar" onClick={exportarExcel}>📥 Reporte Excel</button>
              <button className="btn-edit" onClick={exportarPDF}>📄 Reporte PDF</button>
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
                    <th>Precio venta</th><th>Depósito</th><th>Celular</th><th>Cliente</th>
                    <th>Ciudad</th><th>F. entrega</th><th>Ubicación</th><th>Observación</th><th>Estado</th><th>Acciones</th>
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
                      <td data-label="Celular">{p.venta?.celular_cliente || '—'}</td>
                      <td data-label="Cliente">{p.venta?.nombre_cliente || '—'}</td>
                      <td data-label="Ciudad">{p.venta?.ciudad || '—'}</td>
                      <td data-label="F. entrega">{p.venta?.fecha_entrega || '—'}</td>
                      <td data-label="Ubicación">{p.venta?.ubicacion || '—'}</td>
                      <td data-label="Observación">{p.venta?.observacion || '—'}</td>
                      <td data-label="Estado">{p.venta ? (ESTADOS[p.venta.estado] + ' (' + p.venta.estado + ')') : 'Sin venta'}</td>
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
              <label>Depósito cliente</label>
              <input type="number" name="deposito_cliente" min="0" step="0.01" value={form.deposito_cliente} onChange={cambiar} />
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
              <label>Fecha de entrega</label>
              <input type="date" name="fecha_entrega" value={form.fecha_entrega} onChange={cambiar} />
            </div>
            <div>
              <label>Estado</label>
              <select name="estado" value={form.estado} onChange={cambiar}>
                <option value="P">P — Pendiente de Entrega</option>
                <option value="D">D — Deuda</option>
                <option value="E">E — Entregado</option>
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
        </div>
      )}
    </>
  );
}
