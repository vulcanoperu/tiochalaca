// ── Cola de Pre-fetch Secuencial Global ──────────────────────────────
// Permite descargar análisis pesados en segundo plano (1 a la vez)
// sin saturar el límite de conexiones concurrentes del navegador (6 en Chrome).

let prefetchQueue = [];
let isPrefetching = false;
let processedIds = new Set();

export const enqueuePrefetch = (fixtures) => {
  const BACKEND = import.meta.env.VITE_BACKEND_URL || '';
  
  fixtures.forEach(f => {
    const id = f?.fixture?.id;
    if (id && !processedIds.has(id)) {
      prefetchQueue.push(`${BACKEND}/api/espn/match/${id}/analysis`);
      processedIds.add(id);
    }
  });

  if (!isPrefetching) {
    processQueue();
  }
};

const processQueue = async () => {
  if (prefetchQueue.length === 0) {
    isPrefetching = false;
    return;
  }
  
  isPrefetching = true;
  const url = prefetchQueue.shift();

  try {
    // Retardo artificial de 1 segundo entre cada petición
    // para asegurar que siempre haya conexiones libres para las interacciones del usuario.
    await new Promise(res => setTimeout(res, 1000));
    
    // Fire and forget, no nos importa la respuesta, solo que el servidor 
    // lo guarde en su caché de memoria. Usamos priority: 'low' si el navegador lo soporta.
    await fetch(url, { keepalive: true, priority: 'low' }).catch(() => {});
  } catch (e) {
    // Ignorar errores
  }

  // Siguiente en la cola
  processQueue();
};
