import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const vacio = { nombre: '', apellido_paterno: '', apellido_materno: '', ciudad: '', celular: '' };

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function Clientes({ avisar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [fNombre, setFNombre] = useState('');
  const [fCelular, setFCelular] = useState('');
  const POR_PAGINA = 10;

  const cargar = async () => {
    try {
      const r = await api.get('/api/clientes');
      setLista(r.clientes);
      setFaltaTabla(false);
    } catch (err) {
      if (err.message.includes('clientes')) { setFaltaTabla(true); setLista([]); }
      else avisar('error', err.message);
    }
  };
 
  useEffect(() => { cargar(); }, []);
  useEffect(() => { setPagina(1); }, [fNombre, fCelular]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    const eraEdicion = !!editId;
    try {
      if (editId) {
        await api.put('/api/clientes/' + editId, form);
        avisar('exito', 'Cliente actualizado.');
      } else {
        await api.post('/api/clientes', form);
        avisar('exito', 'Cliente registrado.');
      }
      setForm(vacio);
      setEditId(null);
      await cargar();
      if (eraEdicion) {
        setTimeout(() => document.getElementById('lista-clientes')?.scrollIntoView({ behavior: 'smooth' }), 80);
      }
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (c) => {
    setEditId(c.id);
    setForm({
      nombre: c.nombre || '',
      apellido_paterno: c.apellido_paterno || '',
      apellido_materno: c.apellido_materno || '',
      ciudad: c.ciudad || '',
      celular: c.celular || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async (c) => {
    if (!window.confirm('¿Eliminar a ' + c.nombre + ' ' + c.apellido_paterno + '?')) return;
    try {
      await api.del('/api/clientes/' + c.id);
      avisar('exito', 'Cliente eliminado.');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const t = normalizar(fNombre.trim());
  const c = normalizar(fCelular.trim());
  const filtrados = lista.filter((x) => {
    if (t) {
      const nombreCompleto = normalizar([x.nombre, x.apellido_paterno, x.apellido_materno].filter(Boolean).join(' '));
      if (!nombreCompleto.includes(t)) return false;
    }
    if (c && !normalizar(x.celular).includes(c)) return false;
    return true;
  }).sort((a, b) => {
    const porNombre = normalizar(a.nombre).localeCompare(normalizar(b.nombre), 'es', { sensitivity: 'base', numeric: true });
    if (porNombre !== 0) return porNombre;
    const porPaterno = normalizar(a.apellido_paterno).localeCompare(normalizar(b.apellido_paterno), 'es', { sensitivity: 'base', numeric: true });
    if (porPaterno !== 0) return porPaterno;
    return normalizar(a.apellido_materno).localeCompare(normalizar(b.apellido_materno), 'es', { sensitivity: 'base', numeric: true });
  });

  const paginados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // Si la lista se reduce (por ejemplo al eliminar), no dejar la página fuera de rango.
  // Al actualizar un cliente NO se reinicia la página: se mantiene el mismo listado.
  useEffect(() => {
    setPagina((p) => Math.min(p, Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))));
  }, [filtrados.length]);

  return (
    <>
      <div className="card">
        <h2>👥 {editId ? 'Editar cliente' : 'Registro de Clientes'}</h2>
        {faltaTabla ? (
          <p className="error">Falta crear la tabla de clientes en Supabase. Avísame y te paso el script.</p>
        ) : (
          <form className="grid2" onSubmit={guardar}>
            <div>
              <label>Nombre</label>
              <input name="nombre" value={form.nombre} onChange={cambiar} required />
            </div>
            <div>
              <label>Apellido Paterno</label>
              <input name="apellido_paterno" value={form.apellido_paterno} onChange={cambiar} required />
            </div>
            <div>
              <label>Apellido Materno</label>
              <input name="apellido_materno" value={form.apellido_materno} onChange={cambiar} />
            </div>
            <div>
              <label>Ciudad</label>
              <input name="ciudad" value={form.ciudad} onChange={cambiar} />
            </div>
            <div className="full">
              <label>Celular</label>
              <input name="celular" value={form.celular} onChange={cambiar} required />
            </div>
            <div className="full form-acciones-responsive">
              <button className={`btn-submit-entrega ${editId ? 'btn-submit-edit' : 'btn-submit-lp'}`}>
                {editId ? '💾 Actualizar cliente' : '➕ Guardar cliente'}
              </button>
              {editId && (
                <button
                  type="button"
                  className="btn-cancelar"
                  onClick={() => { setEditId(null); setForm(vacio); }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {!faltaTabla && (
        <div className="card" id="lista-clientes">
          <h2>📋 Clientes registrados ({filtrados.length}{filtrados.length !== lista.length ? ' de ' + lista.length : ''})</h2>
          <p className="hint">Listado ordenado alfabéticamente por nombre.</p>

          <form className="grid2" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label>Buscar por nombre</label>
              <input
                type="search"
                placeholder="Ej: Juan o Pérez"
                value={fNombre}
                onChange={(e) => setFNombre(e.target.value)}
              />
            </div>
            <div>
              <label>Buscar por celular</label>
              <input
                type="search"
                placeholder="Ej: 77712345"
                value={fCelular}
                onChange={(e) => setFCelular(e.target.value)}
              />
            </div>
            {(fNombre || fCelular) && (
              <div className="full">
                <button type="button" onClick={() => { setFNombre(''); setFCelular(''); }}>
                  Limpiar búsqueda
                </button>
              </div>
            )}
          </form>

          {lista.length === 0 ? (
            <p className="empty">Aún no hay clientes registrados.</p>
          ) : filtrados.length === 0 ? (
            <p className="empty">No se encontraron clientes con esos datos.</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Ap. Paterno</th><th>Ap. Materno</th><th>Ciudad</th><th>Celular</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginados.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Nombre">{c.nombre}</td>
                      <td data-label="Ap. Paterno">{c.apellido_paterno}</td>
                      <td data-label="Ap. Materno">{c.apellido_materno || '—'}</td>
                      <td data-label="Ciudad">{c.ciudad || '—'}</td>
                      <td data-label="Celular">{c.celular}</td>
                      <td data-label="Acciones" className="actions">
                        <button className="btn-edit" onClick={() => editar(c)}>Editar</button>
                        <button className="btn-del" onClick={() => eliminar(c)}>Eliminar</button>
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
