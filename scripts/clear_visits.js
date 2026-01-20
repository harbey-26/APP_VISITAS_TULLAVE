import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const { count } = await prisma.visit.deleteMany({});
        console.log(`Successfully deleted ${count} visits.`);
    } catch (e) {
        console.error('Error deleting visits:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
