// Helpers de data URLs (adjuntos guardados en base64). Módulo puro: lo usan
// tanto el Centro de Solicitudes como el Portal de Clientes, sin que los
// controladores se importen entre sí.

// SEGURIDAD: peso REAL del archivo, medido sobre el base64. El campo `size`
// que envía el cliente es informativo y puede mentir — validar con él dejaba
// el límite de tamaño en decorativo (se podía inflar la base de datos).
export function bytesRealesDataUrl(dataUrl) {
    const coma = String(dataUrl || '').indexOf(',');
    if (coma < 0) return 0;
    return Buffer.byteLength(String(dataUrl).slice(coma + 1), 'base64');
}

// Verifica el contenido real por sus "magic bytes" en base64.
// PDF: "%PDF" → "JVBERi"
export function esPdfReal(dataUrl) {
    const coma = String(dataUrl || '').indexOf(',');
    if (coma < 0) return false;
    return String(dataUrl).slice(coma + 1, coma + 7).startsWith('JVBERi');
}

// Formatos de imagen que el sistema muestra de forma segura. SVG queda fuera
// a propósito: puede llevar scripts embebidos.
export const IMAGENES_PERMITIDAS = ['image/jpeg', 'image/png', 'image/webp'];

// #58 — Formatos de video aceptados en las solicitudes. MP4 y MOV comparten
// contenedor (ISO BMFF / QuickTime): los valida el mismo parser de
// videoDuration.js por magic bytes y duración.
export const VIDEOS_PERMITIDOS = ['video/mp4', 'video/quicktime'];

// Nombre de archivo limpio antes de guardarlo: sin saltos de línea ni
// caracteres de control (el nombre viaja a cabeceras MIME al enviarlo por
// correo y a Content-Disposition al descargarlo) y sin rutas.
export function nombreArchivoSeguro(nombre) {
    const limpio = String(nombre || '')
        // eslint-disable-next-line no-control-regex -- detectar caracteres de control ES el objetivo de este saneamiento
        .replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ')
        .replace(/[/\\]/g, '_')
        .trim()
        .slice(0, 200);
    return limpio || 'documento';
}
