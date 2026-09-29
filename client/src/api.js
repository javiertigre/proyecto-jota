// Cliente HTTP hacia la API Express (misma origen en prod, proxy en dev)
async function req(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: 'include', ...options });
  } catch (e) {
    // TypeError: Failed to fetch (Chrome) / NetworkError (Firefox)
    // Ocurre si el backend no está corriendo o hay bloqueo de red/CORS.
    throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté corriendo en http://localhost:3000 (o `npm run dev` en client/ para http://localhost:5173).');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
  return data;
}

export const api = {
  get: (path) => req(path),
  post: (path, body) =>
    req(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
  put: (path, body) =>
    req(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
  del: (path) => req(path, { method: 'DELETE' }),
  // multipart (fotos): sin Content-Type manual
  postForm: (path, formData) => req(path, { method: 'POST', body: formData }),
  putForm: (path, formData) => req(path, { method: 'PUT', body: formData })
};
