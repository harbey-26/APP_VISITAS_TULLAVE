import { describe, it, expect } from 'vitest';
import { getDistanceInMeters } from '../src/utils/distance.js';

// El geofencing depende de esta función: un agente no puede iniciar/finalizar
// una visita a más de 1500 m del inmueble (5000 m si es admin).
describe('getDistanceInMeters (Haversine)', () => {
    it('devuelve 0 para el mismo punto', () => {
        expect(getDistanceInMeters(4.6097, -74.0817, 4.6097, -74.0817)).toBe(0);
    });

    it('≈1 km para 0.009° de latitud (1° lat ≈ 111.13 km)', () => {
        const d = getDistanceInMeters(4.6097, -74.0817, 4.6187, -74.0817);
        expect(d).toBeGreaterThan(990);
        expect(d).toBeLessThan(1010);
    });

    it('distingue el umbral de geofencing de agente (1500 m)', () => {
        // ~1.2 km: dentro del rango permitido
        const cerca = getDistanceInMeters(4.6097, -74.0817, 4.6205, -74.0817);
        // ~2.2 km: fuera del rango
        const lejos = getDistanceInMeters(4.6097, -74.0817, 4.6295, -74.0817);
        expect(cerca).toBeLessThan(1500);
        expect(lejos).toBeGreaterThan(1500);
    });

    it('es simétrica', () => {
        const ida = getDistanceInMeters(4.60, -74.08, 4.65, -74.10);
        const vuelta = getDistanceInMeters(4.65, -74.10, 4.60, -74.08);
        expect(ida).toBeCloseTo(vuelta, 6);
    });
});
