import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { generarExcel } from '../excel.js';
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
  const [generandoExcel, setGenerandoExcel] = useState(false);

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

  const exportarExcel = async () => {
    setGenerandoExcel(true);
    try {
      const ordenados = [...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0));
      const totalPrecio = ordenados.reduce((s, p) => s + (Number(p.precio) || 0), 0).toFixed(2);
      const filas = ordenados.map((p) => [
        p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (p.codigo_fardo || '')),
        p.codigo_fardo || '',
        p.nombre_fardo || '',
        Number(p.precio) || 0,
        ''
      ]);
      const fotos = ordenados.map((p) => (p.foto_url ? { url: p.foto_url } : null));
      filas.push(['', '', 'TOTAL', Number(totalPrecio), '']);
      fotos.push(null);
      await generarExcel({
        nombre: 'productos_' + (fardoActual ? fardoActual.codigo_fardo : 'todos'),
        columnas: [
          { header: 'Código (correlativo-código fardo)', key: 'codigo', width: 26 },
          { header: 'Código fardo', key: 'codigo_fardo', width: 16 },
          { header: 'Fardo', key: 'fardo', width: 26 },
          { header: 'Precio', key: 'precio', width: 12 },
          { header: 'Foto', key: 'foto', width: 16 }
        ],
        filas,
        fotos
      });
    } catch (err) {
      avisar('error', 'No se pudo generar el Excel: ' + err.message);
    } finally {
      setGenerandoExcel(false);
    }
  };

  const exportarPDF = () => {
    const titulo = 'Reporte de productos — ' + (fardoActual ? (fardoActual.codigo_fardo + ' — ' + fardoActual.nombre_fardo) : 'todos');
    const fecha = new Date().toLocaleString();
    const totalPrecio = visibles.reduce((s, p) => s + (Number(p.precio) || 0), 0).toFixed(2);
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
      + 'tfoot td{background:#fef9c3;font-weight:700}'
      + '@media print{.no-print{display:none}}'
      + '</style></head><body>'
      + '<div class="cabecera"><img class="logo-rep" src="/JC.jpeg" /><div class="tit"><h2>' + escH(titulo) + '</h2><p>' + escH(fecha) + ' · ' + visibles.length + ' producto(s) · Total: Bs. ' + totalPrecio + '</p></div></div>'
      + '<table><thead><tr><th>Código</th><th>Foto</th><th>Código fardo</th><th>Fardo</th><th>Precio</th></tr></thead><tbody>' + filas + '</tbody>'
      + '<tfoot><tr><td colspan="4" style="text-align:right;font-weight:700">Total</td><td style="font-weight:700">Bs. ' + totalPrecio + '</td></tr></tfoot></table>'
      + '<p class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>'
      + '</body></html>');
    w.document.close();
    w.focus();
  };

  const generarNumeros = () => {
    const titulo = 'Números de productos — ' + (fardoActual ? (fardoActual.codigo_fardo + ' — ' + fardoActual.nombre_fardo) : 'todos');
    const fecha = new Date().toLocaleString();
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const celdas = (p) => {
      const codigo = p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (p.codigo_fardo || ''));
      const foto = p.foto_url
        ? '<div class="foto"><img src="' + escH(p.foto_url) + '" alt="' + escH(codigo) + '" onload="if(this.naturalHeight>this.naturalWidth)this.classList.add(\'vertical\')" /></div>'
        : '<div class="foto sin-foto">—</div>';
      return '<div class="item">' + foto + '<div class="datos"><div class="codigo">' + escH(codigo)
        + '</div><div class="precio">Bs. ' + escH(p.precio ?? '') + '</div><div class="debe">Debe:</div></div></div>';
    };
    const ordenados = [...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0));
    const POR_HOJA = 6 * 6; // 6 columnas × 6 filas
    const hojas = [];
    for (let i = 0; i < ordenados.length; i += POR_HOJA) {
      hojas.push('<div class="hoja"><div class="grid">' + ordenados.slice(i, i + POR_HOJA).map(celdas).join('') + '</div></div>');
    }
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write('<html><head><title>' + escH(titulo) + '</title><style>'
      + '@page{size:letter portrait;margin:4mm}'
      + 'body{font-family:sans-serif;padding:4px;color:#111}'
      + 'h2{margin:0 0 2px;font-size:15px} .sub{color:#555;margin:0 0 6px;font-size:11px}'
      + '.hoja{page-break-after:always;break-after:page}'
      + '.hoja:last-child{page-break-after:auto;break-after:auto}'
      + '.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:3px}'
      + '.item{border:1px solid #999;border-radius:4px;padding:4px;display:flex;flex-direction:column;align-items:center;gap:3px;page-break-inside:avoid;break-inside:avoid;text-align:center}'
      + '.foto{position:relative;width:100%;height:62px;overflow:hidden;border-radius:3px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:13px;color:#888;container-type:size}'
      + '.foto img{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);max-width:100%;max-height:100%;object-fit:contain;display:block}'
      + '.foto img.vertical{max-width:none;max-height:none;width:100cqh;height:100cqw;transform:translate(-50%,-50%) rotate(90deg)}'
      + '.datos{min-width:0;width:100%}'
      + '.codigo{font-size:11px;font-weight:700;word-break:break-word;line-height:1.15}'
      + '.precio{font-size:13px;font-weight:700;line-height:1.2;margin-top:2px}'
      + '.debe{font-size:11px;font-weight:700;margin-top:2px;border-top:1px solid #bbb;padding-top:2px}'
      + '@media print{.no-print{display:none}}'
      + '</style></head><body>'
      + '<h2>' + escH(titulo) + '</h2><p class="sub">' + escH(fecha) + ' · ' + visibles.length + ' producto(s)</p>'
      + hojas.join('')
      + '<p class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>'
      + '</body></html>');
    w.document.close();
    w.focus();
  };

  const exportarNumerosExcel = async () => {
    setGenerandoExcel(true);
    try {
      const ordenados = [...visibles].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0));
      const totalPrecio = ordenados.reduce((s, p) => s + (Number(p.precio) || 0), 0).toFixed(2);
      const filas = ordenados.map((p) => [
        p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (p.codigo_fardo || '')),
        Number(p.precio) || 0,
        ''
      ]);
      const fotos = ordenados.map((p) => (p.foto_url ? { url: p.foto_url } : null));
      filas.push(['TOTAL', Number(totalPrecio), '']);
      fotos.push(null);
      await generarExcel({
        nombre: 'numeros_' + (fardoActual ? fardoActual.codigo_fardo : 'todos'),
        columnas: [
          { header: 'Código', key: 'codigo', width: 26 },
          { header: 'Precio (Bs.)', key: 'precio', width: 14 },
          { header: 'Foto', key: 'foto', width: 16 }
        ],
        filas,
        fotos
      });
    } catch (err) {
      avisar('error', 'No se pudo generar el Excel: ' + err.message);
    } finally {
      setGenerandoExcel(false);
    }
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
            <button className="btn-entregar" onClick={exportarExcel} disabled={generandoExcel}>{generandoExcel ? 'Generando...' : '📥 Reporte Excel'}</button>
            <button className="btn-edit" onClick={exportarPDF}>📄 Reporte PDF</button>
            <button className="btn-edit" onClick={generarNumeros}>🔢 Generar Números</button>
            <button className="btn-entregar" onClick={exportarNumerosExcel} disabled={generandoExcel}>{generandoExcel ? 'Generando...' : '📥 Números Excel'}</button>
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
