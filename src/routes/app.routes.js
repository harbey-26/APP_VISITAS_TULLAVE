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

// URL de descarga del APK (último artifact del workflow). Cambia si se publica
// el APK en otra ubicación (Play Store, S3, etc.).
const APK_DOWNLOAD_URL = 'https://github.com/harbey-26/APP_VISITAS_TULLAVE/actions/workflows/build-apk.yml';

router.get('/version', (_req, res) => {
    res.json({
        latest: pkg.version,
        apkUrl: APK_DOWNLOAD_URL,
    });
});

export default router;
