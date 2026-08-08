// OTA (#67): empaqueta el dist/ que este mismo servidor sirve a los navegadores
// como bundle zip para el APK. Railway compila dist/ en cada deploy (postinstall),
// así que el bundle queda SIEMPRE sincronizado con la API de este proceso.
//
// bundleVersion = hash del CONTENIDO de dist/ (rutas + bytes, ordenado), no del
// zip: el hash es estable entre reinicios del servidor aunque cambien los
// timestamps, y solo cambia cuando un deploy trae assets distintos.
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import AdmZip from 'adm-zip';

const cache = new Map(); // distDir → { hash, zip } — dist/ no cambia durante la vida del proceso

function listarArchivos(dir, base = '') {
    const archivos = [];
    for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        const rel = base ? `${base}/${nombre}` : nombre;
        if (statSync(ruta).isDirectory()) archivos.push(...listarArchivos(ruta, rel));
        else archivos.push(rel);
    }
    return archivos;
}

// Devuelve { hash, zip } o null si no hay dist/ (dev local sin build)
export function getOtaBundle(distDir) {
    if (cache.has(distDir)) return cache.get(distDir);
    if (!existsSync(join(distDir, 'index.html'))) return null;
    const archivos = listarArchivos(distDir).sort();
    const h = createHash('sha256');
    for (const rel of archivos) {
        h.update(rel);
        h.update(readFileSync(join(distDir, rel)));
    }
    const zip = new AdmZip();
    zip.addLocalFolder(distDir);
    const bundle = { hash: h.digest('hex').slice(0, 12), zip: zip.toBuffer() };
    cache.set(distDir, bundle);
    return bundle;
}
