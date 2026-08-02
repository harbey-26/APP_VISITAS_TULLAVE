// Limitador de tasa por clave (IP, correo, token) en memoria — ventana
// deslizante, sin dependencias nuevas. El backend corre en una sola instancia
// de Railway, así que un contador en proceso es suficiente; si algún día hay
// varias réplicas habría que moverlo a la BD o a Redis.

const ventanas = new Map(); // clave -> array de timestamps

// Limpieza perezosa: evita que el Map crezca sin fin con claves viejas.
let ultimaLimpieza = Date.now();
function limpiar(maxEdadMs) {
    const ahora = Date.now();
    if (ahora - ultimaLimpieza < 60_000) return;
    ultimaLimpieza = ahora;
    for (const [k, marcas] of ventanas) {
        const vivas = marcas.filter((t) => ahora - t < maxEdadMs);
        if (vivas.length === 0) ventanas.delete(k);
        else ventanas.set(k, vivas);
    }
}

// Devuelve true si la acción se permite; false si superó el tope.
export function permitir(clave, maximo, ventanaMs) {
    limpiar(ventanaMs);
    const ahora = Date.now();
    const marcas = (ventanas.get(clave) || []).filter((t) => ahora - t < ventanaMs);
    if (marcas.length >= maximo) {
        ventanas.set(clave, marcas);
        return false;
    }
    marcas.push(ahora);
    ventanas.set(clave, marcas);
    return true;
}

// IP del cliente detrás del proxy de Railway (x-forwarded-for) con respaldo
// a la conexión directa.
export function ipDe(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || 'desconocida';
}

// Middleware listo para usar: limita por IP.
export function limitePorIp({ maximo, ventanaMs, mensaje }) {
    return (req, res, next) => {
        if (!permitir(`ip:${req.baseUrl}${req.path}:${ipDe(req)}`, maximo, ventanaMs)) {
            return res.status(429).json({ error: mensaje });
        }
        next();
    };
}

// Solo para tests: reinicia el estado.
export function _reset() {
    ventanas.clear();
}
