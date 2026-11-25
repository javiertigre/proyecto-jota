// Utilidad para separar un nombre completo en Nombre, Apellido Paterno y Apellido Materno.
// Se usa al registrar automáticamente clientes desde una venta o desde una dinámica.
export const dividirNombreCompleto = (nombreCompleto) => {
  const limpio = String(nombreCompleto || '').replace(/\s+/g, ' ').trim();
  const partes = limpio.split(' ').filter(Boolean);

  if (partes.length === 0) {
    return { nombre: 'Cliente', apellido_paterno: '—', apellido_materno: null };
  }
  if (partes.length === 1) {
    return { nombre: partes[0], apellido_paterno: '—', apellido_materno: null };
  }
  if (partes.length === 2) {
    return { nombre: partes[0], apellido_paterno: partes[1], apellido_materno: null };
  }
  // Caso más común: "Nombre ApellidoPaterno ApellidoMaterno"
  if (partes.length === 3) {
    return { nombre: partes[0], apellido_paterno: partes[1], apellido_materno: partes[2] };
  }

  // Con 4 o más palabras se asume "Nombres... ApellidoPaterno ApellidoMaterno"
  return {
    nombre: partes.slice(0, partes.length - 2).join(' '),
    apellido_paterno: partes[partes.length - 2],
    apellido_materno: partes[partes.length - 1]
  };
};
