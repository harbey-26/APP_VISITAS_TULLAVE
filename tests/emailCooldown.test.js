import { describe, it, expect } from 'vitest';
import { EMAIL_COOLDOWN_MS, emailCooldownRemainingMs, emailCooldownMessage } from '../src/utils/emailCooldown.js';

const NOW = new Date('2026-08-01T10:00:00Z').getTime();

describe('emailCooldownRemainingMs', () => {
    it('sin envío previo no hay espera', () => {
        expect(emailCooldownRemainingMs(null, NOW)).toBe(0);
        expect(emailCooldownRemainingMs(undefined, NOW)).toBe(0);
    });

    it('recién enviado bloquea la hora completa', () => {
        expect(emailCooldownRemainingMs(new Date(NOW), NOW)).toBe(EMAIL_COOLDOWN_MS);
    });

    it('a los 20 minutos faltan 40', () => {
        const hace20 = new Date(NOW - 20 * 60_000);
        expect(emailCooldownRemainingMs(hace20, NOW)).toBe(40 * 60_000);
    });

    it('pasada la hora ya se puede reenviar', () => {
        const hace61 = new Date(NOW - 61 * 60_000);
        expect(emailCooldownRemainingMs(hace61, NOW)).toBe(0);
    });

    it('justo al cumplirse la hora ya se puede', () => {
        const hace60 = new Date(NOW - EMAIL_COOLDOWN_MS);
        expect(emailCooldownRemainingMs(hace60, NOW)).toBe(0);
    });

    it('acepta fecha como string ISO (como llega serializada del API)', () => {
        const iso = new Date(NOW - 30 * 60_000).toISOString();
        expect(emailCooldownRemainingMs(iso, NOW)).toBe(30 * 60_000);
    });

    it('fecha inválida no bloquea (falla abierto)', () => {
        expect(emailCooldownRemainingMs('no-es-fecha', NOW)).toBe(0);
    });
});

describe('emailCooldownMessage', () => {
    it('redondea hacia arriba los minutos', () => {
        expect(emailCooldownMessage(30.5 * 60_000)).toContain('31 minutos');
    });

    it('singular para el último minuto', () => {
        expect(emailCooldownMessage(30_000)).toContain('1 minuto');
        expect(emailCooldownMessage(30_000)).not.toContain('minutos');
    });
});
