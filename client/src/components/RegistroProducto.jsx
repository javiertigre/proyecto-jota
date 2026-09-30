import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

export default function RegistroProducto({ fardos, productos, fardoSel, setFardoSel, recargar, avisar }) {
  const [hint, setHint] = useState('');
  const [precio, setPrecio] = useState('');
  const [foto, setFoto] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [precioEdit, setPrecioEdit] = useState('');
  const [fotoEdit, setFotoEdit] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const elegirFardo = async (id) => {
    setFardoSel(id);
    if (!id) { setHint(''); return; }
    setHint('Calculando nombre de foto...');
    try {
      const d = await api.get('/api/fardos/' + id + '/siguiente');
      setHint('La foto se guardará como: ' + d.nombre_foto);
    } catch {
      setHint('');
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!fardoSel || !precio || !foto) { avisar('error', 'Elige el fardo, toma la foto y pon el precio.'); return; }
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('fardo_id', fardoSel);
      fd.append('precio', precio);
      fd.append('foto', foto);
      const r = await api.postForm('/api/productos', fd);
      avisar('exito', 'Producto ' + r.producto.nombre_foto + ' registrado.');
      setPrecio('');
      setFoto(null);
      e.target.reset();
      elegirFardo(fardoSel); // mantiene el fardo y recalcula el siguiente
      recargar();
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p) => {
    if (!window.confirm('¿Eliminar ' + p.nombre_foto + '?')) return;
    try {
      await api.del('/api/productos/' + p.id);
      avisar('exito', 'Producto eliminado.');
      recargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const abrirEditar = (p) => {
    setEditando(p);
    setPrecioEdit(String(p.precio));
    setFotoEdit(null);
  };

  const actualizar = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('precio', precioEdit);
      if (fotoEdit) fd.append('foto', fotoEdit);
      await api.putForm('/api/productos/' + editando.id, fd);
      avisar('exito', 'Producto actualizado.');
      setEditando(null);
      recargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const porFardo = fardoSel
    ? productos.filter((p) => String(p.fardo_id) === String(fardoSel))
    : productos;
  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? porFardo.filter((p) => String(p.correlativo).includes(q) || (p.nombre_foto || '').toLowerCase().includes(q))
    : porFardo;
  const POR_PAGINA = 10;
  const paginados = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  useEffect(() => { setPagina(1); }, [fardoSel, busqueda, productos]);

  const fardoActual = fardos.find((f) => String(f.id) === String(fardoSel));

  const exportarExcel = () => {
    const cols = ['Código (correlativo-código fardo)', 'Código fardo', 'Fardo', 'Precio', 'Foto URL'];
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const filas = [...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0)).map((p) => [
      p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (p.codigo_fardo || '')),
      p.codigo_fardo || '',
      p.nombre_fardo || '',
      p.precio ?? '',
      p.foto_url || ''
    ]);
    const csv = '﻿' + [cols, ...filas].map((f) => f.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'productos_' + (fardoActual ? fardoActual.codigo_fardo : 'todos') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    const titulo = 'Reporte de productos — ' + (fardoActual ? (fardoActual.codigo_fardo + ' — ' + fardoActual.nombre_fardo) : 'todos');
    const fecha = new Date().toLocaleString();
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filas = [...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0)).map((p) => {
      const foto = p.foto_url ? '<img src="' + p.foto_url + '" style="width:60px;height:60px;object-fit:cover;" />' : '—';
      const codigo = p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (p.codigo_fardo || ''));
      return '<tr><td>' + escH(codigo)
        + '</td><td>' + foto + '</td><td>' + escH(p.codigo_fardo || '') + '</td><td>' + escH(p.nombre_fardo || '')
        + '</td><td>' + escH(p.precio ?? '') + '</td></tr>';
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
      + 'table{width:100%;border-collapse:collapse;font-size:12px}'
      + 'th,td{border:1px solid #999;padding:5px;text-align:left}'
      + 'th{background:#eab308;color:#422006}'
      + '@media print{.no-print{display:none}}'
      + '</style></head><body>'
      + '<div class="cabecera"><img class="logo-rep" src="/JC.jpeg" /><div class="tit"><h2>' + escH(titulo) + '</h2><p>' + escH(fecha) + ' · ' + visibles.length + ' producto(s)</p></div></div>'
      + '<table><thead><tr><th>Código</th><th>Foto</th><th>Código fardo</th><th>Fardo</th><th>Precio</th></tr></thead><tbody>' + filas + '</tbody></table>'
      + '<p class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>'
      + '</body></html>');
    w.document.close();
    w.focus();
  };

  return (
    <>
      <div className="card">
        <h2>📸 Registrar producto del fardo</h2>
        <form className="grid1" onSubmit={guardar}>
          <div>
            <label>Fardo</label>
            <select value={fardoSel} onChange={(e) => elegirFardo(e.target.value)} required>
              <option value="">-- Selecciona un fardo --</option>
              {fardos.map((f) => (
                <option key={f.id} value={f.id}>{f.codigo_fardo} — {f.nombre_fardo}</option>
              ))}
            </select>
            {hint && <small className="hint">{hint}</small>}
          </div>
          <div>
            <label>📸 Sacar foto</label>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files[0])} required />
          </div>
          <div>
            <label>💲 Poner precio</label>
            <input type="number" placeholder="Ej: 25.50" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} required />
          </div>
          <div>
            <button className="btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>🧾 Productos registrados ({visibles.length})</h2>
        <div>
          <label>🔍 Buscar por correlativo</label>
          <input
            type="search"
            placeholder="Ej: 1 o 001"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        {visibles.length > 0 && (
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="btn-entregar" onClick={exportarExcel}>📥 Reporte Excel</button>
            <button className="btn-edit" onClick={exportarPDF}>📄 Reporte PDF</button>
          </div>
        )}
        {visibles.length === 0 ? (
          <p className="empty">{fardoSel ? 'Este fardo aún no tiene productos.' : 'Aún no hay productos registrados.'}</p>
        ) : (
          <div className="tabla">
            <table>
              <thead>
                <tr><th>Foto</th><th>Código</th><th>Fardo</th><th>Precio</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {paginados.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Foto">{p.foto_url ? <a href={p.foto_url} target="_blank" rel="noreferrer"><img className="thumb" src={p.foto_url} alt={p.nombre_foto} /></a> : '—'}</td>
                    <td data-label="Código">{p.nombre_foto}</td>
                    <td data-label="Fardo">{p.nombre_fardo}</td>
                    <td data-label="Precio">{p.precio}</td>
                    <td data-label="Acciones" className="actions">
                      <button className="btn-edit" onClick={() => abrirEditar(p)}>Editar</button>
                      <button className="btn-del" onClick={() => eliminar(p)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacion total={visibles.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
      </div>

      {editando && (
        <div className="card">
          <h2>✏️ Editar {editando.nombre_foto}</h2>
          {editando.foto_url && <img className="foto-actual" src={editando.foto_url} alt={editando.nombre_foto} />}
          <form className="grid1" onSubmit={actualizar}>
            <div>
              <label>💲 Precio</label>
              <input type="number" min="0" step="0.01" value={precioEdit} onChange={(e) => setPrecioEdit(e.target.value)} required />
            </div>
            <div>
              <label>📸 Cambiar foto (opcional)</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoEdit(e.target.files[0])} />
            </div>
            <div>
              <button className="btn-blue">Actualizar producto</button>{' '}
              <button type="button" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
