import { PrismaClient } from '@prisma/client';
import { comparePassword } from '../src/utils/auth.js';

const prisma = new PrismaClient();

async function verifyInternal() {
    const users = [
        { email: 'admin@tullave.com', password: 'Tullave2024*' },
        { email: 'agente@tullave.com', password: 'Tullaveagente*' }
    ];

    for (const { email, password } of users) {
        console.log(`Checking ${email}...`);
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            console.error(`❌ User ${email} not found in DB!`);
            continue;
        }

        const match = await comparePassword(password, user.password);
        if (match) {
            console.log(`✅ Password match for ${email}`);
        } else {
            console.error(`❌ Password MISMATCH for ${email}`);
            console.log(`Stored hash: ${user.password.substring(0, 20)}...`);
        }
    }
}

verifyInternal()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
