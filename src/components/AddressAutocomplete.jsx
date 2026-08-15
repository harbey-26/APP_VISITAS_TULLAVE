import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

// Campo de dirección con autocompletado de Google Places. Al seleccionar una
// sugerencia entrega { address, lat, lng } con coordenadas exactas, lo que evita
// depender de la geocodificación del servidor (más frágil). Si el script de
// Maps aún no cargó, degrada a un input de texto normal.
//
// Requiere que la página haya cargado el script de Maps con la librería 'places'
// (ver src/utils/mapsLoader.js) y pase ese estado en `isLoaded`.
//
// IMPORTANTE: NO usamos el widget `<Autocomplete>` de @react-google-maps/api.
// Ese widget inyecta su lista (`.pac-container`) al final del <body>, y en
// Safari esa capa queda por debajo de los modales `position: fixed` — el
// desplegable simplemente no se veía (en Chrome sí). Aquí consultamos
// `AutocompleteService` y pintamos la lista dentro del propio componente, así
// hereda el contexto de apilamiento del modal y funciona igual en Safari,
// Chrome y el WebView del APK.
//
// `className` permite reusar los estilos del input de cada formulario.
export default function AddressAutocomplete({ value, onChange, isLoaded, placeholder, required, className }) {
    const [predictions, setPredictions] = useState([]);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const serviceRef = useRef(null);      // AutocompleteService (predicciones)
    const detailsRef = useRef(null);      // PlacesService (lat/lng del elegido)
    const sessionRef = useRef(null);      // token de sesión (agrupa la facturación)
    const boxRef = useRef(null);
    const skipNextQuery = useRef(false);  // evita re-consultar tras elegir

    const placesReady = isLoaded && !!window.google?.maps?.places;

    // Cierra el desplegable al tocar fuera del componente.
    useEffect(() => {
        if (!open) return;
        const onDocDown = e => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocDown);
        document.addEventListener('touchstart', onDocDown);
        return () => {
            document.removeEventListener('mousedown', onDocDown);
            document.removeEventListener('touchstart', onDocDown);
        };
    }, [open]);

    // Consulta de predicciones con debounce (evita una llamada por tecla).
    useEffect(() => {
        if (!placesReady) return;
        if (skipNextQuery.current) { skipNextQuery.current = false; return; }

        const query = (value || '').trim();

        const timer = setTimeout(() => {
            if (query.length < 3) { setPredictions([]); setOpen(false); return; }
            if (!serviceRef.current) serviceRef.current = new window.google.maps.places.AutocompleteService();
            if (!sessionRef.current) sessionRef.current = new window.google.maps.places.AutocompleteSessionToken();

            serviceRef.current.getPlacePredictions(
                {
                    input: query,
                    componentRestrictions: { country: 'co' },
                    sessionToken: sessionRef.current,
                },
                (results, status) => {
                    const ok = status === window.google.maps.places.PlacesServiceStatus.OK;
                    setPredictions(ok && results ? results.slice(0, 5) : []);
                    setActiveIndex(-1);
                    setOpen(ok && !!results?.length);
                },
            );
        }, 250);

        return () => clearTimeout(timer);
    }, [value, placesReady]);

    const selectPrediction = prediction => {
        skipNextQuery.current = true;
        setOpen(false);
        setPredictions([]);

        if (!detailsRef.current) {
            detailsRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
        }
        detailsRef.current.getDetails(
            {
                placeId: prediction.place_id,
                fields: ['formatted_address', 'geometry', 'name'],
                sessionToken: sessionRef.current,
            },
            (place, status) => {
                // El token de sesión se consume al pedir los detalles.
                sessionRef.current = null;
                if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
                    // Sin detalles nos quedamos con el texto; el servidor geocodifica.
                    onChange({ address: prediction.description, lat: null, lng: null });
                    return;
                }
                onChange({
                    address: place.formatted_address || place.name || prediction.description,
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                });
            },
        );
    };

    const handleKeyDown = e => {
        if (!open || !predictions.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => (i + 1) % predictions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => (i <= 0 ? predictions.length - 1 : i - 1));
        } else if (e.key === 'Enter') {
            // Solo interceptamos Enter si hay una opción resaltada, para no
            // bloquear el submit normal del formulario.
            if (activeIndex >= 0) {
                e.preventDefault();
                selectPrediction(predictions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div className="relative" ref={boxRef}>
            <input
                type="text"
                placeholder={placeholder}
                className={className || 'w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none'}
                value={value}
                required={required}
                autoComplete="off"
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                onKeyDown={handleKeyDown}
                onFocus={() => { if (predictions.length) setOpen(true); }}
                // Al teclear a mano limpiamos lat/lng: dejan de ser válidos hasta
                // que el usuario elija una sugerencia o el servidor geocodifique.
                onChange={e => onChange({ address: e.target.value, lat: null, lng: null })}
            />

            {open && predictions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1">
                    {predictions.map((p, i) => (
                        <li key={p.place_id}>
                            <button
                                type="button"
                                // onMouseDown: el click se procesa antes del blur del input.
                                onMouseDown={e => { e.preventDefault(); selectPrediction(p); }}
                                onMouseEnter={() => setActiveIndex(i)}
                                className={`w-full flex items-start gap-2 px-3 py-2 text-left text-sm transition ${i === activeIndex ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                            >
                                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                                <span className="min-w-0">
                                    <span className="block font-medium text-gray-900 truncate">
                                        {p.structured_formatting?.main_text || p.description}
                                    </span>
                                    {p.structured_formatting?.secondary_text && (
                                        <span className="block text-xs text-gray-500 truncate">
                                            {p.structured_formatting.secondary_text}
                                        </span>
                                    )}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
