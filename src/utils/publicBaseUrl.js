// Base pública para los links que la app manda por correo/WhatsApp (PDFs
// tokenizados de contratos, liquidaciones, cartas de incremento y servicios).
//
// NUNCA construirla desde el header Host: es controlado por el cliente, y un
// Host falsificado en la petición haría que el correo al arrendatario lleve
// un link a un dominio del atacante (phishing con remitente legítimo).
// Orden: PUBLIC_BASE_URL (env) → header solo si es localhost (desarrollo) →
// dominio conocido de producción (el mismo hardcodeado en el CORS de server.js).
const PRODUCTION_URL = 'https://tu-llave-visitas-e66b.up.railway.app';

export function publicBaseUrl(req) {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
    const host = req.get('host') || '';
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
        return `${req.get('x-forwarded-proto') || req.protocol}://${host}`;
    }
    return PRODUCTION_URL;
}
