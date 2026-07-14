// Genera el PDF de un contrato con jspdf (import dinámico, mismo patrón que
// el export del Dashboard), replicando el membrete y la diagramación de las
// proformas .docx de la inmobiliaria: logo + código de formato en cada
// página, tipografía sans (Arial→helvetica), encabezado etiqueta/valor en
// negrita y cláusulas justificadas con el título de la cláusula en negrita
// inline. Si el contrato no está aprobado, imprime marca de agua "BORRADOR".

import { buildContractDocument, splitMarks, stripMarks, VALUE_MARK } from './contractDocument.js';
import { CONTRACT_LOGO } from '../assets/contractLogo.js';
import { freshImport } from './freshImport.js';
import { downloadBlob } from './downloadBlob.js';

const PAGE = { width: 210, height: 297 };       // A4 vertical, mm
const MARGIN = { top: 40, bottom: 16, left: 19, right: 19 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const BODY_SIZE = 10;                            // ~ proforma (11pt Word)
const LINE_HEIGHT = 4.4;
const KV_LABEL_WIDTH = 52;                       // columna de etiquetas del encabezado

// Pequeño colchón en las medidas de negrita: la Helvetica-Bold de algunos
// visores es una fracción más ancha que las métricas AFM de jspdf y sin él
// el título de la cláusula puede rozar la palabra siguiente.
const BOLD_WIDTH_CUSHION = 1.01;

// Convierte una cadena con marcas de negrilla (#22) en "palabras". Cada palabra
// es una lista de runs { text, bold, width }, de modo que un valor dinámico
// pegado a texto fijo sin espacio (ej.: "3%", "(2027).") se mantiene junto y
// solo la parte dinámica va en negrilla. Las palabras se separan por espacios.
function wordsFromMarked(pdf, marked, size) {
    const words = [];
    let cur = null;
    for (const seg of splitMarks(marked)) {
        for (const piece of seg.text.split(/(\s+)/)) {
            if (piece === '') continue;
            if (/^\s+$/.test(piece)) {
                if (cur) { words.push(cur); cur = null; }
                continue;
            }
            pdf.setFont('helvetica', seg.bold ? 'bold' : 'normal');
            pdf.setFontSize(size);
            const width = pdf.getTextWidth(piece) * (seg.bold ? BOLD_WIDTH_CUSHION : 1);
            if (!cur) cur = { runs: [], width: 0 };
            cur.runs.push({ text: piece, bold: seg.bold, width });
            cur.width += width;
        }
    }
    if (cur) words.push(cur);
    return words;
}

export async function generateContractPdf(contract) {
    const { jsPDF } = await freshImport(() => import('jspdf'));
    const { default: autoTable } = await freshImport(() => import('jspdf-autotable'));

    const docDef = buildContractDocument(contract.type, contract.data);
    if (!docDef) throw new Error('Tipo de contrato desconocido');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = MARGIN.top;

    // ── Membrete (cada página): logo + código de formato + título ──
    // Restaura fuente y tamaño al salir: el membrete se dibuja en medio de
    // párrafos (saltos de página) y si dejara su tamaño (11/8) activo, el
    // resto del párrafo saldría 10% más grande de lo calculado — títulos de
    // cláusula encimados con el texto y líneas por fuera del margen derecho.
    const drawPageHeader = () => {
        const prevFont = pdf.getFont();
        const prevSize = pdf.getFontSize();
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
        pdf.setFont(prevFont.fontName, prevFont.fontStyle);
        pdf.setFontSize(prevSize);
    };

    const newPage = () => {
        pdf.addPage();
        drawPageHeader();
        y = MARGIN.top;
    };

    const ensureSpace = (needed) => {
        if (y + needed > PAGE.height - MARGIN.bottom) newPage();
    };

    // Dibuja un texto (con marcas de negrilla) que se ajusta al ancho. Cada
    // palabra se dibuja run por run en su x exacto — sin `Tw` — para poder
    // mezclar normal/negrilla dentro de una palabra. `justify` reparte el
    // sobrante entre palabras (última línea nunca se justifica).
    const drawMarkedText = (marked, { justify = true, startX = MARGIN.left } = {}) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(BODY_SIZE);
        const spaceW = pdf.getTextWidth(' ');
        const maxW = PAGE.width - MARGIN.right - startX;

        const words = wordsFromMarked(pdf, marked, BODY_SIZE);
        if (words.length === 0) return;

        // partir en líneas
        const lines = [];
        let line = [];
        let lineW = 0;
        for (const w of words) {
            const extra = line.length > 0 ? spaceW : 0;
            if (lineW + extra + w.width > maxW && line.length > 0) {
                lines.push({ words: line, w: lineW });
                line = [];
                lineW = 0;
            }
            line.push(w);
            lineW += (line.length > 1 ? spaceW : 0) + w.width;
        }
        if (line.length > 0) lines.push({ words: line, w: lineW });

        lines.forEach((ln, li) => {
            ensureSpace(LINE_HEIGHT);
            const isLast = li === lines.length - 1;
            const gaps = ln.words.length - 1;
            const extraGap = (justify && !isLast && gaps > 0) ? Math.max(0, (maxW - ln.w) / gaps) : 0;
            let x = startX;
            ln.words.forEach((word, wi) => {
                for (const run of word.runs) {
                    pdf.setFont('helvetica', run.bold ? 'bold' : 'normal');
                    pdf.text(run.text, x, y);
                    x += run.width;
                }
                if (wi < ln.words.length - 1) x += spaceW + extraGap;
            });
            y += LINE_HEIGHT;
        });
    };

    drawPageHeader();

    for (const block of docDef.blocks) {
        if (block.kind === 'title') {
            // el título ya va en el membrete; se omite en el cuerpo
            continue;
        } else if (block.kind === 'subtitle') {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            // Separación clara entre el encabezado de datos y CONDICIONES
            // GENERALES / CLÁUSULAS (issue #24). Si no cabe el título + su
            // aire, pasa de página en vez de quedar pegado al borde.
            ensureSpace(18);
            y += 9;
            pdf.text(block.text, PAGE.width / 2, y, { align: 'center' });
            y += 7;
        } else if (block.kind === 'kv') {
            // Encabezado del arrendamiento: etiqueta y valor en negrilla (como la
            // proforma). Las marcas se quitan aquí porque ya va todo en negrilla.
            pdf.setFontSize(BODY_SIZE);
            pdf.setFont('helvetica', 'bold');
            const valueLines = pdf.splitTextToSize(stripMarks(block.value), CONTENT_WIDTH - KV_LABEL_WIDTH);
            ensureSpace(valueLines.length * LINE_HEIGHT + 1);
            pdf.text(block.label, MARGIN.left, y);
            pdf.text(valueLines, MARGIN.left + KV_LABEL_WIDTH, y);
            y += valueLines.length * LINE_HEIGHT + 1.2;
        } else if (block.kind === 'table') {
            // Cuadro resumen: etiqueta (fija) normal, valor (dinámico) en
            // negrilla (#22). autoTable no admite negrilla parcial, así que se
            // quitan las marcas y se pone toda la columna de valores en negrilla.
            const rows = block.rows.map(([label, value]) => [stripMarks(label), stripMarks(value)]);
            autoTable(pdf, {
                startY: y,
                margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top },
                head: [],
                body: rows,
                theme: 'grid',
                styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.5, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: [15, 15, 15] },
                columnStyles: {
                    0: { cellWidth: 52 },
                    1: { cellWidth: CONTENT_WIDTH - 52, fontStyle: 'bold' },
                },
                didAddPage: () => { drawPageHeader(); },
            });
            y = pdf.lastAutoTable.finalY + 5;
        } else if (block.kind === 'clause') {
            // Título de la cláusula en negrilla + texto con valores dinámicos
            // en negrilla. El lead se marca envolviéndolo en el centinela.
            drawMarkedText(`${VALUE_MARK}${block.lead}${VALUE_MARK} ${block.text}`);
            y += 2.2;
        } else if (block.kind === 'paragraph') {
            drawMarkedText(block.text);
            y += 2.2;
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
            // Cada línea (NOMBRE: valor) con el valor en negrilla; envuelve si es larga
            for (const line of block.lines) {
                drawMarkedText(line, { justify: false });
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

// Nombre de archivo: el Código Wasi (identificador del contrato) si existe —
// p. ej. "840-123.pdf" — o el esquema descriptivo anterior como respaldo para
// contratos creados antes del campo.
export function contractFileName(contract) {
    const wasi = String(contract.data?.codigoWasi || '').trim();
    if (wasi) {
        const limpio = wasi.normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
        if (limpio) return `${limpio}.pdf`;
    }
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
    downloadBlob(pdf.output('blob'), contractFileName(contract));
}
