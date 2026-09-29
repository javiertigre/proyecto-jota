import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const vacio = { nombre: '', apellido_paterno: '', apellido_materno: '', ciudad: '', celular: '' };

export default function Clientes({ avisar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [pagina, setPagina] = useState(1);
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
  useEffect(() => { setPagina(1); }, [lista]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
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
      cargar();
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

  const paginados = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

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
            <div className="full">
              <button className={editId ? 'btn-blue' : 'btn-primary'}>{editId ? 'Actualizar cliente' : 'Guardar cliente'}</button>{' '}
              {editId && <button type="button" onClick={() => { setEditId(null); setForm(vacio); }}>Cancelar</button>}
            </div>
          </form>
        )}
      </div>

      {!faltaTabla && (
        <div className="card">
          <h2>📋 Clientes registrados ({lista.length})</h2>
          {lista.length === 0 ? (
            <p className="empty">Aún no hay clientes registrados.</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Ap. Paterno</th><th>Ap. Materno</th><th>Ciudad</th><th>Celular</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginados.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td>{c.apellido_paterno}</td>
                      <td>{c.apellido_materno || '—'}</td>
                      <td>{c.ciudad || '—'}</td>
                      <td>{c.celular}</td>
                      <td className="actions">
                        <button className="btn-edit" onClick={() => editar(c)}>Editar</button>
                        <button className="btn-del" onClick={() => eliminar(c)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion total={lista.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
        </div>
      )}
    </>
  );
}
