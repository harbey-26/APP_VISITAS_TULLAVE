import { Capacitor } from '@capacitor/core';

let bgGeo = null;

async function getBackgroundGeo() {
    if (!bgGeo && Capacitor.isNativePlatform()) {
        const { BackgroundGeolocation } = await import(
            '@capacitor-community/background-geolocation'
        );
        bgGeo = BackgroundGeolocation;
    }
    return bgGeo;
}

/**
 * Obtiene la posición actual del dispositivo.
 * En APK usa el plugin nativo de Capacitor.
 * En navegador web usa navigator.geolocation.
 */
export async function getCurrentPosition() {
    if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 8000
        });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    // fallback web
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
            reject,
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
        );
    });
}

/**
 * Inicia el rastreo continuo en background (solo APK).
 * @param {function} onLocation - callback con { lat, lng }
 * @returns {string|null} watchId para detener el rastreo, o null en web
 */
export async function startBackgroundTracking(onLocation) {
    if (!Capacitor.isNativePlatform()) return null;
    const geo = await getBackgroundGeo();
    const watchId = await geo.addWatcher(
        {
            backgroundMessage: 'Rastreo activo',
            backgroundTitle: 'VisitTrack',
            requestPermissions: true,
            stale: false,
            distanceFilter: 50  // metros — evita pings innecesarios
        },
        (location, error) => {
            if (error) return;
            if (location) onLocation({ lat: location.latitude, lng: location.longitude });
        }
    );
    return watchId;
}

/**
 * Detiene el rastreo en background (solo APK).
 * @param {string} watchId
 */
export async function stopBackgroundTracking(watchId) {
    if (!Capacitor.isNativePlatform() || !watchId) return;
    const geo = await getBackgroundGeo();
    await geo.removeWatcher({ id: watchId });
}
