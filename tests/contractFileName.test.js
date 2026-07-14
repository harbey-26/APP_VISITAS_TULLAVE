import { describe, it, expect } from 'vitest';
import { contractFileName } from '../src/utils/contractPdf.js';
import { emptyFormData, validateContractData } from '../src/utils/contractTemplates.js';

describe('contractFileName — Código Wasi', () => {
    it('usa el Código Wasi como nombre del archivo', () => {
        const c = { type: 'ADMINISTRACION', data: { codigoWasi: '840-123' } };
        expect(contractFileName(c)).toBe('840-123.pdf');
    });

    it('sanea espacios, tildes y caracteres raros', () => {
        const c = { type: 'ARRENDAMIENTO', data: { codigoWasi: ' CÓD 840/123 ' } };
        expect(contractFileName(c)).toBe('COD-840-123.pdf');
    });

    it('sin código cae al esquema descriptivo anterior (contratos viejos)', () => {
        const c = { type: 'ADMINISTRACION', id: 7, data: { propietarioNombre: 'IRMA VALENZUELA' } };
        const name = contractFileName(c);
        expect(name).toMatch(/^contrato_administracion_irma-valenzuela_\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('código de solo símbolos no deja el nombre vacío', () => {
        const c = { type: 'ARRENDAMIENTO', id: 9, data: { codigoWasi: '///' } };
        expect(contractFileName(c)).toMatch(/^contrato_arrendamiento_/);
    });
});

describe('Código Wasi es obligatorio en ambos formularios', () => {
    it.each(['ADMINISTRACION', 'ARRENDAMIENTO'])('%s lo exige al enviar', (type) => {
        const errors = validateContractData(type, emptyFormData(type));
        expect(errors.some((e) => e.includes('Código Wasi'))).toBe(true);
    });
});
