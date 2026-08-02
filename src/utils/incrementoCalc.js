// Lógica pura del módulo de incrementos de canon (I1): cálculo del nuevo
// canon, aniversarios, semaforización de urgencia y agrupación del dashboard.
// Compartida por frontend (página Incrementos), backend (cron de aniversarios,
// procesamiento masivo, carta) y PDF — sin imports de Prisma ni React.
// Tests en tests/incrementoCalc.test.js.

import { partesFecha } from './fechaLetras.js';

// ── Estados del incremento ──
// PENDIENTE → (enviar carta) ENVIADA → (llega la fecha efectiva y se aplica el
// nuevo canon a la ficha) APLICADA. ANULADA = el admin lo descartó con motivo
// (ej.: contrato terminado antes del aniversario).
export const INCREMENTO_STATUS = {
    PENDIENTE: { label: 'Pendiente', badge: 'bg-gray-100 text-gray-700' },
    ENVIADA: { label: 'Carta enviada', badge: 'bg-blue-100 text-blue-700' },
    APLICADA: { label: 'Aplicado', badge: 'bg-emerald-100 text-emerald-700' },
    ANULADA: { label: 'Anulado', badge: 'bg-red-100 text-red-600' },
};

// ── Tipo de índice pactado en el contrato ──
export const TIPOS_INDICE = {
    IPC: { label: 'IPC', descripcion: 'IPC del año anterior (Ley 820 de 2003, art. 20)' },
    IPC_PLUS: { label: 'IPC + puntos', descripcion: 'IPC más puntos adicionales pactados' },
    FIJO: { label: '% fijo', descripcion: 'Porcentaje fijo pactado en el contrato' },
};

// Coerciona montos que pueden venir como texto ("1.300.000") — COP sin centavos.
export const num = (v) => {
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/[^\d-]/g, ''));
    return isNaN(n) ? 0 : n;
};

// Fecha local "YYYY-MM-DD" (nunca UTC — regla del proyecto para Bogotá).
export function hoyISO(d = new Date()) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

// % aplicable a una ficha según lo pactado. `indice` = registro IndiceAnual
// del período ({ pct }) o null si el admin no lo ha configurado.
// Devuelve null cuando falta el IPC (el cálculo queda pendiente de índice).
export function pctAplicable(ficha, indice) {
    if (ficha?.tipoIndice === 'FIJO') return Number(ficha.pctFijo) || 0;
    if (indice == null || indice.pct == null) return null;
    const ipc = Number(indice.pct) || 0;
    if (ficha?.tipoIndice === 'IPC_PLUS') return ipc + (Number(ficha.puntosAdicionales) || 0);
    return ipc;
}

// Nuevo canon = canon × (1 + pct/100), redondeado AL PESO EXACTO (decisión del
// cliente: sin redondeo a miles). Devuelve null si falta el porcentaje.
export function calcularNuevoCanon(canonActual, pct) {
    const canon = num(canonActual);
    if (pct == null || canon <= 0) return null;
    return Math.round(canon * (1 + pct / 100));
}

// Desglose del cálculo para mostrar en la app y en la carta (#46):
// canon anterior, índice, valor del aumento y nuevo canon.
export function desgloseIncremento(canonActual, pct) {
    const nuevoCanon = calcularNuevoCanon(canonActual, pct);
    if (nuevoCanon == null) return null;
    const canonAnterior = num(canonActual);
    return { canonAnterior, pct, aumento: nuevoCanon - canonAnterior, nuevoCanon };
}

// ── Aniversarios ──

const pad2 = (n) => String(n).padStart(2, '0');

// Aniversario del contrato en un año dado. Si el día no existe en ese año
// (29 de febrero → año no bisiesto) se ajusta al último día del mes.
export function aniversarioEnAnio(fechaInicio, anio) {
    const p = partesFecha(fechaInicio);
    if (!p) return '';
    const ultimoDia = new Date(anio, p.month, 0).getDate();
    return `${anio}-${pad2(p.month)}-${pad2(Math.min(p.day, ultimoDia))}`;
}

