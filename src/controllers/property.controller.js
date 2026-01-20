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

const geocodeAddress = async (address) => {
    try {
        const queries = [];

        // 1. Cleaned address (remove # and special chars)
        let cleanAddress = address.replace(/[#\-]/g, ' ').replace(/\s+/g, ' ').trim();
        queries.push(`${cleanAddress}, Bogotá, Colombia`);

        // 2. Original address
        queries.push(`${address}, Bogotá, Colombia`);

        // 3. Smart Intersection Logic for Bogota
        // Pattern: Calle X # Y -> Calle X Carrera Y (Approximation)
        const calleMatch = address.match(/(?:Calle|Cl|Cale)\s+(\d+[A-Z]*)\s*#\s*(\d+[A-Z]*)/i);
        if (calleMatch) {
            queries.unshift(`Calle ${calleMatch[1]} Carrera ${calleMatch[2]}, Bogotá, Colombia`);
            queries.push(`Calle ${calleMatch[1]}B Carrera ${calleMatch[2]}, Bogotá, Colombia`); // Try 'B' suffix specific to this case
        }

        // Pattern: Carrera X # Y -> Carrera X Calle Y
        const craMatch = address.match(/(?:Carrera|Cra|Kra|Kr)\s+(\d+[A-Z]*)\s*#\s*(\d+[A-Z]*)/i);
        if (craMatch) {
            queries.unshift(`Carrera ${craMatch[1]} Calle ${craMatch[2]}, Bogotá, Colombia`);
        }

        for (const q of queries) {
            console.log(`Attempting geocoding for: "${q}"`);
            const query = encodeURIComponent(q);
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

            const response = await fetch(url, {
                headers: { 'User-Agent': 'TullaveVisitApp/1.0' }
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    console.log(`Geocoding success for "${q}":`, data[0].lat, data[0].lon);
                    return {
                        lat: parseFloat(data[0].lat),
                        lng: parseFloat(data[0].lon)
                    };
                }
            }
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    } catch (error) {
        console.error("Geocoding service error:", error);
    }
    return null;
};

export const createProperty = async (req, res) => {
    console.log('Received Create Property Request:', req.body);
    try {
        let { address, client, lat, lng } = req.body;

        // Check if using suspect default coordinates (within generic Bogota center range)
        const isDefaultLat = Math.abs(lat - 4.6097) < 0.0001;
        const isDefaultLng = Math.abs(lng - (-74.0817)) < 0.0001;

        if (isDefaultLat && isDefaultLng) {
            console.log(`Detected default coordinates for ${address}. Attempting auto-geocoding...`);
            const geocoded = await geocodeAddress(address);

            if (geocoded) {
                console.log(`Geocoding success: ${geocoded.lat}, ${geocoded.lng}`);
                lat = geocoded.lat;
                lng = geocoded.lng;
            } else {
                console.warn(`Geocoding failed for ${address}. Using defaults.`);
            }
        }

        const property = await prisma.property.create({
            data: { address, client, lat, lng }
        });
        console.log('Property created:', property);
        res.status(201).json(property);
    } catch (error) {
        console.error('Error creating property:', error);
        res.status(400).json({ error: error.message });
    }
};

export const updateProperty = async (req, res) => {
    const { id } = req.params;
    try {
        let { address, client, lat, lng } = req.body;

        // Auto-geocode on update if lat/lng are missing or look like defaults, AND address is present
        // Or if the user explicitly wants to update based on address string
        if (address) {
            const isDefaultLat = !lat || Math.abs(lat - 4.6097) < 0.0001;
            const isDefaultLng = !lng || Math.abs(lng - (-74.0817)) < 0.0001;

            if (isDefaultLat && isDefaultLng) {
                console.log(`Update: attempting auto-geocoding for ${address}...`);
                const geocoded = await geocodeAddress(address);
                if (geocoded) {
                    lat = geocoded.lat;
                    lng = geocoded.lng;
                }
            }
        }

        const property = await prisma.property.update({
            where: { id: parseInt(id) },
            data: { address, client, lat, lng }
        });
        res.json(property);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const deleteProperty = async (req, res) => {
    const { id } = req.params;
    try {
        // Check for existing visits
        const visitCount = await prisma.visit.count({
            where: { propertyId: parseInt(id) }
        });

        if (visitCount > 0) {
            return res.status(400).json({
                error: `No se puede eliminar el inmueble porque tiene ${visitCount} visita(s) asociada(s). Elimine las visitas primero.`
            });
        }

        await prisma.property.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Inmueble eliminado correctamente' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
