import { useRef } from 'react';
import { Autocomplete } from '@react-google-maps/api';

// Campo de dirección con autocompletado de Google Places. Al seleccionar una
// sugerencia entrega { address, lat, lng } con coordenadas exactas, lo que evita
// depender de la geocodificación del servidor (más frágil). Si el script de
// Maps aún no cargó, degrada a un input de texto normal.
//
// Requiere que la página haya cargado el script de Maps con la librería 'places'
// (ver src/utils/mapsLoader.js) y pase ese estado en `isLoaded`.
//
// `className` permite reusar los estilos del input de cada formulario.
export default function AddressAutocomplete({ value, onChange, isLoaded, placeholder, required, className }) {
    const acRef = useRef(null);

    const handlePlaceChanged = () => {
        const place = acRef.current?.getPlace();
        if (!place?.geometry?.location) return;
        onChange({
            address: place.formatted_address || place.name || value,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
        });
    };

    const inputEl = (
        <input
            type="text"
            placeholder={placeholder}
            className={className || 'w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none'}
            value={value}
            required={required}
            // Al teclear a mano limpiamos lat/lng: dejan de ser válidos hasta
            // que el usuario elija una sugerencia o el servidor geocodifique.
            onChange={e => onChange({ address: e.target.value, lat: null, lng: null })}
        />
    );

    if (!isLoaded || !window.google?.maps?.places) return inputEl;

    return (
        <Autocomplete
            onLoad={ac => { acRef.current = ac; }}
            onPlaceChanged={handlePlaceChanged}
            options={{
                componentRestrictions: { country: 'co' },
                fields: ['formatted_address', 'geometry', 'name'],
            }}
        >
            {inputEl}
        </Autocomplete>
    );
}
