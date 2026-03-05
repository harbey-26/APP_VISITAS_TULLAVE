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
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        const queries = [];

        // 1. Dirección original completa — Google Maps entiende el formato colombiano
        //    "Calle 45 # 23-15" incluye el número de casa, es la más precisa
        queries.push(`${address}, Bogotá, Colombia`);

        // 2. Reemplazar # por "No." que Google también reconoce bien
        const withNo = address.replace('#', 'No.').replace(/\s+/g, ' ').trim();
        if (withNo !== address) {
            queries.push(`${withNo}, Bogotá, Colombia`);
        }

        // 3. Fallback: formato de intersección (solo si no resolvió antes)
        //    Calle X # Y-Z → Calle X con Carrera Y (pierde número de casa)
        const calleMatch = address.match(/(?:Calle|Cl|Cale)\s+(\d+[A-Z]*)\s*#\s*(\d+[A-Z]*)/i);
        if (calleMatch) {
            queries.push(`Calle ${calleMatch[1]} con Carrera ${calleMatch[2]}, Bogotá, Colombia`);
        }
        const craMatch = address.match(/(?:Carrera|Cra|Kra|Kr)\s+(\d+[A-Z]*)\s*#\s*(\d+[A-Z]*)/i);
        if (craMatch) {
            queries.push(`Carrera ${craMatch[1]} con Calle ${craMatch[2]}, Bogotá, Colombia`);
        }

        // 4. Último fallback: dirección limpia sin caracteres especiales
        const cleanAddress = address.replace(/[#\-]/g, ' ').replace(/\s+/g, ' ').trim();
        queries.push(`${cleanAddress}, Bogotá, Colombia`);

        for (const q of queries) {
            console.log(`Attempting geocoding for: "${q}"`);
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${apiKey}`;

            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'OK' && data.results.length > 0) {
                    const { lat, lng } = data.results[0].geometry.location;
                    console.log(`Geocoding success for "${q}":`, lat, lng);
                    return { lat, lng };
                }
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

        // Geocodificar si: no hay coords (null/undefined) o son las coords por defecto de Bogotá
        const isDefaultLat = lat != null && Math.abs(lat - 4.6097) < 0.0001;
        const isDefaultLng = lng != null && Math.abs(lng - (-74.0817)) < 0.0001;

        if (!lat || !lng || (isDefaultLat && isDefaultLng)) {
            console.log(`Attempting auto-geocoding for ${address}...`);
            const geocoded = await geocodeAddress(address);

            if (geocoded) {
                console.log(`Geocoding success: ${geocoded.lat}, ${geocoded.lng}`);
                lat = geocoded.lat;
                lng = geocoded.lng;
            } else {
                console.warn(`Geocoding failed for ${address}. Coordinates will be null.`);
                lat = null;
                lng = null;
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
