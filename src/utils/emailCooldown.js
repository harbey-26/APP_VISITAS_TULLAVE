// Anti-duplicado del envío de correos (contratos y liquidaciones): tras un
// envío exitoso hay que esperar EMAIL_COOLDOWN_MS antes de poder reenviar.
// Módulo puro e isomorfo — lo usan los controladores (para el 409) y las
// páginas (para deshabilitar el botón), con tests en tests/emailCooldown.test.js.

export const EMAIL_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora

// Milisegundos que faltan para poder reenviar (0 = ya se puede).
export function emailCooldownRemainingMs(emailedAt, now = Date.now()) {
    if (!emailedAt) return 0;
    const t = new Date(emailedAt).getTime();
    if (Number.isNaN(t)) return 0;
    const restante = EMAIL_COOLDOWN_MS - (now - t);
    return restante > 0 ? restante : 0;
}

// Mensaje para el usuario cuando el reenvío está bloqueado.
export function emailCooldownMessage(remainingMs) {
    const min = Math.max(1, Math.ceil(remainingMs / 60_000));
    return `Este documento ya se envió por correo hace poco. Para evitar duplicados al cliente, podrás reenviarlo en ${min} ${min === 1 ? 'minuto' : 'minutos'}.`;
}
