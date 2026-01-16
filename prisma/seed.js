import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/auth.js';

const prisma = new PrismaClient();

async function main() {
    const password = await hashPassword('123456');

    const user = await prisma.user.upsert({
        where: { email: 'admin@tullave.com' },
        update: {},
        create: {
            email: 'admin@tullave.com',
            name: 'Admin User',
            password: password,
            role: 'ADMIN'
        }
    });

    const agent = await prisma.user.upsert({
        where: { email: 'agente@tullave.com' },
        update: {},
        create: {
            email: 'agente@tullave.com',
            name: 'Agente Inmobiliario',
            password: password,
            role: 'AGENT'
        }
    });

    const property = await prisma.property.create({
        data: {
            address: 'Calle 123 # 45-67, Bogotá',
            client: 'Juan Perez',
            lat: 4.6097,
            lng: -74.0817
        }
    });

    console.log({ user, agent, property });

    // Create a pending visit for today
    const today = new Date();
    today.setHours(14, 0, 0, 0);

    await prisma.visit.create({
        data: {
            userId: agent.id,
            propertyId: property.id,
            scheduledStart: today,
            estimatedDuration: 60,
            type: 'SHOWING',
            status: 'PENDING'
        }
    });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
