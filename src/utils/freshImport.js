// Import dinámico resistente a deploys: si la app quedó abierta durante una
// actualización, los chunks del build viejo ya no existen y el import() falla
// ("'text/html' is not a valid JavaScript MIME type" o fetch 404). En ese caso
// recargamos una vez para tomar la versión nueva — mismo patrón que lazyPage
// en App.jsx, pero para los imports dentro de handlers (jspdf, downloadBlob).
export async function freshImport(importer) {
    try {
        return await importer();
    } catch (err) {
        const KEY = 'chunk_reload_at'; // compartida con lazyPage: 1 recarga por ventana
        if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
            const last = Number(sessionStorage.getItem(KEY) || 0);
            if (Date.now() - last > 30_000) {
                sessionStorage.setItem(KEY, String(Date.now()));
                window.location.reload();
                return new Promise(() => {}); // congela mientras recarga
            }
        }
        throw err;
    }
}
