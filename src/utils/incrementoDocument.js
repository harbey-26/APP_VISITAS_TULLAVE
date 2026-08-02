// Texto de la carta de incremento de canon (I1): bloques declarativos que
// consumen la vista previa HTML (página Incrementos) y el PDF
// (incrementoPdf.js), para que app y PDF digan exactamente lo mismo.
// Si el abogado cambia la redacción, se toca SOLO este archivo.
//
// Trabaja sobre un "snapshot" de la carta — los datos congelados del
// incremento al momento de generarla (ver buildSnapshotCarta en el
// controlador): así el PDF se regenera idéntico aunque la ficha cambie después.

import { EMPRESA } from './contractTemplates.js';
import { formatoCifra, formatoIdentificacion, montoEnLetras } from './numeroALetras.js';
import { fechaCorta } from './fechaLetras.js';

const money = (v) => `$${formatoCifra(Math.round(Number(v) || 0))}`;

// Cómo se explica el índice en la carta según lo pactado.
function fraseIndice(snap) {
    const pct = String(snap.pct).replace('.', ',');
    if (snap.tipoIndice === 'FIJO') {
        return `un incremento del ${pct}%, porcentaje pactado en el contrato de arrendamiento`;
    }
    if (snap.tipoIndice === 'IPC_PLUS') {
        return `un incremento del ${pct}%, correspondiente al Índice de Precios al Consumidor (IPC) del año anterior más los puntos adicionales pactados en el contrato`;
    }
    return `un incremento del ${pct}%, correspondiente al Índice de Precios al Consumidor (IPC) certificado por el DANE para el año inmediatamente anterior, conforme al artículo 20 de la Ley 820 de 2003`;
}

// Estructura completa de la carta. `snap` = snapshot del incremento:
// { arrendatarioNombre, arrendatarioCedula?, direccion, codigoWasi?,
//   canonAnterior, pct, aumento, nuevoCanon, fechaEfectiva, tipoIndice,
//   periodo, fechaCarta }
export function cartaIncremento(snap) {
    return {
        ciudadFecha: `${EMPRESA.ciudad}, ${fechaCorta(snap.fechaCarta)}`,
        destinatario: [
            'Señor(a)',
            String(snap.arrendatarioNombre || '').toUpperCase(),
            ...(snap.arrendatarioCedula ? [`C.C. ${formatoIdentificacion(snap.arrendatarioCedula)}`] : []),
            String(snap.direccion || ''),
            'Ciudad',
        ],
        referencia: `Ref.: Incremento anual del canon de arrendamiento — ${snap.direccion}${snap.codigoWasi ? ` (Código ${snap.codigoWasi})` : ''}`,
        saludo: 'Cordial saludo:',
        parrafos: [
            `De conformidad con lo pactado en el contrato de arrendamiento suscrito con ${EMPRESA.razonSocial} y con lo dispuesto en la normatividad vigente, nos permitimos informarle que a partir del ${fechaCorta(snap.fechaEfectiva)} el canon de arrendamiento del inmueble de la referencia tendrá ${fraseIndice(snap)}.`,
            'El nuevo valor del canon mensual queda así:',
        ],
        // Tabla del desglose (#46): canon anterior, índice, aumento, nuevo canon.
        tabla: [
            ['Canon de arrendamiento actual', money(snap.canonAnterior)],
            [`Incremento aplicado (${String(snap.pct).replace('.', ',')}%)`, money(snap.aumento)],
            ['NUEVO CANON MENSUAL', money(snap.nuevoCanon)],
        ],
        montoEnLetras: `Son: ${montoEnLetras(snap.nuevoCanon)} M/CTE.`,
        parrafosCierre: [
            `En consecuencia, el valor a pagar por concepto de canon de arrendamiento a partir del período que inicia el ${fechaCorta(snap.fechaEfectiva)} será de ${money(snap.nuevoCanon)} mensuales, más los demás conceptos pactados en el contrato (cuota de administración, si aplica).`,
            'Agradecemos su puntualidad en los pagos y quedamos atentos a cualquier inquietud.',
        ],
        despedida: 'Atentamente,',
        firma: [
            EMPRESA.representanteLegal,
            'Representante Legal',
            EMPRESA.razonSocial,
            `NIT ${EMPRESA.nit}`,
        ],
    };
}

// Asunto y cuerpo del correo con el que se envía la carta (#49). El PDF va
// adjunto; el link público permite re-descargarla.
export function correoIncremento(snap, publicUrl) {
    return {
        subject: `Incremento anual del canon de arrendamiento — ${snap.direccion} — ${EMPRESA.razonSocial}`,
        text: [
            `Hola ${snap.arrendatarioNombre},`,
            '',
            `${EMPRESA.razonSocial} le informa que a partir del ${fechaCorta(snap.fechaEfectiva)} el canon de arrendamiento del inmueble ${snap.direccion} se incrementa en ${String(snap.pct).replace('.', ',')}%, quedando en ${money(snap.nuevoCanon)} mensuales.`,
            '',
            'En el archivo adjunto encuentra la carta con el detalle del incremento.',
            ...(publicUrl ? [`También puede descargarla en: ${publicUrl}`] : []),
            '',
            'Cualquier inquietud, con gusto la atendemos.',
            '',
            EMPRESA.razonSocial,
            `Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
        ].join('\n'),
    };
}
