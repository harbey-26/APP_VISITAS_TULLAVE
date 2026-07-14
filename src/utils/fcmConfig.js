// Configuración FCM compartida entre el servidor (envío) y el APK (creación
// del canal). Sin dependencias — importable desde ambos lados.
//
// Android 8+: la importancia/sonido/vibración de una notificación los define
// su CANAL, no el mensaje. Sin channelId, FCM usa su canal por defecto
// (importancia normal → sin banner heads-up). Este canal de alta importancia
// hace que los avisos suenen, vibren y aparezcan como banner flotante.
// El canal lo crea el APK desde JS (FirebaseMessaging.createChannel) — no
// requiere recompilar. Si un dispositivo aún no lo tiene, FCM cae al canal
// por defecto (comportamiento anterior, no se pierde la notificación).

export const ALERT_CHANNEL_ID = 'visittrack_alerts';
export const ALERT_CHANNEL_NAME = 'Alertas y recordatorios';

// Bloque `android` para messaging.sendEachForMulticast (mensajes VISIBLES).
export function androidAlertConfig() {
    return {
        priority: 'high',
        notification: {
            channelId: ALERT_CHANNEL_ID,
            defaultSound: true,
            defaultVibrateTimings: true,
        },
    };
}
