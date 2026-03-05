import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.tullave.visittrack',
    appName: 'VisitTrack',
    webDir: 'dist',
    server: {
        // El APK apunta al mismo backend de Railway — no se duplica nada
        url: 'https://tu-llave-visitas-e66b.up.railway.app',
        cleartext: false
    },
    plugins: {
        BackgroundGeolocation: {
            // Notificación persistente que Android requiere para GPS en background
            notificationTitle: 'VisitTrack activo',
            notificationText: 'Rastreo de ubicación en curso',
        }
    }
};

export default config;
