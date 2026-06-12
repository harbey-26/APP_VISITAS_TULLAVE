export const VISIT_TYPE_CONFIG = {
    RENTAL_SHOWING: {
        label: 'Mostrar en Arriendo',
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        border: 'border-blue-200',
        dot: 'bg-blue-500',
        barColor: '#3b82f6',
    },
    PROPERTY_INTAKE: {
        label: 'Captación',
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        border: 'border-orange-200',
        dot: 'bg-orange-500',
        barColor: '#f97316',
    },
    HANDOVER: {
        label: 'Entrega',
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-200',
        dot: 'bg-green-500',
        barColor: '#22c55e',
    },
    MOVE_OUT: {
        label: 'Desocupación',
        bg: 'bg-purple-100',
        text: 'text-purple-700',
        border: 'border-purple-200',
        dot: 'bg-purple-500',
        barColor: '#a855f7',
    },
    INSPECTION: {
        label: 'Inspección',
        bg: 'bg-yellow-100',
        text: 'text-yellow-700',
        border: 'border-yellow-200',
        dot: 'bg-yellow-500',
        barColor: '#eab308',
    },
    OTHER: {
        label: 'Otro',
        bg: 'bg-gray-100',
        text: 'text-gray-600',
        border: 'border-gray-200',
        dot: 'bg-gray-400',
        barColor: '#9ca3af',
    },
};

// Minutos de tolerancia antes de considerar que una visita "inició tarde".
// Evita marcar como tardías diferencias mínimas de reloj/GPS.
export const LATE_START_GRACE_MIN = 10;

// Devuelve cuántos minutos tarde inició la visita respecto a lo programado.
// null si no ha iniciado o si entró dentro de la tolerancia.
export function getLateStartMinutes(visit) {
    if (!visit?.actualStart || !visit?.scheduledStart) return null;
    const diffMin = Math.round(
        (new Date(visit.actualStart).getTime() - new Date(visit.scheduledStart).getTime()) / 60000
    );
    return diffMin > LATE_START_GRACE_MIN ? diffMin : null;
}

export const STATUS_CONFIG = {
    PENDING:     { label: 'Pendiente',    bg: 'bg-yellow-100', text: 'text-yellow-800', pulse: false },
    IN_PROGRESS: { label: 'En Curso',     bg: 'bg-blue-100',   text: 'text-blue-800',   pulse: true  },
    COMPLETED:   { label: 'Completada',   bg: 'bg-green-100',  text: 'text-green-800',  pulse: false },
    MISSED:      { label: 'No Realizada', bg: 'bg-red-100',    text: 'text-red-800',    pulse: false },
};
