import { Fragment, useState } from 'react';
import { api } from '../api.js';

const hoy = () => new Date().toISOString().slice(0, 10);
const nombreEstado = (e) => e === 'P' ? 'Pendiente (P)' : e === 'D' ? 'Deuda (D)' : e === 'E' ? 'Entregado (E)' : (e || '');

const compararCodigo = (a, b) =>
  String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { numeric: true, sensitivity: 'base' });

// Agrupa las ventas por tipo de fardo y ordena cada grupo por código
const agruparPorFardo = (items) => {
  const mapa = new Map();
  (items || []).forEach((it) => {
    const fardo = it.fardo || 'Sin fardo';
    if (!mapa.has(fardo)) mapa.set(fardo, []);
    mapa.get(fardo).push(it);
  });

  return [...mapa.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es', { numeric: true, sensitivity: 'base' }))
    .map(([fardo, ventas]) => {
      const ordenadas = [...ventas].sort(compararCodigo);
      return {
        fardo,
        items: ordenadas,
        totalDeposito: ordenadas.reduce((s, it) => s + (Number(it.deposito) || 0), 0),
        totalVenta: ordenadas.reduce((s, it) => s + (Number(it.precio_venta) || 0), 0),
        totalOriginal: ordenadas.reduce((s, it) => s + (Number(it.precio_original) || 0), 0)
      };
    });
};

export default function ReporteVentas({ avisar }) {
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [items, setItems] = useState([]);
  const [totDep, setTotDep] = useState(0);
  const [totVen, setTotVen] = useState(0);
  const [buscado, setBuscado] = useState(false);
  const [cargando, setCargando] = useState(false);

  const grupos = agruparPorFardo(items);
  const totalOriginal = items.reduce((s, it) => s + (Number(it.precio_original) || 0), 0);

  const buscar = async (e) => {
    if (e) e.preventDefault();
    if (!desde) { avisar('error', 'Elige la fecha desde.'); return; }
    setCargando(true);
    try {
      const params = new URLSearchParams({ desde, hasta: hasta || desde });
      const r = await api.get('/api/reportes/ventas?' + params.toString());
      setItems(r.items || []);
      setTotDep(r.total_deposito || 0);
      setTotVen(r.total_venta || 0);
      setBuscado(true);
      if (!r.items || !r.items.length) avisar('error', 'Sin ventas en esas fechas.');
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setCargando(false);
    }
  };

  const rangoTxt = 'Del ' + desde + ' al ' + (hasta || desde);

  const exportarExcel = () => {
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const filasDatos = [];
    grupos.forEach((g) => {
      filasDatos.push(['', '', 'FARDO: ' + g.fardo]);
      g.items.forEach((it) => filasDatos.push([
        it.fecha_venta, it.codigo, it.fardo, it.precio_original, it.precio_venta ?? '',
        it.deposito ?? '', it.cliente, it.celular, it.ciudad, nombreEstado(it.estado),
        it.ubicacion, it.observacion, it.fecha_entrega
      ]));
      filasDatos.push(['', '', 'SUBTOTAL ' + g.fardo, g.totalOriginal, g.totalVenta, g.totalDeposito]);
    });

    const lineas = [
      ['REPORTE DE VENTAS POR FECHAS'],
      ['CAPRICORNIO DETALLES'],
      [rangoTxt],
      [],
      ['Fecha venta', 'Código', 'Fardo', 'Precio original', 'Precio venta', 'Depósito', 'Cliente', 'Celular', 'Ciudad', 'Estado', 'Ubicación', 'Observación', 'F. entrega'],
      ...filasDatos,
      [],
      ['', '', 'TOTAL GENERAL (' + items.length + ' ventas)', totalOriginal, totVen, totDep]
    ];
    const csv = '﻿' + lineas.map((f) => f.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte_ventas_' + desde + '_' + (hasta || desde) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    const escH = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filaHtml = (it) => '<tr>' + [
      it.fecha_venta, it.codigo, it.fardo, it.precio_original, it.precio_venta ?? '', it.deposito ?? '',
      it.cliente, it.celular, it.ciudad, nombreEstado(it.estado), it.ubicacion, it.observacion, it.fecha_entrega
    ].map(escH).map((c) => '<td>' + c + '</td>').join('') + '</tr>';

    const filas = grupos.map((g) => {
      const cabecera = '<tr class="grupo"><td colspan="13">📦 FARDO: ' + escH(g.fardo) +
        ' · ' + g.items.length + ' venta' + (g.items.length === 1 ? '' : 's') + '</td></tr>';
      const detalle = g.items.map(filaHtml).join('');
      const subtotal = '<tr class="subtot"><td colspan="3">SUBTOTAL ' + escH(g.fardo) + '</td>' +
        '<td>' + escH(g.totalOriginal) + '</td><td>' + escH(g.totalVenta) + '</td><td>' + escH(g.totalDeposito) + '</td><td colspan="7"></td></tr>';
      return cabecera + detalle + subtotal;
    }).join('');

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write('<html><head><title>Reporte de ventas</title><style>'
      + '@page{size:letter portrait;margin:12mm}'
      + 'body{font-family:sans-serif;padding:20px;color:#111}'
      + '.logo-rep{width:80px;height:80px;object-fit:cover;border-radius:10px}'
      + '.cabecera{display:flex;align-items:center;gap:12px;margin-bottom:12px}'
      + '.cabecera .tit{flex:1;text-align:center} h1{margin:0;font-size:20px} h3{margin:4px 0;font-size:14px;color:#333} p.sub{margin:0;font-size:12px;color:#555}'
      + 'table{width:100%;border-collapse:collapse;font-size:10px}'
      + 'th,td{border:1px solid #999;padding:4px;text-align:left}'
      + 'th{background:#eab308;color:#422006}'
      + 'tr.grupo td{background:#fef3c7;color:#713f12;font-weight:bold;font-size:11px}'
      + 'tr.subtot td{background:#fef9c3;font-weight:bold}'
      + '.tot{font-weight:bold;background:#fde68a}'
      + '@media print{.no-print{display:none}}'
      + '</style></head><body>'
      + '<div class="cabecera"><img class="logo-rep" src="/JC.jpeg" /><div class="tit"><h1>REPORTE DE VENTAS POR FECHAS</h1><h3>CAPRICORNIO DETALLES</h3><p class="sub">' + escH(rangoTxt) + ' · ' + grupos.length + ' fardo' + (grupos.length === 1 ? '' : 's') + '</p></div></div>'
      + '<table><thead><tr><th>F. venta</th><th>Código</th><th>Fardo</th><th>P. orig.</th><th>P. venta</th><th>Depósito</th><th>Cliente</th><th>Celular</th><th>Ciudad</th><th>Estado</th><th>Ubicación</th><th>Observación</th><th>F. entrega</th></tr></thead><tbody>' + filas + '</tbody>'
      + '<tfoot><tr class="tot"><td colspan="3">TOTAL GENERAL (' + items.length + ' ventas)</td><td>' + escH(totalOriginal) + '</td><td>' + escH(totVen) + '</td><td>' + escH(totDep) + '</td><td colspan="7"></td></tr></tfoot></table>'
      + '<p class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>'
      + '</body></html>');
    w.document.close();
    w.focus();
  };

  return (
    <>
      <div className="card">
        <h2>📊 Reporte de ventas por fechas</h2>
        <form className="grid2" onSubmit={buscar}>
          <div>
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="full">
            <button className="btn-primary" disabled={cargando}>{cargando ? 'Generando...' : 'Generar reporte'}</button>
          </div>
        </form>
      </div>

      {buscado && (
        <div className="card">
          <h2>🧾 Ventas {rangoTxt} ({items.length}) · {grupos.length} fardo{grupos.length === 1 ? '' : 's'}</h2>
          {items.length > 0 && (
            <div className="actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <button className="btn-entregar" onClick={exportarExcel}>📥 Reporte Excel</button>
              <button className="btn-edit" onClick={exportarPDF}>📄 Reporte PDF</button>
            </div>
          )}
          {items.length === 0 ? (
            <p className="empty">Sin ventas en esas fechas.</p>
          ) : (
            <>
              <div className="tabla tabla-ancha">
                <table>
                  <thead>
                    <tr><th>F. venta</th><th>Código</th><th>Fardo</th><th>P. orig.</th><th>P. venta</th><th>Depósito</th><th>Cliente</th><th>Celular</th><th>Ciudad</th><th>Estado</th><th>Ubicación</th><th>Observación</th><th>F. entrega</th></tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <Fragment key={g.fardo}>
                        <tr style={{ background: '#fef3c7' }}>
                          <td colSpan="13" style={{ fontWeight: 800, color: '#713f12' }}>
                            📦 FARDO: {g.fardo} · {g.items.length} venta{g.items.length === 1 ? '' : 's'}
                          </td>
                        </tr>
                        {g.items.map((it, i) => (
                          <tr key={g.fardo + '-' + (it.codigo || '') + '-' + i}>
                            <td data-label="F. venta">{it.fecha_venta}</td>
                            <td data-label="Código">{it.codigo}</td>
                            <td data-label="Fardo">{it.fardo}</td>
                            <td data-label="P. orig.">{it.precio_original}</td>
                            <td data-label="P. venta">{it.precio_venta ?? '—'}</td>
                            <td data-label="Depósito">{it.deposito ?? '—'}</td>
                            <td data-label="Cliente">{it.cliente}</td>
                            <td data-label="Celular">{it.celular}</td>
                            <td data-label="Ciudad">{it.ciudad}</td>
                            <td data-label="Estado">{nombreEstado(it.estado)}</td>
                            <td data-label="Ubicación">{it.ubicacion || '—'}</td>
                            <td data-label="Observación">{it.observacion || '—'}</td>
                            <td data-label="F. entrega">{it.fecha_entrega || '—'}</td>
                          </tr>
                        ))}
                        <tr style={{ background: '#fef9c3', fontWeight: 700 }}>
                          <td colSpan="3">SUBTOTAL {g.fardo}</td>
                          <td>{g.totalOriginal}</td>
                          <td>{g.totalVenta}</td>
                          <td><strong style={{ color: '#b45309' }}>{g.totalDeposito}</strong></td>
                          <td colSpan="7"></td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3"><strong>TOTAL GENERAL ({items.length} ventas)</strong></td>
                      <td><strong>{totalOriginal}</strong></td>
                      <td><strong>{totVen}</strong></td>
                      <td><strong>{totDep}</strong></td>
                      <td colSpan="7"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="hint">Agrupado por tipo de fardo y ordenado por código · Suma total Depósito: <strong>{totDep}</strong> · Suma Precio venta: <strong>{totVen}</strong></p>
            </>
          )}
        </div>
      )}
    </>
  );
}
