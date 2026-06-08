// M7: Helper para crear notificaciones dirigidas a un agente (in-app + FCM)
import prisma from './prisma.js';
import { messaging } from './firebase.js';

export async function sendPersonalNotification(userId, title, body) {
    if (!userId) return null;
    try {
        const broadcast = await prisma.broadcast.create({
            data: { title, body, userId },
            select: { id: true, title: true, body: true, createdAt: true, userId: true },
        });

        if (messaging) {
            const tokenRecords = await prisma.userFcmToken.findMany({
                where: { userId },
                select: { token: true },
            });
            const tokens = tokenRecords.map(r => r.token);
            if (tokens.length > 0) {
                messaging.sendEachForMulticast({
                    tokens,
                    notification: { title, body },
                    android: { priority: 'high' },
                }).then(r => {
                    const stale = r.responses
                        .map((resp, i) => {
                            if (!resp.success) {
                                const code = resp.error?.code || '';
                                return (code.includes('registration') || code.includes('invalid')) ? tokens[i] : null;
                            }
                            return null;
                        })
                        .filter(Boolean);
                    if (stale.length > 0) {
                        prisma.userFcmToken.deleteMany({ where: { token: { in: stale } } }).catch(() => {});
                    }
                }).catch(e => console.warn('[FCM personal]', e.message));
            }
        }
        return broadcast;
    } catch (e) {
        console.warn('[notify] No se pudo crear notificación personal:', e.message);
        return null;
    }
}
