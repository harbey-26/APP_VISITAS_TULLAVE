import { Capacitor } from '@capacitor/core';

/**
 * Obtiene la posición actual del dispositivo.
 * En APK usa @capacitor/geolocation (nativo, compatible con Capacitor 8).
 * En navegador web usa navigator.geolocation.
 */
export async function getCurrentPosition() {
    if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000
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
 * Inicia el rastreo continuo con watchPosition (solo APK).
 * Usa @capacitor/geolocation v8 — compatible con Capacitor 8.
 * @param {function} onLocation - callback con { lat, lng }
 * @returns {string|null} watchId para detener el rastreo, o null en web
 */
export async function startBackgroundTracking(onLocation) {
    if (!Capacitor.isNativePlatform()) return null;

    const { Geolocation } = await import('@capacitor/geolocation');

    // Solicitar permisos y abortar si no se conceden
    const permission = await Geolocation.requestPermissions().catch(() => null);
    if (!permission || permission.location !== 'granted') return null;

    // Enviar posición inicial inmediatamente
    try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch { /* sin GPS inicial — se reintenta con watchPosition */ }

    // Rastreo continuo mientras la app esté activa
    const watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000 },
        (position, error) => {
            if (error || !position) return;
            onLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        }
    );
    return watchId;
}

/**
 * Detiene el rastreo continuo (solo APK).
 * @param {string} watchId
 */
export async function stopBackgroundTracking(watchId) {
    if (!Capacitor.isNativePlatform() || !watchId) return;
    const { Geolocation } = await import('@capacitor/geolocation');
    await Geolocation.clearWatch({ id: watchId });
}
