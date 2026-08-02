// PDF de la liquidación proporcional de un servicio público (#37) con jspdf —
// mismo patrón isomorfo de liquidacionPdf.js (navegador para descargar, Node
// para correo / link público). Una página: membrete, datos del expediente,
// tabla del prorrateo propietario/arrendatario y montos en letras.

import { calcularServicioPublico } from './servicioPublicoCalc.js';
import { EMPRESA } from './contractTemplates.js';
import { formatoCifra, montoEnLetras } from './numeroALetras.js';
import { fechaCorta } from './fechaLetras.js';
import { CONTRACT_LOGO } from '../assets/contractLogo.js';
import { freshImport } from './freshImport.js';
import { downloadBlob } from './downloadBlob.js';

const PAGE = { width: 210, height: 297 };
const MARGIN = { top: 40, bottom: 22, left: 19, right: 19 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

const money = (v) => `$ ${formatoCifra(Math.round(v || 0))}`;

// `solicitud` = expediente serializado con data.servicioPublico (config) y
// los datos del solicitante/inmueble.
export async function generateServicioPublicoPdf(solicitud) {
    const { jsPDF } = await freshImport(() => import('jspdf'));
    const { default: autoTable } = await freshImport(() => import('jspdf-autotable'));

    const config = solicitud.data?.servicioPublico || {};
    const calc = calcularServicioPublico(config);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const drawPageHeader = () => {
        try {
            pdf.addImage(CONTRACT_LOGO, 'JPEG', MARGIN.left, 8, 34, 14);
        } catch { /* sin logo el documento sigue siendo válido */ }
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(90);
        pdf.text(`Radicado ${solicitud.radicado}`, PAGE.width - MARGIN.right, 12, { align: 'right' });
        pdf.setTextColor(20);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text('LIQUIDACIÓN PROPORCIONAL DE SERVICIO PÚBLICO', PAGE.width / 2, 24, { align: 'center' });
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
    };

    drawPageHeader();
    let y = MARGIN.top;

    // ── Datos del expediente ──
    const campos = [
        ['Servicio', config.servicio || ''],
        ['No. de factura', config.numeroFactura || ''],
        ['Inmueble', solicitud.property?.address || config.direccionInmueble || ''],
        ['Período facturado', config.fechaInicialPeriodo
            ? `${fechaCorta(config.fechaInicialPeriodo)} al ${fechaCorta(config.fechaFinalPeriodo)} (${calc.diasPeriodo} días)` : ''],
        ['Entrega del inmueble', config.fechaEntrega ? fechaCorta(config.fechaEntrega) : ''],
        ['Valor total de la factura', money(calc.valorTotal)],
    ].filter(([, v]) => v !== '');

    autoTable(pdf, {
        startY: y,
        margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top },
        body: campos.map(([k, v]) => [k, { content: v, styles: { fontStyle: 'bold' } }]),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: [15, 15, 15] },
        columnStyles: { 0: { cellWidth: 55 } },
    });
    y = pdf.lastAutoTable.finalY + 6;

    // ── Prorrateo ──
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('DISTRIBUCIÓN PROPORCIONAL', MARGIN.left, y);
    y += 3;
    autoTable(pdf, {
        startY: y,
        margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top },
        head: [['Parte', 'Días a cargo', 'Valor diario', 'Valor a pagar']],
        body: [
            ['PROPIETARIO', String(calc.diasPropietario), money(calc.valorDiario), money(calc.valorPropietario)],
            ['ARRENDATARIO', String(calc.diasArrendatario), money(calc.valorDiario), money(calc.valorArrendatario)],
            [{ content: 'TOTAL', styles: { fontStyle: 'bold' } }, String(calc.diasPeriodo), '',
                { content: money(calc.valorTotal), styles: { fontStyle: 'bold' } }],
        ],
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.2, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: [15, 15, 15] },
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' },
        },
    });
    y = pdf.lastAutoTable.finalY + 5;

    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(80);
    const formula = `Cálculo: $${formatoCifra(calc.valorTotal)} ÷ ${calc.diasPeriodo} días = ${money(calc.valorDiario)}/día. El propietario responde por los días anteriores a la entrega del inmueble y el arrendatario desde el día de la entrega (inclusive).`;
    const formulaLines = pdf.splitTextToSize(formula, CONTENT_WIDTH);
    pdf.text(formulaLines, MARGIN.left, y);
    y += formulaLines.length * 3.5 + 5;
    pdf.setTextColor(20);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.2);
    const sonLines = pdf.splitTextToSize(
        `Propietario: ${montoEnLetras(calc.valorPropietario)} M/CTE · Arrendatario: ${montoEnLetras(calc.valorArrendatario)} M/CTE`,
        CONTENT_WIDTH,
    );
    pdf.text(sonLines, MARGIN.left, y);
    y += sonLines.length * 4.2 + 4;

    if (config.nota) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        const notaLines = pdf.splitTextToSize(`Observaciones: ${config.nota}`, CONTENT_WIDTH);
        pdf.text(notaLines, MARGIN.left, y);
    }

    // ── Pie ──
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
        pdf.setTextColor(20);
    }

    return pdf;
}

export function servicioPublicoFileName(solicitud) {
    const servicio = (solicitud.data?.servicioPublico?.servicio || 'servicio')
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30);
    return `liquidacion_${servicio}_${solicitud.radicado}.pdf`;
}

export async function downloadServicioPublicoPdf(solicitud) {
    const pdf = await generateServicioPublicoPdf(solicitud);
    // No usar pdf.save(): en Safari produce archivos vacíos (ver downloadBlob)
    downloadBlob(pdf.output('blob'), servicioPublicoFileName(solicitud));
}
