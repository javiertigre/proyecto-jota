import { useEffect, useState } from 'react';
import { api, supabase } from '../api.js';

const ROLES = { admin: 'Administrador', registro: 'Cuenta de Registro', entregas: 'Cuenta de Entregas' };
const vacio = { email: '', password: '', full_name: '', rol: 'registro' };

export default function Cuentas({ avisar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editRol, setEditRol] = useState('registro');
  const [miClave, setMiClave] = useState('');

  const cargar = async () => {
    try {
      const r = await api.get('/api/cuentas');
      setLista(r.cuentas);
    } catch (err) {
      avisar('error', err.message);
    }
  };

  useEffect(() => { cargar(); }, []);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/api/cuentas', form);
      if (r.perfilOk === false) {
        avisar('error', 'Cuenta creada, pero NO aparece en la lista (' + (r.perfilError || 'sin permiso') + '). Ejecuta RLS.sql y CUENTAS_ROL.sql en Supabase.');
      } else {
        avisar('exito', 'Cuenta creada. El usuario ya puede iniciar sesión.');
      }
      setForm(vacio);
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (c) => {
    setEditId(c.id);
    setEditNombre(c.full_name || '');
    setEditRol(c.rol || 'registro');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const actualizar = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/cuentas/' + editId, { full_name: editNombre, rol: editRol });
      avisar('exito', 'Cuenta actualizada.');
      setEditId(null);
      setEditNombre('');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const eliminar = async (c) => {
    if (!window.confirm('¿Eliminar la cuenta de ' + (c.full_name || c.email || c.id) + '?')) return;
    try {
      await api.del('/api/cuentas/' + c.id);
      avisar('exito', 'Cuenta eliminada del listado. Para bloquear su acceso, elimínala también en Supabase → Authentication → Users.');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  // Enviar correo para que el usuario ponga una nueva contraseña
  const resetClave = async (c) => {
    if (!c.email) { avisar('error', 'Esa cuenta no tiene correo registrado.'); return; }
    if (!window.confirm('¿Enviar correo de nueva contraseña a ' + c.email + '?')) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(c.email, { redirectTo: window.location.origin });
      if (error) throw error;
      avisar('exito', 'Correo enviado a ' + c.email + '.');
    } catch (err) {
      avisar('error', err.message);
    }
  };

  // Cambiar mi propia contraseña
  const cambiarMiClave = async (e) => {
    e.preventDefault();
    if (!miClave || miClave.length < 6) { avisar('error', 'Mínimo 6 caracteres.'); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: miClave });
      if (error) throw error;
      avisar('exito', 'Tu contraseña fue cambiada.');
      setMiClave('');
    } catch (err) {
      avisar('error', err.message);
    }
  };

  return (
    <>
      <div className="card">
        <h2>🔑 {editId ? 'Editar cuenta' : 'Administrar Cuentas'}</h2>
        {editId ? (
          <form className="grid1" onSubmit={actualizar}>
            <div>
              <label>Nombre completo</label>
              <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} required />
            </div>
            <div>
              <label>Tipo de usuario</label>
              <select value={editRol} onChange={(e) => setEditRol(e.target.value)}>
                <option value="admin">Administrador</option>
                <option value="registro">Cuenta de Registro</option>
                <option value="entregas">Cuenta de Entregas</option>
              </select>
            </div>
            <div>
              <button className="btn-blue">Actualizar</button>{' '}
              <button type="button" onClick={() => setEditId(null)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <form className="grid1" onSubmit={guardar}>
            <div>
              <label>Nombre completo</label>
              <input name="full_name" placeholder="Ej: Juan Perez" value={form.full_name} onChange={cambiar} required />
            </div>
            <div>
              <label>Correo</label>
              <input type="email" name="email" placeholder="correo@ejemplo.com" value={form.email} onChange={cambiar} required />
            </div>
            <div>
              <label>Contraseña</label>
              <input type="password" name="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={cambiar} required minLength={6} />
            </div>
            <div>
              <label>Tipo de usuario</label>
              <select name="rol" value={form.rol} onChange={cambiar}>
                <option value="admin">Administrador</option>
                <option value="registro">Cuenta de Registro</option>
                <option value="entregas">Cuenta de Entregas</option>
              </select>
            </div>
            <div>
              <button className="btn-primary">Crear cuenta</button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2>📋 Cuentas registradas ({lista.length})</h2>
        {lista.length === 0 ? (
          <p className="empty">Aún no hay cuentas registradas.</p>
        ) : (
          <div className="tabla">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Correo</th><th>Tipo</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Nombre">{c.full_name || '—'}</td>
                    <td data-label="Correo">{c.email || '—'}</td>
                    <td data-label="Tipo">{ROLES[c.rol] || c.rol || '—'}</td>
                    <td data-label="Acciones" className="actions">
                      <button className="btn-edit" onClick={() => editar(c)}>Editar</button>
                      <button className="btn-lila" onClick={() => resetClave(c)}>Nueva clave</button>
                      <button className="btn-del" onClick={() => eliminar(c)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>🔒 Cambiar mi contraseña</h2>
        <form className="grid1" onSubmit={cambiarMiClave}>
          <div>
            <label>Nueva contraseña</label>
            <input type="password" placeholder="Mínimo 6 caracteres" value={miClave} onChange={(e) => setMiClave(e.target.value)} required minLength={6} />
          </div>
          <div>
            <button className="btn-blue">Cambiar mi contraseña</button>
          </div>
        </form>
      </div>
    </>
  );
}
