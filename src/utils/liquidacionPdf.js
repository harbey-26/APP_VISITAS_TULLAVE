// Genera el PDF de una liquidación inicial de contrato de arrendamiento con
// jspdf (mismo patrón isomorfo de contractPdf.js: import dinámico, corre en el
// navegador para descargar y en Node para el correo / link público). Replica
// el formato del Excel de la inmobiliaria: membrete, datos del arrendatario,
// tabla de conceptos, totales con abonos y saldo, monto en letras, datos de
// consignación y firmas Entrega/Recibe. Marca de agua BORRADOR si no está
// aprobada.

import { calcularLiquidacion } from './liquidacionCalc.js';
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
    const kvRows = [
        ['Arrendatario', origen.arrendatarioNombre || ''],
        ['Identificación', origen.arrendatarioCedula ? `C.C. ${formatoIdentificacion(origen.arrendatarioCedula)}` : ''],
        ['Teléfono', origen.arrendatarioCelular || ''],
        ['Correo', origen.arrendatarioEmail || ''],
        ['Dirección del inmueble', origen.direccionCompleta || ''],
        ['Código', origen.codigoWasi || ''],
        ['Vigencia del contrato', origen.fechaInicioContrato
            ? `${fechaCorta(origen.fechaInicioContrato)} al ${fechaCorta(origen.fechaFinContrato)}` : ''],
        ['Canon mensual', money(Number(origen.canonMensual) || 0)],
        ...(Number(origen.administracionMensual) > 0
            ? [['Administración mensual', money(Number(origen.administracionMensual))]] : []),
        ['Período liquidado', config.fechaInicialCobro
            ? `${fechaCorta(config.fechaInicialCobro)} al ${fechaCorta(config.fechaFinalCobro)} (${calc.dias} días)` : ''],
    ].filter(([, v]) => v !== '');

    autoTable(pdf, {
        startY: y,
        margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top },
        head: [],
        body: kvRows,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.5, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: [15, 15, 15] },
        columnStyles: {
            0: { cellWidth: 52 },
            1: { cellWidth: CONTENT_WIDTH - 52, fontStyle: 'bold' },
        },
        didAddPage: () => { drawPageHeader(); },
    });
    y = pdf.lastAutoTable.finalY + 6;

    // ── Conceptos ──
    // Cada concepto va TOTALIZADO (IVA incluido en el valor), igual que en el
    // formulario: el IVA se menciona como nota en el detalle, sin columna
    // propia (pedido del cliente — no desglosar el IVA en el PDF).
    autoTable(pdf, {
        startY: y,
        margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top },
        head: [['Concepto', 'Detalle', 'Valor']],
        body: calc.lineas.map((l) => [
            l.concepto,
            [l.detalle, l.iva ? `Incluye IVA 19%: ${money(l.iva)}` : '']
                .filter(Boolean).join('\n'),
            moneySigned(l.total),
        ]),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: [15, 15, 15] },
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 58 },
            1: { cellWidth: CONTENT_WIDTH - 58 - 32 },
            2: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
        },
        didAddPage: () => { drawPageHeader(); },
    });
    y = pdf.lastAutoTable.finalY + 6;

    // ── Totales, abonos y saldo ──
    const totRows = [
        ['Subtotal proporcional', money(calc.subtotalProporcional)],
        ['Servicios', money(calc.subtotalServicios)],
        ['IVA 19%', money(calc.totalIva)],
        ['TOTAL GENERAL', money(calc.totalGeneral)],
        // a.fecha puede ser Date (server) o ISO string (browser) — partesFecha
        // dentro de fechaCorta entiende ambos; no convertir con String().slice()
        ...calc.abonos.map((a) => [
            `Abono${a.fecha ? ` — ${fechaCorta(a.fecha)}` : ''}${a.nota ? ` (${a.nota})` : ''}`,
            `- ${money(a.valor)}`,
        ]),
        ['SALDO A PAGAR', money(calc.saldo)],
    ];
    const TOT_LABEL_W = CONTENT_WIDTH - 60 - 34;
    autoTable(pdf, {
        startY: y,
        margin: { left: MARGIN.left + 60, right: MARGIN.right, top: MARGIN.top },
        head: [],
        body: totRows,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.2, textColor: [15, 15, 15] },
        columnStyles: {
            0: { cellWidth: TOT_LABEL_W, halign: 'right' },
            1: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (hook) => {
            const label = totRows[hook.row.index][0];
            if (label === 'TOTAL GENERAL' || label === 'SALDO A PAGAR') {
                hook.cell.styles.fontStyle = 'bold';
                hook.cell.styles.fontSize = 10;
                hook.cell.styles.fillColor = [235, 235, 235];
            }
        },
        didAddPage: () => { drawPageHeader(); },
    });
    y = pdf.lastAutoTable.finalY + 6;

    // ── Monto en letras ──
    ensureSpace(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BODY_SIZE);
    const sonTexto = calc.pagada
        ? `LIQUIDACIÓN PAGADA EN SU TOTALIDAD${liq.paidAt ? ` — ${fechaCorta(liq.paidAt)}` : ''}`
        : `Son: ${montoEnLetras(calc.saldo)} M/CTE`;
    const sonLines = pdf.splitTextToSize(sonTexto, CONTENT_WIDTH);
    pdf.text(sonLines, MARGIN.left, y);
    y += sonLines.length * LINE_HEIGHT + 5;

    // ── Datos para consignación ──
    ensureSpace(24);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BODY_SIZE);
    pdf.text('DATOS PARA CONSIGNACIÓN', MARGIN.left, y);
    y += LINE_HEIGHT + 1;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const consignacion = [
        `Titular: ${EMPRESA.razonSocial} — NIT ${EMPRESA.nit}`,
        `${EMPRESA.bancoRecaudo}, ${EMPRESA.cuentaRecaudo}`,
    ];
    for (const line of consignacion) {
        pdf.text(line, MARGIN.left, y);
        y += LINE_HEIGHT;
    }
    y += 4;

    // ── Firmas Entrega / Recibe ──
    // ENTREGA firma con quien elaboró la liquidación: el agente, o el
    // representante legal cuando la hizo un administrador (pedido del cliente)
    const entregaNombre = (!liq.user?.name || liq.user?.role === 'ADMIN')
        ? EMPRESA.representanteLegal
        : liq.user.name;
    ensureSpace(38);
    y += 14;
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
