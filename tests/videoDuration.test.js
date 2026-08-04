import { describe, it, expect } from 'vitest';
import { esVideoMp4Real, duracionVideoSegundos, formatoDuracion } from '../src/utils/videoDuration.js';

// ── Constructores de átomos MP4/MOV sintéticos ──

function u32(n) {
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u64(n) {
    const alto = Math.floor(n / 0x100000000);
    return [...u32(alto), ...u32(n % 0x100000000)];
}

function tipo(t) {
    return [...t].map((c) => c.charCodeAt(0));
}

function atomo(t, payload) {
    return Uint8Array.from([...u32(8 + payload.length), ...tipo(t), ...payload]);
}

// Átomo con largesize de 64 bits (size==1)
function atomoLarge(t, payload) {
    return Uint8Array.from([...u32(1), ...tipo(t), ...u64(16 + payload.length), ...payload]);
}

function mvhdV0(timescale, duracion) {
    return atomo('mvhd', [
        0, 0, 0, 0,              // version 0 + flags
        ...u32(0), ...u32(0),    // creation + modification
        ...u32(timescale), ...u32(duracion),
        ...new Array(80).fill(0), // rate, volume, matrix, etc. — irrelevantes
    ]);
}

function mvhdV1(timescale, duracion) {
    return atomo('mvhd', [
        1, 0, 0, 0,              // version 1 + flags
        ...u64(0), ...u64(0),    // creation + modification (8 bytes c/u)
        ...u32(timescale), ...u64(duracion),
        ...new Array(80).fill(0),
    ]);
}

function concat(...partes) {
    const total = partes.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of partes) { out.set(p, off); off += p.length; }
    return out;
}

const ftyp = atomo('ftyp', [...tipo('mp42'), ...u32(0), ...tipo('mp42'), ...tipo('isom')]);

describe('esVideoMp4Real (#58)', () => {
    it('reconoce un MP4/MOV por su átomo ftyp', () => {
        expect(esVideoMp4Real(concat(ftyp, atomo('mdat', [1, 2, 3])))).toBe(true);
    });

    it('rechaza contenido que no es MP4 aunque el mimeType mienta', () => {
        expect(esVideoMp4Real(Uint8Array.from(tipo('JVBERi-4.PDF')))).toBe(false);
        expect(esVideoMp4Real(new Uint8Array(0))).toBe(false);
        expect(esVideoMp4Real(null)).toBe(false);
    });
});

describe('duracionVideoSegundos (#58)', () => {
    it('lee mvhd versión 0 (32 bits): 30 segundos', () => {
        const video = concat(ftyp, atomo('moov', mvhdV0(1000, 30000)), atomo('mdat', [0]));
        expect(duracionVideoSegundos(video)).toBe(30);
    });

    it('lee mvhd versión 1 (64 bits): 75.5 segundos', () => {
        const video = concat(ftyp, atomo('moov', mvhdV1(600, 45300)), atomo('mdat', [0]));
        expect(duracionVideoSegundos(video)).toBe(75.5);
    });

    it('encuentra el moov aunque vaya al FINAL (típico de cámaras de celular)', () => {
        const video = concat(ftyp, atomo('mdat', new Array(500).fill(7)), atomo('moov', mvhdV0(90000, 90000 * 61)));
        expect(duracionVideoSegundos(video)).toBe(61);
    });

    it('soporta átomos con largesize de 64 bits antes del moov', () => {
        const video = concat(ftyp, atomoLarge('mdat', new Array(100).fill(9)), atomo('moov', mvhdV0(1000, 5000)));
        expect(duracionVideoSegundos(video)).toBe(5);
    });

    it('el moov puede traer otros hijos antes del mvhd', () => {
        const moov = atomo('moov', [...atomo('udta', [1, 2, 3, 4]), ...mvhdV0(48000, 48000 * 12)]);
        expect(duracionVideoSegundos(concat(ftyp, moov))).toBe(12);
    });

    it('null si no hay moov/mvhd o el archivo es basura', () => {
        expect(duracionVideoSegundos(concat(ftyp, atomo('mdat', [1, 2])))).toBe(null);
        expect(duracionVideoSegundos(Uint8Array.from(new Array(64).fill(0xab)))).toBe(null);
        expect(duracionVideoSegundos(new Uint8Array(4))).toBe(null);
        expect(duracionVideoSegundos(null)).toBe(null);
    });

    it('null con timescale 0 o duración "desconocida" (0xFFFFFFFF)', () => {
        expect(duracionVideoSegundos(concat(ftyp, atomo('moov', mvhdV0(0, 1000))))).toBe(null);
        expect(duracionVideoSegundos(concat(ftyp, atomo('moov', mvhdV0(1000, 0xFFFFFFFF))))).toBe(null);
    });

    it('no se cae con un átomo corrupto (size que excede el archivo)', () => {
        const roto = concat(ftyp, Uint8Array.from([...u32(99999), ...tipo('moov'), 0, 0]));
        expect(duracionVideoSegundos(roto)).toBe(null);
    });

    it('funciona igual con Buffer de Node (el backend valida sobre el base64 real)', () => {
        const video = concat(ftyp, atomo('moov', mvhdV0(1000, 59999)));
        expect(duracionVideoSegundos(Buffer.from(video))).toBeCloseTo(59.999, 3);
    });
});

describe('formatoDuracion (#58)', () => {
    it('formatea mm:ss', () => {
        expect(formatoDuracion(30)).toBe('0:30');
        expect(formatoDuracion(61)).toBe('1:01');
        expect(formatoDuracion(83.4)).toBe('1:23');
        expect(formatoDuracion(600)).toBe('10:00');
    });
});
