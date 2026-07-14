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

// Suma meses a una fecha "YYYY-MM-DD" y devuelve otra "YYYY-MM-DD" (#23).
// Ej.: sumarMeses('2026-07-13', 12) → '2027-07-13'. Si el día no existe en el
// mes destino (ej.: 31 → febrero) se ajusta al último día del mes.
export function sumarMeses(fecha, meses) {
    const p = partesFecha(fecha);
    const n = Number(meses);
    if (!p || !n || isNaN(n)) return '';
    const base = new Date(p.year, p.month - 1 + n, 1);
    const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(p.day, ultimoDia));
    const mm = String(base.getMonth() + 1).padStart(2, '0');
    const dd = String(base.getDate()).padStart(2, '0');
    return `${base.getFullYear()}-${mm}-${dd}`;
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
