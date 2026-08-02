import { describe, it, expect, beforeEach } from 'vitest';
import { permitir, ipDe, _reset } from '../src/utils/rateLimit.js';

describe('permitir', () => {
    beforeEach(() => _reset());

    it('deja pasar hasta el máximo y luego bloquea', () => {
        const ok = [1, 2, 3].map(() => permitir('k', 3, 60_000));
        expect(ok).toEqual([true, true, true]);
        expect(permitir('k', 3, 60_000)).toBe(false);
    });

    it('las claves son independientes', () => {
        expect(permitir('a', 1, 60_000)).toBe(true);
        expect(permitir('a', 1, 60_000)).toBe(false);
        expect(permitir('b', 1, 60_000)).toBe(true);
    });

    it('con ventana vencida vuelve a permitir', async () => {
        expect(permitir('c', 1, 20)).toBe(true);
        expect(permitir('c', 1, 20)).toBe(false);
        await new Promise((r) => setTimeout(r, 30));
        expect(permitir('c', 1, 20)).toBe(true);
    });
});

describe('ipDe', () => {
    it('toma la primera IP de x-forwarded-for (proxy de Railway)', () => {
        expect(ipDe({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })).toBe('1.2.3.4');
    });

    it('cae a la IP de la conexión si no hay proxy', () => {
        expect(ipDe({ headers: {}, socket: { remoteAddress: '5.6.7.8' } })).toBe('5.6.7.8');
    });

    it('nunca devuelve vacío', () => {
        expect(ipDe({ headers: {} })).toBe('desconocida');
    });
});
