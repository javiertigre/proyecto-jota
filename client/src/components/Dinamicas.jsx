import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { generarExcel } from '../excel.js';
import Paginacion from './Paginacion.jsx';
import ValoresDinamica from './ValoresDinamica.jsx';
import CirculoColores from './CirculoColores.jsx';
import { dividirNombreCompleto } from '../nombreCliente.js';

const hoy = () => new Date().toISOString().slice(0, 10);
const vacio = {
  celular_cliente: '',
  nombre_completo: '',
  monto_compra: '',
  n_ticket: '',
  fecha_compra: hoy(),
  dinamica_nombre: '',
  valor_dinamica: '',
  numero_desde: '',
  numero_hasta: '',
  ticket_entregado: 'Pendiente'
};

const STORAGE_KEY_ENTREGADOS = 'dinamicas_tickets_entregados';
const STORAGE_KEY_TICKETS_ENVIADOS = 'dinamicas_tickets_enviados_whatsapp';

// Cada Bs 40 de compra genera 1 número de ticket
const MONTO_POR_TICKET = 40;

const soloDigitos = (valor) => String(valor || '').replace(/[^0-9]/g, '');

const nombreDesdeCliente = (c) =>
  [c.nombre, c.apellido_paterno, c.apellido_materno]
    .filter(Boolean)
    .filter((t) => t !== '—')
    .join(' ');

const obtenerEstadosEntregadosLocales = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_ENTREGADOS) || '{}');
  } catch {
    return {};
  }
};

const guardarEstadoEntregadoLocal = (id, estado) => {
  if (!id) return;
  try {
    const mapa = obtenerEstadosEntregadosLocales();
    mapa[String(id)] = estado;
    localStorage.setItem(STORAGE_KEY_ENTREGADOS, JSON.stringify(mapa));
  } catch { }
};

const guardarTodosEstadosEntregadosLocales = (mapa) => {
  try {
    localStorage.setItem(STORAGE_KEY_ENTREGADOS, JSON.stringify(mapa || {}));
  } catch { }
};

const eliminarEstadoEntregadoLocal = (id) => {
  if (!id) return;
  try {
    const mapa = obtenerEstadosEntregadosLocales();
    delete mapa[String(id)];
    localStorage.setItem(STORAGE_KEY_ENTREGADOS, JSON.stringify(mapa));
  } catch { }
};

const extraerNumerosDeRegistro = (rec) => {
  if (!rec) return [];
  const nums = [];
  if (rec.n_ticket && String(rec.n_ticket).trim()) {
    const partes = String(rec.n_ticket).split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
    partes.forEach((p) => {
      if (p.includes('-')) {
        const trozos = p.split('-').map(Number);
        if (trozos.length === 2 && !isNaN(trozos[0]) && !isNaN(trozos[1]) && trozos[1] >= trozos[0]) {
          for (let n = trozos[0]; n <= trozos[1]; n++) nums.push(n);
          return;
        }
      }
      const num = Number(p);
      if (!isNaN(num)) nums.push(num);
    });
  } else if (rec.numero_desde != null && rec.numero_hasta != null) {
    const a = Number(rec.numero_desde);
    const b = Number(rec.numero_hasta);
    if (!isNaN(a) && !isNaN(b) && b >= a) {
      for (let n = a; n <= b; n++) nums.push(n);
    }
  }
  return [...new Set(nums)].sort((a, b) => a - b);
};

const construirMensajeTickets = (tickets) =>
  'Buena Noche Caserit@, El presente mensaje es para agradecerle por las compras que realizo en nuestra tienda virtual Capricornio. ' +
  'Conforme la dinamica en la que estamos "BLACK FRIDAY", por cada 40Bs. de sus compritas, se le asigno los siguientes numeros: ' +
  (tickets || []).join(', ') +
  '. Estos numeros son para el sorteo del dia VIERNES 27 de Noviembre a partir de las 20:30, recuerde el unico requisito es estar presente en el LIVE. ' +
  'Esperamos su presencia!!!. Tenga un descanso reparador.';

const formatearListaTickets = (numeros) => {
  const nums = [...new Set((numeros || []).map(Number).filter((n) => !isNaN(n)))].sort((a, b) => a - b);
  if (!nums.length) return '';
  const rangos = [];
  let inicio = nums[0];
  let fin = nums[0];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === fin + 1) {
      fin = nums[i];
    } else {
      rangos.push(inicio === fin ? String(inicio) : `${inicio}-${fin}`);
      inicio = nums[i];
      fin = nums[i];
    }
  }
  rangos.push(inicio === fin ? String(inicio) : `${inicio}-${fin}`);
  return rangos.join(', ');
};

const coincideTicket = (x, q) => {
  if (!q) return true;
  const qClean = String(q).trim();
  if (!qClean) return true;

  const num = parseInt(qClean, 10);
  const esNum = !isNaN(num);

  // 1. Por rango directo en columnas numero_desde / numero_hasta
  if (esNum && x.numero_desde != null && x.numero_hasta != null) {
    const d = Number(x.numero_desde);
    const h = Number(x.numero_hasta);
    if (!isNaN(d) && !isNaN(h) && num >= d && num <= h) {
      return true;
    }
  }

  // 2. Por coincidencia exacta de número o token en n_ticket
  if (x.n_ticket) {
    const str = String(x.n_ticket).trim();
    const tokens = str.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) {
      if (t.toLowerCase() === qClean.toLowerCase()) return true;
      if (esNum && parseInt(t, 10) === num) return true;
      if (esNum && t.includes('-')) {
        const partes = t.split('-');
        if (partes.length === 2) {
          const rIni = parseInt(partes[0].trim(), 10);
          const rFin = parseInt(partes[1].trim(), 10);
          if (!isNaN(rIni) && !isNaN(rFin) && num >= rIni && num <= rFin) return true;
        }
      }
    }
  }

  return false;
};

const desglosarTickets = (items) => {
  const res = [];
  (items || []).forEach((x) => {
    const celular = x.celular_cliente || '';
    const cliente = x.nombre_completo || '';
    const dinamica = x.dinamica_nombre || '';
    const fecha = x.fecha_compra || '';
    const estado = x.ticket_entregado || 'Pendiente';

    // 1. Usar n_ticket como fuente principal (lo que se ve en la lista)
    if (x.n_ticket && String(x.n_ticket).trim()) {
      const partes = String(x.n_ticket).split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
      partes.forEach((p) => {
        if (p.includes('-')) {
          const trozos = p.split('-');
          if (trozos.length === 2) {
            const ini = parseInt(trozos[0].trim(), 10);
            const fin = parseInt(trozos[1].trim(), 10);
            if (!isNaN(ini) && !isNaN(fin) && fin >= ini) {
              for (let n = ini; n <= fin; n++) {
                res.push({
                  id: x.id,
                  numero: n,
                  numeroTexto: String(n).padStart(3, '0'),
                  celular,
                  cliente,
                  dinamica,
                  fecha,
                  ticket_entregado: estado
                });
              }
              return;
            }
          }
        }
        const num = parseInt(p, 10);
        res.push({
          id: x.id,
          numero: isNaN(num) ? 0 : num,
          numeroTexto: isNaN(num) ? p : String(num).padStart(3, '0'),
          celular,
          cliente,
          dinamica,
          fecha,
          ticket_entregado: estado
        });
      });
      return;
    }

    // 2. Solo si n_ticket no está presente, usar numero_desde y numero_hasta
    const tieneRango = x.numero_desde !== null && x.numero_desde !== undefined && x.numero_desde !== '' &&
      x.numero_hasta !== null && x.numero_hasta !== undefined && x.numero_hasta !== '';
    if (tieneRango) {
      const d = Number(x.numero_desde);
      const h = Number(x.numero_hasta);
      if (!isNaN(d) && !isNaN(h) && h >= d) {
        for (let n = d; n <= h; n++) {
          res.push({
            id: x.id,
            numero: n,
            numeroTexto: String(n).padStart(3, '0'),
            celular,
            cliente,
            dinamica,
            fecha,
            ticket_entregado: estado
          });
        }
        return;
      }
    }
  });

  res.sort((a, b) => a.numero - b.numero);
  return res;
};

