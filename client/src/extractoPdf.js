// Lectura de extractos bancarios en PDF (formato "Extracto de Cuenta").
// Se usa pdf.js para obtener cada texto con su posición (x, y) y así separar
// correctamente las columnas: Descripción, Detalle, Transacción, Ingresos y Gastos.
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const RE_FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const RE_HORA = /^\d{2}:\d{2}$/;

// Algunos encabezados que se deben ignorar si el PDF los repite en cada página.
const CABECERAS = new Set([
  'Extracto de Cuenta', 'Resumen de cuenta', 'Fecha', 'Hora', 'Descripción',
  'Detalle', 'Transacción', 'Ingresos', 'Gastos', 'Cliente:', 'Número de cuenta:',
  'Producto:', 'Moneda:', 'Fecha consulta:', '(Bolivianos)'
]);

// Convierte "Bs 1.694,54" o "Bs - 400,00" en número.
function parseMonto(texto) {
  if (!/^Bs\b/i.test(texto)) return null;
  const limpio = texto
    .replace(/[^\d,.-]/g, '') // deja dígitos, coma, punto y signo
    .replace(/\./g, '')       // puntos de miles
    .replace(',', '.');       // coma decimal
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

const limpiar = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function agrupar(items) {
  const registros = [];
  let actual = null;

  for (const it of items) {
    const texto = it.texto;

    // Una fecha en la primera columna marca el inicio de un movimiento.
    const mFecha = texto.match(RE_FECHA);
    if (mFecha && it.x < 135) {
      if (actual) registros.push(actual);
      actual = {
        fecha: `${mFecha[3]}-${mFecha[2]}-${mFecha[1]}`,
        hora: null,
        desc: [],
        detalle: [],
        transaccion: [],
        ingreso: null,
        gasto: null
      };
      continue;
    }

    if (!actual) continue;

    // Si el PDF repite el encabezado, se cierra el registro en curso.
    if (texto === 'Extracto de Cuenta' || texto === 'Resumen de cuenta') {
      registros.push(actual);
      actual = null;
      continue;
    }
    if (CABECERAS.has(texto)) continue;

    // Primera columna: hora.
    if (it.x < 135) {
      if (RE_HORA.test(texto)) actual.hora = texto;
      continue;
    }

    // Las columnas del extracto, según su posición horizontal.
    if (it.x < 280) actual.desc.push(texto);
    else if (it.x < 360) actual.detalle.push(texto);
    else if (it.x < 440) actual.transaccion.push(texto);
    else {
      const monto = parseMonto(texto);
      if (monto === null) continue;
      if (it.x < 512) actual.ingreso = monto;
      else actual.gasto = Math.abs(monto);
    }
  }

  if (actual) registros.push(actual);

  return registros
    .map((r) => ({
      fecha: r.fecha,
      hora: r.hora,
      descripcion: limpiar(r.desc.join(' ')) || null,
      detalle: limpiar(r.detalle.join(' ')) || null,
      transaccion: r.transaccion.join('').replace(/\s+/g, '') || null,
      ingreso: r.ingreso,
      gasto: r.gasto
    }))
    .filter((r) => r.fecha && (r.descripcion || r.transaccion || r.ingreso !== null || r.gasto !== null));
}

export async function leerExtractoPdf(file) {
  const datos = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: datos }).promise;
  const items = [];

  for (let pagina = 1; pagina <= pdf.numPages; pagina++) {
    const page = await pdf.getPage(pagina);
    const contenido = await page.getTextContent({ normalizeWhitespace: true });
    const dePagina = contenido.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ texto: it.str.trim(), x: it.transform[4], y: it.transform[5] }));

    // Orden de lectura: de arriba hacia abajo y de izquierda a derecha.
    dePagina.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    items.push(...dePagina);
    page.cleanup();
  }

  await pdf.destroy();
  return agrupar(items);
}
