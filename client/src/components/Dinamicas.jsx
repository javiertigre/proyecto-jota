import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { generarExcel } from '../excel.js';
import Paginacion from './Paginacion.jsx';
import ValoresDinamica from './ValoresDinamica.jsx';

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
  numero_hasta: ''
};

export default function Dinamicas({ avisar }) {
  const [lista, setLista] = useState([]);
  const [valores, setValores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteHint, setClienteHint] = useState('');
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
  const [busquedaTicket, setBusquedaTicket] = useState('');
  const [pagina, setPagina] = useState(1);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const POR_PAGINA = 10;

  const cargar = async () => {
    try {
      const r = await api.get('/api/dinamicas');
      setLista(r.dinamicas);
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
          try { localStorage.setItem('dinamica_activa', unica.nombre); } catch {}
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
  }, []);
  useEffect(() => { setPagina(1); }, [lista, busquedaTicket]);

  const parsearNombreParaCliente = (nombreCompleto) => {
    const limpio = String(nombreCompleto || '').trim();
    const partes = limpio.split(/\s+/).filter(Boolean);
    if (partes.length === 0) {
      return { nombre: 'Cliente', apellido_paterno: '—', apellido_materno: null };
    }
    if (partes.length === 1) {
      return { nombre: partes[0], apellido_paterno: '—', apellido_materno: null };
    }
    if (partes.length === 2) {
      return { nombre: partes[0], apellido_paterno: partes[1], apellido_materno: null };
    }
    if (partes.length === 3) {
      return { nombre: partes[0] + ' ' + partes[1], apellido_paterno: partes[2], apellido_materno: null };
    }
    const apellido_materno = partes[partes.length - 1];
    const apellido_paterno = partes[partes.length - 2];
    const nombre = partes.slice(0, partes.length - 2).join(' ');
    return { nombre, apellido_paterno, apellido_materno };
  };

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const cambiarCelular = (valor) => {
    const celLimpio = valor.trim();
    setForm((prev) => {
      if (!celLimpio) {
        setClienteHint('');
        return { ...prev, celular_cliente: valor };
      }

      // 1. Buscar en Clientes registrados
      const c = clientes.find((x) => String(x.celular || '').trim() === celLimpio);
      if (c) {
        const nombreCompleto = [c.nombre, c.apellido_paterno, c.apellido_materno]
          .filter(Boolean)
          .filter((t) => t !== '—')
          .join(' ');
        setClienteHint('✓ Cliente existente: ' + nombreCompleto);
        return {
          ...prev,
          celular_cliente: valor,
          nombre_completo: nombreCompleto
        };
      }

      // 2. Buscar en dinámicas previas
      const d = lista.find((x) => String(x.celular_cliente || '').trim() === celLimpio);
      if (d && d.nombre_completo) {
        setClienteHint('✓ Cliente de dinámicas: ' + d.nombre_completo);
        return {
          ...prev,
          celular_cliente: valor,
          nombre_completo: d.nombre_completo
        };
      }

      setClienteHint('Celular nuevo (se registrará en Clientes al guardar).');
      return { ...prev, celular_cliente: valor };
    });
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
      } catch {}
    }

    setForm((prev) => ({
      ...prev,
      dinamica_nombre: nombre,
      valor_dinamica: valor
    }));
  };

  const generarNumero = async () => {
    const dinamica = String(form.dinamica_nombre || '').trim();
    const monto = Number(form.monto_compra);
    const valor = Number(form.valor_dinamica);
    if (!dinamica) {
      avisar('error', 'Primero selecciona una dinámica arriba en Valor Dinámica.');
      return;
    }
    if (!monto || monto <= 0) {
      avisar('error', 'Ingresa un monto de compra válido.');
      return;
    }
    if (!valor || valor <= 0) {
      avisar('error', 'Selecciona una dinámica con valor válido.');
      return;
    }
    const cantidad = Math.round(monto / valor);
    if (cantidad < 1) {
      avisar('error', 'El monto de compra no alcanza para generar un número.');
      return;
    }
    try {
      const r = await api.get(
        '/api/dinamicas/siguiente?dinamica=' + encodeURIComponent(dinamica) + (editId ? '&excluir=' + editId : '')
      );
      const desde = r.siguiente;
      const hasta = desde + cantidad - 1;
      const numeros = [];
      for (let n = desde; n <= hasta; n++) numeros.push(n);
      setForm((prev) => ({ ...prev, n_ticket: numeros.join(', '), numero_desde: desde, numero_hasta: hasta }));
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const cancelar = () => {
    setEditId(null);
    setClienteHint('');
    const activa = valores.find((v) => v.nombre === dinamicaSel);
    setForm({
      ...vacio,
      fecha_compra: hoy(),
      dinamica_nombre: dinamicaSel || '',
      valor_dinamica: activa ? activa.valor : ''
    });
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
      const existeEnClientes = clientes.some((c) => String(c.celular || '').trim() === cel);
      let nuevoClienteRegistrado = false;
      if (!existeEnClientes) {
        try {
          const { nombre, apellido_paterno, apellido_materno } = parsearNombreParaCliente(nom);
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
          console.warn('Registro automático en clientes:', errCli.message);
        }
      }

      if (editId) {
        await api.put('/api/dinamicas/' + editId, form);
        avisar('exito', 'Dinámica actualizada.');
        cancelar();
      } else {
        await api.post('/api/dinamicas', form);
        avisar(
          'exito',
          'Comprador registrado en la dinámica' + (nuevoClienteRegistrado ? ' y agregado a Clientes.' : '.')
        );
        // Mantiene la dinámica seleccionada para registrar a los siguientes compradores
        const dinamicaMantener = form.dinamica_nombre;
        const valorMantener = form.valor_dinamica;
        setClienteHint('');
        setForm({
          ...vacio,
          fecha_compra: hoy(),
          dinamica_nombre: dinamicaMantener,
          valor_dinamica: valorMantener
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
    setForm({
      celular_cliente: x.celular_cliente || '',
      nombre_completo: x.nombre_completo || '',
      monto_compra: x.monto_compra ?? '',
      n_ticket: x.n_ticket || '',
      fecha_compra: x.fecha_compra || '',
      dinamica_nombre: x.dinamica_nombre || '',
      valor_dinamica: x.valor_dinamica ?? '',
      numero_desde: x.numero_desde ?? '',
      numero_hasta: x.numero_hasta ?? ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async (x) => {
    if (!window.confirm('¿Eliminar la dinámica de ' + x.nombre_completo + '?')) return;
    try {
      await api.del('/api/dinamicas/' + x.id);
      avisar('exito', 'Dinámica eliminada.');
      cargar();
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const coincideTicket = (x, q) => {
    if (!q) return true;
    const qClean = q.trim();
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
        // Coincidencia exacta de texto (ej: "005" con "005")
        if (t.toLowerCase() === qClean.toLowerCase()) return true;
        // Coincidencia numérica exacta (ej: 5 con 5, o "005" con 5)
        if (esNum && parseInt(t, 10) === num) return true;
        // Rango dentro del ticket tipo "10-15"
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

  const coincidencias = busquedaTicket.trim()
    ? lista.filter((x) => coincideTicket(x, busquedaTicket))
    : [];

  const visibles = busquedaTicket.trim() ? coincidencias : lista;
  const paginados = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const desglosarTickets = (items) => {
    const res = [];
    (items || []).forEach((x) => {
      const celular = x.celular_cliente || '';
      const cliente = x.nombre_completo || '';
      const dinamica = x.dinamica_nombre || '';
      const fecha = x.fecha_compra || '';

      const tieneRango = x.numero_desde !== null && x.numero_desde !== undefined && x.numero_desde !== '' &&
                         x.numero_hasta !== null && x.numero_hasta !== undefined && x.numero_hasta !== '';

      if (tieneRango) {
        const d = Number(x.numero_desde);
        const h = Number(x.numero_hasta);
        if (!isNaN(d) && !isNaN(h) && h >= d) {
          for (let n = d; n <= h; n++) {
            res.push({
              numero: n,
              numeroTexto: String(n).padStart(3, '0'),
              celular,
              cliente,
              dinamica,
              fecha
            });
          }
          return;
        }
      }

      if (x.n_ticket) {
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
                    numero: n,
                    numeroTexto: String(n).padStart(3, '0'),
                    celular,
                    cliente,
                    dinamica,
                    fecha
                  });
                }
                return;
              }
            }
          }
          const num = parseInt(p, 10);
          res.push({
            numero: isNaN(num) ? 0 : num,
            numeroTexto: isNaN(num) ? p : String(num).padStart(3, '0'),
            celular,
            cliente,
            dinamica,
            fecha
          });
        });
      }
    });

    res.sort((a, b) => a.numero - b.numero);
    return res;
  };

  const exportarSorteoExcel = async () => {
    const origen = visibles.length > 0 && busquedaTicket.trim() ? visibles : lista;
    const tickets = desglosarTickets(origen);
    if (tickets.length === 0) {
      avisar('error', 'No hay boletos o dinámicas registradas para exportar.');
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
        t.fecha
      ]);

      await generarExcel({
        nombre: 'gran_sorteo_27_noviembre_boletos',
        columnas: [
          { header: 'Cabecera / Evento', key: 'cabecera', width: 34 },
          { header: 'Número', key: 'numero', width: 14 },
          { header: 'Celular Cliente', key: 'celular', width: 18 },
          { header: 'Nombre del Cliente', key: 'cliente', width: 32 },
          { header: 'Dinámica', key: 'dinamica', width: 26 },
          { header: 'Fecha de Compra', key: 'fecha', width: 16 }
        ],
        filas,
        fotos: []
      });
      avisar('exito', 'Reporte Excel generado (' + tickets.length + ' boletos).');
    } catch (err) {
      avisar('error', 'Error al generar Excel: ' + err.message);
    } finally {
      setGenerandoExcel(false);
    }
  };

  const exportarSorteoPDF = () => {
    const origen = visibles.length > 0 && busquedaTicket.trim() ? visibles : lista;
    const tickets = desglosarTickets(origen);
    if (tickets.length === 0) {
      avisar('error', 'No hay boletos para generar el PDF.');
      return;
    }

    const titulo = 'Gran Sorteo el 27 de Noviembre — Boletos';
    const fecha = new Date().toLocaleString();
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 6 columnas × 6 filas = 36 boletos por hoja carta (cuadrados compactos)
    const POR_HOJA = 6 * 6;
    const hojas = [];

    const celdas = (t) => `
      <div class="ticket">
        <div class="ticket-header">GRAN SORTEO EL 27 DE NOVIEMBRE</div>
        <div class="ticket-body">
          <div class="ticket-numero">${escH(t.numeroTexto)}</div>
          <div class="ticket-celular">📱 ${escH(t.celular)}</div>
          <div class="ticket-cliente">👤 ${escH(t.cliente)}</div>
          ${t.dinamica ? `<div class="ticket-dinamica">${escH(t.dinamica)}</div>` : ''}
        </div>
      </div>
    `;

    for (let i = 0; i < tickets.length; i += POR_HOJA) {
      const lote = tickets.slice(i, i + POR_HOJA);
      hojas.push(`
        <div class="hoja">
          <div class="hoja-header">
            <span>GRAN SORTEO EL 27 DE NOVIEMBRE</span>
            <span>Página ${Math.floor(i / POR_HOJA) + 1} de ${Math.ceil(tickets.length / POR_HOJA)}</span>
          </div>
          <div class="grid">${lote.map(celdas).join('')}</div>
        </div>
      `);
    }

    const filasTabla = tickets.map((t) => `
      <tr>
        <td style="font-weight:700;color:#0f172a">GRAN SORTEO EL 27 DE NOVIEMBRE</td>
        <td style="font-size:14px;font-weight:800;color:#b91c1c;text-align:center">${escH(t.numeroTexto)}</td>
        <td style="font-weight:700;color:#1d4ed8">${escH(t.celular)}</td>
        <td style="font-weight:600">${escH(t.cliente)}</td>
        <td>${escH(t.dinamica || '—')}</td>
        <td>${escH(t.fecha || '—')}</td>
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
            padding: 8px 16px;
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
            grid-template-columns: repeat(6, 1fr);
            gap: 3px;
          }
          .ticket {
            border: 1px solid #888;
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            page-break-inside: avoid;
            break-inside: avoid;
            background: #ffffff;
            box-sizing: border-box;
            min-height: 38mm;
            max-height: 42mm;
            text-align: center;
          }
          .ticket-header {
            width: 100%;
            background: #0f172a;
            color: #ffffff;
            text-align: center;
            font-size: 7px;
            font-weight: 800;
            padding: 2px 1px;
            letter-spacing: 0.2px;
            line-height: 1.15;
            text-transform: uppercase;
          }
          .ticket-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 2px 3px 3px;
            text-align: center;
            min-width: 0;
          }
          .ticket-numero {
            font-size: 19px;
            font-weight: 900;
            color: #dc2626;
            line-height: 1;
            margin: 2px 0;
          }
          .ticket-celular {
            font-size: 10px;
            font-weight: 800;
            color: #1d4ed8;
            margin: 1px 0;
            line-height: 1.1;
          }
          .ticket-cliente {
            font-size: 9px;
            font-weight: 700;
            color: #111827;
            line-height: 1.15;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .ticket-dinamica {
            font-size: 7.5px;
            color: #64748b;
            margin-top: 2px;
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
            <strong style="font-size:15px;color:#0f172a">🎯 GRAN SORTEO EL 27 DE NOVIEMBRE</strong>
            <div style="font-size:12px;color:#64748b;margin-top:2px">
              ${tickets.length} boletos generados · ${fecha}
            </div>
          </div>
          <div style="display:flex;gap:8px">
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
          ${hojas.join('')}
        </div>

        <div id="vista-tabla" style="display:none">
          <h2 style="margin:0 0 4px">GRAN SORTEO EL 27 DE NOVIEMBRE</h2>
          <p style="color:#64748b;margin:0 0 10px;font-size:12px">${tickets.length} boletos registrados · ${fecha}</p>
          <table>
            <thead>
              <tr>
                <th>Evento</th>
                <th style="text-align:center">Número</th>
                <th>Celular Cliente</th>
                <th>Nombre del Cliente</th>
                <th>Dinámica</th>
                <th>Fecha Compra</th>
              </tr>
            </thead>
            <tbody>
              ${filasTabla}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `);
    w.document.close();
    w.focus();
  };

  return (
    <>
      <div className="card">
        <h2>🎯 {editId ? 'Editar dinámica' : 'Dinámicas'}</h2>
        <div style={{ marginBottom: 15 }}>
          <button type="button" onClick={() => setVerValores(!verValores)}>
            {verValores ? '▲ Ocultar valores de dinámicas' : '🏷️ Crear / administrar diferentes dinámicas'}
          </button>
        </div>
        {faltaTabla ? (
          <p className="error">Falta crear la tabla dinamicas en Supabase. Ejecuta el archivo auth-supabase/DINAMICAS.sql en el SQL Editor.</p>
        ) : (
          <form className="grid2" onSubmit={guardar}>
            <div className="full" style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
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
              {form.dinamica_nombre && form.valor_dinamica != null && form.valor_dinamica !== '' ? (
                <small className="hint" style={{ marginTop: 6, color: '#15803d', fontWeight: 600 }}>
                  ✓ Dinámica activa: <strong>{form.dinamica_nombre}</strong> (Bs {Number(form.valor_dinamica).toFixed(2)} por boleto). Se mantiene fija para registrar compradores consecutivos.
                </small>
              ) : (
                <small className="hint" style={{ marginTop: 6 }}>
                  💡 Selecciona la dinámica una sola vez. Se mantendrá activa para registrar a todos los compradores.
                </small>
              )}
            </div>

            <div>
              <label>Celular Cliente</label>
              <input
                name="celular_cliente"
                value={form.celular_cliente}
                onChange={(e) => cambiarCelular(e.target.value)}
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
            </div>
            <div>
              <label>Nombre Completo</label>
              <input name="nombre_completo" value={form.nombre_completo} onChange={cambiar} required />
            </div>
            <div>
              <label>Monto Compra</label>
              <input name="monto_compra" type="number" step="0.01" min="0" value={form.monto_compra} onChange={cambiar} required />
            </div>
            <div>
              <label>N° Ticket</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input name="n_ticket" value={form.n_ticket} onChange={cambiar} style={{ flex: 1 }} />
                <button type="button" onClick={generarNumero} style={{ whiteSpace: 'nowrap' }}>Generar Numero</button>
              </div>
            </div>
            <div>
              <label>Fecha de Compra</label>
              <input name="fecha_compra" type="date" value={form.fecha_compra} onChange={cambiar} />
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
            <h2 style={{ margin: 0 }}>📋 Dinámicas registradas ({lista.length})</h2>
            <div className="actions" style={{ margin: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-entregar"
                onClick={exportarSorteoExcel}
                disabled={generandoExcel || lista.length === 0}
              >
                {generandoExcel ? 'Generando Excel...' : '📥 Boletos Excel (Sorteo 27 Nov)'}
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={exportarSorteoPDF}
                disabled={lista.length === 0}
              >
                📄 Boletos PDF (Sorteo 27 Nov)
              </button>
            </div>
          </div>

          {/* BUSCADOR POR NÚMERO DE TICKET */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '14px 16px',
            margin: '12px 0 16px'
          }}>
            <label style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span>🔍</span> Buscador por Número de Ticket
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
            <small className="hint" style={{ marginTop: 4 }}>
              Escribe el número de ticket para ver de inmediato el nombre y celular del comprador o ganador.
            </small>

            {/* RESULTADO DESTACADO */}
            {busquedaTicket.trim() && (
              coincidencias.length > 0 ? (
                <div style={{
                  background: '#ecfdf5',
                  border: '2px solid #10b981',
                  borderRadius: 8,
                  padding: 14,
                  marginTop: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🎟️</span> Ticket #{busquedaTicket.trim()} encontrado ({coincidencias.length} coincidencia{coincidencias.length > 1 ? 's' : ''})
                    </div>
                    <span style={{ fontSize: 12, background: '#a7f3d0', color: '#065f46', padding: '3px 10px', borderRadius: 12, fontWeight: 700 }}>
                      ✓ CLIENTE ENCONTRADO
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {coincidencias.map((c) => (
                      <div key={c.id} style={{
                        background: '#ffffff',
                        border: '1px solid #86efac',
                        borderRadius: 6,
                        padding: 12,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 12
                      }}>
                        <div>
                          <div style={{ fontSize: 12, color: '#4b5563', fontWeight: 700 }}>👤 NOMBRE DEL CLIENTE</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 2 }}>
                            {c.nombre_completo}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 12, color: '#4b5563', fontWeight: 700 }}>📱 CELULAR</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <a href={`tel:${c.celular_cliente}`} style={{ color: '#1d4ed8', textDecoration: 'none' }}>
                              {c.celular_cliente}
                            </a>
                            <a
                              href={`https://wa.me/${String(c.celular_cliente).replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 12, background: '#22c55e', color: '#fff', padding: '3px 8px', borderRadius: 4, textDecoration: 'none', fontWeight: 700 }}
                            >
                              WhatsApp
                            </a>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 12, color: '#4b5563', fontWeight: 700 }}>🎯 DINÁMICA</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginTop: 2 }}>
                            {c.dinamica_nombre || '—'}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 12, color: '#4b5563', fontWeight: 700 }}>🎟️ N° DE TICKETS</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#047857', marginTop: 2 }}>
                            {c.n_ticket || '—'}
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

          {visibles.length === 0 ? (
            <p className="empty">{busquedaTicket.trim() ? 'No hay dinámicas que coincidan con la búsqueda.' : 'Aún no hay dinámicas registradas.'}</p>
          ) : (
            <div className="tabla">
              <table>
                <thead>
                  <tr><th>Celular Cliente</th><th>Nombre Completo</th><th>Monto Compra</th><th>N° Ticket</th><th>Fecha de Compra</th><th>Valor Dinámica</th><th>Acciones</th></tr>
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
          <Paginacion total={visibles.length} pagina={pagina} setPagina={setPagina} porPagina={POR_PAGINA} />
        </div>
      )}
    </>
  );
}
