// ───────────────────────────────────────────────────────────────────
// Íconos SVG (data URI) para marcadores de Google Maps.
// Más ricos visualmente que SymbolPath: sombra proyectada, borde blanco
// y punto de estado. Reciben `google` (window.google.maps ya cargado)
// porque Size/Point requieren el SDK inicializado.
// Los usan: Agenda (mapa), Tracking y VisitExecution.
// ───────────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const svgUrl = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

// Punto de estado sobre el pin de visita (PENDING no lleva).
const STATUS_DOT = {
    COMPLETED: '#22c55e',
    IN_PROGRESS: '#3b82f6',
    MISSED: '#ef4444',
};

// Pin clásico (gota) con el color del tipo de visita, aro blanco y sombra.
export function visitMarkerIcon(google, { color = '#e31c25', status = 'PENDING' } = {}) {
    const dot = STATUS_DOT[status];
    const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
  <ellipse cx="20" cy="46.5" rx="7.5" ry="2.6" fill="rgba(0,0,0,0.22)"/>
  <path d="M20 2C12.1 2 5.7 8.4 5.7 16.3 5.7 26.8 20 45 20 45s14.3-18.2 14.3-28.7C34.3 8.4 27.9 2 20 2z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>
  <circle cx="20" cy="16.3" r="5.6" fill="#ffffff" fill-opacity="0.92"/>
  ${dot ? `<circle cx="31.5" cy="8.5" r="6" fill="${dot}" stroke="#ffffff" stroke-width="2.2"/>` : ''}
</svg>`;
    return {
        url: svgUrl(svg),
        scaledSize: new google.maps.Size(40, 50),
        anchor: new google.maps.Point(20, 45),
    };
}

// Avatar del agente: círculo con su inicial, puntero hacia la ubicación y
// punto de estado. `inactiveDot` permite variar la semántica por página
// (gris en Agenda, rojo en Rastreo donde "sin señal" es alerta).
export function agentMarkerIcon(google, { initial = '?', active = true, inactiveDot = '#9ca3af' } = {}) {
    const fill = active ? '#4f46e5' : '#9ca3af';
    const dot = active ? '#22c55e' : inactiveDot;
    const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52">
  <ellipse cx="22" cy="49.4" rx="6.5" ry="2.2" fill="rgba(0,0,0,0.22)"/>
  <path d="M22 49 L15.5 35 H28.5 Z" fill="${fill}"/>
  <circle cx="22" cy="20" r="16" fill="${fill}" stroke="#ffffff" stroke-width="3"/>
  <text x="22" y="25.5" text-anchor="middle" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="700" fill="#ffffff">${esc(String(initial).toUpperCase())}</text>
  <circle cx="34" cy="8.5" r="5.5" fill="${dot}" stroke="#ffffff" stroke-width="2.4"/>
</svg>`;
    return {
        url: svgUrl(svg),
        scaledSize: new google.maps.Size(44, 52),
        anchor: new google.maps.Point(22, 49),
    };
}

// Punto pequeño para hitos (check-in / check-out) en el mapa de la visita.
export function dotIcon(google, color) {
    return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
    };
}
