// Liquidación proporcional de un servicio público entre propietario y
// arrendatario (#37): la factura cubre un período y el arrendatario responde
// desde la fecha de entrega del inmueble; el resto es del propietario.
// Lógica pura compartida por frontend, backend y PDF — tests en
// tests/servicioPublicoCalc.test.js.

import { diasEntre } from './liquidacionCalc.js';
import { partesFecha } from './fechaLetras.js';

const num = (v) => {
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/[^\d-]/g, ''));
    return isNaN(n) ? 0 : n;
};

// Valida la configuración → array de mensajes (vacío si está completa).
export function validarServicioPublico(config = {}) {
    const errors = [];
    if (!String(config.servicio || '').trim()) errors.push('Indica cuál servicio público es (agua, luz, gas…)');
    if (num(config.valorTotal) <= 0) errors.push('El valor total de la factura debe ser mayor a cero');
    if (!partesFecha(config.fechaInicialPeriodo)) errors.push('Falta la fecha inicial del período facturado');
    if (!partesFecha(config.fechaFinalPeriodo)) errors.push('Falta la fecha final del período facturado');
    if (!partesFecha(config.fechaEntrega)) errors.push('Falta la fecha de entrega del inmueble al arrendatario');
    if (partesFecha(config.fechaInicialPeriodo) && partesFecha(config.fechaFinalPeriodo)
        && diasEntre(config.fechaInicialPeriodo, config.fechaFinalPeriodo) === 0) {
        errors.push('La fecha final del período debe ser igual o posterior a la inicial');
    }
    return errors;
}

// Día anterior a una fecha "YYYY-MM-DD".
function diaAnterior(fecha) {
    const p = partesFecha(fecha);
    if (!p) return '';
    const d = new Date(p.year, p.month - 1, p.day - 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

// Prorrateo (fórmula del issue #37):
//   valor diario = valor total ÷ días del período (ambos extremos incluidos)
//   propietario  = días antes de la entrega × valor diario
//   arrendatario = el resto (total − propietario: cuadra al peso, sin residuo)
// La entrega fuera del período asigna todo a una sola parte.
export function calcularServicioPublico(config = {}) {
    const valorTotal = num(config.valorTotal);
    const inicial = config.fechaInicialPeriodo;
    const final = config.fechaFinalPeriodo;
    const entrega = config.fechaEntrega;
    const diasPeriodo = diasEntre(inicial, final);
    if (valorTotal <= 0 || diasPeriodo <= 0 || !partesFecha(entrega)) {
        return {
            diasPeriodo: 0, valorDiario: 0,
            diasPropietario: 0, diasArrendatario: 0,
            valorPropietario: 0, valorArrendatario: 0,
            valorTotal, completo: false,
        };
    }

    let diasPropietario;
    if (entrega <= inicial) diasPropietario = 0;                       // entregado antes del período
    else if (entrega > final) diasPropietario = diasPeriodo;           // aún no se entregaba
    else diasPropietario = diasEntre(inicial, diaAnterior(entrega));   // hasta el día antes de la entrega

    const diasArrendatario = diasPeriodo - diasPropietario;
    const valorDiario = valorTotal / diasPeriodo;
    const valorPropietario = Math.round(valorDiario * diasPropietario);
    const valorArrendatario = valorTotal - valorPropietario; // cuadra al peso

    return {
        diasPeriodo,
        valorDiario: Math.round(valorDiario),
        diasPropietario,
        diasArrendatario,
        valorPropietario,
        valorArrendatario,
        valorTotal,
        completo: true,
    };
}
