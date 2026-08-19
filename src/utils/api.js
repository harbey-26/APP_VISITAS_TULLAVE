/**
 * M5: Cliente HTTP centralizado.
 * - Inyecta el token de autorización automáticamente desde localStorage
 * - Traduce errores técnicos a mensajes amigables
 * - Lanza Error con el mensaje del servidor en errores HTTP
 */

import { API_URL } from '../config';

// La traducción de errores vive aparte (módulo puro, con tests). Se re-exporta
// para que el resto de la app la siga importando desde utils/api.
export { friendlyError } from './friendlyError';

/**
 * Wrapper de fetch con token automático y manejo de errores.
 * @param {string} path  - Ruta relativa, ej. '/api/visits'
 * @param {object} opts  - { method, body, token } — token se lee de localStorage si no se pasa
 */
export async function apiFetch(path, { method = 'GET', body, token } = {}) {
    const authToken = token || localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const options = { method, headers };
    if (body !== undefined) options.body = JSON.stringify(body);

    // M7: Cancelar peticiones que tarden más de 30 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    options.signal = controller.signal;

    let res;
    try {
        res = await fetch(`${API_URL}${path}`, options);
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('La petición tardó demasiado. Verifica tu conexión.');
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }

    // A7: Notificar globalmente cuando el token es rechazado para forzar logout
    if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // El código viaja en el Error para que friendlyError no tenga que
        // adivinarlo leyendo el texto
        const error = new Error(data.error || `Error ${res.status}`);
        error.status = res.status;
        throw error;
    }

    return res.json();
}
