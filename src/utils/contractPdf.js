// Genera el PDF de un contrato con jspdf (import dinámico, mismo patrón que
// el export del Dashboard). Renderiza los bloques de buildContractDocument;
// si el contrato no está aprobado, imprime marca de agua "BORRADOR".

import { buildContractDocument } from './contractDocument.js';

const PAGE = { width: 210, height: 297 };      // A4 vertical, mm
const MARGIN = { top: 20, bottom: 18, left: 18, right: 18 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const LINE_HEIGHT = 4.2;                        // para fuente 9.5

export async function generateContractPdf(contract) {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const docDef = buildContractDocument(contract.type, contract.data);
    if (!docDef) throw new Error('Tipo de contrato desconocido');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = MARGIN.top;

    const ensureSpace = (needed) => {
        if (y + needed > PAGE.height - MARGIN.bottom) {
            pdf.addPage();
            y = MARGIN.top;
        }
    };

    for (const block of docDef.blocks) {
        if (block.kind === 'title') {
            pdf.setFont('times', 'bold');
            pdf.setFontSize(13);
            const lines = pdf.splitTextToSize(block.text, CONTENT_WIDTH);
            ensureSpace(lines.length * 6 + 4);
            pdf.text(lines, PAGE.width / 2, y, { align: 'center' });
            y += lines.length * 6 + 4;
        } else if (block.kind === 'subtitle') {
            pdf.setFont('times', 'bold');
            pdf.setFontSize(11);
            ensureSpace(10);
            y += 2;
            pdf.text(block.text, PAGE.width / 2, y, { align: 'center' });
            y += 7;
        } else if (block.kind === 'table') {
            autoTable(pdf, {
                startY: y,
                margin: { left: MARGIN.left, right: MARGIN.right },
                head: [],
                body: block.rows,
                theme: 'grid',
                styles: { font: 'times', fontSize: 8.5, cellPadding: 1.6, lineColor: [120, 120, 120], lineWidth: 0.15, textColor: [20, 20, 20] },
                columnStyles: {
                    0: { cellWidth: 58, fontStyle: 'bold', fillColor: [243, 244, 246] },
                    1: { cellWidth: CONTENT_WIDTH - 58 },
                },
            });
            y = pdf.lastAutoTable.finalY + 6;
        } else if (block.kind === 'paragraph') {
            pdf.setFont('times', 'normal');
            pdf.setFontSize(9.5);
            const lines = pdf.splitTextToSize(block.text, CONTENT_WIDTH);
            for (const line of lines) {
                ensureSpace(LINE_HEIGHT);
                pdf.text(line, MARGIN.left, y, { maxWidth: CONTENT_WIDTH });
                y += LINE_HEIGHT;
            }
            y += 2.5;
        } else if (block.kind === 'signature') {
            const height = 14 + block.lines.length * LINE_HEIGHT;
            ensureSpace(height + 6);
            y += 10;
            pdf.setFont('times', 'normal');
            pdf.setFontSize(9.5);
            pdf.line(MARGIN.left, y, MARGIN.left + 70, y); // línea de firma
            y += 4.5;
            pdf.setFont('times', 'bold');
            pdf.text(block.role, MARGIN.left, y);
            y += LINE_HEIGHT + 0.5;
            pdf.setFont('times', 'normal');
            for (const line of block.lines) {
                ensureSpace(LINE_HEIGHT);
                pdf.text(line, MARGIN.left, y);
                y += LINE_HEIGHT;
            }
        }
    }

    // Pie de página + marca de agua en todas las páginas
    const isDraft = contract.status !== 'APPROVED' && contract.status !== 'SENT';
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.setFont('times', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(130);
        pdf.text(
            `TuLlave Inmobiliaria — página ${p} de ${total}`,
            PAGE.width / 2, PAGE.height - 8, { align: 'center' }
        );
        if (isDraft) {
            pdf.saveGraphicsState();
            pdf.setGState(new pdf.GState({ opacity: 0.13 }));
            pdf.setFont('times', 'bold');
            pdf.setFontSize(52);
            pdf.setTextColor(200, 30, 30);
            pdf.text('BORRADOR', PAGE.width / 2, PAGE.height / 2, { align: 'center', angle: 45 });
            pdf.restoreGraphicsState();
        }
        pdf.setTextColor(20);
    }

    return pdf;
}

// Nombre de archivo: contrato_arrendamiento_maria-rivera_2026-07-10.pdf
export function contractFileName(contract) {
    const tipo = contract.type === 'ADMINISTRACION' ? 'administracion' : 'arrendamiento';
    const nombre = (contract.data?.propietarioNombre || contract.data?.arrendatarioNombre || `id${contract.id}`)
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
    const fecha = new Date().toISOString().slice(0, 10);
    return `contrato_${tipo}_${nombre}_${fecha}.pdf`;
}

export async function downloadContractPdf(contract) {
    const pdf = await generateContractPdf(contract);
    pdf.save(contractFileName(contract));
}
