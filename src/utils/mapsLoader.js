// Configuración única del loader de Google Maps para toda la app.
//
// IMPORTANTE: todos los `useJsApiLoader` deben recibir EXACTAMENTE las mismas
// opciones (mismo id y mismo array de `libraries`). Si un componente carga el
// script con librerías distintas a otro, Google lanza el warning
// "Loader must not be called again with different options" y, al navegar entre
// páginas con mapa, el ErrorBoundary lo captura como "error inesperado".
//
// Por eso `MAPS_LIBRARIES` es una constante a nivel de módulo (referencia
// estable) y se reutiliza en Agenda, Tracking, VisitExecution y Properties.

export const MAPS_LIBRARIES = ['places'];

export const MAPS_LOADER_OPTIONS = {
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: MAPS_LIBRARIES,
};
