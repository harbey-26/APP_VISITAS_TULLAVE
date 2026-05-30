// ───────────────────────────────────────────────────────────────────
// Componentes UI base — sistema de diseño de TuLlave Visitas
// Centraliza tarjetas, botones, badges, encabezados y estados de carga
// para mantener radios, sombras y colores consistentes en toda la app.
// ───────────────────────────────────────────────────────────────────
import { Loader2, X } from 'lucide-react';

/** Une clases condicionalmente (sin dependencias). */
export function cn(...classes) {
    return classes.filter(Boolean).join(' ');
}

// ── Card ────────────────────────────────────────────────────────────
export function Card({ as: Tag = 'div', className = '', hover = false, children, ...props }) {
    return (
        <Tag
            className={cn(
                'bg-white rounded-2xl border border-gray-100 shadow-card',
                hover && 'transition-shadow hover:shadow-card-hover',
                className
            )}
            {...props}
        >
            {children}
        </Tag>
    );
}

export function CardHeader({ title, subtitle, icon: Icon, action, className = '' }) {
    return (
        <div className={cn('px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3', className)}>
            <div className="min-w-0">
                <h3 className="font-bold text-base text-gray-800 flex items-center gap-2 truncate">
                    {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
                    {title}
                </h3>
                {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
            {action}
        </div>
    );
}

// ── Button ──────────────────────────────────────────────────────────
const BUTTON_VARIANTS = {
    primary: 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/25',
    secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
    ghost: 'text-gray-600 hover:bg-gray-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/25',
    'danger-soft': 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200',
    outline: 'border border-brand-200 text-brand-600 hover:bg-brand-50 hover:border-brand-400',
};

const BUTTON_SIZES = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-5 py-3 text-base gap-2',
};

export function Button({
    variant = 'primary',
    size = 'md',
    icon: Icon,
    loading = false,
    disabled = false,
    className = '',
    children,
    ...props
}) {
    return (
        <button
            disabled={disabled || loading}
            className={cn(
                'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200',
                'active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
                BUTTON_VARIANTS[variant],
                BUTTON_SIZES[size],
                className
            )}
            {...props}
        >
            {loading ? (
                <Loader2 className={cn('animate-spin', size === 'sm' ? 'w-4 h-4' : 'w-5 h-5')} />
            ) : Icon ? (
                <Icon className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />
            ) : null}
            {children}
        </button>
    );
}

// ── Badge ───────────────────────────────────────────────────────────
export function Badge({ className = '', pulse = false, children }) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', className)}>
            {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />}
            {children}
        </span>
    );
}

// ── StatCard ────────────────────────────────────────────────────────
// Métrica con franja de color, ícono y número grande.
export function StatCard({ label, value, subtitle, icon: Icon, iconBg = 'bg-gray-100', iconColor = 'text-gray-600', stripe = 'bg-gray-300' }) {
    return (
        <Card className="overflow-hidden" hover>
            <div className={cn('h-1.5 w-full', stripe)} />
            <div className="p-4 flex items-center gap-4">
                {Icon && (
                    <div className={cn('p-3 rounded-xl shrink-0', iconBg)}>
                        <Icon className={cn('w-6 h-6', iconColor)} />
                    </div>
                )}
                <div className="min-w-0">
                    <p className="text-xs text-gray-500 truncate">{label}</p>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
                    {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
                </div>
            </div>
        </Card>
    );
}

// ── PageHeader ──────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, children, className = '' }) {
    return (
        <div className={cn('flex flex-col md:flex-row justify-between items-start md:items-center gap-4', className)}>
            <div>
                <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
                {subtitle && <p className="text-gray-500 text-sm">{subtitle}</p>}
            </div>
            {children && <div className="flex items-center gap-2 w-full md:w-auto">{children}</div>}
        </div>
    );
}

// ── Formularios: Input / Select / Field ─────────────────────────────
export const inputClass =
    'w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm ' +
    'focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:outline-none transition-all ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

export function Field({ label, hint, children }) {
    return (
        <div>
            {label && <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>}
            {children}
            {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
        </div>
    );
}

export function Input({ className = '', ...props }) {
    return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className = '', children, ...props }) {
    return (
        <select className={cn(inputClass, 'bg-white pr-8', className)} {...props}>
            {children}
        </select>
    );
}

// ── Modal ───────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, maxWidth = 'max-w-md', children }) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className={cn('bg-white w-full rounded-2xl p-6 shadow-2xl animate-slide-up', maxWidth)}
                onClick={(e) => e.stopPropagation()}
            >
                {title && (
                    <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition"
                            aria-label="Cerrar"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}

// ── Skeleton ────────────────────────────────────────────────────────
export function Skeleton({ className = '' }) {
    return <div className={cn('skeleton', className)} />;
}

// ── EmptyState ──────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
    return (
        <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6 gap-3', className)}>
            {Icon && (
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <Icon className="w-7 h-7 text-gray-400" />
                </div>
            )}
            <div>
                <p className="font-semibold text-gray-700">{title}</p>
                {description && <p className="text-sm text-gray-400 mt-1 max-w-xs">{description}</p>}
            </div>
            {action}
        </div>
    );
}

// ── Spinner ─────────────────────────────────────────────────────────
export function Spinner({ className = '' }) {
    return <Loader2 className={cn('animate-spin text-brand-600', className)} />;
}

// ── DonutChart ──────────────────────────────────────────────────────
// Gráfica de dona en SVG puro (sin dependencias). data: [{label, value, color}]
export function DonutChart({ data = [], size = 168, thickness = 22, centerLabel, centerValue }) {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return (
        <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative shrink-0" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle
                        cx={size / 2} cy={size / 2} r={radius}
                        fill="none" stroke="#f1f5f9" strokeWidth={thickness}
                    />
                    {total > 0 && data.map((d, i) => {
                        const fraction = d.value / total;
                        const dash = fraction * circumference;
                        const seg = (
                            <circle
                                key={i}
                                cx={size / 2} cy={size / 2} r={radius}
                                fill="none" stroke={d.color} strokeWidth={thickness}
                                strokeDasharray={`${dash} ${circumference - dash}`}
                                strokeDashoffset={-offset}
                                strokeLinecap="butt"
                                style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }}
                            />
                        );
                        offset += dash;
                        return seg;
                    })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{centerValue ?? total}</span>
                    {centerLabel && <span className="text-xs text-gray-400 mt-1">{centerLabel}</span>}
                </div>
            </div>
            <div className="flex-1 w-full space-y-2.5">
                {data.map((d, i) => {
                    const pct = total ? Math.round((d.value / total) * 100) : 0;
                    return (
                        <div key={i} className="flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                <span className="font-medium text-gray-700 truncate">{d.label}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="font-semibold text-gray-800 tabular-nums">{d.value}</span>
                                <span className="text-xs text-gray-400 tabular-nums w-9 text-right">{pct}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
