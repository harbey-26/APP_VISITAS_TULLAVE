// Configuration for API URL
// In development, VITE_API_URL is empty so we use the proxy (relative paths).
// In production, VITE_API_URL should be the full URL of the backend.
import { Capacitor } from '@capacitor/core';

// #67: en el APK el bundle puede venir del build de Railway (OTA), que compila
// SIN VITE_API_URL porque la web usa rutas relativas. En nativo las rutas
// relativas apuntarían a https://localhost/api (no existe) — respaldo a la URL
// de producción para que el bundle funcione sin importar cómo se compiló.
const PROD_API_URL = 'https://tu-llave-visitas-e66b.up.railway.app';

export const API_URL = import.meta.env.VITE_API_URL
    || (Capacitor.isNativePlatform() ? PROD_API_URL : '');
