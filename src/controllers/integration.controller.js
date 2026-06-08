// M8: Endpoints OAuth para conectar Google Calendar (single corporate account)
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
    calendarEnabled,
    buildAuthUrl,
    completeOAuth,
    disconnect as disconnectCalendar,
    getStatus,
} from '../utils/googleCalendar.js';

const STATE_TTL_S = 600; // 10 min

export const getCalendarStatus = async (req, res) => {
    try {
        if (!calendarEnabled()) {
            return res.json({ enabled: false, connected: false });
        }
        const status = await getStatus();
        res.json({ enabled: true, ...status });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// El admin abre esto en una pestaña nueva; respondemos con un redirect 302
// hacia Google. El "state" es un JWT corto que ata el flujo al admin actual.
export const startCalendarOAuth = async (req, res) => {
    try {
        if (!calendarEnabled()) {
            return res.status(503).json({ error: 'Google Calendar no está configurado en el servidor.' });
        }
        const nonce = crypto.randomBytes(16).toString('hex');
        const state = jwt.sign(
            { uid: req.user.id, nonce },
            process.env.JWT_SECRET,
            { expiresIn: STATE_TTL_S },
        );
        res.redirect(buildAuthUrl(state));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Callback público (Google redirige al navegador). Validamos el state JWT.
export const calendarOAuthCallback = async (req, res) => {
    const { code, state, error } = req.query;
    const html = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
        <style>body{font-family:system-ui;padding:2rem;max-width:520px;margin:auto;color:#111}
        .ok{color:#047857}.err{color:#b91c1c}</style>
        <h2>${title}</h2><p>${body}</p>
        <p><a href="/settings">Volver a la app</a></p>`;
    try {
        if (error) return res.status(400).send(html('No autorizado', `Google devolvió: <code>${error}</code>`));
        if (!code || !state) return res.status(400).send(html('Falta código', 'Solicitud incompleta.'));
        try {
            jwt.verify(state, process.env.JWT_SECRET);
        } catch {
            return res.status(400).send(html('Estado inválido', 'El enlace expiró. Vuelve a iniciar la conexión.'));
        }
        const { email } = await completeOAuth(code);
        res.send(html('✅ Google Calendar conectado', `Cuenta: <strong>${email || 'desconocida'}</strong>. Ya puedes cerrar esta ventana.`));
    } catch (e) {
        res.status(500).send(html('Error', e.message));
    }
};

export const disconnectCalendarController = async (req, res) => {
    try {
        await disconnectCalendar();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
