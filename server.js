import express from 'express';
import cors from 'cors';
import prisma from './src/utils/prisma.js';
import dotenv from 'dotenv';
import apiRoutes from './src/routes/index.js';
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
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

main();
