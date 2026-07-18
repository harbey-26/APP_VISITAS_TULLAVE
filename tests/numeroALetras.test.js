import { describe, it, expect } from 'vitest';
import { numeroALetras, formatoCifra, montoEnLetras, formatoIdentificacion } from '../src/utils/numeroALetras.js';

// Montos en letras para los contratos (Administración y Arrendamiento).
describe('numeroALetras', () => {
    it('unidades y especiales', () => {
        expect(numeroALetras(0)).toBe('cero');
        expect(numeroALetras(1)).toBe('uno');
        expect(numeroALetras(15)).toBe('quince');
        expect(numeroALetras(16)).toBe('dieciséis');
        expect(numeroALetras(21)).toBe('veintiuno');
        expect(numeroALetras(26)).toBe('veintiséis');
    });

    it('decenas y centenas', () => {
        expect(numeroALetras(31)).toBe('treinta y uno');
        expect(numeroALetras(100)).toBe('cien');
        expect(numeroALetras(101)).toBe('ciento uno');
        expect(numeroALetras(555)).toBe('quinientos cincuenta y cinco');
        expect(numeroALetras(900)).toBe('novecientos');
    });

    it('miles con apócope (un/veintiún/treinta y un)', () => {
        expect(numeroALetras(1000)).toBe('mil');
        expect(numeroALetras(21000)).toBe('veintiún mil');
        expect(numeroALetras(31000)).toBe('treinta y un mil');
        expect(numeroALetras(2026)).toBe('dos mil veintiséis');
        expect(numeroALetras(152900)).toBe('ciento cincuenta y dos mil novecientos');
    });

    it('millones', () => {
        expect(numeroALetras(1000000)).toBe('un millón');
        expect(numeroALetras(2000000)).toBe('dos millones');
        expect(numeroALetras(1047100)).toBe('un millón cuarenta y siete mil cien');
        expect(numeroALetras(21500000)).toBe('veintiún millones quinientos mil');
    });

    it('tolera strings y valores raros', () => {
        expect(numeroALetras('1047100')).toBe('un millón cuarenta y siete mil cien');
        expect(numeroALetras(null)).toBe('cero');
        expect(numeroALetras(undefined)).toBe('cero');
    });
});

describe('formatoCifra', () => {
    it('separa miles con punto (formato colombiano)', () => {
        expect(formatoCifra(1047100)).toBe('1.047.100');
        expect(formatoCifra(152900)).toBe('152.900');
        expect(formatoCifra(900)).toBe('900');
        expect(formatoCifra(0)).toBe('0');
    });
});

// #27: las identificaciones se muestran siempre con separador de miles.
describe('formatoIdentificacion', () => {
    it('separa miles con punto', () => {
        expect(formatoIdentificacion('1041980003')).toBe('1.041.980.003');
        expect(formatoIdentificacion('1100016290')).toBe('1.100.016.290');
        expect(formatoIdentificacion('80354037')).toBe('80.354.037');
    });

    it('normaliza lo que el agente ya tecleó con puntos o espacios', () => {
        expect(formatoIdentificacion('79.906.371')).toBe('79.906.371');
        expect(formatoIdentificacion('1 072 962 752')).toBe('1.072.962.752');
    });

    it('conserva el dígito de verificación del NIT', () => {
        expect(formatoIdentificacion('901090444-1')).toBe('901.090.444-1');
        expect(formatoIdentificacion('901.090.444-1')).toBe('901.090.444-1');
    });

    it('no corrompe valores vacíos ni con letras', () => {
        expect(formatoIdentificacion('')).toBe('');
        expect(formatoIdentificacion(null)).toBe('');
        expect(formatoIdentificacion(undefined)).toBe('');
        expect(formatoIdentificacion('CE 123456')).toBe('CE 123456');
    });

    it('acepta números además de strings', () => {
        expect(formatoIdentificacion(1041980003)).toBe('1.041.980.003');
    });
});

describe('montoEnLetras', () => {
    it('formato del contrato: letras en mayúsculas + cifra', () => {
        expect(montoEnLetras(1047100)).toBe('UN MILLÓN CUARENTA Y SIETE MIL CIEN PESOS ($1.047.100)');
        expect(montoEnLetras(152900)).toBe('CIENTO CINCUENTA Y DOS MIL NOVECIENTOS PESOS ($152.900)');
    });
});
