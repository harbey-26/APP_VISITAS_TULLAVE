// ───────────────────────────────────────────────────────────────────
// SlideToConfirm — control "desliza para confirmar" (estilo slide-to-unlock)
//
// Reemplaza a los botones de acción irreversible (iniciar / finalizar visita,
// registrar llamada): el gesto de arrastre es deliberado, así que evita
// toques accidentales sin necesidad de un modal de confirmación.
//
// Estados: idle → (arrastre) → confirmed → loading → (éxito: el padre
// desmonta el control | error: vuelve solo a idle para reintentar).
//
// Funciona con Pointer Events (mouse + touch + lápiz) y soporta teclado
// (Enter/Espacio) para el escritorio del administrador.
// ───────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronsRight, Check, Loader2, Play } from 'lucide-react';

const HANDLE = 56;      // px — tamaño del tirador
const PAD = 4;          // px — padding interno de la pista
const THRESHOLD = 0.9;  // % del recorrido para dar el gesto por completado

const VARIANTS = {
    brand: {
        gradient: 'linear-gradient(135deg, #e31c25 0%, #b91c1c 100%)',
        shadow: '0 8px 24px rgba(227,28,37,0.35)',
        track: 'bg-brand-50 border-brand-100',
        label: 'text-brand-700',
        arrow: 'text-brand-300',
    },
    success: {
        gradient: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
        shadow: '0 8px 24px rgba(22,163,74,0.35)',
        track: 'bg-green-50 border-green-100',
        label: 'text-green-700',
        arrow: 'text-green-300',
    },
    indigo: {
        gradient: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
        shadow: '0 8px 24px rgba(79,70,229,0.35)',
        track: 'bg-indigo-50 border-indigo-100',
        label: 'text-indigo-700',
        arrow: 'text-indigo-300',
    },
};

export default function SlideToConfirm({
    label,                    // texto en reposo — "Desliza para iniciar"
    loadingLabel,             // texto mientras el padre procesa la acción
    successLabel,             // texto al completar el gesto
    disabledLabel,            // texto cuando el control está bloqueado
    icon: Icon = Play,
    variant = 'brand',
    loading = false,
    disabled = false,
    onConfirm,
}) {
    const v = VARIANTS[variant] || VARIANTS.brand;
    const trackRef = useRef(null);
    const maxRef = useRef(0);
    const xRef = useRef(0);
    const originRef = useRef(0);
    const timerRef = useRef(null);
    const wasLoadingRef = useRef(false);

    const [x, setXState] = useState(0);
    const [max, setMax] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const setX = (value) => { xRef.current = value; setXState(value); };

    const measure = useCallback(() => {
        const width = trackRef.current?.clientWidth || 0;
        const m = Math.max(0, width - HANDLE - PAD * 2);
        maxRef.current = m;
        setMax(m);
        return m;
    }, []);

    useEffect(() => {
        measure();
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('resize', measure);
            clearTimeout(timerRef.current);
        };
    }, [measure]);

    // Si la acción del padre terminó sin desmontar el control (típicamente un
    // error: GPS, red o validación del backend), volver al inicio para reintentar.
    useEffect(() => {
        if (wasLoadingRef.current && !loading && confirmed) {
            setConfirmed(false);
            setX(0);
        }
        wasLoadingRef.current = loading;
    }, [loading, confirmed]);

    const locked = disabled || loading || confirmed;
    const progress = max > 0 ? Math.min(1, x / max) : 0;

    const complete = (m) => {
        setX(m);
        setConfirmed(true);
        try { navigator.vibrate?.(18); } catch { /* no soportado */ }
        // Pequeño respiro para que se alcance a ver la animación de éxito
        timerRef.current = setTimeout(() => onConfirm?.(), 200);
    };

    const handlePointerDown = (e) => {
        if (locked) return;
        const m = measure();
        if (m <= 0) return;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignorar */ }
        originRef.current = e.clientX - xRef.current;
        setDragging(true);
    };

    const handlePointerMove = (e) => {
        if (!dragging) return;
        const next = Math.min(maxRef.current, Math.max(0, e.clientX - originRef.current));
        setX(next);
    };

    const handlePointerUp = () => {
        if (!dragging) return;
        setDragging(false);
        const m = maxRef.current;
        if (m > 0 && xRef.current >= m * THRESHOLD) complete(m);
        else setX(0);
    };

    const handleKeyDown = (e) => {
        if (locked) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            complete(measure());
        }
    };

    const currentLabel = disabled && !loading && !confirmed
        ? (disabledLabel || label)
        : loading
            ? (loadingLabel || 'Procesando...')
            : confirmed
                ? (successLabel || 'Listo')
                : label;

    return (
        <div
            ref={trackRef}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={currentLabel}
            aria-disabled={locked}
            onKeyDown={handleKeyDown}
            className={`relative w-full h-16 rounded-2xl border overflow-hidden select-none transition-opacity duration-200 ${v.track} ${
                disabled && !confirmed ? 'opacity-60' : ''
            }`}
            style={{ padding: PAD }}
        >
            {/* Estela de color que crece con el arrastre y llena la pista al confirmar */}
            <div
                className="absolute top-1 bottom-1 left-1 rounded-xl pointer-events-none"
                style={{
                    width: confirmed ? `calc(100% - ${PAD * 2}px)` : HANDLE + x,
                    background: v.gradient,
                    opacity: confirmed ? 1 : 0.12 + progress * 0.35,
                    transition: dragging ? 'opacity 120ms linear' : 'width 350ms cubic-bezier(0.22,1,0.36,1), opacity 250ms ease-out',
                }}
            />

            {/* Etiqueta central */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none pl-[68px] pr-[44px]">
                <span
                    className={`text-[15px] font-bold truncate transition-colors duration-200 ${confirmed ? 'text-white' : v.label}`}
                    style={{ opacity: confirmed ? 1 : Math.max(0.15, 1 - progress * 1.6) }}
                >
                    {currentLabel}
                </span>
            </div>

            {/* Flechas guía — desaparecen al arrastrar */}
            {!confirmed && !locked && (
                <div
                    className="absolute right-4 inset-y-0 flex items-center pointer-events-none"
                    style={{ opacity: Math.max(0, 1 - progress * 2) }}
                >
                    <ChevronsRight className={`w-6 h-6 ${v.arrow} animate-nudge motion-reduce:animate-none`} />
                </div>
            )}

            {/* Tirador */}
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={`absolute top-1 left-1 rounded-xl flex items-center justify-center text-white touch-none ${
                    locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                }`}
                style={{
                    width: HANDLE,
                    height: HANDLE,
                    background: v.gradient,
                    boxShadow: v.shadow,
                    transform: `translateX(${x}px)`,
                    transition: dragging ? 'none' : 'transform 350ms cubic-bezier(0.22,1,0.36,1)',
                }}
            >
                {/* Onda de éxito */}
                {confirmed && !loading && (
                    <span
                        className="absolute inset-0 rounded-xl animate-ripple pointer-events-none"
                        style={{ background: v.gradient }}
                    />
                )}
                {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                ) : confirmed ? (
                    <Check className="w-7 h-7 animate-pop" strokeWidth={3} />
                ) : (
                    <Icon className={`w-6 h-6 ${dragging ? '' : 'animate-nudge motion-reduce:animate-none'}`} />
                )}
            </div>
        </div>
    );
}
