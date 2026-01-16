import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getProperties = async (req, res) => {
    try {
        const properties = await prisma.property.findMany();
        res.json(properties);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createProperty = async (req, res) => {
    console.log('Received Create Property Request:', req.body);
    try {
        const property = await prisma.property.create({
            data: req.body
        });
        console.log('Property created:', property);
        res.status(201).json(property);
    } catch (error) {
        console.error('Error creating property:', error);
        res.status(400).json({ error: error.message });
    }
};
