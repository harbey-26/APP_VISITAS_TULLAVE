import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import prisma from './src/utils/prisma.js';
import dotenv from 'dotenv';
import apiRoutes from './src/routes/index.js';
import { startLocationReminderCron } from './src/utils/locationReminders.js';
import { detectarAniversarios } from './src/controllers/incremento.controller.js';
import { revisarVencimientos } from './src/controllers/solicitud.controller.js';
import { notifyAdmins } from './src/utils/notify.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// C2: CORS restringido a orígenes conocidos (configurable vía ALLOWED_ORIGINS)
// Orígenes permitidos: coincidencia EXACTA (ver el callback de cors abajo),
// así que cada puerto/esquema en uso debe estar listado. 5174 = portal de
// clientes en desarrollo (repo PORTAL_CLIENTES_TULLAVE).
const defaultOrigins = [
    'https://tu-llave-visitas-e66b.up.railway.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:4173',
    'capacitor://localhost',
    'http://localhost'
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : defaultOrigins)
    // P1: dominio(s) del Portal de Clientes (frontend aparte) — se configura
    // en Railway sin tocar código. Acepta varios separados por coma (dominio
    // propio + URL de Railway durante la transición)
    .concat(process.env.PORTAL_ORIGIN ? process.env.PORTAL_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) : []);

// Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.)
// CSP queda desactivada — el frontend embebe assets de Google Maps/Firebase
// y manejar la lista completa de orígenes con un CSP estricto rompería la app.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
    origin: (origin, callback) => {
        // Sin origin = peticiones nativas (APK, curl, Postman) → permitir
        if (!origin) return callback(null, true);
        // Coincidencia EXACTA: con startsWith, un dominio como
        // "https://portal.tullaveinmobiliariasas.com.attacker.net" pasaba el
        // filtro por empezar igual que un origen permitido.
        const allowed = allowedOrigins.includes(origin);
        callback(allowed ? null : new Error(`CORS: origen no permitido (${origin})`), allowed);
    },
    credentials: true
}));
// Los endpoints de autenticación no reciben adjuntos: un cuerpo de 8 MB solo
// serviría para presionar memoria sin estar autenticado. Va ANTES del límite
// general para que gane en esas rutas.
app.use(['/api/auth', '/api/portal/auth'], express.json({ limit: '16kb' }));
// Límite explícito para evitar abuso por payloads enormes. Las fotos de visita
// llegan como base64 (~hasta 4-5 MB cada una), así que 8 MB es holgado.
app.use(express.json({ limit: '8mb' }));

