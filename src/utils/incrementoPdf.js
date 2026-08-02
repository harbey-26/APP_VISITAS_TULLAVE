// PDF de la carta de incremento de canon (I1) con jspdf — mismo patrón
// isomorfo de liquidacionPdf.js: import dinámico, corre en el navegador para
// descargar y en Node para el correo / link público. El contenido sale de
// cartaIncremento() (incrementoDocument.js); aquí solo se dibuja.
// Marca de agua BORRADOR mientras la carta no se haya enviado.

import { cartaIncremento } from './incrementoDocument.js';
import { EMPRESA } from './contractTemplates.js';
import { CONTRACT_LOGO } from '../assets/contractLogo.js';
import { freshImport } from './freshImport.js';
import { downloadBlob } from './downloadBlob.js';

const PAGE = { width: 210, height: 297 };  // A4 vertical, mm
const MARGIN = { top: 40, bottom: 22, left: 22, right: 22 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 5;

// `incremento` = registro serializado con `snapshot` (el data congelado al
// enviar, o el snapshot en vivo para la vista previa) y `status`.
export async function generateIncrementoPdf(incremento) {
    const { jsPDF } = await freshImport(() => import('jspdf'));
    const snap = incremento.snapshot;
    const carta = cartaIncremento(snap);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = MARGIN.top;

    const drawPageHeader = () => {
        try {
            pdf.addImage(CONTRACT_LOGO, 'JPEG', MARGIN.left, 8, 34, 14);
        } catch { /* sin logo la carta sigue siendo válida */ }
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(90);
        pdf.text(`Incremento ${snap.periodo} · No. I-${incremento.id}`, PAGE.width - MARGIN.right, 12, { align: 'right' });
        pdf.setTextColor(20);
        pdf.setDrawColor(160);
        pdf.setLineWidth(0.2);
        pdf.line(MARGIN.left, 26, PAGE.width - MARGIN.right, 26);
    };

    const ensureSpace = (needed) => {
        if (y + needed > PAGE.height - MARGIN.bottom) {
            pdf.addPage();
            drawPageHeader();
            y = MARGIN.top;
        }
    };

    const writeLines = (texto, { bold = false, size = BODY_SIZE, gap = 0 } = {}) => {
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(texto, CONTENT_WIDTH);
        for (const line of lines) {
            ensureSpace(LINE_HEIGHT);
            pdf.text(line, MARGIN.left, y);
            y += LINE_HEIGHT;
        }
        y += gap;
    };

    drawPageHeader();

    // Ciudad y fecha
    writeLines(carta.ciudadFecha, { gap: 6 });

    // Destinatario
    carta.destinatario.forEach((l, i) => writeLines(l, { bold: i === 1 }));
    y += 4;

    // Referencia
    writeLines(carta.referencia, { bold: true, gap: 4 });
    writeLines(carta.saludo, { gap: 3 });

    for (const p of carta.parrafos) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(BODY_SIZE);
        const lines = pdf.splitTextToSize(p, CONTENT_WIDTH);
        ensureSpace(lines.length * LINE_HEIGHT + 3);
        pdf.text(lines, MARGIN.left, y, { maxWidth: CONTENT_WIDTH, align: 'justify' });
        y += lines.length * LINE_HEIGHT + 3;
    }

    // Tabla del desglose: etiqueta a la izquierda, valor a la derecha,
    // última fila (nuevo canon) resaltada.
    const TABLA_W = 120;
    const xTabla = MARGIN.left + (CONTENT_WIDTH - TABLA_W) / 2;
    ensureSpace(carta.tabla.length * 8 + 6);
    carta.tabla.forEach(([label, valor], i) => {
        const esTotal = i === carta.tabla.length - 1;
        if (esTotal) {
            pdf.setFillColor(232, 232, 232);
            pdf.rect(xTabla, y - 5, TABLA_W, 8, 'F');
        }
        pdf.setFont('helvetica', esTotal ? 'bold' : 'normal');
        pdf.setFontSize(esTotal ? 10.5 : 10);
        pdf.text(label, xTabla + 2, y);
        pdf.text(valor, xTabla + TABLA_W - 2, y, { align: 'right' });
        pdf.setDrawColor(150);
        pdf.setLineWidth(0.15);
        pdf.line(xTabla, y + 2.6, xTabla + TABLA_W, y + 2.6);
        y += 8;
    });
    y += 2;
    writeLines(carta.montoEnLetras, { bold: true, size: 9.5, gap: 4 });

    for (const p of carta.parrafosCierre) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(BODY_SIZE);
        const lines = pdf.splitTextToSize(p, CONTENT_WIDTH);
        ensureSpace(lines.length * LINE_HEIGHT + 3);
        pdf.text(lines, MARGIN.left, y, { maxWidth: CONTENT_WIDTH, align: 'justify' });
        y += lines.length * LINE_HEIGHT + 3;
    }

    // Despedida y firma (con hueco para la firma del representante)
    writeLines(carta.despedida, { gap: 0 });
    ensureSpace(22 + carta.firma.length * LINE_HEIGHT);
    y += 18;
    carta.firma.forEach((l, i) => writeLines(l, { bold: i === 0, size: i === 0 ? BODY_SIZE : 9.5 }));

    // ── Pie + marca de agua ──
    const esBorrador = incremento.status === 'PENDIENTE';
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
        if (esBorrador) {
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

export function incrementoFileName(incremento) {
    const snap = incremento.snapshot || {};
    const nombre = (snap.arrendatarioNombre || `id${incremento.id}`)
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
    return `carta_incremento_${snap.periodo || ''}_${nombre}_I${incremento.id}.pdf`;
}

export async function downloadIncrementoPdf(incremento) {
    const pdf = await generateIncrementoPdf(incremento);
    // No usar pdf.save(): en Safari produce archivos vacíos (ver downloadBlob)
    downloadBlob(pdf.output('blob'), incrementoFileName(incremento));
}