// Próximo aniversario a partir de `hoy` (inclusive): el de este año si no ha
// pasado, si no el del año siguiente. Nunca devuelve el año de inicio mismo
// (el primer incremento es al cumplir un año). → { fecha, periodo } | null
export function proximoAniversario(fechaInicio, hoy = hoyISO()) {
    const p = partesFecha(fechaInicio);
    const h = partesFecha(hoy);
    if (!p || !h) return null;
    let anio = h.year;
    let fecha = aniversarioEnAnio(fechaInicio, anio);
    if (fecha < hoy || anio <= p.year) {
        anio += 1;
        fecha = aniversarioEnAnio(fechaInicio, anio);
    }
    if (anio <= p.year) return null; // contrato inicia en el futuro: aún sin aniversario
    return { fecha, periodo: anio };
}

// Aniversarios que deben estar en el radar hoy (#47): el próximo si cae
// dentro del horizonte Y el del período actual si pasó hace poco sin
// gestionarse (retrovisor). El retrovisor cubre la migración inicial: al
// cargar contratos cuyo aniversario acaba de pasar, la tarea nace VENCIDA
// (semáforo negro) en vez de saltar en silencio al año siguiente.
export function aniversariosEnRadar(fechaInicio, hoy = hoyISO(), { horizonteDias = 90, retrovisorDias = 90 } = {}) {
    const p = partesFecha(fechaInicio);
    const h = partesFecha(hoy);
    if (!p || !h) return [];
    const radar = [];
    const anivActual = aniversarioEnAnio(fechaInicio, h.year);
    if (h.year > p.year && anivActual < hoy && -diasHasta(anivActual, hoy) <= retrovisorDias) {
        radar.push({ fecha: anivActual, periodo: h.year });
    }
    const prox = proximoAniversario(fechaInicio, hoy);
    if (prox && diasHasta(prox.fecha, hoy) <= horizonteDias) radar.push(prox);
    return radar;
}

// Días de calendario entre hoy y una fecha (negativo si ya pasó).
export function diasHasta(fecha, hoy = hoyISO()) {
    const a = partesFecha(hoy);
    const b = partesFecha(fecha);
    if (!a || !b) return 0;
    const ms = new Date(b.year, b.month - 1, b.day) - new Date(a.year, a.month - 1, a.day);
    return Math.round(ms / 86400000);
}

// ── Semaforización (#52) ──
// La urgencia mide cuánto falta para la FECHA EFECTIVA del incremento y si la
// carta ya salió. Umbral rojo en 15 días: si la carta no ha salido a esa
// altura, hay que enviarla YA para que el aviso llegue antes del aniversario.
export const UMBRAL_ROJO = 15;
export const UMBRAL_NARANJA = 30;
export const UMBRAL_AMARILLO = 60;

