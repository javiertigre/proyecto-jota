import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const vacio = { codigo_fardo: '', nombre_fardo: '', valor_total_fardo: '', cantidad_productos_fardo: '' };

export default function Fardos({ fardos, recargar, avisar }) {
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;
  const paginados = fardos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  useEffect(() => { setPagina(1); }, [fardos]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put('/api/fardos/' + editId, form);
        avisar('exito', 'Fardo actualizado correctamente.');
      } else {
        await api.post('/api/fardos', form);
        avisar('exito', 'Fardo registrado correctamente.');
      }
      setForm(vacio);
      setEditId(null);
      recargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (f) => {
    setEditId(f.id);
    setForm({
      codigo_fardo: f.codigo_fardo,
      nombre_fardo: f.nombre_fardo,
      valor_total_fardo: f.valor_total_fardo,
      cantidad_productos_fardo: f.cantidad_productos_fardo
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelar = () => {
    setEditId(null);
    setForm(vacio);
  };

  const eliminar = async (f) => {
    if (!window.confirm('¿Eliminar el fardo ' + f.codigo_fardo + '?')) return;
    try {
      await api.del('/api/fardos/' + f.id);
      avisar('exito', 'Fardo eliminado correctamente.');
      recargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  return (
    <>
      <div className="card">
        <h2>📦 {editId ? 'Editar fardo' : 'Registro Fardos'}</h2>
        <form className="grid2" onSubmit={guardar}>
          <div>
            <label>Código del fardo</label>
            <input name="codigo_fardo" placeholder="Ej: FAR-001" value={form.codigo_fardo} onChange={cambiar} required />
          </div>
          <div>
            <label>Nombre del fardo</label>
            <input name="nombre_fardo" placeholder="Ej: Fardo ropa invierno" value={form.nombre_fardo} onChange={cambiar} required />
          </div>
          <div>
            <label>Costo total</label>
            <input type="number" name="valor_total_fardo" placeholder="Ej: 1500" min="0" step="0.01" value={form.valor_total_fardo} onChange={cambiar} required />
          </div>
          <div>
            <label>Cantidad de productos</label>
            <input type="number" name="cantidad_productos_fardo" placeholder="Ej: 50" min="1" step="1" value={form.cantidad_productos_fardo} onChange={cambiar} required />
          </div>
          <div className="full">
            <button className={editId ? 'btn-blue' : 'btn-primary'}>{editId ? 'Actualizar fardo' : 'Guardar fardo'}</button>{' '}
            {editId && <button type="button" onClick={cancelar}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>📋 Fardos registrados ({fardos.length})</h2>
        {fardos.length === 0 ? (
          <p className="empty">Aún no hay fardos registrados.</p>
        ) : (
          <div className="tabla">
            <table>
              <thead>
                <tr><th>Código</th><th>Nombre</th><th>Costo total</th><th>Cant. productos</th><th>Fecha</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {paginados.map((f) => (
                  <tr key={f.id}>
                    <td>{f.codigo_fardo}</td>
                    <td>{f.nombre_fardo}</td>
                    <td>{f.valor_total_fardo}</td>
                    <td>{f.cantidad_productos_fardo}</td>
                    <td>{f.fecha_creacion ? new Date(f.fecha_creacion).toLocaleString() : ''}</td>
                    <td className="actions">
                      <button className="btn-edit" onClick={() => editar(f)}>Editar</button>
                      <button className="btn-del" onClick={() => eliminar(f)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacion total={fardos.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
      </div>
    </>
  );
}
