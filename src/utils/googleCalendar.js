// M8: Integración con Google Calendar (cuenta corporativa única).
// Usa fetch nativo + refresh token persistido en tabla IntegrationToken.
import prisma from './prisma.js';

const INTEGRATION_KIND = 'google_calendar';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API   = 'https://www.googleapis.com/calendar/v3/calendars';

export const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    // C2: envío de contratos por correo con adjunto (Gmail API). Si la
    // integración se conectó antes de añadir este scope, hay que desconectar
    // y volver a conectar Google en Ajustes para autorizarlo.
    'https://www.googleapis.com/auth/gmail.send',
    'openid',
].join(' ');

export function calendarEnabled() {
    return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI,
    );
}

export function buildAuthUrl(state) {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: GOOGLE_SCOPES,
        state: state || '',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(code) {
    const body = new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
    });
    const res = await fetch(TOKEN_URL, { method: 'POST', body });
    if (!res.ok) throw new Error(`Google token exchange: ${res.status} ${await res.text()}`);
    return res.json();
}

async function refreshAccessToken(refreshToken) {
    const body = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
    });
    const res = await fetch(TOKEN_URL, { method: 'POST', body });
    if (!res.ok) throw new Error(`Google refresh: ${res.status} ${await res.text()}`);
    return res.json();
}

async function fetchUserEmail(accessToken) {
    try {
        const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok) return null;
        const data = await r.json();
        return data.email || null;
    } catch { return null; }
}

export async function completeOAuth(code) {
    const tok = await exchangeCode(code);
    if (!tok.refresh_token) {
        throw new Error('Google no devolvió refresh_token. Revoca el acceso en https://myaccount.google.com/permissions y vuelve a conectar.');
    }
    const email = await fetchUserEmail(tok.access_token);
    const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000);
    await prisma.integrationToken.upsert({
        where: { kind: INTEGRATION_KIND },
        update: {
            accessToken: tok.access_token,
            refreshToken: tok.refresh_token,
            expiresAt,
            scope: tok.scope,
            accountEmail: email,
        },
        create: {
            kind: INTEGRATION_KIND,
            accessToken: tok.access_token,
            refreshToken: tok.refresh_token,
            expiresAt,
            scope: tok.scope,
            accountEmail: email,
            calendarId: 'primary',
        },
    });
    return { email };
}

export async function disconnect() {
    await prisma.integrationToken.deleteMany({ where: { kind: INTEGRATION_KIND } });
}

export async function getStatus() {
    const row = await prisma.integrationToken.findUnique({ where: { kind: INTEGRATION_KIND } });
    if (!row) return { connected: false };
    return {
        connected: true,
        accountEmail: row.accountEmail,
        calendarId: row.calendarId,
    };
}

// Exportado también para el envío de correos (C2 — utils/gmail.js).
// Devuelve además el scope y el correo de la cuenta conectada.
export async function getValidAccessToken() {
    const row = await prisma.integrationToken.findUnique({ where: { kind: INTEGRATION_KIND } });
    if (!row) return null;
    const meta = { calendarId: row.calendarId || 'primary', scope: row.scope || '', accountEmail: row.accountEmail || null };
    if (row.expiresAt.getTime() > Date.now() + 30_000) return { token: row.accessToken, ...meta };
    const refreshed = await refreshAccessToken(row.refreshToken);
    const expiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000);
    await prisma.integrationToken.update({
        where: { kind: INTEGRATION_KIND },
        data: { accessToken: refreshed.access_token, expiresAt },
    });
    return { token: refreshed.access_token, ...meta };
}

// Type ↔ etiqueta legible para el resumen del evento
const TYPE_LABELS = {
    RENTAL_SHOWING: 'Mostrar inmueble',
    PROPERTY_INTAKE: 'Captación',
    HANDOVER: 'Entrega',
    MOVE_OUT: 'Desocupación',
    INSPECTION: 'Inspección',
    OTHER: 'Visita',
};

function eventPayloadFor(visit) {
    const start = new Date(visit.scheduledStart);
    const end = new Date(start.getTime() + (visit.estimatedDuration || 60) * 60_000);
    const typeLabel = TYPE_LABELS[visit.type] || 'Visita';
    const summary = `${typeLabel} — ${visit.property?.address || ''}`.trim();
    const descLines = [
        visit.property?.client ? `Cliente inmueble: ${visit.property.client}` : null,
        visit.clientName ? `Contacto: ${visit.clientName}` : null,
        visit.clientPhone ? `Tel: ${visit.clientPhone}` : null,
        visit.clientEmail ? `Correo: ${visit.clientEmail}` : null,
        visit.user?.name ? `Agente: ${visit.user.name}` : null,
        visit.notes ? `Notas: ${visit.notes}` : null,
    ].filter(Boolean);
    const location = visit.property?.address || '';
    const payload = {
        summary,
        description: descLines.join('\n'),
        location,
        start: { dateTime: start.toISOString(), timeZone: 'America/Bogota' },
        end:   { dateTime: end.toISOString(),   timeZone: 'America/Bogota' },
    };
    // Si hay correo del cliente, se le invita al evento; Google le envía la
    // invitación/confirmación por email (con sendUpdates=all en la petición).
    if (visit.clientEmail) {
        payload.attendees = [{ email: visit.clientEmail, displayName: visit.clientName || undefined }];
    }
    return payload;
}

// Crea o actualiza el evento. Devuelve el eventId resultante (o null si no hay integración).
export async function upsertVisitEvent(visit) {
    const session = await getValidAccessToken();
    if (!session) return null;
    const { token, calendarId } = session;
    const payload = eventPayloadFor(visit);
    const calId = encodeURIComponent(calendarId);

    if (visit.googleEventId) {
        const r = await fetch(`${CAL_API}/${calId}/events/${encodeURIComponent(visit.googleEventId)}?sendUpdates=all`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (r.ok) {
            const data = await r.json();
            return data.id;
        }
        if (r.status !== 404 && r.status !== 410) {
            throw new Error(`Calendar PATCH: ${r.status} ${await r.text()}`);
        }
        // 404/410: el evento ya no existe; caemos a crear uno nuevo
    }

    const r = await fetch(`${CAL_API}/${calId}/events?sendUpdates=all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Calendar POST: ${r.status} ${await r.text()}`);
    const data = await r.json();
    return data.id;
}

export async function deleteVisitEvent(visit) {
    if (!visit.googleEventId) return;
    const session = await getValidAccessToken();
    if (!session) return;
    const { token, calendarId } = session;
    const calId = encodeURIComponent(calendarId);
    const r = await fetch(`${CAL_API}/${calId}/events/${encodeURIComponent(visit.googleEventId)}?sendUpdates=all`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok && r.status !== 404 && r.status !== 410) {
        throw new Error(`Calendar DELETE: ${r.status} ${await r.text()}`);
    }
}
