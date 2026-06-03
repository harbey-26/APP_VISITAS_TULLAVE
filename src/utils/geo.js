import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Obtiene la posición actual del dispositivo.
 * Usa navigator.geolocation en todos los entornos (web y APK).
 */
export async function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
            reject,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
    });
}

/**
 * Inicia el rastreo en background usando Android Foreground Service (solo APK).
 * Accede al plugin nativo vía registerPlugin (sin importar el paquete npm que
 * no tiene JS compilado). El servicio nativo continúa con la pantalla apagada.
 * @param {function} onLocation - callback con { lat, lng }
 * @returns {string|null} watchId para detener el rastreo, o null en web / si falla
 */
export async function startBackgroundTracking(onLocation) {
    if (!Capacitor.isNativePlatform()) return null;
    try {
        const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
        const watchId = await BackgroundGeolocation.addWatcher(
            {
                backgroundTitle: 'VisitTrack activo',
                backgroundMessage: 'Rastreo de ubicación en curso',
                requestPermissions: true,
                stale: false,
                distanceFilter: 20, // A3/M5: Ignorar movimientos < 20m — balance entre resolución, batería y carga
            },
            (location, error) => {
                if (error || !location) return;
                onLocation({ lat: location.latitude, lng: location.longitude });
            }
        );
        return watchId;
    } catch {
        return null; // plugin no disponible: fallback silencioso
    }
}

/**
 * Detiene el rastreo en background (solo APK).
 * @param {string} watchId
 */
export async function stopBackgroundTracking(watchId) {
    if (!Capacitor.isNativePlatform() || !watchId) return;
    try {
        const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
        await BackgroundGeolocation.removeWatcher({ id: watchId });
    } catch { /* silencioso */ }
}
