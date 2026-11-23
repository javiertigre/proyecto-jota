import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { generarExcel } from '../excel.js';
import Paginacion from './Paginacion.jsx';

import AnalisisCliente from './AnalisisCliente.jsx';

const ESTADOS = { P: 'Pendiente', D: 'Deuda', E: 'Entregado' };

export default function Analisis({ fardos, avisar }) {
  const [modoCliente, setModoCliente] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [fardoId, setFardoId] = useState('');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [precioRemate, setPrecioRemate] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [dashboard, setDashboard] = useState({ fardos: [], resumen: { total: 0, vendidos: 0, faltantes: 0, valor_total: 0, valor_vendido: 0 } });
  const [cargandoDash, setCargandoDash] = useState(true);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const POR_PAGINA = 10;

  const q = busqueda.trim().toLowerCase();
  const fardosFiltrados = q
    ? fardos.filter((f) => (f.codigo_fardo || '').toLowerCase().includes(q))
    : fardos;

  const fardoSel = fardos.find((f) => String(f.id) === String(fardoId));

  const resumen = dashboard.resumen;
  const pctVendido = resumen.total ? Math.round((resumen.vendidos / resumen.total) * 100) : 0;
  const hayRango = Boolean(desde || hasta);
  const etiquetaVendidos = hayRango ? 'Vendidos en el rango' : 'Vendidos';
  const etiquetaFaltan = hayRango ? 'Sin venta en el rango' : 'Faltan vender';
  const fardosBarra = fardos
    .map((f) => {
      const m = dashboard.fardos.find((x) => String(x.fardo_id) === String(f.id))
        || { total: 0, vendidos: 0, faltantes: 0, valor_total: 0, valor_vendido: 0 };
      return { ...m, codigo_fardo: f.codigo_fardo, nombre_fardo: f.nombre_fardo };
    })
    .filter((b) => b.total > 0);
  const maxTotalBarra = Math.max(1, ...fardosBarra.map((b) => b.total));

  useEffect(() => {
    let vivo = true;
    setCargandoDash(true);
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    const qs = params.toString();
    api.get('/api/analisis/fardos' + (qs ? '?' + qs : ''))
      .then((r) => {
        if (vivo) {
          setDashboard({
            fardos: r.fardos || [],
            resumen: r.resumen || { total: 0, vendidos: 0, faltantes: 0, valor_total: 0, valor_vendido: 0 }
          });
        }
      })
      .catch((err) => { if (vivo) avisar('error', err.message); })
      .finally(() => { if (vivo) setCargandoDash(false); });
    return () => { vivo = false; };
  }, [desde, hasta]);

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

  const abrirFardo = (id) => {
    elegir(id);
    // Llevar al usuario al detalle del fardo que acaba de tocar en el gráfico
    setTimeout(() => {
      const el = document.getElementById('detalle-fardo');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
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
        <h2>📈 Análisis</h2>
        <div className="actions" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className={modoCliente ? '' : 'btn-edit'}
            onClick={() => setModoCliente(false)}
          >
            📦 Por fardo
          </button>
          <button
            type="button"
            className={modoCliente ? 'btn-lila' : ''}
            onClick={() => setModoCliente(true)}
          >
            👤 Análisis por Cliente
          </button>
        </div>
        {!modoCliente && (
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
        )}
      </div>

      {!modoCliente && (
        <div className="card">
          <h2>📊 Dashboard de fardos</h2>
          <div className="dash-filtros">
            <div className="dash-filtro">
              <label>Desde</label>
              <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="dash-filtro">
              <label>Hasta</label>
              <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
            </div>
            {hayRango && (
              <button type="button" className="btn-limpiar-filtro" onClick={() => { setDesde(''); setHasta(''); }}>
                Limpiar fechas
              </button>
            )}
          </div>
          {hayRango && (
            <p className="hint">Mostrando ventas del rango seleccionado; el total de productos es el inventario completo.</p>
          )}
          {cargandoDash ? (
            <p className="empty">Cargando estadísticas...</p>
          ) : resumen.total === 0 ? (
            <p className="empty">Aún no hay productos registrados para mostrar estadísticas.</p>
          ) : (
            <>
              <div className="dash-top">
                <div className="donut-wrap">
                  <div
                    className="donut"
                    style={{ background: `conic-gradient(#22c55e 0% ${pctVendido}%, #fbbf24 ${pctVendido}% 100%)` }}
                  >
                    <div className="donut-centro">
                      <strong>{pctVendido}%</strong>
                      <span>vendido</span>
                    </div>
                  </div>
                  <div className="leyenda">
                    <span><i style={{ background: '#22c55e' }} /> {etiquetaVendidos}: <strong>{resumen.vendidos}</strong></span>
                    <span><i style={{ background: '#fbbf24' }} /> {etiquetaFaltan}: <strong>{resumen.faltantes}</strong></span>
                  </div>
                </div>
                <div className="kpis">
                  <div className="kpi"><span>Total productos</span><strong>{resumen.total}</strong></div>
                  <div className="kpi verde"><span>{etiquetaVendidos}</span><strong>{resumen.vendidos}</strong></div>
                  <div className="kpi ambar"><span>{etiquetaFaltan}</span><strong>{resumen.faltantes}</strong></div>
                  <div className="kpi"><span>Valor total</span><strong>Bs. {resumen.valor_total.toFixed(2)}</strong></div>
                  <div className="kpi verde"><span>Valor vendido</span><strong>Bs. {resumen.valor_vendido.toFixed(2)}</strong></div>
                </div>
              </div>

              <h3 className="dash-subtitulo">Productos por fardo</h3>
              <div className="barras">
                {fardosBarra.map((b) => {
                  const pct = b.total ? (b.vendidos / b.total) * 100 : 0;
                  const ancho = (b.total / maxTotalBarra) * 100;
                  return (
                    <div
                      className={'bar-fila clickable' + (String(fardoId) === String(b.fardo_id) ? ' activo' : '')}
                      key={b.fardo_id}
                      onClick={() => abrirFardo(b.fardo_id)}
                      title="Ver detalle del fardo"
                    >
                      <div className="bar-nombre" title={(b.codigo_fardo || '') + ' — ' + (b.nombre_fardo || '')}>
                        {b.codigo_fardo}
                        <small>{b.nombre_fardo}</small>
                      </div>
                      <div className="bar-track">
                        <div className="bar-bloque" style={{ width: ancho + '%' }}>
                          <div className="bar-vendido" style={{ width: pct + '%' }} title={'Vendidos: ' + b.vendidos} />
                          <div className="bar-faltante" style={{ width: (100 - pct) + '%' }} title={'Faltan: ' + b.faltantes} />
                        </div>
                      </div>
                      <div className="bar-nums">
                        {b.vendidos} / {b.total} <span>· faltan {b.faltantes}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {modoCliente && <AnalisisCliente avisar={avisar} />}

      {!modoCliente && fardoId && (
        <div className="card" id="detalle-fardo">
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

      {!modoCliente && !fardoId && (
        <div className="card">
          <p className="empty">Busca un fardo y selecciónalo para ver sus productos y precios de remate.</p>
        </div>
      )}
    </>
  );
}
