import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.tullave.visittrack',
    appName: 'VisitTrack',
    // #66: el frontend (dist/) viaja DENTRO del APK — arranque instantáneo y
    // funciona sin señal. Solo las llamadas /api van a Railway (VITE_API_URL
    // absoluto, inyectado en el build de CI). Los cambios de UI llegan por OTA
    // (#67, src/utils/otaUpdater.js) — sin bloque server.url.
    webDir: 'dist',
    android: {
        // Necesario para que @capacitor-community/background-geolocation funcione con Capacitor 8
        useLegacyBridge: true
    },
    plugins: {
        BackgroundGeolocation: {
            // Notificación persistente que Android requiere para GPS en background
            notificationTitle: 'VisitTrack activo',
            notificationText: 'Rastreo de ubicación en curso',
        },
        CapacitorUpdater: {
            // OTA en modo MANUAL: la app decide cuándo descargar/aplicar
            // (otaUpdater.js contra nuestro backend). Sin este false, el
            // plugin intenta auto-actualizar contra la nube de Capgo.
            autoUpdate: false,
        }
    }
};

export default config;
