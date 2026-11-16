import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Paginacion from './Paginacion.jsx';

const vacio = { ciudad: '', departamento: '', detalle: '' };

const DEPARTAMENTOS_BOLIVIA = [
  'La Paz',
  'Cochabamba',
  'Santa Cruz',
  'Oruro',
  'Potosí',
  'Chuquisaca',
  'Tarija',
  'Beni',
  'Pando',
  'Otro'
];

const CIUDADES_PREDETERMINADAS = [
  { ciudad: 'Cochabamba', departamento: 'Cochabamba', detalle: 'Ciudad capital' },
  { ciudad: 'Santa Cruz', departamento: 'Santa Cruz', detalle: 'Ciudad capital' },
  { ciudad: 'Oruro', departamento: 'Oruro', detalle: 'Ciudad capital' },
  { ciudad: 'Potosí', departamento: 'Potosí', detalle: 'Ciudad capital' },
  { ciudad: 'Sucre', departamento: 'Chuquisaca', detalle: 'Ciudad capital' },
  { ciudad: 'Tarija', departamento: 'Tarija', detalle: 'Ciudad capital' },
  { ciudad: 'Trinidad', departamento: 'Beni', detalle: 'Ciudad capital' },
  { ciudad: 'Cobija', departamento: 'Pando', detalle: 'Ciudad capital' },
  { ciudad: 'La Paz', departamento: 'La Paz', detalle: 'Sede de gobierno' },
  { ciudad: 'El Alto', departamento: 'La Paz', detalle: 'Ciudad de El Alto' },
  { ciudad: 'Montero', departamento: 'Santa Cruz', detalle: 'Norte Integrado' },
  { ciudad: 'Quillacollo', departamento: 'Cochabamba', detalle: 'Valle Bajo' },
  { ciudad: 'Sacaba', departamento: 'Cochabamba', detalle: 'Valle Central' },
  { ciudad: 'Riberalta', departamento: 'Beni', detalle: 'Provincia Vaca Díez' },
  { ciudad: 'Yacuiba', departamento: 'Tarija', detalle: 'Gran Chaco' },
  { ciudad: 'Villazón', departamento: 'Potosí', detalle: 'Frontera' },
  { ciudad: 'Tupiza', departamento: 'Potosí', detalle: 'Sud Chichas' },
  { ciudad: 'Llallagua', departamento: 'Potosí', detalle: 'Norte de Potosí' },
  { ciudad: 'Uyuni', departamento: 'Potosí', detalle: 'Salar de Uyuni' }
];