// C1: Solo loguear método + URL en producción (nunca el body — puede contener contraseñas)
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// API Routes
app.use('/api', apiRoutes);

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Un asset con hash que ya no existe (sesión abierta durante un deploy) debe
// dar 404, NUNCA el index.html: si se devuelve HTML, el import() dinámico del
// navegador falla con "'text/html' is not a valid JavaScript MIME type" y el
// cliente no puede distinguirlo para recargar.
app.get('/assets/*', (req, res) => {
  res.status(404).send('Not found');
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  // Cuerpo demasiado grande: es una respuesta esperable (no un fallo del
  // servidor) y el cliente necesita distinguirla para avisar bien.
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ error: 'El contenido enviado es demasiado grande.' });
  }
  console.error(err.stack);
  res.status(500).json({
    error: 'Error interno del servidor. Intenta de nuevo más tarde.',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// M6: Limpieza diaria de tokens FCM inactivos (> 30 días sin renovar)
function startFcmCleanupCron() {
    const run = async () => {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        try {
            const { count } = await prisma.userFcmToken.deleteMany({
                where: { updatedAt: { lt: cutoff } }
            });
            if (count > 0) console.log(`[FCM Cron] Eliminados ${count} tokens inactivos`);
        } catch (e) { console.warn('[FCM Cron]', e.message); }
    };
    setInterval(run, 24 * 60 * 60 * 1000); // cada 24 h
}

// L1: Reporte semanal — se ejecuta cada lunes a las 9am como broadcast
async function generateWeeklyReport() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const where = { deletedAt: null, scheduledStart: { gte: weekAgo } };

    const [total, completed, interested, byAgent] = await Promise.all([
        prisma.visit.count({ where }),
        prisma.visit.count({ where: { ...where, status: 'COMPLETED' } }),
        prisma.visit.count({ where: { ...where, outcome: 'Cliente interesado' } }),
        prisma.visit.groupBy({
            by: ['userId'], where: { ...where, status: 'COMPLETED' },
            _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 1
        })
    ]);

    let topAgentName = null;
    if (byAgent[0]?.userId) {
        const agent = await prisma.user.findUnique({
            where: { id: byAgent[0].userId }, select: { name: true }
        });
        topAgentName = agent?.name;
    }

    const convRate = total > 0 ? Math.round((interested / total) * 100) : 0;
    const body = [
        `Visitas programadas: ${total}`,
        `Completadas: ${completed}`,
        `Tasa de conversión: ${convRate}%`,
        topAgentName ? `Agente destacado: ${topAgentName}` : null
    ].filter(Boolean).join(' · ');

    await prisma.broadcast.create({ data: { title: '📊 Resumen semanal', body } });
    console.log('[Weekly Report] Broadcast creado:', body);
}

function startWeeklyReportCron() {
    let lastRanWeek = -1; // evitar doble ejecución en el mismo lunes
    setInterval(() => {
        const now = new Date();
        const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
        // 9am Bogotá = 14:00 UTC (UTC-5, Colombia no tiene horario de verano)
        if (now.getDay() === 1 && now.getUTCHours() === 14 && now.getMinutes() === 0 && week !== lastRanWeek) {
            lastRanWeek = week;
            generateWeeklyReport().catch(e => console.warn('[Weekly Report]', e.message));
        }
    }, 60_000); // revisa cada minuto
}

// I1 (#47): Detección diaria de aniversarios de contrato — crea la tarea de
// incremento con anticipación (INCREMENTO_ANTICIPACION_DIAS, 90 por defecto)
// y avisa a los admins cuántas entraron al radar. Corre a las 7am Bogotá
// (12:00 UTC) y también al arrancar el servidor (si Railway durmió el proceso
// a esa hora, el deploy/restart la recupera).
function startIncrementoCron() {
    const run = async () => {
        try {
            const creados = await detectarAniversarios();
            if (creados.length > 0) {
                notifyAdmins(
                    '📈 Incrementos por gestionar',
                    `${creados.length} contrato(s) entraron al radar de incrementos: ${creados.map(c => c.ficha.arrendatarioNombre).slice(0, 5).join(', ')}${creados.length > 5 ? '…' : ''}. Revisa el módulo de Incrementos.`,
                );
            }
        } catch (e) { console.warn('[Incrementos Cron]', e.message); }
    };
    run(); // al arrancar
    let lastRanDay = new Date().getUTCDate();
    setInterval(() => {
        const now = new Date();
        // 7am Bogotá = 12:00 UTC (UTC-5, Colombia no tiene horario de verano)
        if (now.getUTCHours() === 12 && now.getUTCDate() !== lastRanDay) {
            lastRanDay = now.getUTCDate();
            run();
        }
    }, 10 * 60 * 1000); // revisa cada 10 min
}

// S1 (#41): Alertas de vencimiento del Centro de Solicitudes — derechos de
// petición con niveles escalonados (mitad del término, 3 días, vence hoy,
// vencido) y demás tipos al vencer. Corre a las 7:30am Bogotá (12:30 UTC) y
// al arrancar; cada nivel se notifica una sola vez (data.alertasEnviadas).
function startSolicitudAlertCron() {
    const run = () => revisarVencimientos().catch(e => console.warn('[Solicitudes Cron]', e.message));
    run(); // al arrancar
    let lastRanDay = new Date().getUTCDate();
    setInterval(() => {
        const now = new Date();
        if (now.getUTCHours() === 12 && now.getUTCMinutes() >= 30 && now.getUTCDate() !== lastRanDay) {
            lastRanDay = now.getUTCDate();
            run();
        }
    }, 10 * 60 * 1000); // revisa cada 10 min
}

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    startFcmCleanupCron();        // M6: limpieza diaria de tokens FCM
    startWeeklyReportCron();      // L1: resumen semanal los lunes a las 9am
    startLocationReminderCron();  // Recordatorio por silencio (reemplaza las notif. locales fijas)
    startIncrementoCron();        // I1: detección diaria de aniversarios de contrato (#47)
    startSolicitudAlertCron();    // S1: alertas de vencimiento de solicitudes (#41)
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

main();
