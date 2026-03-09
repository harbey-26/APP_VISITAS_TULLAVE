import { PrismaClient } from '@prisma/client';

// Singleton: una sola instancia compartida entre todos los controladores.
// Evita "too many clients" en PostgreSQL de Railway.
const prisma = new PrismaClient();

export default prisma;
