// Versión del APK que el servidor considera "vigente". El frontend la compara
// con la versión instalada (Capacitor App.getInfo) para decidir si mostrar el
// banner de actualización. La fuente de verdad es package.json del servidor.
import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { getOtaBundle } from '../utils/otaBundle.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
const DIST_DIR = resolve(__dirname, '../../dist');

// Cada build del APK publica un release público en GitHub con tag v<version> y
// asset VisitTrack-v<version>.apk. La URL es predecible — no requiere login.
function buildApkUrl(version) {
    return `https://github.com/harbey-26/APP_VISITAS_TULLAVE/releases/download/v${version}/VisitTrack-v${version}.apk`;
}

router.get('/version', (_req, res) => {
    res.json({
        latest: pkg.version,
        // #67: dos versiones distintas desde que el APK lleva los assets dentro.
        // apkVersion = cascarón nativo (package.json — subirla SOLO en cambios
        // nativos: dispara el banner de reinstalar). bundleVersion = hash del
        // dist/ de este deploy (cambia solo, sin tocar package.json) — la
        // compara otaUpdater.js para descargar el bundle por OTA.
        apkVersion: pkg.version,
        bundleVersion: getOtaBundle(DIST_DIR)?.hash ?? null,
        apkUrl: buildApkUrl(pkg.version),
        // Página del release con changelog (útil si el usuario quiere ver detalles)
        releaseUrl: `https://github.com/harbey-26/APP_VISITAS_TULLAVE/releases/tag/v${pkg.version}`,
    });
});

// #67: bundle web (dist/ en zip) para la actualización OTA del APK. Sin auth:
// es el mismo contenido público que este servidor sirve a cualquier navegador.
router.get('/bundle', (_req, res) => {
    const bundle = getOtaBundle(DIST_DIR);
    if (!bundle) return res.status(404).json({ error: 'Bundle no disponible (sin build de frontend)' });
    res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="visittrack-${bundle.hash}.zip"`,
        'ETag': `"${bundle.hash}"`,
    });
    res.send(bundle.zip);
});

export default router;
