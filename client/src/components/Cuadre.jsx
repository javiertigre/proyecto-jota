import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';
import { dividirNombreCompleto } from '../nombreCliente.js';
import { leerExtractoPdf } from '../extractoPdf.js';

const POR_PAGINA = 20;

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const claveCelular = (v) => {
  const d = soloDigitos(v);
  return d.length > 8 ? d.slice(-8) : d;
};
const nombreCompleto = (c) =>
  [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ').trim();

const fechaBonita = (iso) => {
  const partes = String(iso || '').slice(0, 10).split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : (iso || '—');
};

const dinero = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  return 'Bs ' + Number(n).toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export default function Cuadre({ avisar }) {
  const [registros, setRegistros] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [archivoActivo, setArchivoActivo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [subiendo, setSubiendo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorTabla, setErrorTabla] = useState('');
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ celular: '', nombre_cliente: '' });
  const [guardandoId, setGuardandoId] = useState(null);
  const [comprobandoId, setComprobandoId] = useState(null);
  const inputArchivo = useRef(null);

  const cargar = async () => {
    try {
      const r = await api.get('/api/cuadre');
      setRegistros(r.registros || []);
      setErrorTabla('');
    } catch (err) {
      if (/CUADRE\.sql|cuadre_registros/.test(err.message)) setErrorTabla(err.message);
      else avisar('error', err.message);
    }
    try {
      const rl = await api.get('/api/clientes');
      setClientes(rl.clientes || []);
    } catch { /* el listado de clientes es opcional para mostrar el cuadre */ }
  };

  useEffect(() => {
    cargar().finally(() => setCargando(false));
  }, []);

  // Extractos cargados (el más reciente primero)
  const archivos = useMemo(() => {
    const mapa = new Map();
    registros.forEach((r) => {
      const nombre = r.archivo || 'Sin nombre';
      const fecha = r.created_at || '';
      if (!mapa.has(nombre) || String(fecha) > String(mapa.get(nombre))) mapa.set(nombre, fecha);
    });
    return [...mapa.entries()]
      .sort((a, b) => String(b[1]).localeCompare(String(a[1])))
      .map(([nombre]) => nombre);
  }, [registros]);

  useEffect(() => {
    if (!archivos.length) {
      if (archivoActivo) setArchivoActivo('');
      return;
    }
    if (!archivoActivo || !archivos.includes(archivoActivo)) setArchivoActivo(archivos[0]);
  }, [archivos, archivoActivo]);

  const delArchivo = useMemo(
    () => (archivoActivo ? registros.filter((r) => (r.archivo || 'Sin nombre') === archivoActivo) : registros),
    [registros, archivoActivo]
  );

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return delArchivo.filter((r) => {
      const fecha = String(r.fecha || '').slice(0, 10);
      if (fechaDesde && fecha < fechaDesde) return false;
      if (fechaHasta && fecha > fechaHasta) return false;
      if (!t) return true;
      return [r.fecha, r.hora, r.descripcion, r.detalle, r.transaccion, r.celular, r.nombre_cliente]
        .filter(Boolean).join(' ').toLowerCase().includes(t);
    });
  }, [delArchivo, busqueda, fechaDesde, fechaHasta]);

  const totales = useMemo(() => {
    const ingreso = filtrados.reduce((s, r) => s + (Number(r.ingreso) || 0), 0);
    const gasto = filtrados.reduce((s, r) => s + (Number(r.gasto) || 0), 0);
    return { ingreso, gasto, saldo: ingreso - gasto, cantidad: filtrados.length };
  }, [filtrados]);

  // Totales por fecha, únicamente de los movimientos marcados como Comprobado.
  const totalesComprobados = useMemo(() => {
    const mapa = new Map();
    filtrados.forEach((r) => {
      if (!r.comprobado) return;
      const fecha = String(r.fecha || '').slice(0, 10);
      if (!fecha) return;
      if (!mapa.has(fecha)) mapa.set(fecha, { fecha, cantidad: 0, ingreso: 0, gasto: 0 });
      const grupo = mapa.get(fecha);
      grupo.cantidad += 1;
      grupo.ingreso += Number(r.ingreso) || 0;
      grupo.gasto += Number(r.gasto) || 0;
    });
    const filas = [...mapa.values()]
      .map((g) => ({ ...g, saldo: g.ingreso - g.gasto }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const total = filas.reduce(
      (t, g) => ({
        cantidad: t.cantidad + g.cantidad,
        ingreso: t.ingreso + g.ingreso,
        gasto: t.gasto + g.gasto,
        saldo: t.saldo + g.saldo
      }),
      { cantidad: 0, ingreso: 0, gasto: 0, saldo: 0 }
    );
    return { filas, total };
  }, [filtrados]);

  useEffect(() => { setPagina(1); }, [archivoActivo, busqueda, fechaDesde, fechaHasta]);

  useEffect(() => {
    setPagina((p) => Math.min(p, Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))));
  }, [filtrados.length]);

  const paginados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const subirExtracto = async (e) => {
    e.preventDefault();
    const file = inputArchivo.current?.files?.[0];
    if (!file) {
      avisar('error', 'Selecciona un archivo PDF.');
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      avisar('error', 'El archivo debe ser un PDF.');
      return;
    }
    setSubiendo(true);
    try {
      const filas = await leerExtractoPdf(file);
      if (!filas.length) throw new Error('No se encontraron movimientos en el PDF. Verifica que sea un extracto de cuenta.');
      await api.post('/api/cuadre/guardar', { archivo: file.name, registros: filas });
      await cargar();
      setArchivoActivo(file.name);
      setBusqueda('');
      avisar('exito', `Extracto procesado: ${filas.length} movimientos.`);
      if (inputArchivo.current) inputArchivo.current.value = '';
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setSubiendo(false);
    }
  };

  const buscarCliente = (celular, lista = clientes) => {
    const clave = claveCelular(celular);
    if (!clave) return null;
    return lista.find((c) => claveCelular(c.celular) === clave) || null;
  };

  const iniciarEdicion = (r) => {
    setEditId(r.id);
    setEditForm({ celular: r.celular || '', nombre_cliente: r.nombre_cliente || '' });
  };

  const cancelarEdicion = () => {
    setEditId(null);
    setEditForm({ celular: '', nombre_cliente: '' });
  };

  const cambiarCelular = (valor) => {
    const encontrado = buscarCliente(valor);
    setEditForm((f) => ({
      ...f,
      celular: valor,
      // Si el celular existe en clientes, se completa el nombre automáticamente.
      // Si no existe, se deja vacío para escribirlo y registrarlo al guardar.
      nombre_cliente: encontrado ? nombreCompleto(encontrado) : ''
    }));
  };

  const guardarEdicion = async (r) => {
    const cel = editForm.celular.trim();
    const nombre = editForm.nombre_cliente.trim();
    if (!cel) return avisar('error', 'Ingresa el celular.');
    if (!nombre) return avisar('error', 'Ingresa el nombre del cliente.');

    setGuardandoId(r.id);
    try {
      let cliente = buscarCliente(cel);
      let clienteId = cliente ? cliente.id : null;

      // Si el celular no existe en clientes, se registra con Nombre, Ap. Paterno y Ap. Materno.
      if (!cliente) {
        const partes = dividirNombreCompleto(nombre);
        try {
          const resp = await api.post('/api/clientes', { ...partes, celular: cel });
          cliente = resp.cliente;
          clienteId = cliente ? cliente.id : null;
        } catch (err) {
          if (!/ya se encuentra registrado/i.test(err.message)) throw err;
          const rl = await api.get('/api/clientes');
          const lista = rl.clientes || [];
          setClientes(lista);
          cliente = buscarCliente(cel, lista);
          clienteId = cliente ? cliente.id : null;
        }
      }

      const resp = await api.put('/api/cuadre/' + r.id, {
        celular: cel,
        nombre_cliente: nombre,
        cliente_id: clienteId
      });
      setRegistros((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...resp.registro } : x)));
      setEditId(null);

      // Refrescar la lista local de clientes si se agregó uno nuevo.
      const rl = await api.get('/api/clientes').catch(() => null);
      if (rl) setClientes(rl.clientes || []);
      avisar('exito', 'Registro actualizado.');
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setGuardandoId(null);
    }
  };

  const comprobar = async (r) => {
    setComprobandoId(r.id);
    try {
      const resp = await api.put('/api/cuadre/' + r.id + '/comprobar', { comprobado: !r.comprobado });
      setRegistros((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...resp.registro } : x)));
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setComprobandoId(null);
    }
  };

  return (
    <>
      <div className="card">
        <h2>💵 Cuadre</h2>
        <p className="hint">Sube el extracto bancario en PDF para revisar y clasificar sus movimientos.</p>

        {errorTabla ? (
          <p className="error">{errorTabla}</p>
        ) : (
          <form className="cuadre-upload" onSubmit={subirExtracto}>
            <div>
              <label>Subir Extracto (PDF)</label>
              <input ref={inputArchivo} type="file" accept="application/pdf,.pdf" />
            </div>
            <button className="btn-submit-entrega btn-submit-lp" type="submit" disabled={subiendo}>
              {subiendo ? 'Procesando…' : '📤 Subir extracto'}
            </button>
          </form>
        )}
      </div>

      {!errorTabla && (
        <div className="card">
          <h2>📋 Movimientos del extracto</h2>

          {cargando ? (
            <p className="hint">Cargando movimientos…</p>
          ) : registros.length === 0 ? (
            <p className="empty">Aún no hay movimientos. Sube un extracto en PDF para comenzar.</p>
          ) : (
            <>
              <div className="cuadre-toolbar">
                <div>
                  <label>Extracto</label>
                  <select value={archivoActivo} onChange={(e) => setArchivoActivo(e.target.value)}>
                    {archivos.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label>Desde</label>
                  <input
                    type="date"
                    value={fechaDesde}
                    max={fechaHasta || undefined}
                    onChange={(e) => setFechaDesde(e.target.value)}
                  />
                </div>
                <div>
                  <label>Hasta</label>
                  <input
                    type="date"
                    value={fechaHasta}
                    min={fechaDesde || undefined}
                    onChange={(e) => setFechaHasta(e.target.value)}
                  />
                </div>
                <div>
                  <label>Buscar</label>
                  <input
                    type="search"
                    placeholder="Descripción, celular, cliente…"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                </div>
                {(busqueda || fechaDesde || fechaHasta) && (
                  <div className="cuadre-limpiar">
                    <button
                      type="button"
                      className="btn-cancelar"
                      onClick={() => { setBusqueda(''); setFechaDesde(''); setFechaHasta(''); }}
                    >
                      Limpiar filtros
                    </button>
                  </div>
                )}
              </div>

              <div className="cuadre-totales">
                <div className="cuadre-total ingreso"><span>Ingresos</span><strong>{dinero(totales.ingreso)}</strong></div>
                <div className="cuadre-total gasto"><span>Gastos</span><strong>{dinero(totales.gasto)}</strong></div>
                <div className={'cuadre-total' + (totales.saldo < 0 ? ' gasto' : ' ingreso')}><span>Saldo</span><strong>{dinero(totales.saldo)}</strong></div>
                <div className="cuadre-total"><span>Movimientos</span><strong>{totales.cantidad}</strong></div>
              </div>

              <div className="cuadre-comprobados">
                <h3>✅ Totales por fecha (Comprobado)</h3>
                {totalesComprobados.filas.length === 0 ? (
                  <p className="hint">Aún no hay movimientos marcados como Comprobado para esta selección.</p>
                ) : (
                  <div className="tabla">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Movimientos</th>
                          <th>Ingresos</th>
                          <th>Gastos</th>
                          <th>Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {totalesComprobados.filas.map((g) => (
                          <tr key={g.fecha}>
                            <td data-label="Fecha">{fechaBonita(g.fecha)}</td>
                            <td data-label="Movimientos">{g.cantidad}</td>
                            <td data-label="Ingresos" className="cuadre-monto ingreso">{dinero(g.ingreso)}</td>
                            <td data-label="Gastos" className="cuadre-monto gasto">{dinero(g.gasto)}</td>
                            <td data-label="Saldo" className="cuadre-monto">{dinero(g.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td data-label="Total">Total</td>
                          <td data-label="Movimientos">{totalesComprobados.total.cantidad}</td>
                          <td data-label="Ingresos" className="cuadre-monto ingreso">{dinero(totalesComprobados.total.ingreso)}</td>
                          <td data-label="Gastos" className="cuadre-monto gasto">{dinero(totalesComprobados.total.gasto)}</td>
                          <td data-label="Saldo" className="cuadre-monto">{dinero(totalesComprobados.total.saldo)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {filtrados.length === 0 ? (
                <p className="empty">No se encontraron movimientos con esa búsqueda.</p>
              ) : (
                <div className="tabla tabla-ancha">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha/Hora</th>
                        <th>Descripción</th>
                        <th>Detalle</th>
                        <th>Transacción</th>
                        <th>Ingreso</th>
                        <th>Gastos</th>
                        <th>Celular</th>
                        <th>Nombre Cliente</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginados.map((r) => {
                        const editando = editId === r.id;
                        return (
                          <tr key={r.id} className={r.comprobado ? 'fila-comprobada' : ''}>
                            <td data-label="Fecha/Hora">
                              {fechaBonita(r.fecha)}
                              {r.hora ? <small className="cuadre-hora">{r.hora}</small> : null}
                            </td>
                            <td data-label="Descripción">{r.descripcion || '—'}</td>
                            <td data-label="Detalle">{r.detalle || '—'}</td>
                            <td data-label="Transacción" className="cuadre-transaccion">{r.transaccion || '—'}</td>
                            <td data-label="Ingreso" className="cuadre-monto ingreso">{r.ingreso !== null && r.ingreso !== undefined ? dinero(r.ingreso) : '—'}</td>
                            <td data-label="Gastos" className="cuadre-monto gasto">{r.gasto !== null && r.gasto !== undefined ? dinero(r.gasto) : '—'}</td>
                            <td data-label="Celular">
                              {editando ? (
                                <input
                                  className="cuadre-input"
                                  value={editForm.celular}
                                  onChange={(e) => cambiarCelular(e.target.value)}
                                  placeholder="Celular"
                                />
                              ) : (r.celular || '—')}
                            </td>
                            <td data-label="Nombre Cliente">
                              {editando ? (
                                <input
                                  className="cuadre-input"
                                  value={editForm.nombre_cliente}
                                  onChange={(e) => setEditForm((f) => ({ ...f, nombre_cliente: e.target.value }))}
                                  placeholder="Nombre completo"
                                  onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(r); }}
                                />
                              ) : (r.nombre_cliente || '—')}
                            </td>
                            <td data-label="Acciones" className="actions">
                              {editando ? (
                                <>
                                  <button
                                    className="btn-submit-entrega btn-submit-lp cuadre-accion"
                                    type="button"
                                    disabled={guardandoId === r.id}
                                    onClick={() => guardarEdicion(r)}
                                  >
                                    {guardandoId === r.id ? 'Guardando…' : '💾 Guardar'}
                                  </button>
                                  <button className="btn-cancelar cuadre-accion" type="button" onClick={cancelarEdicion}>
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button className="btn-edit cuadre-accion" type="button" onClick={() => iniciarEdicion(r)}>
                                    Editar
                                  </button>
                                  <button
                                    className={(r.comprobado ? 'btn-comprobado' : 'btn-comprobar') + ' cuadre-accion'}
                                    type="button"
                                    disabled={comprobandoId === r.id}
                                    onClick={() => comprobar(r)}
                                  >
                                    {r.comprobado ? '✅ Comprobado' : 'Comprobar'}
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <Paginacion total={filtrados.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
            </>
          )}
        </div>
      )}
    </>
  );
}
