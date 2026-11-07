import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const vacio = { nombre: '', valor: '' };

export default function ValoresDinamica({ avisar, onCambio }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const cargar = async () => {
    try {
      const r = await api.get('/api/valores-dinamica');
      setLista(r.valores);
      setFaltaTabla(false);
    } catch (err) {
      if (err.message.includes('valores_dinamica')) { setFaltaTabla(true); setLista([]); }
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
        await api.put('/api/valores-dinamica/' + editId, form);
        avisar('exito', 'Valor de dinámica actualizado.');
      } else {
        await api.post('/api/valores-dinamica', form);
        avisar('exito', 'Valor de dinámica registrado.');
      }
      setForm(vacio);
      setEditId(null);
      cargar();
      if (onCambio) onCambio();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (x) => {
    setEditId(x.id);
    setForm({ nombre: x.nombre || '', valor: x.valor ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async (x) => {
    if (!window.confirm('¿Eliminar la dinámica "' + x.nombre + '"?')) return;
    try {
      await api.del('/api/valores-dinamica/' + x.id);
      avisar('exito', 'Valor de dinámica eliminado.');
      cargar();
      if (onCambio) onCambio();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const paginados = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <>
      <div className="card">
        <h2>🏷️ {editId ? 'Editar valor de dinámica' : 'Valor Dinámica'}</h2>
        {faltaTabla ? (
          <p className="error">Falta crear la tabla valores_dinamica en Supabase. Ejecuta el archivo auth-supabase/VALORES_DINAMICA.sql en el SQL Editor.</p>
        ) : (
          <form className="grid2" onSubmit={guardar}>
            <div>
              <label>Nombre de la Dinámica</label>
              <input name="nombre" placeholder="Ej: Dinámica 1" value={form.nombre} onChange={cambiar} required />
            </div>
            <div>
              <label>Valor de la Dinámica</label>
              <input name="valor" type="number" step="0.01" min="0" placeholder="Ej: 50" value={form.valor} onChange={cambiar} required />
            </div>
            <div className="full">
              <button className={editId ? 'btn-blue' : 'btn-primary'}>{editId ? 'Actualizar valor' : 'Guardar valor'}</button>{' '}
              {editId && <button type="button" onClick={() => { setEditId(null); setForm(vacio); }}>Cancelar</button>}
            </div>
          </form>
        )}
      </div>

      {!faltaTabla && (
        <div className="card">
          <h2>📋 Valores de dinámicas registrados ({lista.length})</h2>
          {lista.length === 0 ? (
            <p className="empty">Aún no hay valores de dinámicas registrados.</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr><th>Nombre de la Dinámica</th><th>Valor</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginados.map((x) => (
                    <tr key={x.id}>
                      <td data-label="Nombre de la Dinámica">{x.nombre}</td>
                      <td data-label="Valor">{x.valor != null ? 'Bs ' + Number(x.valor).toFixed(2) : '—'}</td>
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
