// Genera el PDF de una liquidación inicial de contrato de arrendamiento con
// jspdf (mismo patrón isomorfo de contractPdf.js: import dinámico, corre en el
// navegador para descargar y en Node para el correo / link público). Replica
// el formato del Excel de la inmobiliaria: membrete, datos del arrendatario,
// tabla de conceptos, totales con abonos y saldo, monto en letras, datos de
// consignación y firmas Entrega/Recibe. Marca de agua BORRADOR si no está
// aprobada.

import {
    calcularLiquidacion, etiquetaItems, etiquetaItemsProsa, referenciaPago, IVA_PCT,
} from './liquidacionCalc.js';
import { EMPRESA } from './contractTemplates.js';
import { formatoCifra, formatoIdentificacion, montoEnLetras } from './numeroALetras.js';
import { fechaCorta } from './fechaLetras.js';
import { CONTRACT_LOGO } from '../assets/contractLogo.js';
import { freshImport } from './freshImport.js';
import { downloadBlob } from './downloadBlob.js';

const PAGE = { width: 210, height: 297 };  // A4 vertical, mm
// bottom 22: deja aire para el pie de página con los datos de la inmobiliaria
const MARGIN = { top: 40, bottom: 22, left: 19, right: 19 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const BODY_SIZE = 10;
const LINE_HEIGHT = 4.6;

const money = (v) => `$ ${formatoCifra(Math.abs(Math.round(v)))}`;
const moneySigned = (v) => (v < 0 ? `- ${money(v)}` : money(v));

export async function generateLiquidacionPdf(liq) {
    const { jsPDF } = await freshImport(() => import('jspdf'));
    const { default: autoTable } = await freshImport(() => import('jspdf-autotable'));

    const { origen = {}, config = {} } = liq.data || {};
    const calc = liq.calc || calcularLiquidacion(liq.data || {}, liq.pagos || []);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = MARGIN.top;

    const drawPageHeader = () => {
        const prevFont = pdf.getFont();
        const prevSize = pdf.getFontSize();
        try {
            pdf.addImage(CONTRACT_LOGO, 'JPEG', MARGIN.left, 8, 34, 14);
        } catch { /* sin logo la liquidación sigue siendo válida */ }
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(90);
        pdf.text(`Liquidación No. L-${liq.id}`, PAGE.width - MARGIN.right, 12, { align: 'right' });
        pdf.setTextColor(20);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text('LIQUIDACIÓN INICIAL — CONTRATO DE ARRENDAMIENTO', PAGE.width / 2, 24, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(60);
        pdf.text(
            `${EMPRESA.razonSocial} · Nit. ${EMPRESA.nit} · ${EMPRESA.direccion}, ${EMPRESA.ciudad} · Tel: ${EMPRESA.celular} - ${EMPRESA.telefono}`,
            PAGE.width / 2, 29, { align: 'center' },
        );
        pdf.setTextColor(20);
        pdf.setDrawColor(160);
        pdf.setLineWidth(0.2);
        pdf.line(MARGIN.left, 34, PAGE.width - MARGIN.right, 34);
        pdf.setFont(prevFont.fontName, prevFont.fontStyle);
        pdf.setFontSize(prevSize);
    };

    const ensureSpace = (needed) => {
        if (y + needed > PAGE.height - MARGIN.bottom) {
            pdf.addPage();
            drawPageHeader();
            y = MARGIN.top;
        }
    };

    drawPageHeader();

    // ── Datos del arrendatario y del inmueble ──
    // Dos parejas etiqueta/valor por fila (los campos largos ocupan la fila
    // entera): así el encabezado no le roba espacio al detalle y el documento
    // cabe en una sola página.
    const ANCHO = true;   // el campo ocupa toda la fila
    const campos = [
        ['Arrendatario', origen.arrendatarioNombre || '', ANCHO],
        ['Identificación', origen.arrendatarioCedula ? `C.C. ${formatoIdentificacion(origen.arrendatarioCedula)}` : ''],
        ['Teléfono', origen.arrendatarioCelular || ''],
        ['Correo', origen.arrendatarioEmail || ''],
        ['Código', origen.codigoWasi || ''],
        ['Dirección del inmueble', origen.direccionCompleta || '', ANCHO],
        ['Vigencia del contrato', origen.fechaInicioContrato
            ? `${fechaCorta(origen.fechaInicioContrato)} al ${fechaCorta(origen.fechaFinContrato)}` : ''],
        ['Período liquidado', config.fechaInicialCobro
            ? `${fechaCorta(config.fechaInicialCobro)} al ${fechaCorta(config.fechaFinalCobro)} (${calc.dias} días)` : ''],
        ['Canon mensual', money(Number(origen.canonMensual) || 0)],
        ...(Number(origen.administracionMensual) > 0
            ? [['Administración mensual', money(Number(origen.administracionMensual))]] : []),
    ].filter(([, v]) => v !== '');

    const kvRows = [];
    let pendiente = null;   // pareja a la espera de compañera en su fila
    const cerrarPendiente = () => {
        if (!pendiente) return;
        kvRows.push([pendiente[0], { content: pendiente[1], colSpan: 3, styles: { fontStyle: 'bold' } }]);
        pendiente = null;
    };
    for (const [label, valor, ancho] of campos) {
        if (ancho) {
            cerrarPendiente();
            kvRows.push([label, { content: valor, colSpan: 3, styles: { fontStyle: 'bold' } }]);
        } else if (pendiente) {
            kvRows.push([pendiente[0], pendiente[1], label, valor]);
            pendiente = null;
        } else {
            pendiente = [label, valor];
        }
    }
    cerrarPendiente();

    const KV_LABEL_W = 38;
    autoTable(pdf, {
        startY: y,
        margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top },
        head: [],
        body: kvRows,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.5, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: [15, 15, 15] },
        columnStyles: {
            0: { cellWidth: KV_LABEL_W },
            1: { cellWidth: CONTENT_WIDTH / 2 - KV_LABEL_W, fontStyle: 'bold' },
            2: { cellWidth: KV_LABEL_W },
            3: { cellWidth: CONTENT_WIDTH / 2 - KV_LABEL_W, fontStyle: 'bold' },
        },
        didAddPage: () => { drawPageHeader(); },
    });
    y = pdf.lastAutoTable.finalY + 4;

    // ── Detalle de la liquidación ──
    // UN SOLO criterio para el IVA: columna propia por ítem. Los ítems van
    // numerados (1, 2, 3…) y agrupados por secciones (A, B, C…); cada subtotal
    // cita los ítems que suma y el TOTAL cita los grupos. Así el lector puede
    // rastrear cada cifra y el IVA nunca aparece sumado dos veces (era el
    // reclamo del cliente: arriba se totalizaba con IVA y abajo se volvía a
    // separar y sumar aparte).
    const SEC = 'SECCION', SUB = 'SUBTOTAL', TOT = 'TOTAL';
    const filas = [];       // { clase, celdas: [...] }
    for (const g of calc.grupos) {
        filas.push({
            clase: SEC,
            celdas: [{ content: `${g.letra}. ${g.titulo.toUpperCase()}`, colSpan: 5 }],
        });
        for (const l of calc.lineas.filter((x) => x.grupo === g.clave)) {
            filas.push({
                clase: null,
                celdas: [
                    String(l.num),
                    l.detalle ? `${l.concepto}\n${l.detalle}` : l.concepto,
                    moneySigned(l.base),
                    l.iva ? money(l.iva) : '—',
                    moneySigned(l.total),
                ],
            });
        }
        filas.push({
            clase: SUB,
            celdas: [
                '', `Subtotal ${g.letra} (${etiquetaItems(g.nums)})`,
                moneySigned(g.base), g.iva ? money(g.iva) : '—', moneySigned(g.total),
            ],
        });
    }
    const letras = calc.grupos.map((g) => g.letra);
    filas.push({
        clase: TOT,
        celdas: [
            '', `TOTAL LIQUIDACIÓN${letras.length > 1 ? ` (${letras.join(' + ')})` : ''}`,
            moneySigned(calc.totalBase), money(calc.totalIva), moneySigned(calc.totalGeneral),
        ],
    });

    const W_NUM = 8, W_VAL = 27, W_IVA = 24, W_TOT = 29;
    autoTable(pdf, {
        startY: y,
        margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top },
        head: [['#', 'Concepto', 'Valor', `IVA ${IVA_PCT}%`, 'Total']],
        body: filas.map((f) => f.celdas),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: [15, 15, 15] },
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: W_NUM, halign: 'center' },
            1: { cellWidth: CONTENT_WIDTH - W_NUM - W_VAL - W_IVA - W_TOT },
            2: { cellWidth: W_VAL, halign: 'right' },
            3: { cellWidth: W_IVA, halign: 'right' },
            4: { cellWidth: W_TOT, halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (hook) => {
            if (hook.section !== 'body') return;
            const fila = filas[hook.row.index];
            if (fila.clase === SEC) {
                hook.cell.styles.fillColor = [232, 232, 232];
                hook.cell.styles.fontStyle = 'bold';
                hook.cell.styles.fontSize = 8;
            } else if (fila.clase === SUB) {
                hook.cell.styles.fontStyle = 'bold';
                hook.cell.styles.textColor = [70, 70, 70];
            } else if (fila.clase === TOT) {
                hook.cell.styles.fillColor = [225, 225, 225];
                hook.cell.styles.fontStyle = 'bold';
                hook.cell.styles.fontSize = 9.5;
            }
        },
        didAddPage: () => { drawPageHeader(); },
    });
    y = pdf.lastAutoTable.finalY + 3;

    // Nota que cierra el tema del IVA: dónde está y que ya viene incluido.
    ensureSpace(10);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7.5);
    pdf.setTextColor(80);
    const notaIva = calc.totalIva > 0
        ? `El IVA del ${IVA_PCT}% aplica únicamente sobre ${etiquetaItemsProsa(calc.itemsConIva)} y ya está incluido tanto en la columna "Total" como en el TOTAL LIQUIDACIÓN; no se suma de nuevo.`
        : `Ningún concepto de esta liquidación causa IVA.`;
    const notaLines = pdf.splitTextToSize(notaIva, CONTENT_WIDTH);
    pdf.text(notaLines, MARGIN.left, y);
    y += notaLines.length * 3.4 + 3.5;
    pdf.setTextColor(20);

    // ── Abonos y saldo ──
    // Arranca del TOTAL LIQUIDACIÓN (mismo número de la tabla, no una segunda
    // forma de calcularlo) y solo le resta los abonos.
    const totRows = [
        ['Total liquidación', money(calc.totalGeneral)],
        // a.fecha puede ser Date (server) o ISO string (browser) — partesFecha
        // dentro de fechaCorta entiende ambos; no convertir con String().slice()
        ...calc.abonos.map((a) => [
            `Abono${a.fecha ? ` — ${fechaCorta(a.fecha)}` : ''}${a.nota ? ` (${a.nota})` : ''}`,
            `- ${money(a.valor)}`,
        ]),
        ['SALDO A PAGAR', money(calc.saldo)],
    ];
    // El cuadro de saldo ocupa la mitad derecha; la izquierda la usan las
    // formas de pago (se dibujan más abajo, a partir de la misma `y`).
    const PAGO_W = 80;
    const TOT_LABEL_W = CONTENT_WIDTH - PAGO_W - 34;
    const ySaldo = y;
    ensureSpace(totRows.length * 6 + 6);
    autoTable(pdf, {
        startY: y,
        margin: { left: MARGIN.left + PAGO_W, right: MARGIN.right, top: MARGIN.top },
        head: [],
        body: totRows,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.2, textColor: [15, 15, 15] },
        columnStyles: {
            0: { cellWidth: TOT_LABEL_W, halign: 'right' },
            1: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (hook) => {
            if (totRows[hook.row.index][0] === 'SALDO A PAGAR') {
                hook.cell.styles.fontStyle = 'bold';
                hook.cell.styles.fontSize = 10;
                hook.cell.styles.fillColor = [235, 235, 235];
            }
        },
        didAddPage: () => { drawPageHeader(); },
    });
    const yFinSaldo = pdf.lastAutoTable.finalY;

    // ── Formas de pago (columna izquierda, junto al saldo) ──
    // Dos opciones numeradas: consignación/transferencia y pago en línea por
    // Mi Pago Amigo. La URL queda como enlace real del PDF (clic desde el
    // correo o el celular), con el texto acortado para que quepa en la columna.
    const PAGO_SIZE = 8, PAGO_LH = 3.7, SANGRIA = 4;
    const PAGO_TXT_W = PAGO_W - SANGRIA - 6;
    const opciones = [
        {
            titulo: 'Consignación o transferencia',
            lineas: [
                `${EMPRESA.bancoRecaudo}, ${EMPRESA.cuentaRecaudo}`,
                `A nombre de ${EMPRESA.razonSocial}, NIT ${EMPRESA.nit}`,
            ],
        },
        {
            titulo: `En línea o en puntos ${EMPRESA.pagoEnLineaPlataforma}`,
            lineas: [`Busque el convenio "${EMPRESA.pagoEnLineaConvenio}" en:`],
            enlace: EMPRESA.pagoEnLineaUrl,
            enlaceTexto: EMPRESA.pagoEnLineaUrl.replace(/^https?:\/\/(www\.)?/, ''),
        },
    ];

    let yPago = ySaldo;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('FORMAS DE PAGO', MARGIN.left, yPago);
    yPago += 4.6;

    // Referencia que pide el banco: va primero y resaltada, porque sin ella el
    // pago no se puede identificar.
    const referencia = referenciaPago(origen);
    if (referencia) {
        pdf.setFontSize(PAGO_SIZE);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Referencia de pago:', MARGIN.left, yPago);
        yPago += PAGO_LH;
        pdf.setFont('helvetica', 'bold');
        const refPartes = pdf.splitTextToSize(referencia, PAGO_W - 6);
        pdf.text(refPartes, MARGIN.left, yPago);
        yPago += refPartes.length * PAGO_LH + 2;
    }
    opciones.forEach((o, i) => {
        pdf.setFontSize(PAGO_SIZE);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${i + 1}.`, MARGIN.left, yPago);
        const tituloPartes = pdf.splitTextToSize(o.titulo, PAGO_TXT_W);
        pdf.text(tituloPartes, MARGIN.left + SANGRIA, yPago);
        yPago += tituloPartes.length * PAGO_LH;
        pdf.setFont('helvetica', 'normal');
        for (const t of o.lineas) {
            const partes = pdf.splitTextToSize(t, PAGO_TXT_W);
            pdf.text(partes, MARGIN.left + SANGRIA, yPago);
            yPago += partes.length * PAGO_LH;
        }
        if (o.enlace) {
            pdf.setTextColor(20, 70, 160);
            pdf.textWithLink(o.enlaceTexto, MARGIN.left + SANGRIA, yPago, { url: o.enlace });
            // Subrayado del enlace: jspdf no lo dibuja solo
            const ancho = pdf.getTextWidth(o.enlaceTexto);
            pdf.setDrawColor(20, 70, 160);
            pdf.setLineWidth(0.2);
            pdf.line(MARGIN.left + SANGRIA, yPago + 0.8, MARGIN.left + SANGRIA + ancho, yPago + 0.8);
            pdf.setTextColor(20);
            yPago += PAGO_LH;
        }
        yPago += 1.6;
    });

    y = Math.max(yFinSaldo, yPago) + 4;

    // ── Monto en letras ──
    ensureSpace(12);
    pdf.setFont('helvetica', 'bold');
    // 9.2 pt en vez de 10: el monto en letras suele caber en un solo renglón,
    // y ese renglón de más es justo lo que sacaba las firmas a otra página
    pdf.setFontSize(9.2);
    const sonTexto = calc.pagada
        ? `LIQUIDACIÓN PAGADA EN SU TOTALIDAD${liq.paidAt ? ` — ${fechaCorta(liq.paidAt)}` : ''}`
        : `Son: ${montoEnLetras(calc.saldo)} M/CTE`;
    const sonLines = pdf.splitTextToSize(sonTexto, CONTENT_WIDTH);
    pdf.text(sonLines, MARGIN.left, y);
    y += sonLines.length * 4.2 + 4;

    // ── Firmas Entrega / Recibe ──
    // ENTREGA firma con quien elaboró la liquidación: el agente, o el
    // representante legal cuando la hizo un administrador (pedido del cliente)
    const entregaNombre = (!liq.user?.name || liq.user?.role === 'ADMIN')
        ? EMPRESA.representanteLegal
        : liq.user.name;
    // Espacio amplio sobre las líneas para las estampas de firma digital, pero
    // adaptable: antes que mandar las firmas solas a una segunda página se
    // reduce el hueco (mínimo 12 mm, suficiente para una estampa).
    const ALTO_FIRMAS = 18;   // líneas + nombre + identificación bajo ellas
    const HUECO_IDEAL = 28, HUECO_MIN = 12;
    const disponible = PAGE.height - MARGIN.bottom - y - ALTO_FIRMAS;
    if (disponible < HUECO_MIN) {
        pdf.addPage();
        drawPageHeader();
        y = MARGIN.top + HUECO_IDEAL;
    } else {
        y += Math.min(HUECO_IDEAL, disponible);
    }
    const colW = (CONTENT_WIDTH - 14) / 2;
    const x2 = MARGIN.left + colW + 14;
    pdf.setDrawColor(40);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN.left, y, MARGIN.left + colW, y);
    pdf.line(x2, y, x2 + colW, y);
    y += 4.5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BODY_SIZE);
    pdf.text('ENTREGA', MARGIN.left, y);
    pdf.text('RECIBE', x2, y);
    y += LINE_HEIGHT;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(EMPRESA.razonSocial, MARGIN.left, y);
    pdf.text(origen.arrendatarioNombre || '', x2, y);
    y += LINE_HEIGHT;
    pdf.text(`NIT ${EMPRESA.nit}`, MARGIN.left, y);
    if (origen.arrendatarioCedula) {
        pdf.text(`C.C. ${formatoIdentificacion(origen.arrendatarioCedula)}`, x2, y);
    }
    y += LINE_HEIGHT;
    pdf.text(entregaNombre.toUpperCase(), MARGIN.left, y);

    // ── Pie + marca de agua ──
    // Pie de página con los datos de la inmobiliaria (pedido del cliente):
    // nombre, NIT, dirección, teléfonos y correo, en cada página.
    const isDraft = liq.status !== 'APPROVED' && liq.status !== 'PAID';
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.setDrawColor(180);
        pdf.setLineWidth(0.2);
        pdf.line(MARGIN.left, PAGE.height - 16, PAGE.width - MARGIN.right, PAGE.height - 16);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(80);
        pdf.text(`${EMPRESA.razonSocial} · NIT ${EMPRESA.nit}`, PAGE.width / 2, PAGE.height - 12.5, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(110);
        pdf.text(
            `${EMPRESA.direccion}, ${EMPRESA.ciudad} · Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
            PAGE.width / 2, PAGE.height - 9.5, { align: 'center' },
        );
        pdf.setTextColor(130);
        pdf.text(`Página ${p} de ${total}`, PAGE.width / 2, PAGE.height - 6, { align: 'center' });
        if (isDraft) {
            pdf.saveGraphicsState();
            pdf.setGState(new pdf.GState({ opacity: 0.12 }));
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(52);
            pdf.setTextColor(200, 30, 30);
            pdf.text('BORRADOR', PAGE.width / 2, PAGE.height / 2, { align: 'center', angle: 45 });
            pdf.restoreGraphicsState();
        }
        pdf.setTextColor(20);
    }

    return pdf;
}

export function liquidacionFileName(liq) {
    const nombre = (liq.data?.origen?.arrendatarioNombre || `id${liq.id}`)
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
    return `liquidacion_arrendamiento_${nombre}_L${liq.id}.pdf`;
}

export async function downloadLiquidacionPdf(liq) {
    const pdf = await generateLiquidacionPdf(liq);
    // No usar pdf.save(): en Safari produce archivos vacíos (ver downloadBlob)
    downloadBlob(pdf.output('blob'), liquidacionFileName(liq));
}
