import { describe, it, expect } from 'vitest';
import { festivosColombia, esDiaHabil, sumarDiasHabiles, diasHabilesEntre } from '../src/utils/diasHabiles.js';

describe('festivosColombia 2026 (calendario oficial)', () => {
    const f = festivosColombia(2026);
    it('fijos', () => {
        for (const d of ['2026-01-01', '2026-05-01', '2026-07-20', '2026-08-07', '2026-12-08', '2026-12-25']) {
            expect(f.has(d), d).toBe(true);
        }
    });
    it('Semana Santa (Pascua = 5 de abril de 2026)', () => {
        expect(f.has('2026-04-02'), 'Jueves Santo').toBe(true);
        expect(f.has('2026-04-03'), 'Viernes Santo').toBe(true);
    });
    it('relativos a Pascua trasladados a lunes', () => {
        expect(f.has('2026-05-18'), 'Ascensión').toBe(true);
        expect(f.has('2026-06-08'), 'Corpus Christi').toBe(true);
        expect(f.has('2026-06-15'), 'Sagrado Corazón').toBe(true);
    });
    it('Emiliani: se corren al lunes siguiente', () => {
        expect(f.has('2026-01-12'), 'Reyes (6 ene → lunes 12)').toBe(true);
        expect(f.has('2026-01-06'), 'el 6 no es festivo en 2026').toBe(false);
        expect(f.has('2026-03-23'), 'San José (19 mar → lunes 23)').toBe(true);
        expect(f.has('2026-06-29'), 'San Pedro cae lunes: se queda').toBe(true);
        expect(f.has('2026-08-17'), 'Asunción (15 ago sábado → lunes 17)').toBe(true);
        expect(f.has('2026-10-12'), 'Día de la Raza cae lunes: se queda').toBe(true);
        expect(f.has('2026-11-02'), 'Todos los Santos (1 nov domingo → lunes 2)').toBe(true);
        expect(f.has('2026-11-16'), 'Ind. Cartagena (11 nov miércoles → lunes 16)').toBe(true);
    });
    it('tiene exactamente 18 festivos', () => {
        expect(f.size).toBe(18);
    });
});

describe('esDiaHabil', () => {
    it('lunes a viernes normales sí', () => {
        expect(esDiaHabil('2026-08-03')).toBe(true);  // lunes
        expect(esDiaHabil('2026-08-06')).toBe(true);  // jueves
    });
    it('fines de semana no', () => {
        expect(esDiaHabil('2026-08-01')).toBe(false); // sábado
        expect(esDiaHabil('2026-08-02')).toBe(false); // domingo
    });
    it('festivos no', () => {
        expect(esDiaHabil('2026-08-07')).toBe(false); // Batalla de Boyacá (viernes)
        expect(esDiaHabil('2026-08-17')).toBe(false); // Asunción trasladada
    });
});

describe('sumarDiasHabiles', () => {
    it('salta fin de semana', () => {
        // Viernes 31 jul + 1 hábil = lunes 3 ago
        expect(sumarDiasHabiles('2026-07-31', 1)).toBe('2026-08-03');
    });
    it('salta festivos: 15 hábiles desde el 31 jul cruza Boyacá (7 ago) y Asunción (17 ago)', () => {
        // hábiles: ago 3,4,5,6, 10,11,12,13,14, 18,19,20,21, 24,25 → el 15º es el 25 ago
        expect(sumarDiasHabiles('2026-07-31', 15)).toBe('2026-08-25');
    });
    it('n=0 devuelve la misma fecha', () => {
        expect(sumarDiasHabiles('2026-08-03', 0)).toBe('2026-08-03');
    });
});

describe('diasHabilesEntre', () => {
    it('cuenta excluyendo la inicial e incluyendo la final', () => {
        expect(diasHabilesEntre('2026-07-31', '2026-08-03')).toBe(1); // solo el lunes 3
        expect(diasHabilesEntre('2026-07-31', '2026-08-25')).toBe(15);
    });
    it('rango invertido o inválido → 0', () => {
        expect(diasHabilesEntre('2026-08-10', '2026-08-03')).toBe(0);
        expect(diasHabilesEntre('', '2026-08-03')).toBe(0);
    });
});
