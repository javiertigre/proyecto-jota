import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const vacio = { lugar: '', ciudad: '', detalle: '' };

export default function Entregas({ avisar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const cargar = async () => {
    try {
      const r = await api.get('/api/entregas');
      setLista(r.entregas);
      setFaltaTabla(false);
    } catch (err) {
      if (err.message.includes('lugares_entrega')) { setFaltaTabla(true); setLista([]); }
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
        await api.put('/api/entregas/' + editId, form);
        avisar('exito', 'Lugar de entrega actualizado.');
      } else {
        await api.post('/api/entregas', form);
        avisar('exito', 'Lugar de entrega registrado.');
      }
      setForm(vacio);
      setEditId(null);
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (x) => {
    setEditId(x.id);
    setForm({ lugar: x.lugar || '', ciudad: x.ciudad || '', detalle: x.detalle || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async (x) => {
    if (!window.confirm('¿Eliminar el lugar ' + x.lugar + '?')) return;
    try {
      await api.del('/api/entregas/' + x.id);
      avisar('exito', 'Lugar de entrega eliminado.');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const paginados = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <>
      <div className="card">
        <h2>🚚 {editId ? 'Editar lugar de entrega' : 'Registro de Entregas'}</h2>
        {faltaTabla ? (
          <p className="error">Falta crear la tabla lugares_entrega en Supabase. Ejecuta: create table lugares_entrega (id bigint generated always as identity primary key, lugar text not null, ciudad text not null, detalle text, created_at timestamptz default now()).</p>
        ) : (
          <form className="grid1" onSubmit={guardar}>
            <div>
              <label>Nombre del Lugar</label>
              <input name="lugar" placeholder="Ej: Terminal La Paz" value={form.lugar} onChange={cambiar} required />
            </div>
            <div>
              <label>Ciudad</label>
              <input name="ciudad" placeholder="Ej: La Paz" value={form.ciudad} onChange={cambiar} required />
            </div>
            <div>
              <label>Detalle</label>
              <input name="detalle" placeholder="Ej: Oficina 5, turno mañana" value={form.detalle} onChange={cambiar} />
            </div>
            <div>
              <button className={editId ? 'btn-blue' : 'btn-primary'}>{editId ? 'Actualizar' : 'Guardar'}</button>{' '}
              {editId && <button type="button" onClick={() => { setEditId(null); setForm(vacio); }}>Cancelar</button>}
            </div>
          </form>
        )}
      </div>

      {!faltaTabla && (
        <div className="card">
          <h2>📋 Lugares de entrega registrados ({lista.length})</h2>
          {lista.length === 0 ? (
            <p className="empty">Aún no hay lugares de entrega registrados.</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr><th>Lugar</th><th>Ciudad</th><th>Detalle</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginados.map((x) => (
                    <tr key={x.id}>
                      <td data-label="Lugar">{x.lugar}</td>
                      <td data-label="Ciudad">{x.ciudad}</td>
                      <td data-label="Detalle">{x.detalle || '—'}</td>
                      <td data-label="Acciones" className="actions">
                        <button className="btn-edit" onClick={() => editar(x)}>Editar</button>
                        <button className="btn-del" onClick={() => eliminar(x)}>Eliminar</button>
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