export default function Destinos({ avisar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);
  const POR_PAGINA = 10;

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await api.get('/api/ciudades');
      setLista(r.ciudades || []);
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, lista]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    const ciudadLimpia = String(form.ciudad || '').trim();
    if (!ciudadLimpia) {
      avisar('error', 'El nombre de la ciudad o destino es obligatorio.');
      return;
    }

    try {
      if (editId) {
        await api.put('/api/ciudades/' + editId, {
          ciudad: ciudadLimpia,
          departamento: form.departamento || null,
          detalle: form.detalle || null
        });
        avisar('exito', `Destino "${ciudadLimpia}" actualizado.`);
      } else {
        await api.post('/api/ciudades', {
          ciudad: ciudadLimpia,
          departamento: form.departamento || null,
          detalle: form.detalle || null
        });
        avisar('exito', `Destino "${ciudadLimpia}" registrado correctamente.`);
      }
      setForm(vacio);
      setEditId(null);
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (item) => {
    setEditId(item.id);
    setForm({
      ciudad: item.ciudad || '',
      departamento: item.departamento || '',
      detalle: item.detalle || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async (item) => {
    if (!window.confirm(`¿Eliminar la ciudad/destino "${item.ciudad}"?`)) return;
    try {
      await api.del('/api/ciudades/' + item.id);
      avisar('exito', `Destino "${item.ciudad}" eliminado.`);
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const precargarCiudades = async () => {
    if (!window.confirm('¿Deseas registrar automáticamente las principales ciudades de Bolivia?')) return;
    try {
      await api.post('/api/ciudades/precargar', { items: CIUDADES_PREDETERMINADAS });
      avisar('exito', 'Ciudades de Bolivia cargadas correctamente.');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const q = busqueda.trim().toLowerCase();
  const filtrados = lista.filter((c) => {
    if (!q) return true;
    const nom = String(c.ciudad || '').toLowerCase();
    const dep = String(c.departamento || '').toLowerCase();
    const det = String(c.detalle || '').toLowerCase();
    return nom.includes(q) || dep.includes(q) || det.includes(q);
  });

  const paginados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <>
      <div className="card">
        <h2>🗺️ {editId ? 'Editar Destino / Ciudad' : 'Registro de Destinos'}</h2>
        <p className="hint">
          Registra las ciudades y destinos para las entregas al interior del país y despachos de productos.
        </p>

        <form className="grid2" onSubmit={guardar}>
          <div>
            <label>Ciudad / Destino *</label>
            <input
              name="ciudad"
              placeholder="Ej: Cochabamba, Santa Cruz, Montero..."
              value={form.ciudad}
              onChange={cambiar}
              required
              autoFocus
            />
          </div>

          <div>
            <label>Departamento</label>
            <select name="departamento" value={form.departamento} onChange={cambiar}>
              <option value="">-- Selecciona Departamento --</option>
              {DEPARTAMENTOS_BOLIVIA.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="full">
            <label>Detalle / Notas (opcional)</label>
            <input
              name="detalle"
              placeholder="Ej: Terminal de buses, envío por encomienda, turno mañana..."
              value={form.detalle}
              onChange={cambiar}
            />
          </div>

          <div className="full form-acciones-responsive">
            <button
              type="submit"
              className={`btn-submit-entrega ${editId ? 'btn-submit-edit' : 'btn-submit-lp'}`}
            >
              {editId ? '💾 Actualizar Destino' : '➕ Guardar Ciudad'}
            </button>
            {editId && (
              <button
                type="button"
                className="btn-cancelar"
                onClick={() => {
                  setEditId(null);
                  setForm(vacio);
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>📋 Ciudades y Destinos registrados ({filtrados.length})</h2>
          <button
            type="button"
            onClick={precargarCiudades}
            title="Carga las capitales y ciudades principales de Bolivia si la lista está vacía"
            style={{
              background: '#f0fdf4',
              color: '#166534',
              border: '1.5px solid #86efac',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⚡ Cargar ciudades de Bolivia
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <input
            type="text"
            placeholder="🔍 Buscar por nombre de ciudad o departamento..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ maxWidth: '420px', width: '100%' }}
          />
        </div>

        {cargando ? (
          <p className="empty">Cargando destinos...</p>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: '#64748b' }}>
            <p style={{ margin: 0, fontSize: '15px' }}>
              {busqueda
                ? `No se encontraron destinos con la búsqueda "${busqueda}".`
                : 'Aún no hay destinos ni ciudades registradas.'}
            </p>
            {!busqueda && (
              <button
                type="button"
                onClick={precargarCiudades}
                className="btn-primary"
                style={{ marginTop: 12 }}
              >
                ⚡ Cargar ciudades principales de Bolivia
              </button>
            )}
          </div>
        ) : (
          <div className="tabla">
            <table>
              <thead>
                <tr>
                  <th>Ciudad / Destino</th>
                  <th>Departamento</th>
                  <th>Detalle / Notas</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Ciudad / Destino">
                      <strong style={{ color: '#0f172a', fontSize: '14px' }}>
                        📍 {c.ciudad}
                      </strong>
                    </td>
                    <td data-label="Departamento">
                      {c.departamento ? (
                        <span style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 600
                        }}>
                          {c.departamento}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td data-label="Detalle / Notas">
                      {c.detalle || <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td data-label="Acciones" className="actions" style={{ textAlign: 'right' }}>
                      <button className="btn-edit" onClick={() => editar(c)}>Editar</button>
                      <button className="btn-del" onClick={() => eliminar(c)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginacion
          total={filtrados.length}
          pagina={pagina}
          setPagina={setPagina}
          porPagina={POR_PAGINA}
        />
      </div>
    </>
  );
}
