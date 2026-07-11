// Convierte números a letras en español (Colombia) para los contratos:
// los valores monetarios deben ir escritos en palabras y en cifras, p. ej.
// "UN MILLÓN CUARENTA Y SIETE MIL CIEN PESOS ($1.047.100)".
// Compartido por la vista previa (frontend) y el generador de PDF (backend).

const UNIDADES = [
    'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
    'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis',
    'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
    'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete',
    'veintiocho', 'veintinueve',
];

const DECENAS = [
    '', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta',
    'ochenta', 'noventa',
];

const CENTENAS = [
    '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

// Números de 0 a 999. `apocope` = usar "un/veintiún/treinta y un" (antes de
// "mil" o "millón").
function tresCifras(n, apocope) {
    if (n === 0) return '';
    if (n === 100) return 'cien';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const partes = [];
    if (c > 0) partes.push(CENTENAS[c]);
    if (resto > 0) {
        if (resto < 30) {
            let palabra = UNIDADES[resto];
            if (apocope) {
                if (resto === 1) palabra = 'un';
                if (resto === 21) palabra = 'veintiún';
            }
            partes.push(palabra);
        } else {
            const d = Math.floor(resto / 10);
            const u = resto % 10;
            let palabra = DECENAS[d];
            if (u > 0) palabra += ` y ${apocope && u === 1 ? 'un' : UNIDADES[u]}`;
            partes.push(palabra);
        }
    }
    return partes.join(' ');
}

// Convierte un entero (0 a 999.999.999.999) a letras en minúsculas.
export function numeroALetras(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n === 0) return 'cero';

    const millones = Math.floor(n / 1_000_000);
    const miles = Math.floor((n % 1_000_000) / 1000);
    const unidades = n % 1000;
    const partes = [];

    if (millones > 0) {
        if (millones === 1) partes.push('un millón');
        else {
            const milesDeMillon = Math.floor(millones / 1000);
            const restoMillon = millones % 1000;
            const sub = [];
            if (milesDeMillon > 0) sub.push(milesDeMillon === 1 ? 'mil' : `${tresCifras(milesDeMillon, true)} mil`);
            if (restoMillon > 0) sub.push(tresCifras(restoMillon, true));
            partes.push(`${sub.join(' ')} millones`);
        }
    }
    if (miles > 0) partes.push(miles === 1 ? 'mil' : `${tresCifras(miles, true)} mil`);
    if (unidades > 0) partes.push(tresCifras(unidades, false));

    return partes.join(' ');
}

// Formatea una cifra con separador de miles colombiano: 1047100 → "1.047.100".
export function formatoCifra(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Monto en el formato de los contratos:
// 1047100 → "UN MILLÓN CUARENTA Y SIETE MIL CIEN PESOS ($1.047.100)".
export function montoEnLetras(n) {
    const valor = Math.floor(Math.abs(Number(n) || 0));
    return `${numeroALetras(valor).toUpperCase()} PESOS ($${formatoCifra(valor)})`;
}
