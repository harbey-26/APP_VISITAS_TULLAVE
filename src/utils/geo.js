/**
 * Obtiene la posición actual del dispositivo.
 * Usa navigator.geolocation en todos los entornos (web y APK).
 * El WebView de Capacitor auto-concede permiso al origen cargado via server.url.
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
