import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const ESTADOS = { P: 'Pendiente', D: 'Deuda', E: 'Entregado' };
const POR_PAGINA = 10;

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dinero = (n) => (Number(n) || 0).toFixed(2);
const nombreCompleto = (c) => [c?.nombre, c?.apellido_paterno, c?.apellido_materno].filter(Boolean).join(' ');

export default function AnalisisCliente({ avisar }) {
  const [clientes, setClientes] = useState([]);
  const [cargandoClientes, setCargandoClientes] = useState(true);
  const [fNombre, setFNombre] = useState('');
  const [fCelular, setFCelular] = useState('');
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [guardandoEstado, setGuardandoEstado] = useState({});

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const r = await api.get('/api/clientes');
        if (activo) setClientes(r.clientes || []);
      } catch (err) {
        avisar('error', err.message);
      } finally {
        if (activo) setCargandoClientes(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  useEffect(() => { setPagina(1); }, [fNombre, fCelular]);

  const t = normalizar(fNombre.trim());
  const c = normalizar(fCelular.trim());
  const filtrados = clientes.filter((x) => {
    if (t && !normalizar(nombreCompleto(x)).includes(t)) return false;
    if (c && !normalizar(x.celular).includes(c)) return false;
    return true;
  }).sort((a, b) => {
    const porNombre = normalizar(a.nombre).localeCompare(normalizar(b.nombre), 'es', { sensitivity: 'base', numeric: true });
    if (porNombre !== 0) return porNombre;
    return normalizar(a.apellido_paterno).localeCompare(normalizar(b.apellido_paterno), 'es', { sensitivity: 'base', numeric: true });
  });

  const paginados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  useEffect(() => {
    setPagina((p) => Math.min(p, Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))));
  }, [filtrados.length]);

  const verHistorial = async (cliente) => {
    setSeleccionado(cliente);
    setHistorial(null);
    setCargandoHistorial(true);
    try {
      const params = new URLSearchParams({
        celular: cliente.celular || '',
        nombre: nombreCompleto(cliente)
      });
      const r = await api.get('/api/clientes/historial?' + params.toString());
      setHistorial(r);
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const volver = () => {
    setSeleccionado(null);
    setHistorial(null);
  };

  const cambiarEstado = async (item, estado) => {
    if (!item || !item.id || estado === item.estado) return;
    setGuardandoEstado((m) => ({ ...m, [item.id]: true }));
    try {
      const r = await api.post('/api/ventas/' + item.id + '/estado', { estado });
      setHistorial((h) => {
        if (!h) return h;
        return {
          ...h,
          items: h.items.map((x) => x.id === item.id
            ? { ...x, estado: r.venta.estado, fecha_entrega: r.venta.fecha_entrega || x.fecha_entrega }
            : x)
        };
      });
      avisar('exito', 'Estado actualizado a ' + (ESTADOS[estado] || estado) + '.');
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setGuardandoEstado((m) => {
        const n = { ...m };
        delete n[item.id];
        return n;
      });
    }
  };

  const selectorEstado = (it) => (
    <select
      className="select-estado"
      value={it.estado || 'P'}
      onChange={(e) => cambiarEstado(it, e.target.value)}
      disabled={!!guardandoEstado[it.id]}
      title={guardandoEstado[it.id] ? 'Guardando...' : 'Cambiar estado'}
    >
      <option value="P">Pendiente</option>
      <option value="D">Deuda</option>
      <option value="E">Entregado</option>
    </select>
  );

  if (seleccionado) {
    const datos = historial?.cliente || seleccionado;
    const items = historial?.items || [];
    const pagos = historial?.pagos || [];
    const tot = historial?.totales || {};

    return (
      <>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>👤 {nombreCompleto(datos)}</h2>
            <button className="btn-edit" onClick={volver}>← Cambiar cliente</button>
          </div>
          <p className="hint">
            Celular: <strong>{datos.celular || '—'}</strong> · Ciudad: <strong>{datos.ciudad || '—'}</strong>
          </p>

          {cargandoHistorial ? (
            <p className="empty">Cargando historial...</p>
          ) : (
            <>
              <div className="resumen-analisis">
                <div className="resumen-item"><span>Compras</span><strong>{tot.compras || 0}</strong></div>
                <div className="resumen-item"><span>Total comprado</span><strong>Bs. {dinero(tot.total_venta)}</strong></div>
                <div className="resumen-item"><span>Depósitos</span><strong>Bs. {dinero(tot.total_deposito)}</strong></div>
                <div className="resumen-item"><span>Abonado</span><strong>Bs. {dinero(tot.total_abonado)}</strong></div>
                <div className="resumen-item"><span>Saldo pendiente</span><strong style={{ color: Number(tot.total_saldo) > 0 ? '#b91c1c' : '#15803d' }}>Bs. {dinero(tot.total_saldo)}</strong></div>
                <div className="resumen-item"><span>Deudas activas</span><strong>{tot.deudas || 0}</strong></div>
                <div className="resumen-item"><span>Pagos registrados</span><strong>{tot.pagos || 0}</strong></div>
              </div>

              <h3 style={{ marginTop: 18 }}>🛍️ Compras</h3>
              <p className="hint">Puedes cambiar el estado directamente en la columna <strong>Estado</strong>.</p>
              {items.length === 0 ? (
                <p className="empty">Este cliente no tiene compras registradas.</p>
              ) : (
                <div className="tabla tabla-ancha">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th><th>Foto</th><th>Código</th><th>Fardo</th>
                        <th>P. original</th><th>P. venta</th><th>Depósito</th>
                        <th>Abonado</th><th>Saldo</th><th>Estado</th><th>Observación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className={'estado-' + it.estado}>
                          <td data-label="Fecha">{it.fecha_venta || '—'}</td>
                          <td data-label="Foto">
                            {it.foto_url
                              ? <a href={it.foto_url} target="_blank" rel="noreferrer"><img className="thumb" src={it.foto_url} alt={it.codigo} /></a>
                              : '—'}
                          </td>
                          <td data-label="Código">{it.codigo || '—'}</td>
                          <td data-label="Fardo">{it.fardo || '—'}</td>
                          <td data-label="P. original">Bs. {dinero(it.precio_original)}</td>
                          <td data-label="P. venta">Bs. {dinero(it.precio_venta)}</td>
                          <td data-label="Depósito">Bs. {dinero(it.deposito)}</td>
                          <td data-label="Abonado">Bs. {dinero(it.abonado)}</td>
                          <td data-label="Saldo">
                            <strong style={{ color: it.saldo > 0 ? '#b91c1c' : '#15803d' }}>Bs. {dinero(it.saldo)}</strong>
                          </td>
                          <td data-label="Estado">{selectorEstado(it)}</td>
                          <td data-label="Observación">{it.observacion || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'right' }}>TOTALES</td>
                        <td>Bs. {dinero(tot.total_venta)}</td>
                        <td>Bs. {dinero(tot.total_deposito)}</td>
                        <td>Bs. {dinero(tot.total_abonado)}</td>
                        <td>Bs. {dinero(tot.total_saldo)}</td>
                        <td colSpan="2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <h3 style={{ marginTop: 18 }}>⚠️ Deudas pendientes</h3>
              {items.filter((it) => it.saldo > 0).length === 0 ? (
                <p className="empty">Este cliente no tiene deudas pendientes.</p>
              ) : (
                <div className="tabla">
                  <table>
                    <thead>
                      <tr><th>Fecha venta</th><th>Código</th><th>Fardo</th><th>P. venta</th><th>Depósito</th><th>Abonado</th><th>Saldo</th><th>Estado</th></tr>
                    </thead>
                    <tbody>
                      {items.filter((it) => it.saldo > 0).map((it) => (
                        <tr key={'deuda-' + it.id} className={'estado-' + it.estado}>
                          <td data-label="Fecha venta">{it.fecha_venta || '—'}</td>
                          <td data-label="Código">{it.codigo || '—'}</td>
                          <td data-label="Fardo">{it.fardo || '—'}</td>
                          <td data-label="P. venta">Bs. {dinero(it.precio_venta)}</td>
                          <td data-label="Depósito">Bs. {dinero(it.deposito)}</td>
                          <td data-label="Abonado">Bs. {dinero(it.abonado)}</td>
                          <td data-label="Saldo"><strong style={{ color: '#b91c1c' }}>Bs. {dinero(it.saldo)}</strong></td>
                          <td data-label="Estado">{selectorEstado(it)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'right' }}>SALDO TOTAL PENDIENTE</td>
                        <td>Bs. {dinero(tot.total_saldo)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <h3 style={{ marginTop: 18 }}>💳 Pagos y abonos</h3>
              {pagos.length === 0 ? (
                <p className="empty">Este cliente no tiene pagos o abonos registrados.</p>
              ) : (
                <div className="tabla tabla-ancha">
                  <table>
                    <thead>
                      <tr><th>Fecha de pago</th><th>Código</th><th>Fardo</th><th>Monto</th><th>Nota</th></tr>
                    </thead>
                    <tbody>
                      {pagos.map((p) => (
                        <tr key={p.id}>
                          <td data-label="Fecha de pago">{p.fecha_pago}</td>
                          <td data-label="Código">{p.codigo || '—'}</td>
                          <td data-label="Fardo">{p.fardo || '—'}</td>
                          <td data-label="Monto"><strong>Bs. {dinero(p.monto)}</strong></td>
                          <td data-label="Nota">{p.nota || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="3" style={{ textAlign: 'right' }}>TOTAL ABONADO</td>
                        <td>Bs. {dinero(tot.total_abonado)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="card">
      <h2>👤 Historial por cliente</h2>
      <p className="hint">Busca por nombre o celular y selecciona un cliente para ver sus compras, deudas y pagos.</p>

      <form className="grid2" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label>Buscar por nombre</label>
          <input type="search" placeholder="Ej: Juan o Pérez" value={fNombre} onChange={(e) => setFNombre(e.target.value)} />
        </div>
        <div>
          <label>Buscar por celular</label>
          <input type="search" placeholder="Ej: 77712345" value={fCelular} onChange={(e) => setFCelular(e.target.value)} />
        </div>
        {(fNombre || fCelular) && (
          <div className="full">
            <button type="button" onClick={() => { setFNombre(''); setFCelular(''); }}>Limpiar búsqueda</button>
          </div>
        )}
      </form>

      <h3 style={{ marginTop: 18 }}>Clientes encontrados ({filtrados.length})</h3>
      {cargandoClientes ? (
        <p className="empty">Cargando clientes...</p>
      ) : clientes.length === 0 ? (
        <p className="empty">No hay clientes registrados.</p>
      ) : filtrados.length === 0 ? (
        <p className="empty">No se encontraron clientes con esos datos.</p>
      ) : (
        <div className="tabla">
          <table>
            <thead>
              <tr><th>Nombre</th><th>Celular</th><th>Ciudad</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {paginados.map((cli) => (
                <tr key={cli.id}>
                  <td data-label="Nombre">{nombreCompleto(cli)}</td>
                  <td data-label="Celular">{cli.celular}</td>
                  <td data-label="Ciudad">{cli.ciudad || '—'}</td>
                  <td data-label="Acciones" className="actions">
                    <button className="btn-lila" onClick={() => verHistorial(cli)}>Ver historial</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacion total={filtrados.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
    </div>
  );
}
