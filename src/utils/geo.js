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
 * Inicia el rastreo continuo con setInterval + getCurrentPosition (solo APK).
 * Usa @capacitor/geolocation v8 — compatible con Capacitor 8.
 * Se prefiere setInterval sobre watchPosition porque watchPosition no dispara
 * callbacks cuando el dispositivo está estático.
 * @param {function} onLocation - callback con { lat, lng }
 * @returns {number|null} intervalId para detener el rastreo, o null en web
 */
export async function startBackgroundTracking(onLocation) {
    if (!Capacitor.isNativePlatform()) return null;

    const { Geolocation } = await import('@capacitor/geolocation');

    // Solicitar permisos y abortar si no se conceden
    const permission = await Geolocation.requestPermissions().catch(() => null);
    if (!permission || permission.location !== 'granted') return null;

    const fetchAndSend = async () => {
        try {
            const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
            onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        } catch { /* fallo silencioso — reintenta en el siguiente ciclo */ }
    };

    fetchAndSend(); // ping inmediato al arrancar
    const intervalId = setInterval(fetchAndSend, 30000); // cada 30 s
    return intervalId;
}

/**
 * Detiene el rastreo continuo (solo APK).
 * @param {number} intervalId
 */
export async function stopBackgroundTracking(intervalId) {
    if (!Capacitor.isNativePlatform() || intervalId == null) return;
    clearInterval(intervalId);
}
