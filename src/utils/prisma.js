import { PrismaClient } from '@prisma/client';

// Singleton: una sola instancia compartida entre todos los controladores.
// connection_limit=5 evita saturar el PostgreSQL de Railway (límite ~20 conexiones).
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    log: ['error'],
});

export default prisma;
