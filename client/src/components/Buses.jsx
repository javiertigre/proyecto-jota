import { Fragment, useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const vacio = { nombre: '', direccion: '', telefono: '', celular: '' };

export default function Buses({ avisar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [abiertos, setAbiertos] = useState({});
  const [nuevoDestino, setNuevoDestino] = useState({});
  const [fEmpresa, setFEmpresa] = useState('');
  const [editDestinoId, setEditDestinoId] = useState(null);
  const [editDestinoTexto, setEditDestinoTexto] = useState('');
  const POR_PAGINA = 10;

  const cargar = async () => {
    try {
      const r = await api.get('/api/buses');
      setLista(r.empresas);
      setFaltaTabla(false);
    } catch (err) {
      if (err.message.includes('empresas_bus') || err.message.includes('destinos_bus')) { setFaltaTabla(true); setLista([]); }
      else avisar('error', err.message);
    }
  };

  useEffect(() => { cargar(); }, []);
  useEffect(() => { setPagina(1); }, [lista, fEmpresa]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put('/api/buses/' + editId, form);
        avisar('exito', 'Empresa actualizada.');
      } else {
        await api.post('/api/buses', form);
        avisar('exito', 'Empresa registrada.');
      }
      setForm(vacio);
      setEditId(null);
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (b) => {
    setEditId(b.id);
    setForm({ nombre: b.nombre || '', direccion: b.direccion || '', telefono: b.telefono || '', celular: b.celular || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async (b) => {
    if (!window.confirm('¿Eliminar la empresa ' + b.nombre + ' y sus destinos?')) return;
    try {
      await api.del('/api/buses/' + b.id);
      avisar('exito', 'Empresa eliminada.');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const agregarDestino = async (empresaId) => {
    const texto = (nuevoDestino[empresaId] || '').trim();
    if (!texto) { avisar('error', 'Escribe el destino.'); return; }
    try {
      await api.post('/api/buses/' + empresaId + '/destinos', { destino: texto });
      setNuevoDestino({ ...nuevoDestino, [empresaId]: '' });
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const quitarDestino = async (d) => {
    if (!window.confirm('¿Quitar el destino ' + d.destino + '?')) return;
    try {
      await api.del('/api/destinos/' + d.id);
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const guardarDestino = async (d) => {
    if (!editDestinoTexto.trim()) { avisar('error', 'Escribe el destino.'); return; }
    try {
      await api.put('/api/destinos/' + d.id, { destino: editDestinoTexto });
      setEditDestinoId(null);
      setEditDestinoTexto('');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const qe = fEmpresa.trim().toLowerCase();
  const filtradas = qe ? lista.filter((b) => (b.nombre || '').toLowerCase().includes(qe)) : lista;
  const paginados = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <>
      <div className="card">
        <h2>🚌 {editId ? 'Editar empresa' : 'Registro de Buses'}</h2>
        {faltaTabla ? (
          <p className="error">Falta crear las tablas de buses en Supabase. Avísame y te paso el script.</p>
        ) : (
          <form className="grid2" onSubmit={guardar}>
            <div className="full">
              <label>Nombre de la Empresa</label>
              <input name="nombre" value={form.nombre} onChange={cambiar} required />
            </div>
            <div className="full">
              <label>Dirección</label>
              <input name="direccion" value={form.direccion} onChange={cambiar} />
            </div>
            <div>
              <label>Teléfono</label>
              <input name="telefono" value={form.telefono} onChange={cambiar} />
            </div>
            <div>
              <label>Celular</label>
              <input name="celular" value={form.celular} onChange={cambiar} />
            </div>
            <div className="full">
              <button className={editId ? 'btn-blue' : 'btn-primary'}>{editId ? 'Actualizar empresa' : 'Guardar empresa'}</button>{' '}
              {editId && <button type="button" onClick={() => { setEditId(null); setForm(vacio); }}>Cancelar</button>}
            </div>
          </form>
        )}
      </div>

      {!faltaTabla && (
        <div className="card">
          <h2>📋 Empresas registradas ({filtradas.length})</h2>
          <div>
            <label>🔍 Filtrar por empresa</label>
            <input
              type="search"
              placeholder="Ej: Trans Copacabana"
              value={fEmpresa}
              onChange={(e) => setFEmpresa(e.target.value)}
            />
          </div>
          {filtradas.length === 0 ? (
            <p className="empty">Aún no hay empresas registradas.</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr><th>Empresa</th><th>Dirección</th><th>Teléfono</th><th>Celular</th><th>Destinos</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginados.map((b) => (
                    <Fragment key={b.id}>
                      <tr>
                        <td>{b.nombre}</td>
                        <td>{b.direccion || '—'}</td>
                        <td>{b.telefono || '—'}</td>
                        <td>{b.celular || '—'}</td>
                        <td>{b.destinos.length === 0 ? '—' : b.destinos.map((d) => d.destino).join(', ')}</td>
                        <td className="actions">
                          <button className="btn-edit" onClick={() => setAbiertos({ ...abiertos, [b.id]: !abiertos[b.id] })}>
                            Destinos ({b.destinos.length})
                          </button>
                          <button className="btn-edit" onClick={() => editar(b)}>Editar</button>
                          <button className="btn-del" onClick={() => eliminar(b)}>Eliminar</button>
                        </td>
                      </tr>
                      {abiertos[b.id] && (
                        <tr>
                          <td colSpan="6">
                            <strong>Destinos de {b.nombre}:</strong>
                            {b.destinos.length === 0 && <p className="empty">Sin destinos. Agrega el primero abajo.</p>}
                            <ul>
                              {b.destinos.map((d) => (
                                <li key={d.id}>
                                  {editDestinoId === d.id ? (
                                    <>
                                      <input
                                        value={editDestinoTexto}
                                        onChange={(e) => setEditDestinoTexto(e.target.value)}
                                      />{' '}
                                      <button className="btn-edit" onClick={() => guardarDestino(d)}>Guardar</button>{' '}
                                      <button onClick={() => setEditDestinoId(null)}>Cancelar</button>
                                    </>
                                  ) : (
                                    <>
                                      {d.destino}{' '}
                                      <button className="btn-edit" onClick={() => { setEditDestinoId(d.id); setEditDestinoTexto(d.destino); }}>Editar</button>{' '}
                                      <button className="btn-del" onClick={() => quitarDestino(d)}>Quitar</button>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              <input
                                style={{ flex: '1 1 160px' }}
                                placeholder="Nuevo destino (Ej: La Paz)"
                                value={nuevoDestino[b.id] || ''}
                                onChange={(e) => setNuevoDestino({ ...nuevoDestino, [b.id]: e.target.value })}
                              />
                              <button className="btn-primary" style={{ width: 'auto' }} onClick={() => agregarDestino(b.id)}>Agregar</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion total={filtradas.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
        </div>
      )}
    </>
  );
}
