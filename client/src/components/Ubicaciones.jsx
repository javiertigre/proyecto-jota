import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const vacio = { lugar: '', detalle: '' };

export default function Ubicaciones({ avisar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const cargar = async () => {
    try {
      const r = await api.get('/api/ubicaciones');
      setLista(r.ubicaciones);
      setFaltaTabla(false);
    } catch (err) {
      if (err.message.includes('ubicaciones')) { setFaltaTabla(true); setLista([]); }
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
        await api.put('/api/ubicaciones/' + editId, form);
        avisar('exito', 'Ubicación actualizada.');
      } else {
        await api.post('/api/ubicaciones', form);
        avisar('exito', 'Ubicación registrada.');
      }
      setForm(vacio);
      setEditId(null);
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (u) => {
    setEditId(u.id);
    setForm({ lugar: u.lugar || '', detalle: u.detalle || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async (u) => {
    if (!window.confirm('¿Eliminar la ubicación ' + u.lugar + '?')) return;
    try {
      await api.del('/api/ubicaciones/' + u.id);
      avisar('exito', 'Ubicación eliminada.');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const paginados = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <>
      <div className="card">
        <h2>📍 {editId ? 'Editar ubicación' : 'Ubicación del Producto'}</h2>
        {faltaTabla ? (
          <p className="error">Falta crear la tabla de ubicaciones en Supabase. Avísame y te paso el script.</p>
        ) : (
          <form className="grid1" onSubmit={guardar}>
            <div>
              <label>Lugar</label>
              <input name="lugar" placeholder="Ej: Estante A3" value={form.lugar} onChange={cambiar} required />
            </div>
            <div>
              <label>Detalle</label>
              <input name="detalle" placeholder="Ej: Pasillo 2, al fondo" value={form.detalle} onChange={cambiar} />
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
          <h2>📋 Ubicaciones registradas ({lista.length})</h2>
          {lista.length === 0 ? (
            <p className="empty">Aún no hay ubicaciones registradas.</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr><th>Lugar</th><th>Detalle</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginados.map((u) => (
                    <tr key={u.id}>
                      <td data-label="Lugar">{u.lugar}</td>
                      <td data-label="Detalle">{u.detalle || '—'}</td>
                      <td data-label="Acciones" className="actions">
                        <button className="btn-edit" onClick={() => editar(u)}>Editar</button>
                        <button className="btn-del" onClick={() => eliminar(u)}>Eliminar</button>
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
