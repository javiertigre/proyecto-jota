import { Fragment, useState } from 'react';
import { api } from '../api.js';

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
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
  const [pagos, setPagos] = useState([]);
  const [totCob, setTotCob] = useState(0);
  const [pagosFaltaTabla, setPagosFaltaTabla] = useState(false);
  const [pagosError, setPagosError] = useState('');

  const grupos = agruparPorFardo(items);
  const totalOriginal = items.reduce((s, it) => s + (Number(it.precio_original) || 0), 0);
  // TOTAL DEPÓSITO = depósitos de las ventas + cobranza de deudas (abonos)
  const totalDepositoCobrado = (Number(totDep) || 0) + (Number(totCob) || 0);
  const hastaEfectivo = hasta && hasta >= desde ? hasta : desde;

  const buscar = async (e) => {
    if (e) e.preventDefault();
    if (!desde) { avisar('error', 'Elige la fecha desde.'); return; }
    if (hasta && hasta < desde) setHasta(desde);
    setCargando(true);
    try {
      const params = new URLSearchParams({ desde, hasta: hastaEfectivo });
      const r = await api.get('/api/reportes/ventas?' + params.toString());
      let rp = { items: [], total: 0, faltaTabla: false };
      let errorPagos = '';
      try {
        rp = await api.get('/api/reportes/pagos?' + params.toString());
      } catch (err) {
        errorPagos = err.message;
      }
      setItems(r.items || []);
      setTotDep(r.total_deposito || 0);
      setTotVen(r.total_venta || 0);
      setPagos(rp.items || []);
      setTotCob(rp.total || 0);
      setPagosFaltaTabla(!!rp.faltaTabla);
      setPagosError(errorPagos);
      setBuscado(true);
      if (!r.items || !r.items.length) avisar('error', 'Sin ventas en esas fechas.');
    } catch (err) {
      avisar('error', err.message);
    } finally {
      setCargando(false);
    }
  };

  const rangoTxt = 'Del ' + desde + ' al ' + hastaEfectivo;

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

    const filasCobranza = pagos.map((p) => [
      p.fecha_pago, p.codigo, p.fardo, p.cliente, p.celular, p.monto, p.nota
    ]);

    const lineas = [
      ['REPORTE DE VENTAS POR FECHAS'],
      ['CAPRICORNIO DETALLES'],
      [rangoTxt],
      [],
      ['Fecha venta', 'Código', 'Fardo', 'Precio original', 'Precio venta', 'Depósito', 'Cliente', 'Celular', 'Ciudad', 'Estado', 'Ubicación', 'Observación', 'F. entrega'],
      ...filasDatos,
      [],
      ['', '', 'TOTAL GENERAL (' + items.length + ' ventas)', totalOriginal, totVen, totalDepositoCobrado],
      ...(pagos.length ? [
        [],
        ['COBRANZA DE DEUDAS POR FECHA DE PAGO'],
        ['Fecha pago', 'Código', 'Fardo', 'Cliente', 'Celular', 'Monto', 'Nota'],
        ...filasCobranza,
        [],
        ['', '', '', '', 'TOTAL COBRANZA', totCob]
      ] : [])
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

    const cobranzaHtml = pagos.length
      ? '<h3 style="margin-top:18px">💳 COBRANZA DE DEUDAS POR FECHA DE PAGO</h3>'
        + '<table><thead><tr><th>Fecha pago</th><th>Código</th><th>Fardo</th><th>Cliente</th><th>Celular</th><th>Monto</th><th>Nota</th></tr></thead><tbody>'
        + pagos.map((p) => '<tr>' + [p.fecha_pago, p.codigo, p.fardo, p.cliente, p.celular, p.monto, p.nota]
          .map(escH).map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('')
        + '</tbody><tfoot><tr class="tot"><td colspan="5">TOTAL COBRANZA (' + pagos.length + ' abonos)</td><td>' + escH(totCob) + '</td><td></td></tr></tfoot></table>'
      : '';

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
      + '<tfoot><tr class="tot"><td colspan="3">TOTAL GENERAL (' + items.length + ' ventas)</td><td>' + escH(totalOriginal) + '</td><td>' + escH(totVen) + '</td><td>' + escH(totalDepositoCobrado) + '</td><td colspan="7"></td></tr></tfoot></table>'
      + cobranzaHtml
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
            <input type="date" value={desde} onChange={(e) => {
              const v = e.target.value;
              setDesde(v);
              if (!hasta || hasta < v) setHasta(v);
            }} required />
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
          <h2>💳 Cobranza de deudas por fecha de pago ({pagos.length})</h2>
          <p className="hint">Abonos registrados {rangoTxt}. Se controlan por la fecha en que se pagó y <strong>no se suman al total de ventas</strong>.</p>
          {pagosError ? (
            <p className="error">No se pudo cargar la cobranza: {pagosError}</p>
          ) : pagosFaltaTabla ? (
            <p className="error">Falta crear la tabla de pagos. Ejecuta <strong>auth-supabase/PAGOS_VENTA.sql</strong> en Supabase.</p>
          ) : pagos.length === 0 ? (
            <p className="empty">Sin abonos registrados en el rango.</p>
          ) : (
            <div className="tabla tabla-ancha">
              <table>
                <thead>
                  <tr><th>Fecha pago</th><th>Código</th><th>Fardo</th><th>Cliente</th><th>Celular</th><th>Monto</th><th>Nota</th></tr>
                </thead>
                <tbody>
                  {pagos.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Fecha pago">{p.fecha_pago}</td>
                      <td data-label="Código">{p.codigo || '—'}</td>
                      <td data-label="Fardo">{p.fardo || '—'}</td>
                      <td data-label="Cliente">{p.cliente || '—'}</td>
                      <td data-label="Celular">{p.celular || '—'}</td>
                      <td data-label="Monto"><strong>Bs {Number(p.monto).toFixed(2)}</strong></td>
                      <td data-label="Nota">{p.nota || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5"><strong>TOTAL COBRADO ({pagos.length} abonos)</strong></td>
                    <td data-label="Total"><strong style={{ color: '#7e22ce' }}>Bs {Number(totCob).toFixed(2)}</strong></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {buscado && (
        <div className="card">
          <h2>🧾 Ventas {rangoTxt} ({items.length}) · {grupos.length} fardo{grupos.length === 1 ? '' : 's'}</h2>
          {pagos.length > 0 && (
            <p className="success" style={{ margin: '4px 0 10px' }}>
              💳 Cobranza de deudas en el rango: <strong>Bs {Number(totCob).toFixed(2)}</strong> ({pagos.length} abono{pagos.length === 1 ? '' : 's'}). El detalle está en la sección <strong>Cobranza de deudas</strong>.
            </p>
          )}
          {(items.length > 0 || pagos.length > 0) && (
            <div className="actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <button className="btn-entregar" onClick={exportarExcel}>📥 Reporte Excel</button>
              <button className="btn-edit" onClick={exportarPDF}>📄 Reporte PDF</button>
            </div>
          )}
          {items.length === 0 ? (
            <p className="empty">Sin ventas en esas fechas.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 16px', minWidth: 180 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total Depósito</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#b45309' }}>Bs {totalDepositoCobrado.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: '#92400e' }}>Depósitos + cobranza</div>
                </div>
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '10px 16px', minWidth: 180 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total Precio Venta</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#15803d' }}>Bs {Number(totVen).toFixed(2)}</div>
                </div>
                <div style={{ background: '#e0e7ff', border: '1px solid #a5b4fc', borderRadius: 10, padding: '10px 16px', minWidth: 180 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#3730a3', textTransform: 'uppercase', letterSpacing: '.04em' }}>Ventas / Fardos</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#3730a3' }}>{items.length} · {grupos.length}</div>
                </div>
                <div style={{ background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: 10, padding: '10px 16px', minWidth: 180 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '.04em' }}>Cobranza de deudas</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#7e22ce' }}>Bs {Number(totCob).toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: '#6b21a8' }}>{pagos.length} abono(s) · no suma a ventas</div>
                </div>
              </div>
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
                            📦 FARDO: {g.fardo} · {g.items.length} venta{g.items.length === 1 ? '' : 's'} · Depósito: Bs {Number(g.totalDeposito).toFixed(2)}
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
                          <td data-label="P. orig. total">{g.totalOriginal}</td>
                          <td data-label="P. venta total">{g.totalVenta}</td>
                          <td data-label="Depósito total"><strong style={{ color: '#b45309' }}>Bs {Number(g.totalDeposito).toFixed(2)}</strong></td>
                          <td colSpan="7"></td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3"><strong>TOTAL GENERAL ({items.length} ventas)</strong></td>
                      <td data-label="P. orig. total"><strong>{totalOriginal}</strong></td>
                      <td data-label="P. venta total"><strong>{Number(totVen).toFixed(2)}</strong></td>
                      <td data-label="Depósito total"><strong style={{ color: '#b45309' }}>Bs {totalDepositoCobrado.toFixed(2)}</strong></td>
                      <td colSpan="7"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="hint">Agrupado por tipo de fardo y ordenado por código · Total Depósito (depósitos + cobranza): <strong>Bs {totalDepositoCobrado.toFixed(2)}</strong> · Total Precio venta: <strong>Bs {Number(totVen).toFixed(2)}</strong></p>
            </>
          )}
        </div>
      )}
    </>
  );
}
