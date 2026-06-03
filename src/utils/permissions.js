import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

// El plugin nativo expone openSettings() para llevar al usuario a la pantalla
// de Ajustes de la app (permisos + batería). Solo existe en el APK.
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

export const isNative = () => Capacitor.isNativePlatform();

/** Estado del permiso de ubicación: 'granted' | 'denied' | 'prompt' | 'unknown' */
export async function checkLocationPermission() {
    try {
        const p = await Geolocation.checkPermissions();
        return p.location;
    } catch { return 'unknown'; }
}

/** Solicita el permiso de ubicación (diálogo nativo "Mientras se usa la app"). */
export async function requestLocationPermission() {
    try {
        const p = await Geolocation.requestPermissions({ permissions: ['location'] });
        return p.location;
    } catch { return 'unknown'; }
}

/** Estado del permiso de notificaciones. */
export async function checkNotificationPermission() {
    try {
        const p = await LocalNotifications.checkPermissions();
        return p.display;
    } catch { return 'unknown'; }
}

/** Solicita el permiso de notificaciones (diálogo nativo). */
export async function requestNotificationPermission() {
    try {
        const p = await LocalNotifications.requestPermissions();
        return p.display;
    } catch { return 'unknown'; }
}

/**
 * Abre la pantalla de Ajustes de la app. Se usa para que el agente conceda
 * manualmente "Permitir todo el tiempo" (background location, Android 11+ no
 * lo ofrece en el diálogo inicial) y desactive la optimización de batería.
 */
export async function openAppSettings() {
    try {
        await BackgroundGeolocation.openSettings();
        return true;
    } catch {
        return false;
    }
}