export default function Dinamicas({ avisar }) {
  const [lista, setLista] = useState([]);
  const [valores, setValores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteHint, setClienteHint] = useState('');
  const [clienteInfo, setClienteInfo] = useState(null);
  const [dinamicaSel, setDinamicaSel] = useState(() => {
    try {
      return localStorage.getItem('dinamica_activa') || '';
    } catch {
      return '';
    }
  });
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [verValores, setVerValores] = useState(false);
  const [verRuleta, setVerRuleta] = useState(false);
  const [modoBusqueda, setModoBusqueda] = useState('ticket'); // 'ticket' | 'celular'
  const [busquedaTicket, setBusquedaTicket] = useState('');
  const [busquedaCelular, setBusquedaCelular] = useState('');
  const [pagina, setPagina] = useState(1);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [verFiltroPdf, setVerFiltroPdf] = useState(false);
  const [pdfDesde, setPdfDesde] = useState('');
  const [pdfHasta, setPdfHasta] = useState('');
  const [modalCambioCliente, setModalCambioCliente] = useState(false);
  const [ticketACambiar, setTicketACambiar] = useState('');
  const [registroCambioCliente, setRegistroCambioCliente] = useState(null);
  const [modoDivision, setModoDivision] = useState('solo_este');
  const [nuevoClienteId, setNuevoClienteId] = useState('');
  const [nuevoClienteCelular, setNuevoClienteCelular] = useState('');
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('');
  const [guardandoCambioCliente, setGuardandoCambioCliente] = useState(false);
  const [verEnvioTickets, setVerEnvioTickets] = useState(false);
  const [enviadosTickets, setEnviadosTickets] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_TICKETS_ENVIADOS) || '[]'));
    } catch {
      return new Set();
    }
  });
  const POR_PAGINA = 10;

  const abrirModalCambioCliente = (ticketNumero = null, registroDirecto = null) => {
    let reg = registroDirecto;
    let tNum = ticketNumero ? String(ticketNumero).trim() : '';

    if (!reg && tNum) {
      reg = lista.find((x) => coincideTicket(x, tNum)) || null;
    } else if (reg && !tNum) {
      const nums = extraerNumerosDeRegistro(reg);
      tNum = nums.length > 0 ? String(nums[0]) : '';
    }

    setTicketACambiar(tNum);
    setRegistroCambioCliente(reg);
    setModoDivision('solo_este');
    setNuevoClienteId('');
    setNuevoClienteCelular('');
    setNuevoClienteNombre('');
    setModalCambioCliente(true);
  };

  const cerrarModalCambioCliente = () => {
    setModalCambioCliente(false);
    setTicketACambiar('');
    setRegistroCambioCliente(null);
    setNuevoClienteId('');
    setNuevoClienteCelular('');
    setNuevoClienteNombre('');
    setGuardandoCambioCliente(false);
  };

  const alCambiarTicketInput = (valor) => {
    setTicketACambiar(valor);
    const valLimpio = String(valor || '').trim();
    if (!valLimpio) {
      setRegistroCambioCliente(null);
      return;
    }
    const reg = lista.find((x) => coincideTicket(x, valLimpio)) || null;
    setRegistroCambioCliente(reg);
  };

  const ejecutarCambioCliente = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!ticketACambiar || !registroCambioCliente) {
      avisar('error', 'Debes elegir un número de ticket válido que exista en las dinámicas.');
      return;
    }
    const nuevoNom = String(nuevoClienteNombre || '').trim();
    const nuevoCel = String(nuevoClienteCelular || '').trim();
    if (!nuevoNom || !nuevoCel) {
      avisar('error', 'Debes ingresar el celular y nombre completo del nuevo cliente.');
      return;
    }

    const celLimpio = soloDigitos(nuevoCel);
    const celActualLimpio = soloDigitos(registroCambioCliente.celular_cliente);
    if (celLimpio && celLimpio === celActualLimpio && nuevoNom.toLowerCase() === String(registroCambioCliente.nombre_completo || '').trim().toLowerCase()) {
      avisar('error', 'El nuevo cliente ingresado es el mismo que el dueño actual de este ticket.');
      return;
    }

    setGuardandoCambioCliente(true);
    try {
      const numsDelReg = extraerNumerosDeRegistro(registroCambioCliente);
      const numT = Number(ticketACambiar);

      if (numsDelReg.length > 1 && modoDivision === 'solo_este' && !isNaN(numT) && numsDelReg.includes(numT)) {
        // Separar solo este ticket del registro original
        const restantes = numsDelReg.filter((n) => n !== numT);
        const montoTotal = Number(registroCambioCliente.monto_compra || 0);
        const montoPorBoleto = montoTotal > 0 ? montoTotal / numsDelReg.length : MONTO_POR_TICKET;
        const montoRestante = Math.round(montoPorBoleto * restantes.length * 100) / 100;
        const montoNuevo = Math.round(montoPorBoleto * 100) / 100;

        // 1. Actualizar el registro original con los tickets que quedaron
        await api.put('/api/dinamicas/' + registroCambioCliente.id, {
          ...registroCambioCliente,
          n_ticket: formatearListaTickets(restantes),
          numero_desde: Math.min(...restantes),
          numero_hasta: Math.max(...restantes),
          monto_compra: montoRestante
        });

        // 2. Crear el nuevo registro con el ticket individual para el nuevo cliente
        const respNuevo = await api.post('/api/dinamicas', {
          nombre_completo: nuevoNom,
          celular_cliente: nuevoCel,
          monto_compra: montoNuevo,
          n_ticket: String(numT),
          numero_desde: numT,
          numero_hasta: numT,
          fecha_compra: registroCambioCliente.fecha_compra || hoy(),
          dinamica_nombre: registroCambioCliente.dinamica_nombre,
          valor_dinamica: registroCambioCliente.valor_dinamica,
          ticket_entregado: registroCambioCliente.ticket_entregado || 'Pendiente'
        });
        if (respNuevo?.dinamica?.id) {
          guardarEstadoEntregadoLocal(respNuevo.dinamica.id, registroCambioCliente.ticket_entregado || 'Pendiente');
        }
      } else {
        // Transferir la compra/registro completo al nuevo cliente
        await api.put('/api/dinamicas/' + registroCambioCliente.id, {
          ...registroCambioCliente,
          nombre_completo: nuevoNom,
          celular_cliente: nuevoCel
        });
      }

      // 3. Si el cliente no existe en la tabla de clientes, agregarlo automáticamente
      const existeEnClientes = clientes.some((c) => soloDigitos(c.celular) === celLimpio);
      if (!existeEnClientes && celLimpio) {
        try {
          const { nombre, apellido_paterno, apellido_materno } = dividirNombreCompleto(nuevoNom);
          await api.post('/api/clientes', {
            nombre,
            apellido_paterno,
            apellido_materno,
            celular: nuevoCel
          });
        } catch (errCli) {
          console.warn('Registro automático en clientes:', errCli.message);
        }
      }

      avisar('exito', `Ticket #${ticketACambiar} transferido exitosamente a ${nuevoNom}.`);
      cerrarModalCambioCliente();
      await cargar();
      await cargarClientes();
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setGuardandoCambioCliente(false);
    }
  };

  const cargar = async () => {
    try {
      // 1. Estados guardados previamente en este dispositivo
      const locales = obtenerEstadosEntregadosLocales();

      // 2. Sincronización bidireccional con la nube:
      // Si este dispositivo tiene tickets 'Entregado' que la nube no tenía, se suben automáticamente
      const syncRes = await api.post('/api/dinamicas/sync-estados', { locales }).catch(() => null);
      const cloud = syncRes?.estados || {};

      // 3. Traer dinámicas completas
      const r = await api.get('/api/dinamicas');
      const cloudEstados = { ...cloud, ...(r.cloudEstados || {}) };

      const listaMapeada = (r.dinamicas || []).map((x) => {
        const idStr = String(x.id);
        const estadoDb = x.ticket_entregado;
        let estadoFinal = 'Pendiente';
        if (cloudEstados[idStr]) {
          estadoFinal = cloudEstados[idStr];
        } else if (estadoDb && estadoDb !== 'Pendiente') {
          estadoFinal = estadoDb;
        } else if (locales[idStr]) {
          estadoFinal = locales[idStr];
        } else if (estadoDb) {
          estadoFinal = estadoDb;
        }

        return {
          ...x,
          ticket_entregado: estadoFinal
        };
      });

      // 4. Actualizar localStorage de este dispositivo con los estados sincronizados
      const nuevoMapaLocal = {};
      listaMapeada.forEach((x) => {
        if (x.ticket_entregado === 'Entregado') {
          nuevoMapaLocal[String(x.id)] = 'Entregado';
        }
      });
      guardarTodosEstadosEntregadosLocales(nuevoMapaLocal);

      setLista(listaMapeada);
      setFaltaTabla(false);
    } catch (err) {
      if (err.message.includes('dinamicas')) { setFaltaTabla(true); setLista([]); }
      else avisar('error', err.message);
    }
  };

  const cargarClientes = async () => {
    try {
      const r = await api.get('/api/clientes');
      setClientes(r.clientes || []);
    } catch {
      // Ignorar si aún no existe la tabla
    }
  };

  const cargarValores = async () => {
    try {
      const r = await api.get('/api/valores-dinamica');
      const items = r.valores || [];
      setValores(items);

      setForm((prev) => {
        if (prev.dinamica_nombre) {
          const actual = items.find((v) => v.nombre === prev.dinamica_nombre);
          return actual ? { ...prev, valor_dinamica: actual.valor } : prev;
        }

        const preferida = dinamicaSel || (typeof localStorage !== 'undefined' ? localStorage.getItem('dinamica_activa') : '');
        const encontrada = items.find((v) => v.nombre === preferida);
        if (encontrada) {
          setDinamicaSel(encontrada.nombre);
          return { ...prev, dinamica_nombre: encontrada.nombre, valor_dinamica: encontrada.valor };
        }

        if (items.length === 1) {
          const unica = items[0];
          setDinamicaSel(unica.nombre);
          try { localStorage.setItem('dinamica_activa', unica.nombre); } catch { }
          return { ...prev, dinamica_nombre: unica.nombre, valor_dinamica: unica.valor };
        }

        return prev;
      });
    } catch (err) {
      if (!err.message.includes('valores_dinamica')) avisar('error', err.message);
    }
  };

  useEffect(() => {
    cargar();
    cargarValores();
    cargarClientes();

    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        cargar();
      }
    };
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);
  useEffect(() => { setPagina(1); }, [lista, busquedaTicket, busquedaCelular, modoBusqueda]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const cambiarCelular = (valor) => {
    const celLimpio = soloDigitos(valor);
    setForm((prev) => {
      if (!celLimpio) {
        setClienteHint('');
        setClienteInfo(null);
        return { ...prev, celular_cliente: valor, nombre_completo: '' };
      }

      // 1. Buscar en Clientes registrados (comparando solo dígitos)
      const c = clientes.find((x) => soloDigitos(x.celular) === celLimpio);
      if (c) {
        const nombreCompleto = nombreDesdeCliente(c);
        setClienteHint('✓ Cliente registrado: ' + nombreCompleto);
        setClienteInfo({
          existente: true,
          nombre: nombreCompleto,
          celular: c.celular,
          ciudad: c.ciudad || ''
        });
        return {
          ...prev,
          celular_cliente: valor,
          nombre_completo: nombreCompleto
        };
      }

      // 2. Si no está en Clientes, no autocompletar con datos de otras búsquedas:
      //    se dejan las casillas vacías para que se escriba el nuevo registro.
      setClienteHint('Celular no registrado. Escribe el nombre completo del nuevo cliente.');
      setClienteInfo(null);
      return { ...prev, celular_cliente: valor, nombre_completo: '' };
    });
  };

  const alSalirCelular = async () => {
    const celLimpio = soloDigitos(form.celular_cliente);
    if (celLimpio.length < 6) return;
    // Refresca la lista de clientes por si otra persona lo registró recientemente
    try {
      const r = await api.get('/api/clientes');
      const listaNube = r.clientes || [];
      setClientes(listaNube);
      const c = listaNube.find((x) => soloDigitos(x.celular) === celLimpio);
      if (c) {
        const nombreCompleto = nombreDesdeCliente(c);
        setClienteHint('✓ Cliente registrado: ' + nombreCompleto);
        setClienteInfo({
          existente: true,
          nombre: nombreCompleto,
          celular: c.celular,
          ciudad: c.ciudad || ''
        });
        setForm((prev) => ({ ...prev, nombre_completo: nombreCompleto }));
      }
    } catch {
      // Si falla la consulta se mantiene lo que ya se buscó en memoria
    }
  };

  const elegirDinamica = (e) => {
    const nombre = e.target.value;
    const encontrada = valores.find((v) => v.nombre === nombre);
    const valor = encontrada ? encontrada.valor : '';

    if (!editId) {
      setDinamicaSel(nombre);
      try {
        if (nombre) localStorage.setItem('dinamica_activa', nombre);
        else localStorage.removeItem('dinamica_activa');
      } catch { }
    }

    setForm((prev) => ({
      ...prev,
      dinamica_nombre: nombre,
      valor_dinamica: valor
    }));
  };

  const obtenerUltimoTicketRegistrado = (excluirId = null) => {
    let max = 0;
    (lista || []).forEach((d) => {
      if (excluirId && String(d.id) === String(excluirId)) return;
      if (d.n_ticket && String(d.n_ticket).trim()) {
        String(d.n_ticket).split(/[^0-9]+/).filter(Boolean).forEach((n) => {
          max = Math.max(max, Number(n) || 0);
        });
      } else if (d.numero_hasta !== null && d.numero_hasta !== undefined && d.numero_hasta !== '') {
        max = Math.max(max, Number(d.numero_hasta) || 0);
      }
    });
    return max;
  };

  const generarNumero = () => {
    const dinamica = String(form.dinamica_nombre || '').trim();
    if (!dinamica) {
      avisar('error', 'Primero selecciona una dinámica arriba en Valor Dinámica.');
      return;
    }

    const monto = Number(form.monto_compra);
    if (!form.monto_compra || !Number.isFinite(monto) || monto <= 0) {
      avisar('error', 'Primero ingresa el monto de compra para calcular los números de ticket.');
      return;
    }

    // 1 número de ticket por cada Bs 40 de compra
    const cantidad = Math.floor(monto / MONTO_POR_TICKET);
    if (cantidad < 1) {
      avisar(
        'error',
        `El monto debe ser de al menos Bs ${MONTO_POR_TICKET.toFixed(2)} para generar 1 número de ticket (cada Bs ${MONTO_POR_TICKET} = 1 ticket).`
      );
      return;
    }

    // Respetar estrictamente el último número correlativo registrado
    const ultimo = obtenerUltimoTicketRegistrado(editId);
    const desde = ultimo + 1;
    const hasta = ultimo + cantidad;
    const nTicket = cantidad === 1 ? String(desde) : `${desde}-${hasta}`;

    setForm((prev) => ({
      ...prev,
      n_ticket: nTicket,
      numero_desde: desde,
      numero_hasta: hasta
    }));

    const sobrante = monto % MONTO_POR_TICKET;
    avisar(
      'exito',
      `Monto Bs ${monto.toFixed(2)} → ${cantidad} número${cantidad > 1 ? 's' : ''} de ticket ` +
      `(${cantidad === 1 ? '#' + desde : '#' + desde + ' al #' + hasta})` +
      (sobrante > 0 ? `. Sobran Bs ${sobrante.toFixed(2)} sin boleto.` : '.')
    );
  };

  const cancelar = () => {
    setEditId(null);
    setClienteHint('');
    setClienteInfo(null);
    const activa = valores.find((v) => v.nombre === dinamicaSel);
    setForm({
      ...vacio,
      // Mantiene la fecha elegida para seguir registrando compradores del mismo día
      fecha_compra: form.fecha_compra || hoy(),
      dinamica_nombre: dinamicaSel || '',
      valor_dinamica: activa ? activa.valor : '',
      ticket_entregado: 'Pendiente'
    });
  };

  const cambiarEstadoTicket = async (item, nuevoEstado) => {
    const estadoActual = item.ticket_entregado || 'Pendiente';
    const estadoFinal = nuevoEstado || (estadoActual === 'Entregado' ? 'Pendiente' : 'Entregado');

    // 1. Actualización visual inmediata en la tabla y ruleta
    setLista((prev) => prev.map((x) => (x.id === item.id ? { ...x, ticket_entregado: estadoFinal } : x)));

    // 2. Persistencia en localStorage local
    guardarEstadoEntregadoLocal(item.id, estadoFinal);

    // 3. Persistencia en la nube (para que se refleje inmediatamente en cualquier celular o PC)
    try {
      await api.post(`/api/dinamicas/${item.id}/estado`, { ticket_entregado: estadoFinal });
      avisar('exito', `Ticket de ${item.nombre_completo} actualizado a "${estadoFinal}".`);
    } catch {
      try {
        await api.put(`/api/dinamicas/${item.id}`, { ...item, ticket_entregado: estadoFinal });
        avisar('exito', `Ticket de ${item.nombre_completo} actualizado a "${estadoFinal}".`);
      } catch {
        avisar('exito', `Ticket de ${item.nombre_completo} guardado como "${estadoFinal}".`);
      }
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.dinamica_nombre) {
      avisar('error', 'Primero selecciona una dinámica arriba en Valor Dinámica.');
      return;
    }
    const cel = String(form.celular_cliente || '').trim();
    const nom = String(form.nombre_completo || '').trim();
    if (!cel || !nom) {
      avisar('error', 'El celular y el nombre completo son obligatorios.');
      return;
    }

    try {
      // Si el cliente no existe en Clientes, guardarlo automáticamente
      const existeEnClientes = clientes.some((c) => soloDigitos(c.celular) === soloDigitos(cel));
      let nuevoClienteRegistrado = false;
      if (!existeEnClientes) {
        try {
          const { nombre, apellido_paterno, apellido_materno } = dividirNombreCompleto(nom);
          const rCli = await api.post('/api/clientes', {
            nombre,
            apellido_paterno,
            apellido_materno,
            celular: cel
          });
          if (rCli && rCli.cliente) {
            setClientes((prev) => [rCli.cliente, ...prev]);
            nuevoClienteRegistrado = true;
          }
        } catch (errCli) {
          // Si ya existe (por ejemplo, se registró en otro dispositivo), refresca la lista
          if (/ya se encuentra registrado/i.test(errCli.message || '')) {
            try {
              const r = await api.get('/api/clientes');
              setClientes(r.clientes || []);
            } catch { }
          } else {
            console.warn('Registro automático en clientes:', errCli.message);
          }
        }
      }

      // Sincronizar numero_desde y numero_hasta con n_ticket para que nunca queden rangos viejos
      let numDesde = null;
      let numHasta = null;
      if (form.n_ticket && String(form.n_ticket).trim()) {
        const nums = String(form.n_ticket).split(/[^0-9]+/).filter(Boolean).map(Number);
        if (nums.length === 1) {
          numDesde = nums[0];
          numHasta = nums[0];
        } else if (nums.length > 1) {
          numDesde = Math.min(...nums);
          numHasta = Math.max(...nums);
        }
      }

      const datosGuardar = {
        ...form,
        numero_desde: numDesde,
        numero_hasta: numHasta
      };

      if (editId) {
        guardarEstadoEntregadoLocal(editId, form.ticket_entregado || 'Pendiente');
        await api.put('/api/dinamicas/' + editId, datosGuardar);
        avisar('exito', 'Dinámica actualizada.');
        cancelar();
      } else {
        const respGuardar = await api.post('/api/dinamicas', datosGuardar);
        if (respGuardar && respGuardar.dinamica && respGuardar.dinamica.id) {
          guardarEstadoEntregadoLocal(respGuardar.dinamica.id, form.ticket_entregado || 'Pendiente');
        }
        avisar(
          'exito',
          'Comprador registrado en la dinámica' + (nuevoClienteRegistrado ? ' y agregado a Clientes.' : '.')
        );
        // Mantiene la dinámica y la fecha seleccionadas para registrar a los siguientes compradores
        const dinamicaMantener = form.dinamica_nombre;
        const valorMantener = form.valor_dinamica;
        const fechaMantener = form.fecha_compra || hoy();
        setClienteHint('');
        setClienteInfo(null);
        setForm({
          ...vacio,
          fecha_compra: fechaMantener,
          dinamica_nombre: dinamicaMantener,
          valor_dinamica: valorMantener,
          ticket_entregado: 'Pendiente'
        });
      }
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const editar = (x) => {
    setEditId(x.id);
    setClienteHint('');
    setClienteInfo(null);
    setForm({
      celular_cliente: x.celular_cliente || '',
      nombre_completo: x.nombre_completo || '',
      monto_compra: x.monto_compra ?? '',
      n_ticket: x.n_ticket || '',
      fecha_compra: x.fecha_compra || '',
      dinamica_nombre: x.dinamica_nombre || '',
      valor_dinamica: x.valor_dinamica ?? '',
      numero_desde: x.numero_desde ?? '',
      numero_hasta: x.numero_hasta ?? '',
      ticket_entregado: x.ticket_entregado || 'Pendiente'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async (x) => {
    if (!window.confirm('¿Eliminar la dinámica de ' + x.nombre_completo + '?')) return;
    try {
      eliminarEstadoEntregadoLocal(x.id);
      await api.del('/api/dinamicas/' + x.id);
      avisar('exito', 'Dinámica eliminada.');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const enviarNumerosClienteTickets = (grupo) => {
    const cel = soloDigitos(grupo.celular);
    if (!cel) {
      avisar('error', 'El cliente no tiene un número de celular registrado.');
      return;
    }

    const tickets = grupo.tickets.map((t) => '#' + t.numeroTexto);
    if (tickets.length === 0) {
      avisar('error', 'Este cliente no tiene números de ticket asignados.');
      return;
    }

    const mensaje = construirMensajeTickets(tickets);
    const telefono = cel.length === 8 ? '591' + cel : cel;

    window.open('https://wa.me/' + telefono + '?text=' + encodeURIComponent(mensaje), '_blank');

    // Pintar la fila de verde para marcar que ya se envió el mensaje
    setEnviadosTickets((prev) => {
      const next = new Set(prev);
      next.add(grupo.clave);
      try {
        localStorage.setItem(STORAGE_KEY_TICKETS_ENVIADOS, JSON.stringify([...next]));
      } catch { }
      return next;
    });
  };

  const normalizarTelefono = (tel) => String(tel || '').replace(/[^0-9]/g, '');

  const coincidenciasTicket = busquedaTicket.trim()
    ? lista.filter((x) => coincideTicket(x, busquedaTicket))
    : [];

  const coincidenciasCelular = busquedaCelular.trim()
    ? lista.filter((x) => {
      const celClean = normalizarTelefono(x.celular_cliente);
      const qClean = normalizarTelefono(busquedaCelular);
      if (qClean) return celClean.includes(qClean);
      return String(x.celular_cliente || '').toLowerCase().includes(busquedaCelular.toLowerCase().trim());
    })
    : [];

  const tieneFiltroTicket = modoBusqueda === 'ticket' && busquedaTicket.trim();
  const tieneFiltroCelular = modoBusqueda === 'celular' && busquedaCelular.trim();

  const visibles = tieneFiltroTicket
    ? coincidenciasTicket
    : (tieneFiltroCelular ? coincidenciasCelular : lista);

  const paginados = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // Clientes que tienen tickets, agrupados por celular para mostrar TODOS sus tickets en una sola fila
  const clientesConTickets = (() => {
    const mapa = {};
    lista.forEach((x) => {
      const tickets = desglosarTickets([x]);
      if (tickets.length === 0) return;

      const celular = String(x.celular_cliente || '').trim();
      const nombre = String(x.nombre_completo || '').trim();
      const tel = normalizarTelefono(celular);
      const clave = tel || (nombre.toLowerCase() + '|' + celular.toLowerCase());

      if (!mapa[clave]) {
        mapa[clave] = { clave, nombre, celular, tickets: [], ticketsVistos: new Set() };
      }
      if (!mapa[clave].nombre && nombre) mapa[clave].nombre = nombre;
      if (!mapa[clave].celular && celular) mapa[clave].celular = celular;

      tickets.forEach((t) => {
        const numeroClave = String(t.numero || t.numeroTexto);
        if (mapa[clave].ticketsVistos.has(numeroClave)) return;
        mapa[clave].ticketsVistos.add(numeroClave);
        mapa[clave].tickets.push(t);
      });
    });

    return Object.values(mapa)
      .map((g) => ({
        clave: g.clave,
        nombre: g.nombre,
        celular: g.celular,
        tickets: g.tickets.sort((a, b) => a.numero - b.numero)
      }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  })();

  const comprasPorFecha = (() => {
    if (modoBusqueda !== 'celular' || !busquedaCelular.trim() || coincidenciasCelular.length === 0) {
      return [];
    }
    const mapa = {};
    coincidenciasCelular.forEach((item) => {
      const f = item.fecha_compra || 'Sin fecha';
      if (!mapa[f]) mapa[f] = [];
      mapa[f].push(item);
    });
    return Object.keys(mapa)
      .sort((a, b) => b.localeCompare(a))
      .map((fecha) => ({
        fecha,
        items: mapa[fecha],
        tickets: desglosarTickets(mapa[fecha]),
        totalMonto: mapa[fecha].reduce((acc, curr) => acc + (Number(curr.monto_compra) || 0), 0)
      }));
  })();

  const exportarSorteoExcel = async () => {
    const origen = visibles.length > 0 && (tieneFiltroTicket || tieneFiltroCelular) ? visibles : lista;
    // Solo números en estado Pendiente (los entregados no se muestran para exportar ni imprimir)
    const soloPendientes = origen.filter((x) => (x.ticket_entregado || 'Pendiente') !== 'Entregado');
    const tickets = desglosarTickets(soloPendientes);

    if (tickets.length === 0) {
      const totalEntregados = desglosarTickets(origen.filter((x) => (x.ticket_entregado || 'Pendiente') === 'Entregado')).length;
      if (totalEntregados > 0) {
        avisar('info', `Los ${totalEntregados} boletos ya están en estado "Entregado". El reporte solo incluye boletos "Pendientes".`);
      } else {
        avisar('error', 'No hay boletos pendientes para exportar.');
      }
      return;
    }
    setGenerandoExcel(true);
    try {
      const filas = tickets.map((t) => [
        'GRAN SORTEO EL 27 DE NOVIEMBRE',
        t.numero,
        t.celular,
        t.cliente,
        t.dinamica,
        t.fecha,
        t.ticket_entregado || 'Pendiente'
      ]);

      await generarExcel({
        nombre: 'gran_sorteo_27_noviembre_boletos_pendientes',
        columnas: [
          { header: 'Cabecera / Evento', key: 'cabecera', width: 34 },
          { header: 'Número', key: 'numero', width: 14 },
          { header: 'Celular Cliente', key: 'celular', width: 18 },
          { header: 'Nombre del Cliente', key: 'cliente', width: 32 },
          { header: 'Dinámica', key: 'dinamica', width: 26 },
          { header: 'Fecha de Compra', key: 'fecha', width: 16 },
          { header: 'Estado Entrega', key: 'estado', width: 16 }
        ],
        filas,
        fotos: []
      });
      avisar('exito', 'Reporte Excel generado (' + tickets.length + ' boletos pendientes).');
    } catch (err) {
      avisar('error', 'Error al generar Excel: ' + err.message);
    } finally {
      setGenerandoExcel(false);
    }
  };

  const exportarSorteoPDF = (filtro = {}) => {
    const desde = String(filtro.desde || '').trim();
    const hasta = String(filtro.hasta || '').trim();

    if (desde && hasta && desde > hasta) {
      avisar('error', 'La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
      return;
    }

    const origenBase = visibles.length > 0 && (tieneFiltroTicket || tieneFiltroCelular) ? visibles : lista;
    // Filtrar por rango de fechas de compra (las fechas se guardan como AAAA-MM-DD)
    const origen = (desde || hasta)
      ? origenBase.filter((x) => {
        const f = String(x.fecha_compra || '').trim();
        if (!f) return false;
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
        return true;
      })
      : origenBase;

    // Solo números en estado Pendiente (los entregados no se muestran para imprimir)
    const soloPendientes = origen.filter((x) => (x.ticket_entregado || 'Pendiente') !== 'Entregado');
    const tickets = desglosarTickets(soloPendientes);

    if (tickets.length === 0) {
      const totalEntregados = desglosarTickets(origen.filter((x) => (x.ticket_entregado || 'Pendiente') === 'Entregado')).length;
      const rango = desde || hasta
        ? ` en el rango ${desde || 'inicio'} a ${hasta || 'hoy'}`
        : '';
      if (totalEntregados > 0) {
        avisar('info', `Los ${totalEntregados} boletos${rango} ya están en estado "Entregado". El reporte solo imprime boletos "Pendientes".`);
      } else {
        avisar('error', `No hay boletos pendientes para generar el PDF${rango}.`);
      }
      return;
    }

    const rangoTexto = desde || hasta
      ? `${desde || 'inicio'} a ${hasta || 'hoy'}`
      : 'todas las fechas';
    const titulo = `Gran Sorteo el 27 de Noviembre — Boletos Pendientes (${rangoTexto})`;
    const fecha = new Date().toLocaleString();
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 7 columnas × 8 filas = 56 boletos por hoja (tamaño cuadrado para recortar ~28mm × 28mm)
    const renderHojas = (cols, rows) => {
      const porHoja = cols * rows;
      const totalHojas = Math.ceil(tickets.length / porHoja);
      const res = [];
      for (let i = 0; i < tickets.length; i += porHoja) {
        const lote = tickets.slice(i, i + porHoja);
        const celdas = lote.map((t) => `
          <div class="ticket">
            <div class="ticket-header">GRAN SORTEO EL 27 DE NOVIEMBRE</div>
            <div class="ticket-body">
              <div class="ticket-numero">${escH(t.numeroTexto)}</div>
              <div class="ticket-celular">📱 ${escH(t.celular)}</div>
              <div class="ticket-cliente">👤 ${escH(t.cliente)}</div>
              ${t.dinamica ? `<div class="ticket-dinamica">${escH(t.dinamica)}</div>` : ''}
            </div>
          </div>
        `).join('');

        res.push(`
          <div class="hoja">
            <div class="hoja-header">
              <span>GRAN SORTEO EL 27 DE NOVIEMBRE (PENDIENTES) · ${escH(rangoTexto)}</span>
              <span>Página ${Math.floor(i / porHoja) + 1} de ${totalHojas}</span>
            </div>
            <div class="grid cols-${cols}">${celdas}</div>
          </div>
        `);
      }
      return res.join('');
    };

    const filasTabla = tickets.map((t) => `
      <tr>
        <td style="font-weight:700;color:#0f172a">GRAN SORTEO EL 27 DE NOVIEMBRE</td>
        <td style="font-size:14px;font-weight:800;color:#b91c1c;text-align:center">${escH(t.numeroTexto)}</td>
        <td style="font-weight:700;color:#1d4ed8">${escH(t.celular)}</td>
        <td style="font-weight:600">${escH(t.cliente)}</td>
        <td>${escH(t.dinamica || '—')}</td>
        <td>${escH(t.fecha || '—')}</td>
        <td style="font-weight:700;color:#b45309;text-align:center">⏳ ${escH(t.ticket_entregado || 'Pendiente')}</td>
      </tr>
    `).join('');

    const w = window.open('', '_blank');
    if (!w) return;

    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escH(titulo)}</title>
        <style>
          @page {
            size: letter portrait;
            margin: 4mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: sans-serif;
            margin: 0;
            padding: 4px;
            color: #111827;
            background: #ffffff;
          }
          .no-print {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            padding: 10px 14px;
            border-radius: 8px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
          }
          .no-print button {
            background: #1e293b;
            color: #ffffff;
            border: none;
            padding: 7px 14px;
            border-radius: 6px;
            font-weight: 700;
            cursor: pointer;
            font-size: 13px;
          }
          .no-print button:hover { background: #0f172a; }
          .no-print .btn-sec {
            background: #e2e8f0;
            color: #1e293b;
          }
          .no-print .btn-sec:hover { background: #cbd5e1; }
          .btn-tam.active {
            background: #0f172a !important;
            color: #ffffff !important;
            outline: 2px solid #3b82f6;
          }
          .hoja {
            page-break-after: always;
            break-after: page;
          }
          .hoja:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .hoja-header {
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #64748b;
            margin-bottom: 3px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .grid {
            display: grid;
            gap: 2.5px;
          }
          .grid.cols-7 {
            grid-template-columns: repeat(7, 1fr);
          }
          .grid.cols-8 {
            grid-template-columns: repeat(8, 1fr);
            gap: 2px;
          }
          .grid.cols-6 {
            grid-template-columns: repeat(6, 1fr);
            gap: 3px;
          }

          /* TICKET CUADRADO PARA CORTAR */
          .ticket {
            border: 1px dashed #555555;
            border-radius: 3px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            page-break-inside: avoid;
            break-inside: avoid;
            background: #ffffff;
            box-sizing: border-box;
            text-align: center;
            height: 28mm;
          }
          .cols-8 .ticket {
            height: 25mm;
          }
          .cols-6 .ticket {
            height: 38mm;
          }

          .ticket-header {
            width: 100%;
            background: #0f172a;
            color: #ffffff;
            text-align: center;
            font-size: 6.5px;
            font-weight: 800;
            padding: 1.5px 1px;
            letter-spacing: 0.1px;
            line-height: 1.15;
            text-transform: uppercase;
          }
          .cols-8 .ticket-header {
            font-size: 5.5px;
            padding: 1px;
          }
          .cols-6 .ticket-header {
            font-size: 7.5px;
            padding: 2px;
          }

          .ticket-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 1px 2px 2px;
            text-align: center;
            min-width: 0;
          }
          .ticket-numero {
            font-size: 16px;
            font-weight: 900;
            color: #dc2626;
            line-height: 1;
            margin: 1px 0;
          }
          .cols-8 .ticket-numero {
            font-size: 14px;
          }
          .cols-6 .ticket-numero {
            font-size: 19px;
          }

          .ticket-celular {
            font-size: 8.5px;
            font-weight: 800;
            color: #1d4ed8;
            margin: 1px 0;
            line-height: 1;
            white-space: nowrap;
          }
          .cols-8 .ticket-celular {
            font-size: 8px;
          }
          .cols-6 .ticket-celular {
            font-size: 10px;
          }

          .ticket-cliente {
            font-size: 7.5px;
            font-weight: 700;
            color: #111827;
            line-height: 1.1;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .cols-8 .ticket-cliente {
            font-size: 7px;
          }
          .cols-6 .ticket-cliente {
            font-size: 9px;
          }

          .ticket-dinamica {
            font-size: 6.5px;
            color: #64748b;
            margin-top: 1px;
            border-top: 1px dotted #cbd5e1;
            width: 95%;
            padding-top: 1px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-top: 8px;
          }
          th, td {
            border: 1px solid #94a3b8;
            padding: 6px 8px;
            text-align: left;
          }
          th {
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
          }
          tr:nth-child(even) { background: #f8fafc; }
          @media print {
            .no-print { display: none !important; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print">
          <div>
            <strong style="font-size:15px;color:#0f172a">🎯 GRAN SORTEO EL 27 DE NOVIEMBRE — SOLO PENDIENTES</strong>
            <div style="font-size:12px;color:#64748b;margin-top:2px">
              ${tickets.length} boletos pendientes de entrega (los entregados no se imprimen) · Fechas: ${escH(rangoTexto)} · ${fecha}
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span style="font-size:12px;color:#475569;font-weight:600">Tamaño para cortar:</span>
            <button id="btn7" class="btn-tam active" onclick="cambiarTam(7, 8, this)">✂️ Pequeño (7×8 · 56/hoja)</button>
            <button id="btn8" class="btn-tam btn-sec" onclick="cambiarTam(8, 9, this)">✂️ Mini (8×9 · 72/hoja)</button>
            <button id="btn6" class="btn-tam btn-sec" onclick="cambiarTam(6, 6, this)">✂️ Mediano (6×6 · 36/hoja)</button>
            <button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
            <button class="btn-sec" onclick="
              var vC = document.getElementById('vista-cupones');
              var vT = document.getElementById('vista-tabla');
              if (vC.style.display === 'none') {
                vC.style.display = 'block';
                vT.style.display = 'none';
                this.innerText = '📋 Ver formato tabla';
              } else {
                vC.style.display = 'none';
                vT.style.display = 'block';
                this.innerText = '🎟️ Ver formato boletos para recortar';
              }
            ">📋 Ver formato tabla</button>
          </div>
        </div>

        <div id="vista-cupones">
          ${renderHojas(7, 8)}
        </div>

        <div id="vista-tabla" style="display:none">
          <h2 style="margin:0 0 4px">GRAN SORTEO EL 27 DE NOVIEMBRE — BOLETOS PENDIENTES (${escH(rangoTexto)})</h2>
          <p style="color:#64748b;margin:0 0 10px;font-size:12px">${tickets.length} boletos pendientes de entrega · Fechas: ${escH(rangoTexto)} · ${fecha}</p>
          <table>
            <thead>
              <tr>
                <th>Evento</th>
                <th style="text-align:center">Número</th>
                <th>Celular Cliente</th>
                <th>Nombre del Cliente</th>
                <th>Dinámica</th>
                <th>Fecha Compra</th>
                <th style="text-align:center">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${filasTabla}
            </tbody>
          </table>
        </div>

        <script>
          var allTickets = ${JSON.stringify(tickets)};
          function cambiarTam(cols, rows, btn) {
            document.querySelectorAll('.btn-tam').forEach(function(b) {
              b.classList.remove('active');
              b.classList.add('btn-sec');
            });
            btn.classList.add('active');
            btn.classList.remove('btn-sec');

            var porHoja = cols * rows;
            var totalHojas = Math.ceil(allTickets.length / porHoja);
            var html = '';
            for (var i = 0; i < allTickets.length; i += porHoja) {
              var lote = allTickets.slice(i, i + porHoja);
              var celdas = lote.map(function(t) {
                var dinamicaHtml = t.dinamica ? '<div class=\"ticket-dinamica\">' + (t.dinamica || '') + '</div>' : '';
                return '<div class=\"ticket\">'
                  + '<div class=\"ticket-header\">GRAN SORTEO EL 27 DE NOVIEMBRE</div>'
                  + '<div class=\"ticket-body\">'
                  + '<div class=\"ticket-numero\">' + (t.numeroTexto || '') + '</div>'
                  + '<div class=\"ticket-celular\">📱 ' + (t.celular || '') + '</div>'
                  + '<div class=\"ticket-cliente\">👤 ' + (t.cliente || '') + '</div>'
                  + dinamicaHtml
                  + '</div></div>';
              }).join('');

              var numPag = Math.floor(i / porHoja) + 1;
              html += '<div class=\"hoja\">'
                + '<div class=\"hoja-header\"><span>GRAN SORTEO EL 27 DE NOVIEMBRE</span><span>Página ' + numPag + ' de ' + totalHojas + '</span></div>'
                + '<div class=\"grid cols-' + cols + '\">' + celdas + '</div>'
                + '</div>';
            }
            document.getElementById('vista-cupones').innerHTML = html;
          }
        </script>
      </body>
      </html>
    `);
    w.document.close();
    w.focus();
  };

  const montoNum = Number(form.monto_compra);
  const boletosEstimados =
    form.monto_compra !== '' && Number.isFinite(montoNum) && montoNum > 0
      ? Math.floor(montoNum / MONTO_POR_TICKET)
      : 0;

  // Fechas con registros para elegir rápidamente en el PDF
  const fechasDisponibles = [...new Set(lista.map((x) => x.fecha_compra).filter(Boolean))].sort();

  return (
    <>
      <div className="card">
        <h2>🎯 {editId ? 'Editar dinámica' : 'Dinámicas'}</h2>
        <div style={{ marginBottom: 15, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setVerValores(!verValores)}>
            {verValores ? '▲ Ocultar valores de dinámicas' : '🏷️ Crear / administrar diferentes dinámicas'}
          </button>
          <button
            type="button"
            onClick={() => abrirModalCambioCliente()}
            disabled={lista.length === 0}
            style={{
              background: '#8b5cf6',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: lista.length === 0 ? 'not-allowed' : 'pointer',
              opacity: lista.length === 0 ? 0.6 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.35)'
            }}
            title="Elegir un número de ticket para cambiar o reasignar de cliente"
          >
            🔄 Cambiar Cliente por N° de Ticket
          </button>
          <button
            type="button"
            onClick={() => setVerRuleta(true)}
            disabled={lista.length === 0}
            style={{
              background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #3b82f6 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: lista.length === 0 ? 'not-allowed' : 'pointer',
              opacity: lista.length === 0 ? 0.6 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.35)'
            }}
            title="Generar ruleta de colores con todos los números registrados en la dinámica seleccionada"
          >
            🎡 Círculo de Colores
          </button>
        </div>
        {faltaTabla ? (
          <p className="error">Falta crear la tabla dinamicas en Supabase. Ejecuta el archivo auth-supabase/DINAMICAS.sql en el SQL Editor.</p>
        ) : (
          <form className="grid2" onSubmit={guardar}>
            <div className="full" style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                    🎯 Valor Dinámica
                  </label>
                  <select name="dinamica_nombre" value={form.dinamica_nombre} onChange={elegirDinamica} required>
                    <option value="">{valores.length === 0 ? 'Primero crea una dinámica' : '-- Selecciona una dinámica (se mantiene para varios compradores) --'}</option>
                    {valores.map((v) => (
                      <option key={v.id} value={v.nombre}>
                        {v.nombre} — Bs {Number(v.valor).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                    📅 Fecha de Compra
                  </label>
                  <input name="fecha_compra" type="date" value={form.fecha_compra} onChange={cambiar} required />
                </div>
              </div>
              {form.dinamica_nombre && form.valor_dinamica != null && form.valor_dinamica !== '' ? (
                <small className="hint" style={{ marginTop: 6, color: '#15803d', fontWeight: 600 }}>
                  ✓ Dinámica activa: <strong>{form.dinamica_nombre}</strong> (Bs {Number(form.valor_dinamica).toFixed(2)} por boleto) · Fecha fija: <strong>{form.fecha_compra || hoy()}</strong>. Se mantienen para registrar compradores consecutivos.
                </small>
              ) : (
                <small className="hint" style={{ marginTop: 6 }}>
                  💡 Selecciona la dinámica y la fecha una sola vez. Se mantendrán activas para registrar a todos los compradores.
                </small>
              )}
            </div>

            <div>
              <label>Celular Cliente</label>
              <input
                name="celular_cliente"
                value={form.celular_cliente}
                onChange={(e) => cambiarCelular(e.target.value)}
                onBlur={alSalirCelular}
                placeholder="Ej: 77712345"
                required
              />
              {clienteHint && (
                <small
                  className="hint"
                  style={{
                    color: clienteHint.startsWith('✓') ? '#15803d' : '#64748b',
                    fontWeight: clienteHint.startsWith('✓') ? 600 : 400,
                    marginTop: 4,
                    display: 'block'
                  }}
                >
                  {clienteHint}
                </small>
              )}
              {clienteInfo && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: clienteInfo.existente ? '1px solid #86efac' : '1px solid #cbd5e1',
                    background: clienteInfo.existente ? '#ecfdf5' : '#f8fafc'
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: clienteInfo.existente ? '#166534' : '#475569', marginBottom: 4 }}>
                    {clienteInfo.existente ? '✅ CLIENTE REGISTRADO' : '🆕 CLIENTE NUEVO (se registrará al guardar)'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>👤 {clienteInfo.nombre || form.nombre_completo || '—'}</div>
                  <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700 }}>📱 {clienteInfo.celular || form.celular_cliente}</div>
                  {clienteInfo.ciudad ? <div style={{ fontSize: 12, color: '#64748b' }}>📍 {clienteInfo.ciudad}</div> : null}
                </div>
              )}
            </div>
            <div>
              <label>Nombre Completo</label>
              <input name="nombre_completo" value={form.nombre_completo} onChange={cambiar} required />
            </div>
            <div>
              <label>Monto Compra</label>
              <input name="monto_compra" type="number" step="0.01" min="0" value={form.monto_compra} onChange={cambiar} required />
              <small className="hint" style={{ display: 'block', marginTop: 4 }}>
                {form.monto_compra === ''
                  ? `Cada Bs ${MONTO_POR_TICKET} de compra genera 1 número de ticket.`
                  : boletosEstimados > 0
                    ? `🟢 Bs ${montoNum.toFixed(2)} → ${boletosEstimados} número${boletosEstimados > 1 ? 's' : ''} de ticket.`
                    : `⚠️ Monto mínimo: Bs ${MONTO_POR_TICKET.toFixed(2)} para generar 1 ticket.`}
              </small>
            </div>
            <div>
              <label>N° Ticket</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input name="n_ticket" value={form.n_ticket} onChange={cambiar} style={{ flex: 1 }} />
                <button type="button" onClick={generarNumero} style={{ whiteSpace: 'nowrap' }}>Generar Numero</button>
              </div>
              <small className="hint" style={{ display: 'block', marginTop: 4 }}>
                Calcula automáticamente los números consecutivos según el monto de compra.
              </small>
            </div>
            <div>
              <label>Ticket Entregado</label>
              <select name="ticket_entregado" value={form.ticket_entregado || 'Pendiente'} onChange={cambiar}>
                <option value="Pendiente">⏳ Pendiente</option>
                <option value="Entregado">✅ Entregado</option>
              </select>
            </div>
            <div className="full">
              <button className={editId ? 'btn-blue' : 'btn-primary'}>{editId ? 'Actualizar dinámica' : 'Guardar dinámica'}</button>{' '}
              {editId && <button type="button" onClick={cancelar}>Cancelar</button>}
            </div>
          </form>
        )}
      </div>

      {verValores && (
        <ValoresDinamica avisar={avisar} onCambio={cargarValores} />
      )}

      {!faltaTabla && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            <div>
              <h2 style={{ margin: 0 }}>📋 Dinámicas registradas ({lista.length})</h2>
              <small style={{ color: '#64748b', fontSize: '12px' }}>
                Los reportes solo muestran boletos con estado <strong>Pendiente</strong>. Los entregados no se imprimen.
              </small>
            </div>
            <div className="actions" style={{ margin: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-entregar"
                onClick={exportarSorteoExcel}
                disabled={generandoExcel || lista.length === 0}
                title="Descargar Excel con boletos en estado Pendiente"
              >
                {generandoExcel ? 'Generando Excel...' : '📥 Boletos Excel (Solo Pendientes)'}
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => setVerFiltroPdf((v) => !v)}
                disabled={lista.length === 0}
                title="Elegir fechas e imprimir boletos para recortar (solo boletos en estado Pendiente)"
              >
                📄 Boletos PDF por fechas
              </button>
              <button
                type="button"
                onClick={() => setVerRuleta(true)}
                disabled={lista.length === 0}
                style={{
                  background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #3b82f6 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '7px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: lista.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: lista.length === 0 ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.35)'
                }}
                title="Generar ruleta de colores con todos los números registrados en la dinámica seleccionada"
              >
                🎡 Círculo de Colores
              </button>
            </div>
          </div>

          {verFiltroPdf && (
            <div style={{
              background: '#eef2ff',
              border: '1px solid #c7d2fe',
              borderRadius: 8,
              padding: '14px 16px',
              margin: '0 0 14px'
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a', marginBottom: 10 }}>
                📅 Elegir fechas para generar los boletos PDF
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>Desde</label>
                  <input
                    type="date"
                    value={pdfDesde}
                    onChange={(e) => setPdfDesde(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>Hasta</label>
                  <input
                    type="date"
                    value={pdfHasta}
                    onChange={(e) => setPdfHasta(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setVerFiltroPdf(false);
                      exportarSorteoPDF({ desde: pdfDesde, hasta: pdfHasta });
                    }}
                  >
                    🖨️ Generar PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPdfDesde(''); setPdfHasta(''); }}
                    title="Quitar el filtro y usar todas las fechas"
                  >
                    Todas
                  </button>
                  <button type="button" onClick={() => setVerFiltroPdf(false)}>Cancelar</button>
                </div>
              </div>

              {fechasDisponibles.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Fechas con registros:</span>
                  {fechasDisponibles.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => { setPdfDesde(f); setPdfHasta(f); }}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 14,
                        border: '1px solid',
                        borderColor: pdfDesde === f && pdfHasta === f ? '#1d4ed8' : '#c7d2fe',
                        background: pdfDesde === f && pdfHasta === f ? '#1d4ed8' : '#ffffff',
                        color: pdfDesde === f && pdfHasta === f ? '#ffffff' : '#1e40af',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}

              <small className="hint" style={{ display: 'block', marginTop: 8 }}>
                💡 Elige un solo día con los botones de fecha o un rango con “Desde” y “Hasta”. Si no eliges fechas, se generan todos los boletos pendientes.
              </small>
            </div>
          )}

          {/* BUSCADORES: POR N° TICKET O POR CELULAR (HISTORIAL POR FECHAS) */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '14px 16px',
            margin: '12px 0 16px'
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setModoBusqueda('ticket')}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  background: modoBusqueda === 'ticket' ? '#1e293b' : '#e2e8f0',
                  color: modoBusqueda === 'ticket' ? '#ffffff' : '#475569'
                }}
              >
                🎟️ Buscar por N° de Ticket
              </button>
              <button
                type="button"
                onClick={() => setModoBusqueda('celular')}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  background: modoBusqueda === 'celular' ? '#1e293b' : '#e2e8f0',
                  color: modoBusqueda === 'celular' ? '#ffffff' : '#475569'
                }}
              >
                📱 Buscar por Celular (Historial por fechas)
              </button>
              <button
                type="button"
                onClick={() => setVerEnvioTickets((v) => !v)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  background: verEnvioTickets ? '#16a34a' : '#e2e8f0',
                  color: verEnvioTickets ? '#ffffff' : '#475569'
                }}
              >
                📤 Enviar Tickets
              </button>
            </div>

            {modoBusqueda === 'ticket' ? (
              <div>
                <label style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span>🎟️</span> Buscador por Número de Ticket
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="search"
                    placeholder="Ingresa el N° de ticket (ej: 1, 45, 100)..."
                    value={busquedaTicket}
                    onChange={(e) => setBusquedaTicket(e.target.value)}
                    style={{ flex: 1, fontSize: '15px' }}
                  />
                  {busquedaTicket && (
                    <button
                      type="button"
                      onClick={() => setBusquedaTicket('')}
                      style={{ whiteSpace: 'nowrap', padding: '8px 14px' }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <small className="hint" style={{ marginTop: 4, display: 'block' }}>
                  Escribe el número de ticket para ver de inmediato el nombre, celular y estado de entrega del comprador.
                </small>

                {/* RESULTADO POR TICKET */}
                {busquedaTicket.trim() && (
                  coincidenciasTicket.length > 0 ? (
                    <div style={{
                      background: '#ecfdf5',
                      border: '2px solid #10b981',
                      borderRadius: 8,
                      padding: 14,
                      marginTop: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>🎟️</span> Ticket #{busquedaTicket.trim()} encontrado ({coincidenciasTicket.length} coincidencia{coincidenciasTicket.length > 1 ? 's' : ''})
                        </div>
                        <span style={{ fontSize: 12, background: '#a7f3d0', color: '#065f46', padding: '3px 10px', borderRadius: 12, fontWeight: 700 }}>
                          ✓ CLIENTE ENCONTRADO
                        </span>
                      </div>

                      <div style={{ display: 'grid', gap: 10 }}>
                        {coincidenciasTicket.map((c) => (
                          <div key={c.id} style={{
                            background: '#ffffff',
                            border: '1px solid #86efac',
                            borderRadius: 6,
                            padding: 12,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                            gap: 12,
                            alignItems: 'center'
                          }}>
                            <div>
                              <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 700 }}>👤 NOMBRE DEL CLIENTE</div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginTop: 2 }}>
                                {c.nombre_completo}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 700 }}>📱 CELULAR</div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <a href={`tel:${c.celular_cliente}`} style={{ color: '#1d4ed8', textDecoration: 'none' }}>
                                  {c.celular_cliente}
                                </a>
                                <a
                                  href={`https://wa.me/${String(c.celular_cliente).replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ fontSize: 11, background: '#22c55e', color: '#fff', padding: '3px 8px', borderRadius: 4, textDecoration: 'none', fontWeight: 700 }}
                                >
                                  WhatsApp
                                </a>
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 700 }}>🎯 DINÁMICA</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginTop: 2 }}>
                                {c.dinamica_nombre || '—'}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 700 }}>🎟️ TICKETS</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#047857', marginTop: 2 }}>
                                {c.n_ticket || '—'}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 700 }}>📦 TICKET ENTREGADO</div>
                              <div style={{ marginTop: 2 }}>
                                <button
                                  type="button"
                                  onClick={() => cambiarEstadoTicket(c)}
                                  title="Haz clic para alternar entre Pendiente y Entregado"
                                  style={{
                                    cursor: 'pointer',
                                    padding: '4px 10px',
                                    borderRadius: 14,
                                    border: '1px solid',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: (c.ticket_entregado || 'Pendiente') === 'Entregado' ? '#dcfce7' : '#fef3c7',
                                    borderColor: (c.ticket_entregado || 'Pendiente') === 'Entregado' ? '#16a34a' : '#f59e0b',
                                    color: (c.ticket_entregado || 'Pendiente') === 'Entregado' ? '#15803d' : '#b45309'
                                  }}
                                >
                                  {(c.ticket_entregado || 'Pendiente') === 'Entregado' ? '✅ Entregado' : '⏳ Pendiente'}
                                </button>
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 700 }}>👤 REASIGNAR</div>
                              <div style={{ marginTop: 2 }}>
                                <button
                                  type="button"
                                  onClick={() => abrirModalCambioCliente(busquedaTicket.trim(), c)}
                                  className="btn-lila"
                                  style={{ padding: '4px 10px', fontSize: 12, minHeight: 'auto', borderRadius: 14 }}
                                  title="Cambiar el cliente dueño de este ticket"
                                >
                                  🔄 Cambiar Cliente
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      background: '#fef2f2',
                      border: '1px solid #f87171',
                      borderRadius: 8,
                      padding: 12,
                      marginTop: 12,
                      color: '#991b1b',
                      fontSize: 14
                    }}>
                      ❌ No se encontró ningún cliente con el ticket <strong>#{busquedaTicket.trim()}</strong>.
                    </div>
                  )
                )}
              </div>
            ) : (
              <div>
                <label style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span>📱</span> Buscador por Celular (Historial de tickets por fechas)
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="search"
                    placeholder="Ingresa el celular del cliente (ej: 77712345)..."
                    value={busquedaCelular}
                    onChange={(e) => setBusquedaCelular(e.target.value)}
                    style={{ flex: 1, fontSize: '15px' }}
                  />
                  {busquedaCelular && (
                    <button
                      type="button"
                      onClick={() => setBusquedaCelular('')}
                      style={{ whiteSpace: 'nowrap', padding: '8px 14px' }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <small className="hint" style={{ marginTop: 4, display: 'block' }}>
                  Escribe el celular del cliente para ver todos los tickets que tiene acumulados organizados por fecha.
                </small>

                {/* RESULTADO HISTORIAL POR CELULAR */}
                {busquedaCelular.trim() && (
                  coincidenciasCelular.length > 0 ? (
                    <div style={{
                      background: '#eff6ff',
                      border: '2px solid #3b82f6',
                      borderRadius: 8,
                      padding: 14,
                      marginTop: 12
                    }}>
                      {/* CABECERA RESUMEN CLIENTE */}
                      {(() => {
                        const primer = coincidenciasCelular[0];
                        const totalTickets = desglosarTickets(coincidenciasCelular);
                        const pendientesCount = totalTickets.filter((t) => (t.ticket_entregado || 'Pendiente') !== 'Entregado').length;
                        const entregadosCount = totalTickets.filter((t) => (t.ticket_entregado || 'Pendiente') === 'Entregado').length;
                        const totalMonto = coincidenciasCelular.reduce((acc, c) => acc + (Number(c.monto_compra) || 0), 0);

                        return (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12, borderBottom: '1px solid #bfdbfe', paddingBottom: 10 }}>
                              <div>
                                <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700 }}>CLIENTE ENCONTRADO</div>
                                <div style={{ fontSize: 19, fontWeight: 900, color: '#0f172a' }}>
                                  👤 {primer.nombre_completo}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                                  <a href={`tel:${primer.celular_cliente}`} style={{ fontSize: 15, fontWeight: 800, color: '#1d4ed8', textDecoration: 'none' }}>
                                    📱 {primer.celular_cliente}
                                  </a>
                                  <a
                                    href={`https://wa.me/${String(primer.celular_cliente).replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 11, background: '#22c55e', color: '#fff', padding: '3px 8px', borderRadius: 4, textDecoration: 'none', fontWeight: 700 }}
                                  >
                                    WhatsApp
                                  </a>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ background: '#ffffff', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: 6, textAlign: 'center' }}>
                                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>TOTAL TICKETS</div>
                                  <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{totalTickets.length}</div>
                                </div>
                                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: 6, textAlign: 'center' }}>
                                  <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700 }}>PENDIENTES</div>
                                  <div style={{ fontSize: 18, fontWeight: 900, color: '#b45309' }}>{pendientesCount}</div>
                                </div>
                                <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: 6, textAlign: 'center' }}>
                                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>ENTREGADOS</div>
                                  <div style={{ fontSize: 18, fontWeight: 900, color: '#15803d' }}>{entregadosCount}</div>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: 6, textAlign: 'center' }}>
                                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>TOTAL COMPRADO</div>
                                  <div style={{ fontSize: 18, fontWeight: 900, color: '#047857' }}>Bs {totalMonto.toFixed(2)}</div>
                                </div>
                              </div>
                            </div>

                            {/* LISTADO ORGANIZADO POR FECHAS */}
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e3a8a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>📅</span> Historial de Tickets agrupado por Fechas ({comprasPorFecha.length} fecha{comprasPorFecha.length > 1 ? 's' : ''}):
                              </div>

                              <div style={{ display: 'grid', gap: 10 }}>
                                {comprasPorFecha.map((gf) => (
                                  <div key={gf.fecha} style={{
                                    background: '#ffffff',
                                    border: '1px solid #93c5fd',
                                    borderRadius: 8,
                                    padding: 12,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                  }}>
                                    <div style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      gap: 6,
                                      borderBottom: '1px dashed #cbd5e1',
                                      paddingBottom: 6,
                                      marginBottom: 8
                                    }}>
                                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: 4, fontSize: 12 }}>
                                          📅 {gf.fecha || 'Sin fecha'}
                                        </span>
                                        <span>· {gf.tickets.length} ticket{gf.tickets.length > 1 ? 's' : ''} en este día</span>
                                      </div>
                                      <div style={{ fontSize: 13, fontWeight: 700, color: '#047857' }}>
                                        Subtotal: Bs {gf.totalMonto.toFixed(2)}
                                      </div>
                                    </div>

                                    <div style={{ display: 'grid', gap: 8 }}>
                                      {gf.items.map((it) => {
                                        const ticketsDelItem = desglosarTickets([it]);
                                        const esEntregado = (it.ticket_entregado || 'Pendiente') === 'Entregado';

                                        return (
                                          <div key={it.id} style={{
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 6,
                                            padding: '8px 10px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: 8
                                          }}>
                                            <div>
                                              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                                                {it.dinamica_nombre || 'Dinámica'} · Compra: Bs {Number(it.monto_compra || 0).toFixed(2)}
                                              </div>
                                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginRight: 4 }}>
                                                  Boletos:
                                                </span>
                                                {ticketsDelItem.map((t) => (
                                                  <span
                                                    key={t.numero}
                                                    style={{
                                                      background: esEntregado ? '#dcfce7' : '#fee2e2',
                                                      color: esEntregado ? '#166534' : '#991b1b',
                                                      fontWeight: 800,
                                                      fontSize: 12,
                                                      padding: '2px 7px',
                                                      borderRadius: 4,
                                                      border: `1px solid ${esEntregado ? '#86efac' : '#fca5a5'}`
                                                    }}
                                                  >
                                                    #{t.numeroTexto}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                              <button
                                                type="button"
                                                onClick={() => cambiarEstadoTicket(it)}
                                                title="Haz clic para alternar entre Pendiente y Entregado"
                                                style={{
                                                  cursor: 'pointer',
                                                  padding: '5px 12px',
                                                  borderRadius: 14,
                                                  border: '1px solid',
                                                  fontSize: 12,
                                                  fontWeight: 700,
                                                  background: esEntregado ? '#dcfce7' : '#fef3c7',
                                                  borderColor: esEntregado ? '#16a34a' : '#f59e0b',
                                                  color: esEntregado ? '#15803d' : '#b45309'
                                                }}
                                              >
                                                {esEntregado ? '✅ Entregado' : '⏳ Pendiente'}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{
                      background: '#fef2f2',
                      border: '1px solid #f87171',
                      borderRadius: 8,
                      padding: 12,
                      marginTop: 12,
                      color: '#991b1b',
                      fontSize: 14
                    }}>
                      ❌ No se encontró ningún cliente registrado con el celular <strong>{busquedaCelular.trim()}</strong>.
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* LISTADO DE CLIENTES CON TICKETS PARA ENVIAR SUS NÚMEROS */}
          {verEnvioTickets && (
            <div style={{
              background: '#f0fdf4',
              border: '2px solid #86efac',
              borderRadius: 8,
              padding: '14px 16px',
              margin: '0 0 18px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                    📤 Enviar Tickets a Clientes
                  </div>
                  <small style={{ color: '#166534', display: 'block', marginTop: 2 }}>
                    Clientes con tickets registrados. Si un cliente tiene tickets en varias fechas, se muestran todos juntos en una sola fila.
                  </small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 12, fontWeight: 700 }}>
                    {clientesConTickets.length} cliente{clientesConTickets.length === 1 ? '' : 's'} con tickets
                  </span>
                  <button type="button" onClick={() => setVerEnvioTickets(false)} style={{ padding: '5px 12px', fontSize: 13 }}>
                    ✕ Cerrar
                  </button>
                </div>
              </div>

              {clientesConTickets.length === 0 ? (
                <p className="empty" style={{ margin: 0 }}>No hay clientes con tickets registrados.</p>
              ) : (
                <div className="tabla">
                  <table>
                    <thead>
                      <tr>
                        <th>Nombre Cliente</th>
                        <th>Celular</th>
                        <th>N° Ticket</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientesConTickets.map((g) => {
                        const enviado = enviadosTickets.has(g.clave);
                        const ticketsPorFecha = g.tickets.reduce((acc, t) => {
                          const f = t.fecha || 'Sin fecha';
                          if (!acc[f]) acc[f] = [];
                          acc[f].push(t);
                          return acc;
                        }, {});

                        return (
                          <tr
                            key={g.clave}
                            style={{
                              background: enviado ? '#bbf7d0' : '#ffffff',
                              transition: 'background 0.25s ease'
                            }}
                          >
                            <td data-label="Nombre Cliente">
                              <strong style={{ color: '#0f172a' }}>{g.nombre || '—'}</strong>
                              {enviado && (
                                <span style={{ display: 'block', fontSize: 11, color: '#166534', fontWeight: 700, marginTop: 2 }}>
                                  ✅ Mensaje enviado
                                </span>
                              )}
                            </td>
                            <td data-label="Celular">
                              <span style={{ color: '#1d4ed8', fontWeight: 700 }}>{g.celular || '—'}</span>
                            </td>
                            <td data-label="N° Ticket">
                              <div style={{ display: 'grid', gap: 4 }}>
                                {Object.entries(ticketsPorFecha)
                                  .sort((a, b) => b[0].localeCompare(a[0]))
                                  .map(([fecha, tks]) => (
                                    <div key={fecha} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 11, color: '#475569', fontWeight: 700, minWidth: 74 }}>
                                        📅 {fecha}
                                      </span>
                                      {tks.map((t) => (
                                        <span
                                          key={`${g.clave}-${fecha}-${t.numero}-${t.numeroTexto}`}
                                          style={{
                                            background: enviado ? '#dcfce7' : '#eff6ff',
                                            color: enviado ? '#166534' : '#1e40af',
                                            fontWeight: 800,
                                            fontSize: 12,
                                            padding: '2px 7px',
                                            borderRadius: 4,
                                            border: `1px solid ${enviado ? '#86efac' : '#bfdbfe'}`
                                          }}
                                        >
                                          #{t.numeroTexto}
                                        </span>
                                      ))}
                                    </div>
                                  ))}
                              </div>
                            </td>
                            <td data-label="Acciones" className="actions">
                              <button
                                type="button"
                                onClick={() => enviarNumerosClienteTickets(g)}
                                title="Enviar por WhatsApp todos los números de ticket de este cliente"
                                style={{
                                  padding: '6px 12px',
                                  fontSize: 12,
                                  background: enviado ? '#15803d' : '#22c55e',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: 6,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {enviado ? '✅ Reenviar Numeros' : '📲 Enviar Numeros'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {visibles.length === 0 ? (
            <p className="empty">
              {tieneFiltroTicket || tieneFiltroCelular
                ? 'No hay dinámicas que coincidan con la búsqueda.'
                : 'Aún no hay dinámicas registradas.'}
            </p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr>
                    <th>Celular Cliente</th>
                    <th>Nombre Completo</th>
                    <th>Monto Compra</th>
                    <th>N° Ticket</th>
                    <th>Fecha de Compra</th>
                    <th>Valor Dinámica</th>
                    <th>Ticket Entregado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginados.map((x) => (
                    <tr key={x.id}>
                      <td data-label="Celular Cliente">{x.celular_cliente}</td>
                      <td data-label="Nombre Completo">{x.nombre_completo}</td>
                      <td data-label="Monto Compra">{x.monto_compra != null ? 'Bs ' + Number(x.monto_compra).toFixed(2) : '—'}</td>
                      <td data-label="N° Ticket">{x.n_ticket || '—'}</td>
                      <td data-label="Fecha de Compra">{x.fecha_compra || '—'}</td>
                      <td data-label="Valor Dinámica">
                        {x.valor_dinamica != null
                          ? (x.dinamica_nombre ? x.dinamica_nombre + ' — ' : '') + 'Bs ' + Number(x.valor_dinamica).toFixed(2)
                          : (x.dinamica_nombre || '—')}
                      </td>
                      <td data-label="Ticket Entregado">
                        <button
                          type="button"
                          onClick={() => cambiarEstadoTicket(x)}
                          title="Haz clic para alternar entre Pendiente y Entregado"
                          style={{
                            cursor: 'pointer',
                            padding: '4px 10px',
                            borderRadius: '16px',
                            border: '1px solid',
                            fontSize: '12px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: (x.ticket_entregado || 'Pendiente') === 'Entregado' ? '#dcfce7' : '#fef3c7',
                            borderColor: (x.ticket_entregado || 'Pendiente') === 'Entregado' ? '#16a34a' : '#f59e0b',
                            color: (x.ticket_entregado || 'Pendiente') === 'Entregado' ? '#15803d' : '#b45309'
                          }}
                        >
                          {(x.ticket_entregado || 'Pendiente') === 'Entregado' ? '✅ Entregado' : '⏳ Pendiente'}
                        </button>
                      </td>
                      <td data-label="Acciones" className="actions">
                        <button
                          className="btn-lila"
                          onClick={() => abrirModalCambioCliente(null, x)}
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          title="Cambiar de cliente para los tickets de este registro"
                        >
                          🔄 Cambiar Cliente
                        </button>
                        <button className="btn-edit" onClick={() => editar(x)}>Editar</button>
                        <button className="btn-del" onClick={() => eliminar(x)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion total={visibles.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
        </div>
      )}

      {verRuleta && (
        <CirculoColores
          onCerrar={() => setVerRuleta(false)}
          dinamicaInicial={form.dinamica_nombre || dinamicaSel}
          listaDinamicas={lista}
          valoresDinamicas={valores}
          desglosarTickets={desglosarTickets}
          onCambiarEstadoTicket={cambiarEstadoTicket}
        />
      )}

      {modalCambioCliente && (
        <div className="modal-fondo" onClick={cerrarModalCambioCliente}>
          <div className="modal-entrega" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="modal-entrega-cabecera">
              <div>
                <h2>🔄 Cambiar Cliente por N° de Ticket</h2>
                <p className="sub">Transfiere o reasigna un número de ticket a un cliente diferente.</p>
              </div>
              <button
                type="button"
                className="modal-entrega-cerrar"
                onClick={cerrarModalCambioCliente}
                title="Cerrar ventana"
              >
                ✕
              </button>
            </div>

            <div className="modal-entrega-cuerpo">
              <form onSubmit={ejecutarCambioCliente}>
                {/* PASO 1: ELEGIR TICKET */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', marginBottom: 4, display: 'block' }}>
                    🎟️ N° de Ticket a transferir
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      min="1"
                      placeholder="Ej: 5, 23, 100..."
                      value={ticketACambiar}
                      onChange={(e) => alCambiarTicketInput(e.target.value)}
                      style={{ flex: 1, fontSize: 15 }}
                      required
                      autoFocus
                    />
                    {ticketACambiar && (
                      <button
                        type="button"
                        className="btn-secundario"
                        onClick={() => alCambiarTicketInput('')}
                        style={{ padding: '0 12px', fontSize: 13 }}
                      >
                        ✕ Limpiar
                      </button>
                    )}
                  </div>

                  {/* SELECT RÁPIDO DE TODOS LOS TICKETS REGISTRADOS */}
                  <div style={{ marginTop: 8 }}>
                    <select
                      value={ticketACambiar}
                      onChange={(e) => alCambiarTicketInput(e.target.value)}
                      style={{ fontSize: 13 }}
                    >
                      <option value="">-- O selecciona de la lista de tickets registrados ({desglosarTickets(lista).length}) --</option>
                      {desglosarTickets(lista).map((t) => (
                        <option key={`${t.id}-${t.numero}`} value={t.numero}>
                          Ticket #{t.numero} — {t.cliente} ({t.dinamica || 'Sin dinámica'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* INFO DEL TICKET ENCONTRADO O ERROR */}
                {ticketACambiar && (
                  registroCambioCliente ? (
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 16
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 4 }}>
                          ✓ Ticket #{ticketACambiar} Encontrado
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          🎯 {registroCambioCliente.dinamica_nombre || 'Dinámica'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, fontSize: 13 }}>
                        <div>
                          <small style={{ color: '#64748b', fontSize: 11, display: 'block', fontWeight: 700 }}>CLIENTE ACTUAL</small>
                          <strong style={{ color: '#0f172a' }}>👤 {registroCambioCliente.nombre_completo}</strong>
                        </div>
                        <div>
                          <small style={{ color: '#64748b', fontSize: 11, display: 'block', fontWeight: 700 }}>CELULAR</small>
                          <strong style={{ color: '#1d4ed8' }}>📱 {registroCambioCliente.celular_cliente}</strong>
                        </div>
                        <div>
                          <small style={{ color: '#64748b', fontSize: 11, display: 'block', fontWeight: 700 }}>TICKETS DEL REGISTRO</small>
                          <strong style={{ color: '#047857' }}>🎟️ {registroCambioCliente.n_ticket || `#${ticketACambiar}`}</strong>
                        </div>
                        <div>
                          <small style={{ color: '#64748b', fontSize: 11, display: 'block', fontWeight: 700 }}>MONTO / FECHA</small>
                          <span>Bs {Number(registroCambioCliente.monto_compra || 0).toFixed(2)} · {registroCambioCliente.fecha_compra || '—'}</span>
                        </div>
                      </div>

                      {extraerNumerosDeRegistro(registroCambioCliente).length > 1 && (
                        <div style={{
                          marginTop: 10,
                          padding: '10px 12px',
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          borderRadius: 8
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 6 }}>
                            ⚠️ Este registro incluye varios tickets: <strong>{registroCambioCliente.n_ticket}</strong>.
                          </div>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>
                            <input
                              type="radio"
                              name="modoDivision"
                              value="solo_este"
                              checked={modoDivision === 'solo_este'}
                              onChange={() => setModoDivision('solo_este')}
                              style={{ marginTop: 2 }}
                            />
                            <span>
                              <strong>Transferir solo el ticket #{ticketACambiar}</strong>
                              <small style={{ display: 'block', color: '#64748b' }}>
                                Se separa este boleto para el nuevo cliente. Los demás tickets se quedan con {registroCambioCliente.nombre_completo}.
                              </small>
                            </span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="modoDivision"
                              value="todo_el_registro"
                              checked={modoDivision === 'todo_el_registro'}
                              onChange={() => setModoDivision('todo_el_registro')}
                              style={{ marginTop: 2 }}
                            />
                            <span>
                              <strong>Transferir TODOS los tickets ({registroCambioCliente.n_ticket})</strong>
                              <small style={{ display: 'block', color: '#64748b' }}>
                                Transfiere la compra completa al nuevo cliente.
                              </small>
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      background: '#fef2f2',
                      border: '1px solid #fca5a5',
                      borderRadius: 8,
                      padding: 10,
                      color: '#991b1b',
                      fontSize: 13,
                      marginBottom: 16
                    }}>
                      ❌ No se encontró ningún cliente registrado con el ticket <strong>#{ticketACambiar}</strong>.
                    </div>
                  )
                )}

                {/* PASO 2: DATOS DEL NUEVO CLIENTE */}
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 16
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#166534', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>👥</span> Datos del Nuevo Cliente
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 4, display: 'block' }}>
                      Elegir de clientes registrados (opcional):
                    </label>
                    <select
                      value={nuevoClienteId}
                      onChange={(e) => {
                        const idSel = e.target.value;
                        setNuevoClienteId(idSel);
                        const c = clientes.find((x) => String(x.id) === String(idSel));
                        if (c) {
                          setNuevoClienteNombre(nombreDesdeCliente(c));
                          setNuevoClienteCelular(c.celular || '');
                        }
                      }}
                      style={{ fontSize: 13 }}
                    >
                      <option value="">-- Seleccionar cliente existente o escribir abajo --</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {nombreDesdeCliente(c)} {c.celular ? `(📱 ${c.celular})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 4, display: 'block' }}>
                        📱 Celular del Nuevo Cliente *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: 77712345"
                        value={nuevoClienteCelular}
                        onChange={(e) => {
                          const v = e.target.value;
                          setNuevoClienteCelular(v);
                          const celClean = soloDigitos(v);
                          if (celClean) {
                            const c = clientes.find((x) => soloDigitos(x.celular) === celClean);
                            if (c) {
                              setNuevoClienteNombre(nombreDesdeCliente(c));
                              setNuevoClienteId(String(c.id));
                            }
                          }
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 4, display: 'block' }}>
                        👤 Nombre Completo del Nuevo Cliente *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: María Flores"
                        value={nuevoClienteNombre}
                        onChange={(e) => setNuevoClienteNombre(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* BOTONES DE ACCIÓN */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={cerrarModalCambioCliente}
                    disabled={guardandoCambioCliente}
                  >
                    ✕ Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={guardandoCambioCliente || !ticketACambiar || !registroCambioCliente || !nuevoClienteNombre.trim() || !nuevoClienteCelular.trim()}
                    style={{ minWidth: 160 }}
                  >
                    {guardandoCambioCliente ? 'Guardando...' : '💾 Confirmar Cambio'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
