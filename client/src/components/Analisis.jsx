import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { generarExcel } from '../excel.js';
import Paginacion from './Paginacion.jsx';

const ESTADOS = { P: 'Pendiente', D: 'Deuda', E: 'Entregado' };

export default function Analisis({ fardos, avisar }) {
  const [busqueda, setBusqueda] = useState('');
  const [fardoId, setFardoId] = useState('');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [precioRemate, setPrecioRemate] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const q = busqueda.trim().toLowerCase();
  const fardosFiltrados = q
    ? fardos.filter((f) => (f.codigo_fardo || '').toLowerCase().includes(q))
    : fardos;

  const fardoSel = fardos.find((f) => String(f.id) === String(fardoId));

  const cargar = async (id) => {
    if (!id) { setItems([]); return; }
    setCargando(true);
    try {
      const [rp, rv] = await Promise.all([
        api.get('/api/productos?fardo_id=' + encodeURIComponent(id)),
        api.get('/api/ventas?fardo_id=' + encodeURIComponent(id)).catch(() => ({ items: [] }))
      ]);
      const mapaV = {};
      (rv.items || []).forEach((it) => { if (it.venta) mapaV[it.id] = it.venta; });
      setItems((rp.productos || []).map((p) => ({ ...p, venta: mapaV[p.id] || null })));
    } catch (err) {
      avisar('error', err.message);
      setItems([]);
    } finally {
      setCargando(false);
    }
  };

  const elegir = (id) => {
    setFardoId(id);
    setEditando(null);
    setPagina(1);
    cargar(id);
  };

  const cambiarBusqueda = (valor) => {
    setBusqueda(valor);
    // Si el fardo elegido deja de coincidir con la búsqueda, se limpia la selección
    if (!fardoId) return;
    const t = valor.trim().toLowerCase();
    const f = fardos.find((x) => String(x.id) === String(fardoId));
    const coincide = f && (!t || (f.codigo_fardo || '').toLowerCase().includes(t));
    if (!coincide) {
      setFardoId('');
      setItems([]);
      setEditando(null);
    }
  };

  const abrirEditar = (p) => {
    setEditando(p.id);
    setPrecioRemate(p.precio_remate !== null && p.precio_remate !== undefined ? String(p.precio_remate) : '');
  };

  const guardarRemate = async (p) => {
    const valor = String(precioRemate).trim();
    if (valor !== '' && (Number.isNaN(Number(valor)) || Number(valor) < 0)) {
      avisar('error', 'Precio de remate inválido.');
      return;
    }
    setGuardando(true);
    try {
      const r = await api.put('/api/productos/' + p.id + '/remate', {
        precio_remate: valor === '' ? null : Number(valor)
      });
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, precio_remate: r.producto.precio_remate } : x)));
      setEditando(null);
      avisar('exito', 'Precio de remate guardado para ' + (p.nombre_foto || 'el producto') + '.');
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setGuardando(false);
    }
  };

  const ordenados = [...items].sort((a, b) => (a.correlativo ?? 0) - (b.correlativo ?? 0));
  const paginados = ordenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const vendidos = ordenados.filter((p) => p.venta).length;
  const totalVenta = ordenados.reduce((s, p) => s + (p.venta ? (Number(p.venta.precio_venta) || 0) : 0), 0);
  const totalRemate = ordenados.reduce((s, p) => s + (Number(p.precio_remate) || 0), 0);
  const totalFardo = Number(fardoSel?.valor_total_fardo) || ordenados.reduce((s, p) => s + (Number(p.precio) || 0), 0);
  const totalPrecios = ordenados.reduce((s, p) => s + (Number(p.precio) || 0), 0);

  const exportarExcel = async () => {
    if (!ordenados.length) return;
    setGenerandoExcel(true);
    try {
      const filas = ordenados.map((p) => [
        p.nombre_foto || (String(p.correlativo ?? '').padStart(3, '0') + '-' + (fardoSel?.codigo_fardo || '')),
        Number(p.precio) || 0,
        (p.precio_remate !== null && p.precio_remate !== undefined && p.precio_remate !== '') ? Number(p.precio_remate) : '',
        p.venta ? (ESTADOS[p.venta.estado] || p.venta.estado) : 'Sin vender',
        ''
      ]);
      const fotos = ordenados.map((p) => (p.foto_url ? { url: p.foto_url } : null));
      filas.push(['TOTAL', Number(totalPrecios.toFixed(2)), Number(totalRemate.toFixed(2)), '', '']);
      fotos.push(null);
      filas.push(['Vendidos', vendidos + ' / ' + ordenados.length, '', '', '']);
      fotos.push(null);
      filas.push(['Total venta (Bs.)', Number(totalVenta.toFixed(2)), '', '', '']);
      fotos.push(null);
      filas.push(['Valor total del fardo (Bs.)', Number(totalFardo.toFixed(2)), '', '', '']);
      fotos.push(null);
      await generarExcel({
        nombre: 'analisis_' + (fardoSel ? fardoSel.codigo_fardo : 'todos'),
        columnas: [
          { header: 'Código', key: 'codigo', width: 26 },
          { header: 'Precio', key: 'precio', width: 14 },
          { header: 'Remate', key: 'remate', width: 14 },
          { header: 'Estado', key: 'estado', width: 18 },
          { header: 'Foto', key: 'foto', width: 18 }
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

  useEffect(() => { setPagina(1); }, [fardoId, items.length]);
  useEffect(() => {
    setPagina((p) => Math.min(p, Math.max(1, Math.ceil(ordenados.length / POR_PAGINA))));
  }, [ordenados.length]);

  return (
    <>
      <div className="card">
        <h2>📈 Análisis por fardo</h2>
        <form className="grid1" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label>Fardo</label>
            <select value={fardoId} onChange={(e) => elegir(e.target.value)}>
              <option value="">-- Selecciona un fardo --</option>
              {fardosFiltrados.map((f) => (
                <option key={f.id} value={f.id}>{f.codigo_fardo} — {f.nombre_fardo}</option>
              ))}
            </select>
            <small className="hint">{fardosFiltrados.length} fardo(s) encontrado(s)</small>
          </div>
          <div>
            <label>🔍 Buscar por código de fardo</label>
            <input
              type="search"
              placeholder="Ej: FAR-001"
              value={busqueda}
              onChange={(e) => cambiarBusqueda(e.target.value)}
            />
          </div>
        </form>
      </div>

      {fardoId && (
        <div className="card">
          <h2>🧾 Productos del fardo: {fardoSel ? `${fardoSel.codigo_fardo} — ${fardoSel.nombre_fardo}` : ''}</h2>
          <div className="resumen-analisis">
            <div className="resumen-item"><span>Productos</span><strong>{ordenados.length}</strong></div>
            <div className="resumen-item"><span>Vendidos</span><strong>{vendidos} / {ordenados.length}</strong></div>
            <div className="resumen-item"><span>Total venta</span><strong>Bs. {totalVenta.toFixed(2)}</strong></div>
            <div className="resumen-item"><span>Total fardo</span><strong>Bs. {totalFardo.toFixed(2)}</strong></div>
            <div className="resumen-item"><span>Total remate</span><strong>Bs. {totalRemate.toFixed(2)}</strong></div>
          </div>
          {ordenados.length > 0 && (
            <div className="actions" style={{ margin: '0 0 10px' }}>
              <button className="btn-entregar" onClick={exportarExcel} disabled={generandoExcel}>
                {generandoExcel ? 'Generando...' : '📥 Reporte Excel'}
              </button>
            </div>
          )}
          {cargando ? (
            <p className="empty">Cargando...</p>
          ) : ordenados.length === 0 ? (
            <p className="empty">Este fardo aún no tiene productos registrados.</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr>
                    <th>Foto</th><th>Código</th><th>Precio</th><th>Remate</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginados.map((p) => (
                    <tr key={p.id} className={p.venta ? 'estado-' + p.venta.estado : ''}>
                      <td data-label="Foto">
                        {p.foto_url ? (
                          <a href={p.foto_url} target="_blank" rel="noreferrer">
                            <img className="thumb" src={p.foto_url} alt={p.nombre_foto} />
                          </a>
                        ) : '—'}
                      </td>
                      <td data-label="Código">{p.nombre_foto}</td>
                      <td data-label="Precio">{p.precio}</td>
                      <td data-label="Remate">
                        {editando === p.id ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={precioRemate}
                            onChange={(e) => setPrecioRemate(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          (p.precio_remate !== null && p.precio_remate !== undefined && p.precio_remate !== '')
                            ? 'Bs. ' + p.precio_remate
                            : '—'
                        )}
                      </td>
                      <td data-label="Estado">
                        {p.venta ? (ESTADOS[p.venta.estado] || p.venta.estado) : 'Sin vender'}
                      </td>
                      <td data-label="Acciones" className="actions">
                        {editando === p.id ? (
                          <>
                            <button className="btn-blue" onClick={() => guardarRemate(p)} disabled={guardando}>
                              {guardando ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
                          </>
                        ) : (
                          <button className="btn-edit" onClick={() => abrirEditar(p)}>Editar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td data-label="Resumen" colSpan={3} style={{ textAlign: 'right' }}>Total remate</td>
                    <td data-label="Total remate">Bs. {totalRemate.toFixed(2)}</td>
                    <td data-label="" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Paginacion total={ordenados.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
        </div>
      )}

      {!fardoId && (
        <div className="card">
          <p className="empty">Busca un fardo y selecciónalo para ver sus productos y precios de remate.</p>
        </div>
      )}
    </>
  );
}
