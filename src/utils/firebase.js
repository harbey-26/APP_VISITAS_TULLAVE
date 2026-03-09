import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let messaging = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (!getApps().length) {
            initializeApp({ credential: cert(serviceAccount) });
        }
        messaging = getMessaging();
    } catch (e) {
        console.warn('[Firebase Admin] No se pudo inicializar:', e.message);
    }
} else {
    console.warn('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT no definida — FCM desactivado');
}

export { messaging };
