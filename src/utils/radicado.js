// Consecutivo del radicado "SOL-AAAA-NNNN". Se calcula desde el MAYOR número
// ya usado en el año — nunca desde el conteo de filas: al eliminar un
// expediente el conteo baja y el "siguiente" chocaría con un radicado vigente
// (constraint @unique), dejando la radicación bloqueada para siempre.
export function siguienteRadicado(anio, radicadosExistentes) {
    const ultimo = radicadosExistentes.reduce((max, r) => {
        const n = parseInt(String(r).split('-')[2], 10);
        return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `SOL-${anio}-${String(ultimo + 1).padStart(4, '0')}`;
}
