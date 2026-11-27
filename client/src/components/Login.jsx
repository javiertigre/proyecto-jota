import { useState } from 'react';
import { api } from '../api.js';

// Solo se permite el ingreso a cuentas creadas por el Administrador del Sistema.
// Si el usuario no tiene cuenta autorizada, se muestra este mensaje.
const MSG_SIN_ACCESO = 'Usted no tiene Acceso para ingresar al Sistema, comuníquese con el Administrador del Sistema.';

export default function Login({ onAuth, mensajeInicial }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(mensajeInicial || null);
  const [cargando, setCargando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await api.post('/api/login', { email: form.email, password: form.password });
      // Verifica que el usuario autenticado tenga una cuenta autorizada.
      const me = await api.get('/api/me');
      onAuth(me);
    } catch (err) {
      setError(err.message || MSG_SIN_ACCESO);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="auth-wrap auth-tigre">
      <div className="auth-card">
        <img src="/JC.jpeg" alt='JC - Tienda Virtual "Jota Capri"' />
        <h1>Bienvenido al Sistema</h1>
        <p className="sub">de su tienda Virtual <strong>"Jota Capri"</strong></p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={enviar}>
          <input type="email" name="email" placeholder="correo@ejemplo.com" value={form.email} onChange={cambiar} required autoComplete="email" inputMode="email" />
          <input type="password" name="password" placeholder="Contraseña" value={form.password} onChange={cambiar} required autoComplete="current-password" />
          <button className="btn-primary" disabled={cargando}>
            {cargando ? 'Verificando acceso...' : 'Entrar'}
          </button>
        </form>
        <p className="hint">
          El acceso es solo para cuentas autorizadas por el Administrador del Sistema.
        </p>
      </div>
    </div>
  );
}
