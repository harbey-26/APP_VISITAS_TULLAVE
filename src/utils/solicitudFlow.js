// Lógica pura del Centro de Solicitudes (S1): máquina de estados (#33),
// catálogos (prioridad, medio, solicitante, adjuntos), términos de los
// derechos de petición (#41) y urgencia de vencimientos para la bandeja (#43).
// Compartida por frontend y backend — sin imports de Prisma ni React.
// Tests en tests/solicitudFlow.test.js.

import { sumarDiasHabiles, diasHabilesEntre } from './diasHabiles.js';
import { partesFecha } from './fechaLetras.js';

// ── Estados del expediente (#33) ──
export const SOLICITUD_ESTADOS = {
    RECIBIDA: { label: 'Recibida', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400', orden: 0 },
    EN_REVISION: { label: 'En revisión', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', orden: 1 },
    EN_GESTION: { label: 'En gestión', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', orden: 2 },
    PENDIENTE_TERCERO: { label: 'Pendiente de tercero', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', orden: 3 },
    FINALIZADA: { label: 'Finalizada', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', orden: 4 },
    ARCHIVADA: { label: 'Archivada', badge: 'bg-gray-200 text-gray-600', dot: 'bg-gray-500', orden: 5 },
};

// Transiciones válidas: el flujo avanza en orden y permite retroceder un paso
// (y reabrir una finalizada); nunca saltar de Recibida a Finalizada.
export const TRANSICIONES = {
    RECIBIDA: ['EN_REVISION'],
    EN_REVISION: ['EN_GESTION', 'RECIBIDA'],
    EN_GESTION: ['PENDIENTE_TERCERO', 'FINALIZADA', 'EN_REVISION'],
    PENDIENTE_TERCERO: ['EN_GESTION', 'FINALIZADA'],
    FINALIZADA: ['ARCHIVADA', 'EN_GESTION'], // EN_GESTION = reabrir
    ARCHIVADA: [],
};

export const puedeTransicionar = (desde, hacia) =>
    (TRANSICIONES[desde] || []).includes(hacia);

// Estados "vivos" — cuentan como solicitud abierta en bandeja y dashboard.
export const ESTADOS_ABIERTOS = ['RECIBIDA', 'EN_REVISION', 'EN_GESTION', 'PENDIENTE_TERCERO'];

export const PRIORIDADES = {
    ALTA: { label: 'Alta', badge: 'bg-red-100 text-red-700', orden: 0 },
    MEDIA: { label: 'Media', badge: 'bg-amber-100 text-amber-700', orden: 1 },
    BAJA: { label: 'Baja', badge: 'bg-gray-100 text-gray-600', orden: 2 },
};

export const MEDIOS_INGRESO = {
    WHATSAPP: 'WhatsApp',
    CORREO: 'Correo',
    LLAMADA: 'Llamada',
    PRESENCIAL: 'Presencial',
    OTRO: 'Otro',
};

export const SOLICITANTE_TIPOS = {
    PROPIETARIO: 'Propietario',
    ARRENDATARIO: 'Arrendatario',
    TERCERO: 'Tercero',
};

export const ADJUNTO_CATEGORIAS = {
    FOTO: 'Fotografía',
    FOTO_ANTES: 'Foto — antes',
    FOTO_DESPUES: 'Foto — después',
    FACTURA: 'Factura',
    COTIZACION: 'Cotización',
    ACTA: 'Acta',
    CORREO: 'Correo',
    PDF: 'Documento PDF',
    OTRO: 'Otro',
};

// Tipos de actuación de la línea de tiempo (#38).
export const ACTUACION_TIPOS = {
    CREACION: { label: 'Creación', icon: '📥' },
    ESTADO: { label: 'Cambio de estado', icon: '🔁' },
    ASIGNACION: { label: 'Asignación', icon: '👤' },
    NOTA: { label: 'Nota', icon: '📝' },
    ADJUNTO: { label: 'Adjunto', icon: '📎' },
    AUTOMATIZACION: { label: 'Automatización', icon: '⚙️' },
    RESPUESTA: { label: 'Respuesta', icon: '✉️' },
    ALERTA: { label: 'Alerta', icon: '⏰' },
};

// ── Derechos de petición (#41 — Ley 1755 de 2015, días HÁBILES) ──
export const DP_TIPOS = {
    GENERAL: { label: 'Derecho de petición general', diasHabiles: 15 },
    DOCUMENTOS: { label: 'Solicitud de documentos e información', diasHabiles: 10 },
    CONSULTA: { label: 'Consulta', diasHabiles: 30 },
    QUEJA_RECLAMO: { label: 'Queja / reclamo', diasHabiles: 15 },
};

// Vencimiento legal: N días hábiles contados desde el día siguiente a la
// radicación. → "YYYY-MM-DD" ('' si datos inválidos).
export function vencimientoDP(fechaRadicacion, dpTipo = 'GENERAL') {
    const plazo = DP_TIPOS[dpTipo]?.diasHabiles;
    if (!plazo || !partesFecha(fechaRadicacion)) return '';
    return sumarDiasHabiles(fechaRadicacion, plazo);
}

// Días de calendario entre hoy y una fecha (negativo si ya pasó).
export function diasHasta(fecha, hoy) {
    const a = partesFecha(hoy);
    const b = partesFecha(fecha);
    if (!a || !b) return 0;
    const ms = new Date(b.year, b.month - 1, b.day) - new Date(a.year, a.month - 1, a.day);
    return Math.round(ms / 86400000);
}

// Niveles de alerta del DP, en orden de gravedad. El cron envía cada nivel UNA
// vez (los registra en data.alertasEnviadas).
export const DP_ALERTAS = {
    MITAD: { label: 'Va la mitad del término', emoji: '🟡' },
    TRES_DIAS: { label: 'Vence en 3 días o menos', emoji: '🟠' },
    VENCE_HOY: { label: 'VENCE HOY', emoji: '🔴' },
    VENCIDO: { label: 'TÉRMINO VENCIDO', emoji: '⚫' },
};

// Nivel de alerta vigente de un derecho de petición (null = sin alerta aún).
// `fechaRadicacion` y `fechaVencimiento` en "YYYY-MM-DD".
export function nivelAlertaDP({ fechaRadicacion, fechaVencimiento, hoy }) {
    if (!partesFecha(fechaVencimiento) || !partesFecha(hoy)) return null;
    const restantes = diasHasta(fechaVencimiento, hoy);
    if (restantes < 0) return 'VENCIDO';
    if (restantes === 0) return 'VENCE_HOY';
    if (restantes <= 3) return 'TRES_DIAS';
    if (partesFecha(fechaRadicacion)) {
        const total = diasHabilesEntre(fechaRadicacion, fechaVencimiento);
        const corridos = diasHabilesEntre(fechaRadicacion, hoy);
        if (total > 0 && corridos >= total / 2) return 'MITAD';
    }
    return null;
}

// ── Urgencia genérica por fecha de vencimiento (bandeja #43, dashboard #40) ──
export const URGENCIAS = {
    VENCIDA: { label: 'Vencida', badge: 'bg-red-100 text-red-700', dot: 'bg-red-600', orden: 0 },
    POR_VENCER: { label: 'Por vencer (≤3 días)', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', orden: 1 },
    VIGENTE: { label: 'En término', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', orden: 2 },
    SIN_TERMINO: { label: 'Sin término', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300', orden: 3 },
};

export function urgenciaVencimiento(fechaVencimiento, hoy) {
    if (!partesFecha(fechaVencimiento)) return 'SIN_TERMINO';
    const dias = diasHasta(fechaVencimiento, hoy);
    if (dias < 0) return 'VENCIDA';
    if (dias <= 3) return 'POR_VENCER';
    return 'VIGENTE';
}

// Orden de bandeja: vencidas primero, luego por vencer; a igual urgencia, la
// prioridad manda; después la fecha límite más próxima; al final las nuevas.
export function compararBandeja(a, b, hoy) {
    const ua = URGENCIAS[urgenciaVencimiento(a.fechaVencimiento, hoy)].orden;
    const ub = URGENCIAS[urgenciaVencimiento(b.fechaVencimiento, hoy)].orden;
    if (ua !== ub) return ua - ub;
    const pa = PRIORIDADES[a.prioridad]?.orden ?? 1;
    const pb = PRIORIDADES[b.prioridad]?.orden ?? 1;
    if (pa !== pb) return pa - pb;
    const fa = a.fechaVencimiento || '9999';
    const fb = b.fechaVencimiento || '9999';
    if (fa !== fb) return fa.localeCompare(fb);
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

// ── Sub-estados del flujo de reparaciones (#36) ──
export const REPARACION_PASOS = [
    { clave: 'CASO_CREADO', label: 'Caso creado' },
    { clave: 'FOTOS_ADJUNTAS', label: 'Fotos del daño adjuntas' },
    { clave: 'COTIZACION_SOLICITADA', label: 'Cotización solicitada' },
    { clave: 'AUTORIZADO', label: 'Autorizado por el propietario' },
    { clave: 'TECNICO_ASIGNADO', label: 'Técnico asignado' },
    { clave: 'REPARACION_FINALIZADA', label: 'Reparación finalizada' },
];

export const REPARACION_ORDEN = REPARACION_PASOS.map((p) => p.clave);

export function pasoReparacionSiguiente(subEstado) {
    const i = REPARACION_ORDEN.indexOf(subEstado);
    return i >= 0 && i < REPARACION_ORDEN.length - 1 ? REPARACION_ORDEN[i + 1] : null;
}
