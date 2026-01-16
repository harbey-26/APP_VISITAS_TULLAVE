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
        const query = encodeURIComponent(`${address}, Bogotá, Colombia`);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'TullaveVisitApp/1.0' // Nominatim requires a User-Agent
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
            }
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
