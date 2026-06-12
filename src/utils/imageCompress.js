// ───────────────────────────────────────────────────────────────────
// Compresión de fotos en el cliente antes de subirlas.
// Una foto de cámara (~2-4 MB) queda en ~150-400 KB sin pérdida visible:
// menos datos móviles para el agente, payloads ligeros y la BD no se infla
// (las imágenes se guardan como data URI en VisitImage).
// ───────────────────────────────────────────────────────────────────

// Lado mayor máximo en px. 1600 px sobra para revisar una visita en pantalla.
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.82;

function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// Devuelve un data URI JPEG redimensionado. Si algo falla (formato exótico,
// canvas bloqueado, etc.) cae al archivo original: subir sin comprimir es
// mejor que no subir.
export async function compressImage(file) {
    let objectUrl = null;
    try {
        objectUrl = URL.createObjectURL(file);
        const img = await loadImage(objectUrl);

        const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        const compressed = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        // Si por alguna razón la compresión no redujo nada (imagen ya pequeña),
        // mantener el original evita recomprimir JPEG sobre JPEG sin ganancia.
        const original = await readAsDataURL(file);
        return compressed.length < original.length ? compressed : original;
    } catch {
        return readAsDataURL(file);
    } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}
