// Genera y descarga un archivo .xlsx con imágenes incrustadas (si se indican).
// columnas: [{ header, key, width }]
// filas:    [[valor, valor, ...], ...]  (mismo orden que las columnas)
// fotos:    [{ url } | null]  — una por fila; la imagen se coloca en la última columna.
export async function generarExcel({ nombre, columnas, filas, fotos = [] }) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Datos');
  ws.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FF422006' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAB308' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Descarga de imágenes en paralelo
  const imagenes = await Promise.all(
    filas.map(async (_, i) => {
      const f = fotos[i];
      if (!f || !f.url) return null;
      try {
        const r = await fetch(f.url);
        if (!r.ok) return null;
        const buffer = await r.arrayBuffer();
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : 'jpeg';
        return { buffer, ext };
      } catch {
        return null;
      }
    })
  );

  const colFoto = columnas.length - 1;
  filas.forEach((fila, i) => {
    const row = ws.addRow(fila);
    row.height = 80;
    row.eachCell((c) => { c.alignment = { vertical: 'middle' }; });
    const img = imagenes[i];
    if (img) {
      const id = wb.addImage({ buffer: img.buffer, extension: img.ext });
      ws.addImage(id, {
        tl: { col: colFoto, row: row.number - 1 },
        ext: { width: 100, height: 100 },
        editAs: 'oneCell'
      });
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre + '.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