export const SEMAFOROS = {
    NEGRO: { clave: 'NEGRO', orden: 0, label: 'Vencido — pendiente de aplicar', dot: 'bg-gray-900', badge: 'bg-gray-900 text-white' },
    ROJO: { clave: 'ROJO', orden: 1, label: 'Debe enviarse', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
    NARANJA: { clave: 'NARANJA', orden: 2, label: 'Menos de 30 días', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
    AMARILLO: { clave: 'AMARILLO', orden: 3, label: 'Entre 30 y 60 días', dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700' },
    VERDE: { clave: 'VERDE', orden: 4, label: 'Más de 60 días', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
    AZUL: { clave: 'AZUL', orden: 5, label: 'Carta enviada — esperando fecha', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
    APLICADO: { clave: 'APLICADO', orden: 6, label: 'Aplicado', dot: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
    ANULADO: { clave: 'ANULADO', orden: 7, label: 'Anulado', dot: 'bg-gray-300', badge: 'bg-gray-100 text-gray-500' },
};

export function semaforo(incremento, hoy = hoyISO()) {
    if (incremento.status === 'APLICADA') return SEMAFOROS.APLICADO;
    if (incremento.status === 'ANULADA') return SEMAFOROS.ANULADO;
    const dias = diasHasta(incremento.fechaEfectiva, hoy);
    if (dias < 0) return SEMAFOROS.NEGRO;                        // vencido sin aplicar
    if (incremento.status === 'ENVIADA') return SEMAFOROS.AZUL;  // ya salió la carta
    if (dias <= UMBRAL_ROJO) return SEMAFOROS.ROJO;
    if (dias < UMBRAL_NARANJA) return SEMAFOROS.NARANJA;
    if (dias <= UMBRAL_AMARILLO) return SEMAFOROS.AMARILLO;
    return SEMAFOROS.VERDE;
}

// Orden por urgencia para listados: primero lo vencido, luego lo urgente;
// a igual semáforo, la fecha efectiva más próxima primero.
export function compararUrgencia(a, b, hoy = hoyISO()) {
    const sa = semaforo(a, hoy).orden;
    const sb = semaforo(b, hoy).orden;
    if (sa !== sb) return sa - sb;
    return String(a.fechaEfectiva).localeCompare(String(b.fechaEfectiva));
}

// ── Agrupación del dashboard (#48) ──
// Cada incremento VIVO (no aplicado/anulado) cae en máximo un grupo:
//   PENDIENTE_APLICAR — la fecha efectiva ya llegó y el canon no se ha aplicado
//   ESTA_SEMANA       — carta sin enviar, quedan ≤ 7 días
//   ESTE_MES          — carta sin enviar, quedan ≤ 31 días
//   PROXIMO_MES       — la fecha efectiva cae en el mes calendario siguiente
//   null              — todavía lejano (o carta ya enviada esperando fecha)
export const GRUPOS_DASHBOARD = [
    { clave: 'ESTA_SEMANA', emoji: '🔴', titulo: 'Deben enviarse esta semana' },
    { clave: 'ESTE_MES', emoji: '🟠', titulo: 'Deben enviarse este mes' },
    { clave: 'PROXIMO_MES', emoji: '🟢', titulo: 'Empiezan el próximo mes' },
    { clave: 'PENDIENTE_APLICAR', emoji: '⚫', titulo: 'Pendientes de aplicar' },
];

export function grupoDashboard(incremento, hoy = hoyISO()) {
    if (incremento.status === 'APLICADA' || incremento.status === 'ANULADA') return null;
    const dias = diasHasta(incremento.fechaEfectiva, hoy);
    if (dias <= 0) return 'PENDIENTE_APLICAR';
    const sinEnviar = incremento.status === 'PENDIENTE';
    if (sinEnviar && dias <= 7) return 'ESTA_SEMANA';
    if (sinEnviar && dias <= 31) return 'ESTE_MES';
    const h = partesFecha(hoy);
    const f = partesFecha(incremento.fechaEfectiva);
    if (h && f) {
        const mesSiguiente = h.month === 12 ? { year: h.year + 1, month: 1 } : { year: h.year, month: h.month + 1 };
        if (f.year === mesSiguiente.year && f.month === mesSiguiente.month) return 'PROXIMO_MES';
    }
    return null;
}

// ── Validación de la ficha antes de generar/enviar la carta (#49, #54) ──
// Devuelve la lista de faltantes (vacía si la carta puede generarse). El correo
// solo es obligatorio para ENVIAR por email, no para generar el PDF.
export function validarFichaParaCarta(ficha, { paraCorreo = false } = {}) {
    const errors = [];
    if (!String(ficha?.arrendatarioNombre || '').trim()) errors.push('Falta el nombre del arrendatario');
    if (!String(ficha?.direccion || '').trim()) errors.push('Falta la dirección del inmueble');
    if (num(ficha?.canonActual) <= 0) errors.push('El canon actual debe ser mayor a cero');
    if (!partesFecha(ficha?.fechaInicioContrato)) errors.push('Falta la fecha de inicio del contrato');
    if (paraCorreo && !String(ficha?.arrendatarioEmail || '').trim()) {
        errors.push('La ficha no tiene correo del arrendatario');
    }
    return errors;
}
