// Descarga un Blob como archivo con el patrón ancla + click (el mismo del
// export CSV del Dashboard, que funciona en todos los navegadores). No usamos
// jsPDF.save(): su FileSaver interno revoca el object URL de inmediato y en
// Safari eso produce descargas de 0 bytes. Aquí la revocación se pospone.
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
