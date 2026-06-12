// Valida si una franja horaria nueva se solapa con visitas ya programadas.
// La usan createVisit y updateVisit (visit.controller) para impedir que un
// agente quede con dos visitas al mismo tiempo.
//
// visits: [{ scheduledStart, estimatedDuration }] — las visitas existentes
// newStart: Date | string — inicio propuesto
// durationMin: number — duración propuesta en minutos
export function hasScheduleConflict(visits, newStart, durationMin) {
    const start = new Date(newStart);
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    return visits.some(v => {
        const vStart = new Date(v.scheduledStart);
        const vEnd = new Date(vStart.getTime() + v.estimatedDuration * 60 * 1000);
        // Solapan si una empieza antes de que la otra termine (los bordes
        // exactos no cuentan: terminar 10:00 y empezar 10:00 es válido).
        return start < vEnd && end > vStart;
    });
}
