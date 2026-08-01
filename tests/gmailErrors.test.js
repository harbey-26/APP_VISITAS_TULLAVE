import { describe, it, expect } from 'vitest';
import { explainGmailSendError } from '../src/utils/gmailErrors.js';

// Cuerpos reales de error de la API de Google (formato clásico y formato nuevo)
const bodyApiDisabled = JSON.stringify({
    error: {
        code: 403,
        message: 'Gmail API has not been used in project 12345 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=12345 then retry.',
        errors: [{ message: '…', domain: 'usageLimits', reason: 'accessNotConfigured' }],
        status: 'PERMISSION_DENIED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }],
    },
});

const bodyInsufficientScope = JSON.stringify({
    error: {
        code: 403,
        message: 'Request had insufficient authentication scopes.',
        status: 'PERMISSION_DENIED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
    },
});

const bodyInsufficientPermissions = JSON.stringify({
    error: {
        code: 403,
        message: 'Insufficient Permission',
        errors: [{ message: 'Insufficient Permission', domain: 'global', reason: 'insufficientPermissions' }],
    },
});

const bodyDailyLimit = JSON.stringify({
    error: {
        code: 403,
        message: 'User-rate limit exceeded.',
        errors: [{ reason: 'dailyLimitExceeded', domain: 'usageLimits' }],
    },
});

const bodyDelegation = JSON.stringify({
    error: {
        code: 403,
        message: 'Delegation denied for usuario@tullave.com',
        errors: [{ reason: 'forbidden', domain: 'global' }],
    },
});

describe('explainGmailSendError', () => {
    it('detecta la API de Gmail deshabilitada y NO recomienda reconectar', () => {
        const msg = explainGmailSendError(403, bodyApiDisabled);
        expect(msg).toContain('API de Gmail no está habilitada');
        expect(msg).toContain('console.cloud.google.com');
        expect(msg).not.toContain('volver a conectar');
    });

    it('detecta scope insuficiente (formato nuevo) y pide reconectar marcando la casilla', () => {
        const msg = explainGmailSendError(403, bodyInsufficientScope);
        expect(msg).toContain('gmail.send');
        expect(msg).toContain('volver a conectar');
        expect(msg).toContain('casilla');
    });

    it('detecta scope insuficiente (formato clásico insufficientPermissions)', () => {
        const msg = explainGmailSendError(403, bodyInsufficientPermissions);
        expect(msg).toContain('gmail.send');
        expect(msg).toContain('volver a conectar');
    });

    it('detecta límite de envío y pide reintentar después', () => {
        const msg = explainGmailSendError(403, bodyDailyLimit);
        expect(msg).toContain('límite');
        expect(msg).not.toContain('reconectar');
    });

    it('detecta Delegation denied como problema de cuenta remitente', () => {
        const msg = explainGmailSendError(403, bodyDelegation);
        expect(msg).toContain('remitente');
    });

    it('trata 401 como sesión expirada/revocada', () => {
        const msg = explainGmailSendError(401, JSON.stringify({ error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } }));
        expect(msg).toContain('expiró o fue revocada');
    });

    it('con cuerpo no-JSON devuelve mensaje genérico con el status', () => {
        const msg = explainGmailSendError(500, '<html>Internal error</html>');
        expect(msg).toContain('500');
        expect(msg).toContain('logs del servidor');
    });

    it('con cuerpo vacío no explota', () => {
        const msg = explainGmailSendError(403, '');
        expect(msg).toContain('403');
    });
});
