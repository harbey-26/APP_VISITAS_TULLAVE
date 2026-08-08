import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import AdmZip from 'adm-zip';
import { getOtaBundle } from '../src/utils/otaBundle.js';

// El OTA del APK (#67) depende de este hash: si dos deploys con el mismo dist/
// dieran hashes distintos, cada arranque del servidor forzaría una descarga
// inútil en todos los dispositivos; si un dist/ distinto diera el mismo hash,
// los agentes se quedarían con la app vieja para siempre.

function distDeMentira(archivos) {
    const dir = mkdtempSync(join(tmpdir(), 'ota-test-'));
    for (const [rel, contenido] of Object.entries(archivos)) {
        const ruta = join(dir, rel);
        mkdirSync(join(ruta, '..'), { recursive: true });
        writeFileSync(ruta, contenido);
    }
    return dir;
}

const BASE = {
    'index.html': '<html>app</html>',
    'assets/app-abc123.js': 'console.log(1)',
    'assets/app-abc123.css': 'body{}',
};

describe('getOtaBundle', () => {
    let dist;
    beforeEach(() => { dist = distDeMentira(BASE); });

    it('null si no hay dist con index.html (dev local sin build)', () => {
        expect(getOtaBundle(distDeMentira({ 'suelto.txt': 'x' }))).toBeNull();
    });

    it('mismo contenido en directorios distintos → mismo hash (estable entre deploys)', () => {
        const otro = distDeMentira(BASE);
        expect(getOtaBundle(dist).hash).toBe(getOtaBundle(otro).hash);
        expect(getOtaBundle(dist).hash).toMatch(/^[0-9a-f]{12}$/);
    });

    it('contenido distinto → hash distinto', () => {
        const cambiado = distDeMentira({ ...BASE, 'assets/app-abc123.js': 'console.log(2)' });
        expect(getOtaBundle(cambiado).hash).not.toBe(getOtaBundle(dist).hash);
    });

    it('archivo nuevo → hash distinto', () => {
        const conExtra = distDeMentira({ ...BASE, 'assets/chunk-def.js': 'x' });
        expect(getOtaBundle(conExtra).hash).not.toBe(getOtaBundle(dist).hash);
    });

    it('el zip contiene index.html en la raíz y los assets (formato que espera el updater)', () => {
        const zip = new AdmZip(getOtaBundle(dist).zip);
        const nombres = zip.getEntries().map(e => e.entryName);
        expect(nombres).toContain('index.html');
        expect(nombres).toContain('assets/app-abc123.js');
        expect(zip.readAsText('index.html')).toBe('<html>app</html>');
    });

    it('cachea por directorio (dist/ no cambia durante la vida del proceso)', () => {
        expect(getOtaBundle(dist)).toBe(getOtaBundle(dist));
    });
});
