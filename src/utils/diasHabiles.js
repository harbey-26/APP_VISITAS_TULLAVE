// Días hábiles en Colombia: lunes a viernes, excluyendo los festivos de la
// Ley 51 de 1983 (Ley Emiliani). Base del cálculo de términos legales de los
// derechos de petición (#41 — Ley 1755 de 2015, plazos en días hábiles).
// Lógica pura, sin dependencias — tests en tests/diasHabiles.test.js.

import { partesFecha } from './fechaLetras.js';

const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Domingo de Pascua (algoritmo de Butcher).
function pascua(anio) {
    const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(anio, mes - 1, dia);
}

const sumarDias = (fecha, n) => {
    const d = new Date(fecha);
    d.setDate(d.getDate() + n);
    return d;
};

// Ley Emiliani: el festivo se traslada al lunes siguiente (si ya es lunes, queda).
const alLunes = (fecha) => {
    const d = new Date(fecha);
    const dow = d.getDay(); // 0 = domingo, 1 = lunes
    if (dow !== 1) d.setDate(d.getDate() + ((8 - dow) % 7));
    return d;
};

// Festivos de un año como Set de "YYYY-MM-DD" (memoizado por año).
const cacheFestivos = new Map();
export function festivosColombia(anio) {
    if (cacheFestivos.has(anio)) return cacheFestivos.get(anio);
    const p = pascua(anio);
    const fechas = [
        // Fijos (no se trasladan)
        new Date(anio, 0, 1),   // Año Nuevo
        new Date(anio, 4, 1),   // Día del Trabajo
        new Date(anio, 6, 20),  // Independencia
        new Date(anio, 7, 7),   // Batalla de Boyacá
        new Date(anio, 11, 8),  // Inmaculada Concepción
        new Date(anio, 11, 25), // Navidad
        // Relativos a Pascua sin traslado
        sumarDias(p, -3),       // Jueves Santo
        sumarDias(p, -2),       // Viernes Santo
        // Relativos a Pascua trasladados a lunes (ya caen en lunes: +43/+64/+71)
        sumarDias(p, 43),       // Ascensión
        sumarDias(p, 64),       // Corpus Christi
        sumarDias(p, 71),       // Sagrado Corazón
        // Emiliani: se corren al lunes siguiente
        alLunes(new Date(anio, 0, 6)),   // Reyes Magos
        alLunes(new Date(anio, 2, 19)),  // San José
        alLunes(new Date(anio, 5, 29)),  // San Pedro y San Pablo
        alLunes(new Date(anio, 7, 15)),  // Asunción de la Virgen
        alLunes(new Date(anio, 9, 12)),  // Día de la Raza
        alLunes(new Date(anio, 10, 1)),  // Todos los Santos
        alLunes(new Date(anio, 10, 11)), // Independencia de Cartagena
    ];
    const set = new Set(fechas.map(iso));
    cacheFestivos.set(anio, set);
    return set;
}

// ¿"YYYY-MM-DD" es día hábil? (L-V y no festivo)
export function esDiaHabil(fecha) {
    const p = partesFecha(fecha);
    if (!p) return false;
    const d = new Date(p.year, p.month - 1, p.day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false;
    return !festivosColombia(p.year).has(iso(d));
}

// Fecha del n-ésimo día hábil DESPUÉS de `fecha` (la ley cuenta los términos a
// partir del día siguiente a la radicación). n=0 devuelve la misma fecha.
export function sumarDiasHabiles(fecha, n) {
    const p = partesFecha(fecha);
    if (!p || n < 0) return '';
    const d = new Date(p.year, p.month - 1, p.day);
    let restantes = n;
    while (restantes > 0) {
        d.setDate(d.getDate() + 1);
        if (esDiaHabil(iso(d))) restantes -= 1;
    }
    return iso(d);
}

// Días hábiles ENTRE dos fechas, excluyendo la inicial e incluyendo la final
// (cuántos días hábiles han corrido del término). 0 si el rango es inválido.
export function diasHabilesEntre(inicial, final) {
    const a = partesFecha(inicial);
    const b = partesFecha(final);
    if (!a || !b) return 0;
    const d = new Date(a.year, a.month - 1, a.day);
    const fin = new Date(b.year, b.month - 1, b.day);
    let dias = 0;
    while (d < fin) {
        d.setDate(d.getDate() + 1);
        if (esDiaHabil(iso(d))) dias += 1;
    }
    return dias;
}
