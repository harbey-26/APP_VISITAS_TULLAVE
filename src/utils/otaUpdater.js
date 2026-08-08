// OTA (#67): mantiene el bundle web del APK al día contra el backend.
// Flujo: al arrancar y al volver a primer plano se compara el bundleVersion
// del servidor (hash del dist/ del deploy vigente) con el bundle ACTIVO; si
// difieren se descarga el zip y se programa con next() — se aplica en el
// próximo arranque, sin interrumpir al agente ni reinstalar APK.
//
// Red de seguridad anti-brick: notifyAppReady() confirma que el bundle activo
// arrancó bien; si un bundle descargado crashea antes de llamarlo, el plugin
// REVIERTE solo al anterior.
//
// Regla operativa: el bundle debe ser compatible con el APK instalado — si un
// cambio necesita un plugin nativo nuevo, primero sale el APK y luego el
// código que lo usa.
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { API_URL } from '../config';

// Evita re-descargar un bundle ya programado con next() mientras no se reinicie
const DOWNLOADED_KEY = 'visittrack_ota_downloaded';
// Throttle: el resume se dispara a cada rato (cambiar de app, apagar pantalla)
const CHECK_MIN_INTERVAL_MS = 10 * 60 * 1000;
let lastCheck = 0;

async function checkAndDownload() {
    if (Date.now() - lastCheck < CHECK_MIN_INTERVAL_MS) return;
    lastCheck = Date.now();

    const res = await fetch(`${API_URL}/api/app/version`);
    if (!res.ok) return;
    const { bundleVersion } = await res.json();
    if (!bundleVersion) return;

    const { bundle } = await CapacitorUpdater.current();
    const activa = bundle?.version || ''; // '' = bundle embebido en el APK
    if (bundleVersion === activa) {
        localStorage.removeItem(DOWNLOADED_KEY);
        return;
    }
    if (localStorage.getItem(DOWNLOADED_KEY) === bundleVersion) return; // ya en cola

    const nueva = await CapacitorUpdater.download({
        url: `${API_URL}/api/app/bundle`,
        version: bundleVersion,
    });
    await CapacitorUpdater.next({ id: nueva.id });
    localStorage.setItem(DOWNLOADED_KEY, bundleVersion);
}

// Llamar UNA vez desde la raíz de la app (App.jsx) — también con sesión
// cerrada: notifyAppReady debe correr en CADA arranque o el plugin asume que
// el bundle está roto y lo revierte.
export function initOtaUpdater() {
    if (!Capacitor.isNativePlatform()) return;
    CapacitorUpdater.notifyAppReady().catch(() => {});
    checkAndDownload().catch(() => {}); // errores silenciosos, como el GPS
    CapacitorApp.addListener('resume', () => {
        checkAndDownload().catch(() => {});
    });
}
