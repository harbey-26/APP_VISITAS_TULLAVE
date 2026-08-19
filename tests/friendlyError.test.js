import { describe, it, expect } from 'vitest';
import { friendlyError } from '../src/utils/friendlyError.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

describe('friendlyError', () => {
    it('traduce la falta de red', () => {
        expect(friendlyError(new Error('Failed to fetch')))
            .toBe('Sin conexión. Verifica tu internet e intenta de nuevo.');
    });

    it('un 401 real sí es sesión expirada', () => {
        expect(friendlyError(httpError(401, 'Token inválido o expirado')))
            .toBe('Tu sesión expiró. Inicia sesión nuevamente.');
    });

    it('un 403 es falta de permisos', () => {
        expect(friendlyError(httpError(403, 'Acceso denegado')))
            .toBe('No tienes permiso para realizar esta acción.');
    });

    it('un 429 es exceso de intentos', () => {
        expect(friendlyError(httpError(429, 'Demasiadas solicitudes')))
            .toBe('Demasiados intentos. Espera unos minutos.');
    });

    // El bug reportado por el cliente (ago 2026): el envío de la respuesta de
    // una solicitud fallaba con 400 porque el token de GOOGLE estaba revocado,
    // y la app decía "Tu sesión expiró" — el cliente volvió a iniciar sesión
    // varias veces desde distintos dispositivos sin que cambiara nada.
    it('un 400 que menciona un token de terceros NO es sesión expirada', () => {
        const msg = 'La conexión con Google se revocó o expiró. Un administrador debe reconectarla en Ajustes.';
        expect(friendlyError(httpError(400, msg))).toBe(msg);
    });

    it('un 400 con el detalle crudo de Google tampoco', () => {
        const msg = 'Google refresh: 400 {"error":"invalid_grant","error_description":"Token has been expired or revoked."}';
        expect(friendlyError(httpError(400, msg))).toBe(msg);
    });

    it('un 409 conserva el mensaje del servidor', () => {
        const msg = 'Ya tienes una visita en curso.';
        expect(friendlyError(httpError(409, msg))).toBe(msg);
    });

    it('un 500 se generaliza', () => {
        expect(friendlyError(httpError(500, 'PrismaClientKnownRequestError'))).toBe('Error en el servidor. Intenta más tarde.');
    });

    it('sin status, cae a la heurística por código', () => {
        expect(friendlyError(new Error('Error 401'))).toBe('Tu sesión expiró. Inicia sesión nuevamente.');
        expect(friendlyError(new Error('Algo raro pasó'))).toBe('Algo raro pasó');
    });
});
