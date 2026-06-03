import express from 'express';
import cors from 'cors';
import prisma from './src/utils/prisma.js';
import dotenv from 'dotenv';
import apiRoutes from './src/routes/index.js';
import { startLocationReminderCron } from './src/utils/locationReminders.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// C2: CORS restringido a orígenes conocidos (configurable vía ALLOWED_ORIGINS)
const defaultOrigins = [
    'https://tu-llave-visitas-e66b.up.railway.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'capacitor://localhost',
    'http://localhost'
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : defaultOrigins;

app.use(cors({
    origin: (origin, callback) => {
        // Sin origin = peticiones nativas (APK, curl, Postman) → permitir
        if (!origin) return callback(null, true);
        const allowed = allowedOrigins.some(o => origin === o || origin.startsWith(o));
        callback(allowed ? null : new Error(`CORS: origen no permitido (${origin})`), allowed);
    },
    credentials: true
}));
app.use(express.json());

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

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
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
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

main();
