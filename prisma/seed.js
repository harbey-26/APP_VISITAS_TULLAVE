import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/auth.js';

const prisma = new PrismaClient();

// Backfill puntual del celular de agentes existentes (jun 2026). Solo escribe
// si phone está NULL, así nunca pisa un número editado luego desde el panel.
// Corre en cada deploy pero es idempotente; se puede borrar más adelante.
async function backfillAgentPhones() {
    const phones = {
        'Jhon Fredy Cruz Alonso': '3154333189',
        'Luis Fernando Mejia Amaya': '3151929081',
    };
    for (const [name, phone] of Object.entries(phones)) {
        const r = await prisma.user.updateMany({ where: { name, phone: null }, data: { phone } });
        if (r.count > 0) console.log(`Celular asignado a ${name}: ${phone}`);
    }
}

async function main() {
    await backfillAgentPhones();

    // Bootstrap-only: si ya hay usuarios en la BD, no sembramos nada. Esto evita
    // que los usuarios eliminados por el admin "resuciten" en cada deploy de
    // Railway. El seed solo aplica en la primera instalación (BD vacía).
    const existingCount = await prisma.user.count();
    if (existingCount > 0) {
        console.log(`Seed omitido: ya hay ${existingCount} usuario(s) en la BD.`);
        return { skipped: true };
    }

    const rawAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const rawAgentPassword = process.env.SEED_AGENT_PASSWORD;

    if (!rawAdminPassword || !rawAgentPassword) {
        throw new Error('Define SEED_ADMIN_PASSWORD y SEED_AGENT_PASSWORD como variables de entorno antes de ejecutar el seed.');
    }

    const adminPassword = await hashPassword(rawAdminPassword);
    const agentPassword = await hashPassword(rawAgentPassword);

    const user = await prisma.user.create({
        data: {
            email: 'admin@tullave.com',
            name: 'Admin User',
            password: adminPassword,
            role: 'ADMIN'
        }
    });

    const agent = await prisma.user.create({
        data: {
            email: 'agente@tullave.com',
            name: 'Agente Inmobiliario',
            password: agentPassword,
            role: 'AGENT'
        }
    });

    console.log({ user, agent });

    // Datos demo (inmueble + visita de ejemplo): SOLO bajo demanda.
    // En producción NO deben crearse — el seed corre en cada deploy de Railway y
    // la visita "para hoy" reaparecía cada día. Para sembrar demo en local:
    //   SEED_DEMO=true node prisma/seed.js
    if (process.env.SEED_DEMO === 'true') {
        let property = await prisma.property.findFirst({
            where: { address: 'Calle 123 # 45-67, Bogotá' }
        });

        if (!property) {
            property = await prisma.property.create({
                data: {
                    address: 'Calle 123 # 45-67, Bogotá',
                    client: 'Juan Perez',
                    lat: 4.6097,
                    lng: -74.0817
                }
            });
        }

        const today = new Date();
        today.setHours(14, 0, 0, 0);

        const existingVisit = await prisma.visit.findFirst({
            where: { propertyId: property.id, scheduledStart: today }
        });

        if (!existingVisit) {
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
        console.log('Datos demo sembrados (SEED_DEMO=true)');
    }
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
