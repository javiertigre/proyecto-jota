// Pie de página con paginación (10 por página)
export default function Paginacion({ total, pagina, setPagina, porPagina = 10 }) {
  const paginas = Math.ceil(total / porPagina);
  if (paginas <= 1) return null;

  const ir = (p) => setPagina(Math.min(Math.max(1, p), paginas));

  // Ventana de botones alrededor de la página actual
  const inicio = Math.max(1, Math.min(pagina - 3, paginas - 6));
  const nums = [];
  for (let i = inicio; i <= Math.min(paginas, inicio + 6); i++) nums.push(i);

  return (
    <div className="paginacion">
      <button disabled={pagina <= 1} onClick={() => ir(pagina - 1)}>← Anterior</button>
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => ir(n)}
          className={n === pagina ? 'pag-active' : ''}
        >
          {n}
        </button>
      ))}
      <button disabled={pagina >= paginas} onClick={() => ir(pagina + 1)}>Siguiente →</button>
      <small className="hint">Página {pagina} de {paginas} ({total})</small>
    </div>
  );
}
