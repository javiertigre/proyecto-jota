import { useEffect, useState } from 'react';
import { api } from '../api.js';

const esLaPaz = (ciudad) => (ciudad || '').trim().toUpperCase() === 'LA PAZ';

export default function SolicitudesEntrega({ avisar }) {
  const [celular, setCelular] = useState('');
  const [nombre, setNombre] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);
  const [buscado, setBuscado] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [lugares, setLugares] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [editando, setEditando] = useState(null);
  const [tipo, setTipo] = useState('LA_PAZ');
  const [lugarId, setLugarId] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [detalle, setDetalle] = useState('');

  useEffect(() => {
    api.get('/api/entregas').then((r) => setLugares(r.entregas || [])).catch(() => { });
    api.get('/api/buses').then((r) => setEmpresas(r.empresas || [])).catch(() => { });
  }, []);

  const buscar = async (e) => {
    if (e) e.preventDefault();
    const cel = celular.trim();
    const nom = nombre.trim();
    if (!cel && !nom && !fechaEntrega) { avisar('error', 'Escribe el celular, el nombre o elige una fecha.'); return; }
    setBuscando(true);
    try {
      const params = new URLSearchParams();
      if (cel) params.set('celular', cel);
      if (nom) params.set('nombre', nom);
      if (fechaEntrega) params.set('fecha_entrega', fechaEntrega);
      const r = await api.get('/api/solicitudes?' + params.toString());
      setItems(r.items || []);
      setBuscado(true);
      setEditando(null);
      if (!r.items || !r.items.length) avisar('error', 'No se encontraron entregas para esa búsqueda.');
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setBuscando(false);
    }
  };

  const abrirForm = (item) => {
    setEditando(item);
    const enLP = esLaPaz(item.venta?.ciudad);
    setTipo(item.entrega?.tipo || (enLP ? 'LA_PAZ' : 'PROVINCIA'));
    setLugarId(item.entrega?.lugar_entrega_id ? String(item.entrega.lugar_entrega_id) : '');
    setEmpresaId(item.entrega?.empresa_bus_id ? String(item.entrega.empresa_bus_id) : '');
    setDestinoId(item.entrega?.destino_bus_id ? String(item.entrega.destino_bus_id) : '');
    setDetalle(item.entrega?.detalle || '');
    setTimeout(() => document.getElementById('form-entrega')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const textoEntrega = (t, lugId, empId, desId) => {
    if (t === 'LA_PAZ') {
      const l = lugares.find((x) => String(x.id) === String(lugId));
      return l ? (l.lugar + ' — ' + l.ciudad + (l.detalle ? ' (' + l.detalle + ')' : '')) : '—';
    }
    const emp = empresas.find((x) => String(x.id) === String(empId));
    const des = (emp ? (emp.destinos || []) : []).find((d) => String(d.id) === String(desId));
    return (emp ? emp.nombre : '—') + ' → ' + (des ? des.destino : '—');
  };

  const guardar = async (e) => {
    e.preventDefault();
    const pid = editando.producto_id;
    const payload = {
      producto_id: pid,
      tipo,
      lugar_entrega_id: tipo === 'LA_PAZ' ? (lugarId || null) : null,
      empresa_bus_id: tipo === 'PROVINCIA' ? (empresaId || null) : null,
      destino_bus_id: tipo === 'PROVINCIA' ? (destinoId || null) : null,
      detalle
    };
    try {
      const r = await api.post('/api/solicitudes', payload);
      avisar('exito', 'Entrega registrada.');
      // Actualización local inmediata (sin recargar toda la lista)
      setItems((prev) => prev.map((it) => it.producto_id === pid ? {
        ...it,
        entrega: r.solicitud || { ...payload },
        entrega_texto: textoEntrega(tipo, lugarId, empresaId, destinoId)
      } : it));
      setEditando(null);
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const entregar = async (item) => {
    if (!item.entrega) { avisar('error', 'Registra primero dónde se entregará.'); return; }
    if (!fechaEntrega) { avisar('error', 'Elige la fecha de entrega.'); return; }
    if (!window.confirm('¿Marcar ' + (item.nombre_foto || '') + ' como ENTREGADO el ' + fechaEntrega + '?')) return;
    try {
      await api.post('/api/solicitudes/' + item.producto_id + '/entregar', { fecha_entrega: fechaEntrega });
      avisar('exito', 'Producto entregado el ' + fechaEntrega + '.');
      // Actualización local inmediata (sin recargar toda la lista)
      setItems((prev) => prev.map((it) => it.producto_id === item.producto_id ? {
        ...it,
        venta: { ...it.venta, estado: 'E', fecha_entrega: fechaEntrega }
      } : it));
    } catch (err) {
      avisar('error', err.message);
    }
  };

  const destinosDe = (empId) => {
    const emp = empresas.find((x) => String(x.id) === String(empId));
    return emp ? (emp.destinos || []) : [];
  };

  const ordenados = [...items].sort((a, b) => String(a.nombre_foto || '').localeCompare(String(b.nombre_foto || '')));

  // Nombre + apellido paterno (2 primeras palabras)
  const clienteCorto = (it) => String(it.venta?.nombre_cliente || '').trim().split(/\s+/).slice(0, 2).join(' ');
  // Datos de entrega resueltos con lo ya cargado (lugares y empresas)
  const lugarDe = (it) => {
    if (it.entrega?.tipo !== 'LA_PAZ') return null;
    return lugares.find((x) => String(x.id) === String(it.entrega.lugar_entrega_id)) || null;
  };
  const destinoDe = (it) => {
    if (it.entrega?.tipo !== 'PROVINCIA') return null;
    const emp = empresas.find((x) => String(x.id) === String(it.entrega.empresa_bus_id));
    const des = (emp ? (emp.destinos || []) : []).find((d) => String(d.id) === String(it.entrega.destino_bus_id));
    return { emp, des };
  };
  // Reporte 1: solo LA PAZ — orden EL ALTO primero, luego LA PAZ, luego resto
  const pesoCiudad = (c) => {
    const u = String(c || '').trim().toUpperCase();
    if (u === 'EL ALTO') return 0;
    if (u === 'LA PAZ') return 1;
    return 2;
  };
  const filasLaPaz = ordenados
    .filter((it) => it.entrega?.tipo === 'LA_PAZ')
    .map((it) => {
      const l = lugarDe(it);
      const ciudad = l ? l.ciudad : '';
      const lugarTxt = l ? (l.lugar + (l.detalle ? ' — ' + l.detalle : '')) : it.entrega_texto;
      return { it, cliente: clienteCorto(it), ciudad, lugarTxt };
    })
    .sort((a, b) => (pesoCiudad(a.ciudad) - pesoCiudad(b.ciudad)) || a.cliente.localeCompare(b.cliente));
  // Reporte 2: solo PROVINCIA (interior) — ordenado por ciudad de entrega
  const filasInterior = ordenados
    .filter((it) => it.entrega?.tipo === 'PROVINCIA')
    .map((it) => {
      const r = destinoDe(it);
      const ciudad = (r && r.des) ? r.des.destino : '';
      return { it, cliente: clienteCorto(it), ciudad };
    })
    .sort((a, b) => a.ciudad.localeCompare(b.ciudad) || a.cliente.localeCompare(b.cliente));

  const descargarCSV = (nombreArchivo, lineas) => {
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '﻿' + lineas.map((f) => f.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  };

  const imprimirPDF = (titulo, subtitulo, thead, filasHtml, totalTxt) => {
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write('<html><head><title>' + escH(titulo) + '</title><style>'
      + '@page{size:letter portrait;margin:12mm}'
      + 'body{font-family:sans-serif;padding:20px;color:#111;text-align:center}'
      + '.logo-rep{width:80px;height:80px;object-fit:cover;border-radius:10px}'
      + '.cabecera{display:flex;align-items:center;gap:14px;margin-bottom:12px;text-align:left}'
      + '.cabecera .tit{flex:1;text-align:center}'
      + 'h1{margin:0;font-size:22px} h3{margin:4px 0 4px;font-size:15px;color:#333}'
      + 'p.sub{margin:0}'
      + 'p{color:#555;margin:0 0 12px;font-size:12px}'
      + 'table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}'
      + 'th,td{border:1px solid #999;padding:6px;text-align:left}'
      + 'th{background:#eab308;color:#422006}'
      + '@media print{.no-print{display:none}}'
      + '</style></head><body>'
      + '<div class="cabecera"><img class="logo-rep" src="/JC.jpeg" />'
      + '<div class="tit"><h1>' + escH(titulo) + '</h1><h3>' + escH(subtitulo) + '</h3><p class="sub">' + escH(totalTxt) + '</p></div></div>'
      + '<table><thead><tr>' + thead.map((c) => '<th>' + escH(c) + '</th>').join('') + '</tr></thead><tbody>' + filasHtml + '</tbody></table>'
      + '<p class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>'
      + '</body></html>');
    w.document.close();
    w.focus();
  };

  const excelLaPaz = () => {
    if (!filasLaPaz.length) { avisar('error', 'No hay entregas de LA PAZ en la lista.'); return; }
    descargarCSV('entregas_la_paz_' + (fechaEntrega || 'todas') + '.csv', [
      ['ENTREGAS CIUDAD DE LA PAZ'],
      ['CAPRICORNIO DETALLES'],
      ['Fecha: ' + (fechaEntrega || 'todas')],
      [],
      ['N°', 'Cliente', 'Lugar de entrega', 'Ciudad'],
      ...filasLaPaz.map((f, i) => [i + 1, f.cliente, f.lugarTxt, f.ciudad])
    ]);
  };
  const pdfLaPaz = () => {
    if (!filasLaPaz.length) { avisar('error', 'No hay entregas de LA PAZ en la lista.'); return; }
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filasHtml = filasLaPaz.map((f, i) =>
      '<tr><td>' + (i + 1) + '</td><td>' + escH(f.cliente) + '</td><td>' + escH(f.lugarTxt) + '</td><td>' + escH(f.ciudad) + '</td></tr>'
    ).join('');
    imprimirPDF('ENTREGAS CIUDAD DE LA PAZ', 'CAPRICORNIO DETALLES', ['N°', 'Cliente', 'Lugar de entrega', 'Ciudad'], filasHtml,
      'Fecha: ' + (fechaEntrega || 'todas') + ' · ' + filasLaPaz.length + ' entrega(s)');
  };
  const excelInterior = () => {
    if (!filasInterior.length) { avisar('error', 'No hay envíos al interior en la lista.'); return; }
    descargarCSV('envios_interior_' + (fechaEntrega || 'todas') + '.csv', [
      ['CAPRICORNIO DETALLES'],
      ['ENVIOS INTERIOR'],
      ['Fecha: ' + (fechaEntrega || 'todas')],
      [],
      ['N°', 'Cliente', 'Ciudad de entrega'],
      ...filasInterior.map((f, i) => [i + 1, f.cliente, f.ciudad])
    ]);
  };
  const pdfInterior = () => {
    if (!filasInterior.length) { avisar('error', 'No hay envíos al interior en la lista.'); return; }
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filasHtml = filasInterior.map((f, i) =>
      '<tr><td>' + (i + 1) + '</td><td>' + escH(f.cliente) + '</td><td>' + escH(f.ciudad) + '</td></tr>'
    ).join('');
    imprimirPDF('CAPRICORNIO DETALLES', 'ENVIOS INTERIOR', ['N°', 'Cliente', 'Ciudad de entrega'], filasHtml,
      'Fecha: ' + (fechaEntrega || 'todas') + ' · ' + filasInterior.length + ' envío(s)');
  };

  return (
    <>
      <div className="card">
        <h2>🚚 Entregas — buscar cliente</h2>
        <form className="grid2" onSubmit={buscar}>
          <div>
            <label>Celular del cliente</label>
            <input
              placeholder="Ej: 77712345"
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
            />
          </div>
          <div>
            <label>Nombre / apellido paterno</label>
            <input
              placeholder="Ej: Juan o Perez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div>
            <label>Fecha de entrega (filtra y se graba al entregar)</label>
            <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            <small className="hint">Puedes buscar solo por fecha, sin celular ni nombre.</small>
          </div>
          <div className="full">
            <button className="btn-primary" disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar'}</button>
          </div>
        </form>
      </div>

      {buscado && (
        <div className="card">
          <h2>📋 Lista de Entregas — {fechaEntrega || 'todas'} ({items.length})</h2>
          {items.length > 0 && (
            <div className="actions" style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button className="btn-entregar" onClick={excelLaPaz}>📥 Excel La Paz</button>
              <button className="btn-edit" onClick={pdfLaPaz}>📄 PDF La Paz</button>
              <button className="btn-entregar" onClick={excelInterior}>📥 Excel Interior</button>
              <button className="btn-edit" onClick={pdfInterior}>📄 PDF Interior</button>
            </div>
          )}
          {items.length === 0 ? (
            <p className="empty">Sin resultados para esa búsqueda.</p>
          ) : (
            <div className="tabla tabla-ancha">
              <table>
                <thead>
                  <tr><th>Foto</th><th>Producto</th><th>Fardo</th><th>Cliente</th><th>Ciudad</th><th>Se encuentra en</th><th>Estado</th><th>Observaciones</th><th>Fecha Entrega</th><th>Entrega</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const esEntregado = it.venta?.estado === 'E';
                    return (
                      <tr key={it.producto_id}>
                        <td>{it.foto_url ? <a href={it.foto_url} target="_blank" rel="noreferrer"><img className="thumb" loading="lazy" src={it.foto_url} alt={it.nombre_foto} /></a> : '—'}</td>
                        <td>{it.nombre_foto} (Bs {it.precio})</td>
                        <td>{it.codigo_fardo} — {it.nombre_fardo}</td>
                        <td>{it.venta?.nombre_cliente || '—'}</td>
                        <td>{it.venta?.ciudad || '—'}</td>
                        <td>{it.venta?.ubicacion || '—'}</td>
                        <td>{esEntregado ? 'Entregado (E)' : it.venta?.estado === 'P' ? 'Pendiente (P)' : it.venta?.estado === 'D' ? 'Deuda (D)' : (it.venta?.estado || '—')}</td>
                        <td>{it.venta?.observacion || '—'}</td>
                        <td>{it.venta?.fecha_entrega || '—'}</td>
                        <td>{it.entrega ? it.entrega_texto : 'Sin registrar'}</td>
                        <td className="actions">
                          {esEntregado ? (
                            <strong>ENTREGADO</strong>
                          ) : it.entrega ? (
                            <>
                              <button className="btn-edit" onClick={() => abrirForm(it)}>Editar</button>
                              <button className="btn-entregar" onClick={() => entregar(it)}>Entregar</button>
                            </>
                          ) : (
                            <button className="btn-edit" onClick={() => abrirForm(it)}>Registrar</button>
                          )}
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

      {editando && (
        <div className="card" id="form-entrega">
          <h2>🚚 Registrar entrega — {editando.nombre_foto}</h2>
          <p className="hint">
            Cliente: <strong>{editando.venta?.nombre_cliente || '—'}</strong> · Ciudad de la venta: <strong>{editando.venta?.ciudad || '—'}</strong>
            {esLaPaz(editando.venta?.ciudad)
              ? ' → Entrega en LA PAZ (lugares registrados).'
              : ' → Entrega fuera de LA PAZ (destinos por empresa).'}
          </p>
          <form className="grid1" onSubmit={guardar}>
            <div>
              <label>Tipo de entrega</label>
              <select value={tipo} onChange={(e) => { setTipo(e.target.value); }}>
                <option value="LA_PAZ">LA PAZ — Registro de Entregas</option>
                <option value="PROVINCIA">Otra ciudad — Destinos por Empresa</option>
              </select>
            </div>
            {tipo === 'LA_PAZ' ? (
              <div>
                <label>Lugar de entrega (Registro de Entregas)</label>
                <select value={lugarId} onChange={(e) => setLugarId(e.target.value)} required>
                  <option value="">-- Selecciona el lugar --</option>
                  {lugares.map((l) => (
                    <option key={l.id} value={l.id}>{l.lugar} — {l.ciudad}{l.detalle ? ' (' + l.detalle + ')' : ''}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label>Empresa de bus</label>
                  <select value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setDestinoId(''); }} required>
                    <option value="">-- Selecciona la empresa --</option>
                    {empresas.map((x) => (
                      <option key={x.id} value={x.id}>{x.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Destino (de la empresa)</label>
                  <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
                    <option value="">-- Selecciona el destino --</option>
                    {destinosDe(empresaId).map((d) => (
                      <option key={d.id} value={d.id}>{d.destino}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label>Detalle (opcional)</label>
              <input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej: llamar antes de entregar" />
            </div>
            <div>
              <button className="btn-blue">Guardar entrega</button>{' '}
              <button type="button" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
