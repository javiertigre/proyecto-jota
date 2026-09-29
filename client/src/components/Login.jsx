import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onAuth }) {
  const [modo, setModo] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      if (modo === 'login') {
        await api.post('/api/login', { email: form.email, password: form.password });
      } else {
        await api.post('/api/register', form);
      }
      const me = await api.get('/api/me');
      onAuth(me);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="auth-wrap">
      <h1>{modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
      {error && <p className="error">{error}</p>}
      <form onSubmit={enviar}>
        {modo === 'register' && (
          <input name="full_name" placeholder="Tu nombre completo" value={form.full_name} onChange={cambiar} required />
        )}
        <input type="email" name="email" placeholder="correo@ejemplo.com" value={form.email} onChange={cambiar} required />
        <input type="password" name="password" placeholder="Contraseña" value={form.password} onChange={cambiar} required />
        <button className="btn-primary" disabled={cargando}>
          {cargando ? 'Espera...' : modo === 'login' ? 'Entrar' : 'Registrarse'}
        </button>
      </form>
      <p>
        {modo === 'login' ? (
          <>¿No tienes cuenta? <a href="#" onClick={(e) => { e.preventDefault(); setModo('register'); }}>Crear cuenta</a></>
        ) : (
          <>¿Ya tienes cuenta? <a href="#" onClick={(e) => { e.preventDefault(); setModo('login'); }}>Iniciar sesión</a></>
        )}
      </p>
    </div>
  );
}
