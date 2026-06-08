// Versión del APK que el servidor considera "vigente". El frontend la compara
// con la versión instalada (Capacitor App.getInfo) para decidir si mostrar el
// banner de actualización. La fuente de verdad es package.json del servidor.
import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

// Cada build del APK publica un release público en GitHub con tag v<version> y
// asset VisitTrack-v<version>.apk. La URL es predecible — no requiere login.
function buildApkUrl(version) {
    return `https://github.com/harbey-26/APP_VISITAS_TULLAVE/releases/download/v${version}/VisitTrack-v${version}.apk`;
}

router.get('/version', (_req, res) => {
    res.json({
        latest: pkg.version,
        apkUrl: buildApkUrl(pkg.version),
        // Página del release con changelog (útil si el usuario quiere ver detalles)
        releaseUrl: `https://github.com/harbey-26/APP_VISITAS_TULLAVE/releases/tag/v${pkg.version}`,
    });
});

export default router;
