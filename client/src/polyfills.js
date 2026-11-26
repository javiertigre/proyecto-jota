// Compatibilidad: pdf.js (usado para leer los extractos PDF) necesita
// Promise.withResolvers, disponible solo en navegadores recientes.
if (typeof Promise !== 'undefined' && typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
