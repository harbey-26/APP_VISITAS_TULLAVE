// Fechas en letras para los contratos, p. ej.
// "primero (01) de agosto de dos mil veintiséis (2026)".
// Acepta Date o string "YYYY-MM-DD" (se interpreta en hora local, nunca UTC,
// para que la fecha no se corra un día en Bogotá).

import { numeroALetras } from './numeroALetras.js';

const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Normaliza a { year, month (1-12), day }; null si no es una fecha válida.
export function partesFecha(fecha) {
    if (!fecha) return null;
    if (typeof fecha === 'string') {
        const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return { year: +m[1], month: +m[2], day: +m[3] };
        fecha = new Date(fecha);
    }
    if (!(fecha instanceof Date) || isNaN(fecha)) return null;
    return { year: fecha.getFullYear(), month: fecha.getMonth() + 1, day: fecha.getDate() };
}

// "2026-08-01" → "01 de agosto de 2026"
export function fechaCorta(fecha) {
    const p = partesFecha(fecha);
    if (!p) return '';
    return `${String(p.day).padStart(2, '0')} de ${MESES[p.month - 1]} de ${p.year}`;
}

// "2026-08-01" → "01 DE AGOSTO DE 2026" (formato de los encabezados de la proforma)
export function fechaCortaCaps(fecha) {
    return fechaCorta(fecha).toUpperCase();
}

// "2026-08-01" → "primero (01) de agosto de dos mil veintiséis (2026)"
export function fechaEnLetras(fecha) {
    const p = partesFecha(fecha);
    if (!p) return '';
    const dia = p.day === 1 ? 'primero' : numeroALetras(p.day);
    const dd = String(p.day).padStart(2, '0');
    return `${dia} (${dd}) de ${MESES[p.month - 1]} de ${numeroALetras(p.year)} (${p.year})`;
}
