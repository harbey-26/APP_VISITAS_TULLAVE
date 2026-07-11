import { describe, it, expect } from 'vitest';
import {
    CONTRACT_TEMPLATES, emptyFormData, prefillFromVisit,
    validateContractData, fieldApplies,
} from '../src/utils/contractTemplates.js';
import { buildContractDocument } from '../src/utils/contractDocument.js';

// Integridad de las definiciones de plantilla.
describe('CONTRACT_TEMPLATES', () => {
    it('define los dos tipos con secciones y campos con key/label/type', () => {
        for (const type of ['ADMINISTRACION', 'ARRENDAMIENTO']) {
            const t = CONTRACT_TEMPLATES[type];
            expect(t.sections.length).toBeGreaterThan(0);
            for (const s of t.sections) {
                for (const f of s.fields) {
                    expect(f.key, `${type}/${s.title}`).toBeTruthy();
                    expect(f.label).toBeTruthy();
                    expect(f.type).toBeTruthy();
                }
            }
        }
    });

    it('no repite keys dentro de una plantilla', () => {
        for (const t of Object.values(CONTRACT_TEMPLATES)) {
            const keys = t.sections.flatMap((s) => s.fields.map((f) => f.key));
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
});

describe('emptyFormData / fieldApplies', () => {
    it('aplica defaults (checkbox, listas, fecha de hoy)', () => {
        const d = emptyFormData('ARRENDAMIENTO');
        expect(d.deudores).toEqual([]);
        expect(d.ciudadFirma).toBe('Bogotá D.C.');
        expect(d.duracionMeses).toBe('12');
        expect(d.fechaFirma).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('showIf oculta campos condicionados', () => {
        const field = { key: 'numeroGarajes', showIf: { key: 'garajes', equals: true } };
        expect(fieldApplies(field, { garajes: false })).toBe(false);
        expect(fieldApplies(field, { garajes: true })).toBe(true);
    });
});

describe('prefillFromVisit', () => {
    const visit = {
        clientName: 'Irma Lucía Valenzuela',
        clientPhone: '3142154621',
        clientEmail: 'milu@example.com',
        property: { address: 'KR 135 17 84 TO 2 AP 1501', client: 'Estación Fontibón PH' },
    };

    it('mapea cliente y propiedad a los campos de administración', () => {
        const d = prefillFromVisit('ADMINISTRACION', visit);
        expect(d.propietarioNombre).toBe('Irma Lucía Valenzuela');
        expect(d.propietarioTelefono).toBe('3142154621');
        expect(d.direccionInmueble).toBe('KR 135 17 84 TO 2 AP 1501');
        expect(d.conjunto).toBe('Estación Fontibón PH');
    });

    it('mapea al arrendatario en arrendamiento', () => {
        const d = prefillFromVisit('ARRENDAMIENTO', visit);
        expect(d.arrendatarioNombre).toBe('Irma Lucía Valenzuela');
        expect(d.direccionInmueble).toBe('KR 135 17 84 TO 2 AP 1501');
    });

    it('tolera visita nula', () => {
        expect(prefillFromVisit('ADMINISTRACION', null)).toEqual({});
    });
});

describe('validateContractData', () => {
    it('reporta los requeridos faltantes', () => {
        const errors = validateContractData('ADMINISTRACION', emptyFormData('ADMINISTRACION'));
        expect(errors.some((e) => e.includes('Nombre completo'))).toBe(true);
        expect(errors.some((e) => e.includes('Canon'))).toBe(true);
    });

    it('no exige campos ocultos por showIf', () => {
        const data = { ...emptyFormData('ADMINISTRACION'), garajes: false };
        const errors = validateContractData('ADMINISTRACION', data);
        expect(errors.some((e) => e.includes('garaje'))).toBe(false);
    });

    it('valida requeridos dentro de la lista de deudores', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), deudores: [{ nombre: 'Ramón' }] };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Deudor solidario 1'))).toBe(true);
    });

    it('rechaza montos no numéricos', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), canon: 'abc' };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Canon'))).toBe(true);
    });

    it('tipo desconocido', () => {
        expect(validateContractData('OTRO', {})).toEqual(['Tipo de contrato desconocido']);
    });
});

