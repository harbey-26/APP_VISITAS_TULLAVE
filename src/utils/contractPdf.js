// Genera el PDF de un contrato con jspdf (import dinámico, mismo patrón que
// el export del Dashboard), replicando el membrete y la diagramación de las
// proformas .docx de la inmobiliaria: logo + código de formato en cada
// página, tipografía sans (Arial→helvetica), encabezado etiqueta/valor en
// negrita y cláusulas justificadas con el título de la cláusula en negrita
// inline. Si el contrato no está aprobado, imprime marca de agua "BORRADOR".

import { buildContractDocument } from './contractDocument.js';
import { CONTRACT_LOGO } from '../assets/contractLogo.js';

const PAGE = { width: 210, height: 297 };       // A4 vertical, mm
const MARGIN = { top: 40, bottom: 16, left: 19, right: 19 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const BODY_SIZE = 10;                            // ~ proforma (11pt Word)
const LINE_HEIGHT = 4.4;
const KV_LABEL_WIDTH = 52;                       // columna de etiquetas del encabezado

// La Helvetica-Bold de algunos visores (PDFKit de macOS/iOS) es ~1% más
// ancha que las métricas AFM de jspdf; sin colchón, la deriva acumulada en
// títulos de cláusula largos se come el espacio con la palabra siguiente.
const BOLD_WIDTH_CUSHION = 1.02;

// Divide un texto con estilo en palabras medibles.
function tokenize(pdf, segments, size) {
    const words = [];
    for (const seg of segments) {
        if (!seg.text) continue;
        pdf.setFont('helvetica', seg.bold ? 'bold' : 'normal');
        pdf.setFontSize(size);
        for (const w of seg.text.split(/\s+/)) {
            if (!w) continue;
            const width = pdf.getTextWidth(w) * (seg.bold ? BOLD_WIDTH_CUSHION : 1);
            words.push({ text: w, bold: seg.bold, width });
        }
    }
    return words;
}

export async function generateContractPdf(contract) {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const docDef = buildContractDocument(contract.type, contract.data);
    if (!docDef) throw new Error('Tipo de contrato desconocido');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = MARGIN.top;

    // ── Membrete (cada página): logo + código de formato + título ──
    const drawPageHeader = () => {
        try {
            // logo 343x141 px → 34 x 14 mm
            pdf.addImage(CONTRACT_LOGO, 'JPEG', MARGIN.left, 8, 34, 14);
        } catch { /* si el logo falla, el contrato sigue siendo válido */ }
        if (docDef.pageHeader?.code) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(90);
            pdf.text(docDef.pageHeader.code, PAGE.width - MARGIN.right, 12, { align: 'right' });
            pdf.setTextColor(20);
        }
        if (docDef.pageHeader?.title) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            const lines = pdf.splitTextToSize(docDef.pageHeader.title, CONTENT_WIDTH);
            pdf.text(lines, PAGE.width / 2, 28, { align: 'center' });
        }
        // línea sutil bajo el membrete
        pdf.setDrawColor(160);
        pdf.setLineWidth(0.2);
        pdf.line(MARGIN.left, 34, PAGE.width - MARGIN.right, 34);
    };

    const newPage = () => {
        pdf.addPage();
        drawPageHeader();
        y = MARGIN.top;
    };

    const ensureSpace = (needed) => {
        if (y + needed > PAGE.height - MARGIN.bottom) newPage();
    };

    // Párrafo justificado con soporte de negrita inline (lead de cláusula).
    // La justificación se hace con el operador PDF `Tw` (word spacing): el
    // visor estira los espacios de la cadena completa, así que no dependemos
    // de que nuestras métricas coincidan al posicionar palabra por palabra
    // (posicionar cada palabra por separado hacía que se pegaran entre sí en
    // visores cuya Helvetica difiere de las métricas de jspdf).
    const setWordSpacing = (mm) => {
        pdf.internal.write(`${(mm * pdf.internal.scaleFactor).toFixed(3)} Tw`);
    };

    const drawRichParagraph = (segments) => {
        const words = tokenize(pdf, segments, BODY_SIZE);
        if (words.length === 0) return;
        pdf.setFontSize(BODY_SIZE);
        pdf.setFont('helvetica', 'normal');
        const spaceW = pdf.getTextWidth(' ');

        // 1) partir en líneas con nuestras métricas
        const lines = [];
        let line = [];
        let lineW = 0;
        for (const w of words) {
            const extra = line.length > 0 ? spaceW : 0;
            if (lineW + extra + w.width > CONTENT_WIDTH && line.length > 0) {
                lines.push(line);
                line = [];
                lineW = 0;
            }
            line.push(w);
            lineW += (line.length > 1 ? spaceW : 0) + w.width;
        }
        if (line.length > 0) lines.push(line);

        // 2) dibujar cada línea como corridas de un mismo estilo
        lines.forEach((ws, li) => {
            ensureSpace(LINE_HEIGHT);
            const isLast = li === lines.length - 1;
            const gaps = ws.length - 1;
            const contentW = ws.reduce((s, w) => s + w.width, 0) + gaps * spaceW;
            const tw = (!isLast && gaps > 0) ? Math.max(0, (CONTENT_WIDTH - contentW) / gaps) : 0;
            setWordSpacing(tw);

            // corridas consecutivas del mismo estilo → una sola cadena
            let x = MARGIN.left;
            let run = [];
            const flushRun = () => {
                if (run.length === 0) return;
                pdf.setFont('helvetica', run[0].bold ? 'bold' : 'normal');
                pdf.text(run.map((w) => w.text).join(' '), x, y);
                const runW = run.reduce((s, w) => s + w.width, 0) + (run.length - 1) * (spaceW + tw);
                x += runW + spaceW + tw; // espacio entre corridas
                run = [];
            };
            for (const w of ws) {
                if (run.length > 0 && run[0].bold !== w.bold) flushRun();
                run.push(w);
            }
            flushRun();
            y += LINE_HEIGHT;
        });
        setWordSpacing(0);
        y += 2.2;
    };

    drawPageHeader();

    for (const block of docDef.blocks) {
        if (block.kind === 'title') {
            // el título ya va en el membrete; se omite en el cuerpo
            continue;
        } else if (block.kind === 'subtitle') {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            ensureSpace(10);
            y += 2;
            pdf.text(block.text, PAGE.width / 2, y, { align: 'center' });
            y += 7;
        } else if (block.kind === 'kv') {
            pdf.setFontSize(BODY_SIZE);
            pdf.setFont('helvetica', 'bold');
            const valueLines = pdf.splitTextToSize(block.value, CONTENT_WIDTH - KV_LABEL_WIDTH);
            ensureSpace(valueLines.length * LINE_HEIGHT + 1);
            pdf.text(block.label, MARGIN.left, y);
            pdf.text(valueLines, MARGIN.left + KV_LABEL_WIDTH, y);
            y += valueLines.length * LINE_HEIGHT + 1.2;
        } else if (block.kind === 'table') {
            autoTable(pdf, {
                startY: y,
                margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top },
                head: [],
                body: block.rows,
                theme: 'grid',
                styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.5, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: [15, 15, 15] },
                columnStyles: {
                    0: { cellWidth: 52, fontStyle: 'bold' },
                    1: { cellWidth: CONTENT_WIDTH - 52 },
                },
                didAddPage: () => { drawPageHeader(); },
            });
            y = pdf.lastAutoTable.finalY + 5;
        } else if (block.kind === 'clause') {
            drawRichParagraph([
                { text: block.lead, bold: true },
                { text: block.text, bold: false },
            ]);
        } else if (block.kind === 'paragraph') {
            drawRichParagraph([{ text: block.text, bold: false }]);
        } else if (block.kind === 'signature') {
            const height = 16 + block.lines.length * LINE_HEIGHT;
            ensureSpace(height + 4);
            y += 11;
            pdf.setFontSize(BODY_SIZE);
            pdf.setFont('helvetica', 'normal');
            pdf.setDrawColor(40);
            pdf.setLineWidth(0.3);
            pdf.line(MARGIN.left, y, MARGIN.left + 70, y); // línea de firma
            y += 4.5;
            pdf.setFont('helvetica', 'bold');
            pdf.text(block.role, MARGIN.left, y);
            y += LINE_HEIGHT + 0.5;
            pdf.setFont('helvetica', 'normal');
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
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(130);
        pdf.text(`Página ${p} de ${total}`, PAGE.width / 2, PAGE.height - 7, { align: 'center' });
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

// Nombre de archivo: contrato_arrendamiento_maria-rivera_2026-07-10.pdf
export function contractFileName(contract) {
    const tipo = contract.type === 'ADMINISTRACION' ? 'administracion' : 'arrendamiento';
    const nombre = (contract.data?.propietarioNombre || contract.data?.arrendatarioNombre || `id${contract.id}`)
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
    // Fecha local, no UTC (de noche en Bogotá toISOString ya va en mañana)
    const d = new Date();
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `contrato_${tipo}_${nombre}_${fecha}.pdf`;
}

export async function downloadContractPdf(contract) {
    const pdf = await generateContractPdf(contract);
    // No usar pdf.save(): en Safari produce archivos vacíos (revoca el
    // object URL antes de que termine la escritura). Ver utils/downloadBlob.
    const { downloadBlob } = await import('./downloadBlob.js');
    downloadBlob(pdf.output('blob'), contractFileName(contract));
}
