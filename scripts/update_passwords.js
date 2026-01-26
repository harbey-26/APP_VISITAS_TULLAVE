import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/auth.js';

const prisma = new PrismaClient();

async function main() {
    const adminPassword = 'Tullave2024*';
    const agentPassword = 'Tullaveagente*';

    const hashedAdminPassword = await hashPassword(adminPassword);
    const hashedAgentPassword = await hashPassword(agentPassword);

    console.log(`Updating Admin password to: ${adminPassword}`);
    console.log(`Updating Agent password to: ${agentPassword}`);

    try {
        const admin = await prisma.user.update({
            where: { email: 'admin@tullave.com' },
            data: { password: hashedAdminPassword }
        });
        console.log('Admin password updated successfully.');
    } catch (e) {
        console.error('Error updating Admin password:', e.message);
    }

    try {
        const agent = await prisma.user.update({
            where: { email: 'agente@tullave.com' },
            data: { password: hashedAgentPassword }
        });
        console.log('Agent password updated successfully.');
    } catch (e) {
        console.error('Error updating Agent password:', e.message);
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
