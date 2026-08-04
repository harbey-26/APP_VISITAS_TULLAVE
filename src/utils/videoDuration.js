// #58 — Duración de videos MP4/MOV sin dependencias. Módulo puro e isomorfo
// (opera sobre Uint8Array — Buffer también lo es): lo usa el backend para
// validar el límite de 1 minuto por seguridad (la metadata que lee el
// navegador la controla el cliente) y el frontend para formatear mensajes.
//
// MP4 (ISO BMFF) y MOV (QuickTime) comparten estructura: una secuencia de
// "átomos" [size u32][tipo 4 chars][payload]. La duración global vive en
// moov → mvhd (timescale + duration). Se escanea el archivo completo, así
// que da igual si el moov va al principio (faststart) o al final (típico
// de cámaras de celular).

function u32(bytes, off) {
    return bytes[off] * 0x1000000 + (bytes[off + 1] << 16) + (bytes[off + 2] << 8) + bytes[off + 3];
}

function u64(bytes, off) {
    return u32(bytes, off) * 0x100000000 + u32(bytes, off + 4);
}

function tipoAtomo(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}

// Magic bytes: todo MP4/MOV real arranca con un átomo `ftyp` (el tipo va en
// los bytes 4-8). El mimeType que declara el cliente puede mentir.
export function esVideoMp4Real(bytes) {
    return !!bytes && bytes.length >= 12 && tipoAtomo(bytes, 4) === 'ftyp';
}

// Recorre los átomos de un rango [inicio, fin). Soporta size==1 (largesize
// de 64 bits, videos >4 GB) y size==0 (el átomo llega hasta el final).
function* atomos(bytes, inicio, fin) {
    let off = inicio;
    while (off + 8 <= fin) {
        let size = u32(bytes, off);
        let header = 8;
        const tipo = tipoAtomo(bytes, off + 4);
        if (size === 1) {
            if (off + 16 > fin) return;
            size = u64(bytes, off + 8);
            header = 16;
        } else if (size === 0) {
            size = fin - off;
        }
        if (size < header || off + size > fin) return; // corrupto: no seguir
        yield { tipo, payload: off + header, size: size - header };
        off += size;
    }
}

// Duración en segundos, o null si no se puede determinar (sin moov/mvhd,
// archivo corrupto, timescale 0 o duración "desconocida" 0xFFFFFFFF).
export function duracionVideoSegundos(bytes) {
    if (!bytes || bytes.length < 16) return null;
    for (const a of atomos(bytes, 0, bytes.length)) {
        if (a.tipo !== 'moov') continue;
        for (const b of atomos(bytes, a.payload, a.payload + a.size)) {
            if (b.tipo !== 'mvhd') continue;
            const version = bytes[b.payload];
            let timescale, duracion;
            if (version === 1 && b.size >= 32) {
                // v1: creation(8) + modification(8) + timescale(4) + duration(8)
                timescale = u32(bytes, b.payload + 20);
                duracion = u64(bytes, b.payload + 24);
            } else if (version === 0 && b.size >= 20) {
                // v0: creation(4) + modification(4) + timescale(4) + duration(4)
                timescale = u32(bytes, b.payload + 12);
                duracion = u32(bytes, b.payload + 16);
                if (duracion === 0xFFFFFFFF) return null; // "desconocida" según el spec
            } else {
                return null;
            }
            return timescale > 0 ? duracion / timescale : null;
        }
        return null; // moov sin mvhd: no hay dónde más buscar
    }
    return null;
}

// "1:23" para mensajes de error ("el video dura 1:23 — el máximo es 1:00").
export function formatoDuracion(segundos) {
    const total = Math.round(segundos);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
