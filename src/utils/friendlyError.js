/**
 * Traducción de errores técnicos a mensajes legibles para el usuario.
 *
 * Módulo puro (sin fetch ni config) para poder testearse — utils/api.js lo
 * re-exporta y el resto de la app lo importa de ahí.
 *
 * La regla clave: se decide por el CÓDIGO HTTP real (`err.status`, que pone
 * `apiFetch`), NUNCA por lo que diga el texto del error. Un mensaje del
 * servidor puede mencionar "token" o un número sin que la sesión del usuario
 * tenga nada que ver — p. ej. el token de Google revocado, que llega dentro de
 * un 400. Traducir eso a "tu sesión expiró" mandaba al usuario a iniciar
 * sesión una y otra vez sin arreglar nada (reporte del cliente, ago 2026).
 */
export function friendlyError(err) {
    const msg = err?.message || String(err);
    if (
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        msg.includes('net::ERR')
    ) {
        return 'Sin conexión. Verifica tu internet e intenta de nuevo.';
    }

    const status = err?.status;
    if (status) {
        if (status === 429) return 'Demasiados intentos. Espera unos minutos.';
        if (status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
        if (status === 403) return 'No tienes permiso para realizar esta acción.';
        if (status === 500) return 'Error en el servidor. Intenta más tarde.';
        // 400 / 404 / 409 / 503… → el mensaje del servidor es el útil
        return msg;
    }

    // Errores sin status (fetch crudo fuera de apiFetch): heurística por código
    if (msg.includes('429')) return 'Demasiados intentos. Espera unos minutos.';
    if (msg.includes('401')) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (msg.includes('403')) return 'No tienes permiso para realizar esta acción.';
    if (msg.includes('500')) return 'Error en el servidor. Intenta más tarde.';
    return msg;
}
