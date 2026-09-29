import { useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import RegistroProducto from './components/RegistroProducto.jsx';
import Fardos from './components/Fardos.jsx';
import Clientes from './components/Clientes.jsx';
import Buses from './components/Buses.jsx';
import Ubicaciones from './components/Ubicaciones.jsx';
import Entregas from './components/Entregas.jsx';
import Cuentas from './components/Cuentas.jsx';
import SolicitudesEntrega from './components/SolicitudesEntrega.jsx';
import Ventas from './components/Ventas.jsx';
import ReporteVentas from './components/ReporteVentas.jsx';

// Pestaña inicial según tipo de usuario
function tabInicial(rol) {
  if (rol === 'registro') return 'registro';
  if (rol === 'entregas') return 'entregas';
  return 'config';
}

export default function App() {
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('config');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [verCuadre, setVerCuadre] = useState(false);
  const [fardos, setFardos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [fardoSel, setFardoSel] = useState('');
  const [msg, setMsg] = useState(null);

  const avisar = (tipo, texto) => {
    setMsg({ tipo, texto });
    setTimeout(() => setMsg(null), 4000);
  };

  const cargarDatos = async (silencioso = false) => {
    try {
      const [rf, rp] = await Promise.all([api.get('/api/fardos'), api.get('/api/productos')]);
      setFardos(rf.fardos);
      setProductos(rp.productos);
    } catch (err) {
      if (!silencioso) avisar('error', err.message);
    }
  };

  useEffect(() => {
    api.get('/api/me')
      .then((me) => { setSesion(me); setTab(tabInicial(me.profile?.rol)); cargarDatos(); })
      .catch(() => setSesion(null))
      .finally(() => setCargando(false));
  }, []);

  // Actualización automática: recarga fardos/productos cada 15s y al volver a la pestaña
  useEffect(() => {
    if (!sesion) return;
    const id = setInterval(() => cargarDatos(true), 15000);
    const alVolver = () => { if (document.visibilityState === 'visible') cargarDatos(true); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [sesion]);

  const salir = async () => {
    await api.post('/api/logout', {});
    setSesion(null);
  };

  if (cargando) return <div className="app"><p>Cargando...</p></div>;
  if (!sesion) return <div className="app"><Login onAuth={(me) => { setSesion(me); setTab(tabInicial(me.profile?.rol)); cargarDatos(); }} /></div>;

  // Tipo de usuario: admin (todo), registro (solo Registro), entregas (solo Entregas)
  const rol = sesion.profile?.rol || 'admin';
  const esAdmin = rol === 'admin';
  const puede = (t) => esAdmin || (rol === 'registro' && t === 'registro') || (rol === 'entregas' && t === 'entregas');

  const enConfig = ['config', 'fardos', 'clientes', 'buses', 'ubicaciones', 'lugares_entrega', 'cuentas'].includes(tab);
  const irTab = (t) => {
    setTab(t);
    setMenuAbierto(false);
  };
  const elegirConfig = (opcion) => {
    if (opcion === 'registro') irTab('fardos');
    if (opcion === 'cuadre') { irTab('config'); setVerCuadre(true); }
    if (opcion === 'clientes') irTab('clientes');
    if (opcion === 'buses') irTab('buses');
    if (opcion === 'ubicaciones') irTab('ubicaciones');
    if (opcion === 'lugares_entrega') irTab('lugares_entrega');
    if (opcion === 'cuentas') irTab('cuentas');
  };

  const nombre = sesion.profile?.full_name || sesion.user?.email;

  return (
    <div className="app" onClick={() => setMenuAbierto(false)}>
      <div className="topbar">
        <div className="logo" title="JC"><img src="/JC.jpeg" alt="JC" /></div>
        <div className="tabs" onClick={(e) => e.stopPropagation()}>
          {esAdmin && (
          <div className="dropdown">
            <button
              className={'tab-btn' + (enConfig ? ' active' : '')}
              onClick={() => setMenuAbierto(!menuAbierto)}
            >
              ⚙️ Configuración ▾
            </button>
            <div className={'dropdown-list' + (menuAbierto ? ' open' : '')}>
              <button onClick={() => elegirConfig('registro')}>📦 Registro de Fardos</button>
              <button onClick={() => elegirConfig('cuadre')}>💵 Cuadre</button>
              <button onClick={() => elegirConfig('clientes')}>👥 Registro de Clientes</button>
              <button onClick={() => elegirConfig('buses')}>🚌 Registro de Buses</button>
              <button onClick={() => elegirConfig('ubicaciones')}>📍 Ubicación del Producto</button>
              <button onClick={() => elegirConfig('lugares_entrega')}>🚚 Registro de Entregas</button>
              <button onClick={() => elegirConfig('cuentas')}>🔑 Administrar Cuentas</button>
            </div>
          </div>
          )}
          {puede('registro') && <button className={'tab-btn' + (tab === 'registro' ? ' active' : '')} onClick={() => irTab('registro')}>📦 Registro</button>}
          {esAdmin && <button className={'tab-btn' + (tab === 'ventas' ? ' active' : '')} onClick={() => irTab('ventas')}>💰 Ventas</button>}
          {puede('entregas') && <button className={'tab-btn' + (tab === 'entregas' ? ' active' : '')} onClick={() => irTab('entregas')}>🚚 Entregas</button>}
          {esAdmin && <button className={'tab-btn' + (tab === 'reportes' ? ' active' : '')} onClick={() => irTab('reportes')}>📊 Reportes</button>}
        </div>
        <div className="userbox">
          <div><strong>{nombre}</strong></div>
          <button className="btn-logout" onClick={salir}>Cerrar sesión</button>
        </div>
      </div>

      {msg?.tipo === 'exito' && <p className="success">{msg.texto}</p>}
      {msg?.tipo === 'error' && <p className="error">{msg.texto}</p>}

      {esAdmin && tab === 'config' && (
        <div className="card">
          <h2>⚙️ Configuración</h2>
          {verCuadre && (
            <div style={{ marginTop: 15, padding: 15, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              <strong>Módulo de Cuadre</strong>
              <p style={{ color: '#6b7280' }}>Pendiente de implementar.</p>
            </div>
          )}
        </div>
      )}

      {esAdmin && tab === 'fardos' && (
        <Fardos fardos={fardos} recargar={cargarDatos} avisar={avisar} />
      )}

      {esAdmin && tab === 'clientes' && (
        <Clientes avisar={avisar} />
      )}

      {esAdmin && tab === 'buses' && (
        <Buses avisar={avisar} />
      )}

      {esAdmin && tab === 'ubicaciones' && (
        <Ubicaciones avisar={avisar} />
      )}

      {esAdmin && tab === 'lugares_entrega' && (
        <Entregas avisar={avisar} />
      )}

      {esAdmin && tab === 'cuentas' && (
        <Cuentas avisar={avisar} />
      )}

      {puede('registro') && tab === 'registro' && (
        <RegistroProducto
          fardos={fardos}
          productos={productos}
          fardoSel={fardoSel}
          setFardoSel={setFardoSel}
          recargar={cargarDatos}
          avisar={avisar}
        />
      )}

      {esAdmin && tab === 'ventas' && (
        <Ventas fardos={fardos} avisar={avisar} />
      )}

      {puede('entregas') && tab === 'entregas' && (
        <SolicitudesEntrega avisar={avisar} />
      )}

      {esAdmin && tab === 'reportes' && (
        <ReporteVentas avisar={avisar} />
      )}
    </div>
  );
}