describe('buildContractDocument', () => {
    const textoCompleto = (doc) => doc.blocks
        .map((b) => [b.lead, b.text, b.label, b.value].filter(Boolean).join(' '))
        .join('\n');

    it('administración: interpola datos en cuadro resumen y cláusulas', () => {
        const data = {
            ...emptyFormData('ADMINISTRACION'),
            propietarioNombre: 'IRMA LUCÍA VALENZUELA',
            canon: '1047100',
            fianzaPct: '3',
            fechaInicio: '2026-08-01',
            regimenPH: true,
            cuotaAdministracion: '152900',
        };
        const doc = buildContractDocument('ADMINISTRACION', data);
        expect(doc.title).toBe('CONTRATO DE ADMINISTRACIÓN DE INMUEBLES'); // plural, como la proforma
        expect(doc.pageHeader.title).toBe('CONTRATO DE ADMINISTRACIÓN DE INMUEBLES');
        const table = doc.blocks.find((b) => b.kind === 'table');
        const flat = table.rows.map((r) => r.join(': ')).join('\n');
        expect(flat).toContain('IRMA LUCÍA VALENZUELA');
        expect(flat).toContain('UN MILLÓN CUARENTA Y SIETE MIL CIEN PESOS ($1.047.100)');
        const leads = doc.blocks.filter((b) => b.kind === 'clause').map((b) => b.lead).join('\n');
        expect(leads).toContain('CLÁUSULA VIGÉSIMA PRIMERA');
        expect(textoCompleto(doc)).toContain('Ley 527 de 1999');
    });

    it('arrendamiento: TERCERA lleva el canon (no la suma) y la cuota aparte', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            arrendatarioNombre: 'MARÍA RIVERA',
            canon: '1047100',
            cuotaAdministracion: '152900',
            fechaInicio: '2026-08-01',
            deudores: [{ nombre: 'RAMÓN MARTÍNEZ', cedula: '79.906.371', lugarExpedicion: 'Bogotá D.C.' }],
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const tercera = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('TERCERA'));
        expect(tercera.text).toContain('arrendamiento es la suma de UN MILLÓN CUARENTA Y SIETE MIL CIEN PESOS ($1.047.100)');
        expect(tercera.text).toContain('CIENTO CINCUENTA Y DOS MIL NOVECIENTOS PESOS ($152.900)');
        expect(tercera.text).not.toContain('$1.200.000'); // nunca la suma
        const texto = textoCompleto(doc);
        expect(texto).toContain('RAMÓN MARTÍNEZ');
        expect(texto).toContain('primero (01) de agosto de dos mil veintiséis (2026)');
        const firmas = doc.blocks.filter((b) => b.kind === 'signature');
        expect(firmas.length).toBe(3); // arrendador + arrendatario + 1 deudor
        expect(doc.pageHeader.code).toBe('F-GCT-005'); // código de formato de la proforma
    });

    it('no duplica la ciudad si la dirección de Google ya la trae', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            direccionInmueble: 'Cl. 17d #111a-35, Bogotá, Colombia',
            ciudadInmueble: 'Bogotá D.C.',
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const segunda = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('SEGUNDA'));
        expect(segunda.text).toContain('Cl. 17d #111a-35, Bogotá, Colombia.');
        expect(segunda.text).not.toContain('Colombia, Bogotá D.C.');
        expect(segunda.text).not.toMatch(/\.\./); // sin doble punto final
    });

    it('encabezado usa líneas etiqueta/valor (kv), no tabla, como la proforma', () => {
        const doc = buildContractDocument('ARRENDAMIENTO', emptyFormData('ARRENDAMIENTO'));
        expect(doc.blocks.some((b) => b.kind === 'kv' && b.label === 'ARRENDADOR (ES):')).toBe(true);
        expect(doc.blocks.some((b) => b.kind === 'table')).toBe(false);
    });

    it('sin cuota de administración usa la variante "no aplica"', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), canon: '1000000' };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const quinta = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('QUINTA'));
        expect(quinta.text).toContain('No aplica');
        const primera = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('PRIMERA'));
        expect(primera.text).not.toContain('una cuota de administración');
    });

    it('devuelve null para tipo desconocido', () => {
        expect(buildContractDocument('OTRO', {})).toBeNull();
    });
});
