// Verificaciones automáticas al radicar una terminación de contrato (#42):
// vigencia, cumplimiento del preaviso y cláusula penal, leídas del contrato
// de ARRENDAMIENTO vinculado. Las reglas replican el texto del contrato de
// TuLlave (contractDocument.js): preaviso de tres (3) meses y, si la entrega
// es anticipada, indemnización de tres (3) cánones vigentes (art. 24 num. 4,
// Ley 820 de 2003). Lógica pura — tests en tests/terminacionCheck.test.js.

import { partesFecha, sumarMeses, fechaCorta } from './fechaLetras.js';

export const PREAVISO_MESES = 3;
export const PENALIDAD_CANONES = 3;

const num = (v) => {
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/[^\d-]/g, ''));
    return isNaN(n) ? 0 : n;
};

function diasHasta(fecha, desde) {
    const a = partesFecha(desde);
    const b = partesFecha(fecha);
    if (!a || !b) return 0;
    return Math.round((new Date(b.year, b.month - 1, b.day) - new Date(a.year, a.month - 1, a.day)) / 86400000);
}

// `contrato` = data JSON del contrato ARRENDAMIENTO ({ fechaInicio,
// fechaVencimiento, canon }). `fechaSolicitud` = cuándo se está notificando;
// `fechaDeseada` = cuándo quieren entregar el inmueble (opcional: por defecto
// el vencimiento del contrato).
export function verificarTerminacion(contrato = {}, { fechaSolicitud, fechaDeseada } = {}) {
    const fechaInicio = contrato.fechaInicio || '';
    const fechaVencimiento = contrato.fechaVencimiento || '';
    const canon = num(contrato.canon);
    const observaciones = [];

    const datosCompletos = !!(partesFecha(fechaInicio) && partesFecha(fechaVencimiento) && partesFecha(fechaSolicitud));
    if (!datosCompletos) {
        observaciones.push('El contrato vinculado no tiene fechas completas: verifica inicio y vencimiento antes de proceder.');
        return { datosCompletos: false, observaciones };
    }

    const entrega = partesFecha(fechaDeseada) ? fechaDeseada : fechaVencimiento;
    const vigente = fechaSolicitud >= fechaInicio && fechaSolicitud <= fechaVencimiento;

    // Preaviso: la notificación debe llegar mínimo 3 meses antes de la fecha
    // de entrega. Fecha límite = entrega − 3 meses.
    const fechaLimitePreaviso = sumarMeses(entrega, -PREAVISO_MESES);
    const preavisoCumplido = fechaSolicitud <= fechaLimitePreaviso;
    // Días de retraso: cuántos días DESPUÉS del límite llega la notificación
    const diasFaltantesPreaviso = preavisoCumplido ? 0 : diasHasta(fechaSolicitud, fechaLimitePreaviso);

    // Terminación anticipada: la entrega es antes del vencimiento del período.
    const anticipada = entrega < fechaVencimiento;
    const penalidadAplica = anticipada;
    const penalidadMonto = penalidadAplica ? canon * PENALIDAD_CANONES : 0;

    if (vigente) {
        observaciones.push(`Contrato vigente desde el ${fechaCorta(fechaInicio)} hasta el ${fechaCorta(fechaVencimiento)}.`);
    } else if (fechaSolicitud > fechaVencimiento) {
        observaciones.push(`OJO: la vigencia pactada ya venció (${fechaCorta(fechaVencimiento)}). Si el contrato se prorrogó, verifica la vigencia real de la prórroga.`);
    } else {
        observaciones.push(`El contrato aún no inicia (inicia el ${fechaCorta(fechaInicio)}).`);
    }
    if (preavisoCumplido) {
        observaciones.push(`Preaviso cumplido: la notificación se hace con ${PREAVISO_MESES} meses o más de anticipación (límite: ${fechaCorta(fechaLimitePreaviso)}).`);
    } else {
        observaciones.push(`Preaviso NO cumplido: la fecha límite para notificar era el ${fechaCorta(fechaLimitePreaviso)} (llega ${diasFaltantesPreaviso} día(s) tarde). La contraparte podría objetar la terminación o exigir la indemnización pactada.`);
    }
    if (penalidadAplica) {
        observaciones.push(`Terminación ANTICIPADA (entrega el ${fechaCorta(entrega)}, antes del vencimiento): aplica indemnización de ${PENALIDAD_CANONES} cánones vigentes${canon > 0 ? ` = $${penalidadMonto.toLocaleString('es-CO')}` : ' (canon no registrado en el contrato)'} — cláusula penal, parágrafos 1º/2º, y art. 24 num. 4 de la Ley 820 de 2003.`);
    } else {
        observaciones.push('La entrega coincide con el vencimiento del período: no aplica penalidad por terminación anticipada.');
    }

    return {
        datosCompletos: true,
        vigente,
        fechaInicio,
        fechaVencimiento,
        fechaEntrega: entrega,
        anticipada,
        preaviso: {
            meses: PREAVISO_MESES,
            fechaLimite: fechaLimitePreaviso,
            cumplido: preavisoCumplido,
            diasTarde: diasFaltantesPreaviso,
        },
        clausulaPenal: {
            aplica: penalidadAplica,
            canones: PENALIDAD_CANONES,
            monto: penalidadMonto,
        },
        observaciones,
    };
}
