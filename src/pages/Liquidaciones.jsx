import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch, friendlyError } from '../utils/api';
import {
    calcularLiquidacion, validateLiquidacionConfig, diasEntre,
    LIQUIDACION_STATUS, EDITABLE_STATUSES, SENDABLE_STATUSES, ADMON_MODOS,
} from '../utils/liquidacionCalc';
import { downloadLiquidacionPdf } from '../utils/liquidacionPdf';
import { formatoCifra } from '../utils/numeroALetras';
import { fechaCorta } from '../utils/fechaLetras';
import {
    Button, Badge, PageHeader, EmptyState, Skeleton, Modal, Field, Input, Select, inputClass, cn,
} from '../components/ui';
import { buildWhatsAppUrl } from '../utils/phone';
import {
    Receipt, Pencil, Eye, Send, Download, Trash2, CheckCircle, Undo2,
    MessageCircle, Mail, RotateCcw, User, X, Plus, Banknote, RefreshCw, ExternalLink,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────
// Liquidación inicial de contratos de arrendamiento: reemplaza el Excel.
// Se crea desde un contrato ARRENDAMIENTO aprobado (los datos del contrato
// van bloqueados), el agente configura el cobro con resumen en vivo y el
// admin la aprueba. Aprobada = cuenta por cobrar: se registran pagos hasta
// saldarla (PAGADA). Igual que contratos: PDF, WhatsApp y correo.
// ──────────────────────────────────────────────────────────────────────

const money = (v) => `$ ${formatoCifra(Math.abs(Math.round(v || 0)))}`;

const nombreDe = (l) => l.data?.origen?.arrendatarioNombre || 'Sin nombre';
const isSendable = (l) => SENDABLE_STATUSES.includes(l.status);
// Reabrir para corregir: aprobadas sin pagos y sin enviar al cliente
const isReopenable = (l) => l.status === 'APPROVED' && (l.pagos || []).length === 0 && !l.sentAt;

function formatDateTime(iso) {
    try {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: 'America/Bogota', day: 'numeric', month: 'short',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(iso));
    } catch {
        return '';
    }
}

// Campo de dinero: separador de miles en vivo, solo dígitos en el estado
// (mismo patrón del formulario de contratos).
function MoneyInput({ value, onChange, disabled }) {
    return (
        <Input
            type="text"
            inputMode="numeric"
            placeholder="0"
            disabled={disabled}
            value={value != null && String(value) !== '' && Number(value) !== 0 ? formatoCifra(value) : ''}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        />
    );
}

function IvaCheckbox({ checked, onChange, disabled }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap pt-2.5">
            <input
                type="checkbox"
                checked={!!checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs font-semibold text-gray-600">IVA 19%</span>
        </label>
    );
}

// ─── Resumen (sección C): totales en vivo, también usado como vista previa ──
function Resumen({ calc, compact = false }) {
    return (
        <div className={cn('space-y-1.5', compact ? 'text-xs' : 'text-sm')}>
            {calc.lineas.map((l, i) => (
                <div key={i} className="flex justify-between gap-2 text-gray-600">
                    <span className="min-w-0">
                        {l.concepto}
                        {l.detalle && <span className="block text-[11px] text-gray-400">{l.detalle}</span>}
                        {l.iva > 0 && <span className="block text-[11px] text-gray-400">+ IVA {money(l.iva)}</span>}
                    </span>
                    <span className={cn('font-semibold whitespace-nowrap', l.total < 0 && 'text-emerald-600')}>
                        {l.total < 0 ? `- ${money(l.total)}` : money(l.total)}
                    </span>
                </div>
            ))}
            <div className="border-t border-gray-200 pt-1.5 space-y-1">
                <div className="flex justify-between text-gray-500">
                    <span>Subtotal proporcional</span><span>{money(calc.subtotalProporcional)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                    <span>Servicios</span><span>{money(calc.subtotalServicios)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                    <span>IVA 19%</span><span>{money(calc.totalIva)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900">
                    <span>Total general</span><span>{money(calc.totalGeneral)}</span>
                </div>
                {calc.abonos.map((a, i) => (
                    <div key={i} className="flex justify-between text-emerald-700">
                        <span className="min-w-0 truncate">
                            Abono{a.fecha ? ` · ${fechaCorta(a.fecha)}` : ''}
                            {a.nota ? ` (${a.nota})` : ''}
                        </span>
                        <span className="whitespace-nowrap">- {money(a.valor)}</span>
                    </div>
                ))}
                <div className={cn('flex justify-between font-bold rounded-lg px-2 py-1.5 -mx-2',
                    calc.pagada ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700')}>
                    <span>{calc.pagada ? 'PAGADA' : 'Saldo a pagar'}</span>
                    <span>{money(calc.saldo)}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────

export default function Liquidaciones() {
    const { user } = useAuth();
    const toast = useToast();
    const isAdmin = user?.role === 'ADMIN';
    const [searchParams, setSearchParams] = useSearchParams();

    const [liquidaciones, setLiquidaciones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [agentFilter, setAgentFilter] = useState('');
    const [soloConSaldo, setSoloConSaldo] = useState(false);
    const [busy, setBusy] = useState(false);

    // Formulario (editar config)
    const [editing, setEditing] = useState(null);      // liquidación en edición o null
    const [config, setConfig] = useState({});

    // Vista previa / revisión, pagos y confirmaciones
    const [preview, setPreview] = useState(null);
    const [reviewNote, setReviewNote] = useState('');
    const [pagoTarget, setPagoTarget] = useState(null); // liquidación a la que se registra pago
    const [pagoForm, setPagoForm] = useState({ fecha: '', valor: '', nota: '' });
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [confirmReopen, setConfirmReopen] = useState(null);

    const fetchLiquidaciones = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch('/api/liquidaciones');
            setLiquidaciones(Array.isArray(data) ? data : []);
            return Array.isArray(data) ? data : [];
        } catch (err) {
            toast.error(friendlyError(err));
            return [];
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const openEdit = (liq) => {
        setEditing(liq);
        setConfig({ ...liq.data.config });
    };

    // Deep-link desde Contratos: /liquidaciones?contractId=N → abre la
    // liquidación de ese contrato o crea el borrador si no existe.
    const handledContractId = useRef(false);
    useEffect(() => {
        const contractId = searchParams.get('contractId');
        (async () => {
            const list = await fetchLiquidaciones();
            if (!contractId || handledContractId.current) return;
            handledContractId.current = true;
            setSearchParams({}, { replace: true });
            const existing = list.find((l) => l.contractId === parseInt(contractId));
            if (existing) {
                if (EDITABLE_STATUSES.includes(existing.status)) openEdit(existing);
                else setPreview(existing);
                return;
            }
            try {
                const created = await apiFetch('/api/liquidaciones', {
                    method: 'POST', body: { contractId: parseInt(contractId) },
                });
                setLiquidaciones((prev) => [created, ...prev]);
                openEdit(created);
                toast.success('Liquidación creada desde el contrato');
            } catch (err) {
                toast.error(friendlyError(err));
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Resumen en vivo de la liquidación en edición (mismo cálculo del backend)
    const liveCalc = useMemo(() => {
        if (!editing) return null;
        return calcularLiquidacion({ origen: editing.data.origen, config }, editing.pagos || []);
    }, [editing, config]);

    const configErrors = useMemo(() => (editing ? validateLiquidacionConfig(config) : []), [editing, config]);

    // Cambia un campo de config; al mover las fechas recalcula los días
    const setCfg = (key, value) => {
        setConfig((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'fechaInicialCobro' || key === 'fechaFinalCobro') {
                const dias = diasEntre(next.fechaInicialCobro, next.fechaFinalCobro);
                if (dias > 0) next.diasCobrados = dias;
            }
            return next;
        });
    };

    const saveConfig = async ({ thenSubmit = false } = {}) => {
        setBusy(true);
        try {
            const clean = {
                ...config,
                diasCobrados: Number(config.diasCobrados) || 0,
                pctDerechos: Number(config.pctDerechos) || 0,
                estudioValor: Number(config.estudioValor) || 0,
                polizaValor: Number(config.polizaValor) || 0,
                abonosPrevios: (config.abonosPrevios || []).map((a) => ({ ...a, valor: Number(a.valor) || 0 })),
                otros: (config.otros || []).map((o) => ({ ...o, valor: Number(o.valor) || 0 })),
            };
            const saved = await apiFetch(`/api/liquidaciones/${editing.id}`, { method: 'PATCH', body: { config: clean } });
            if (thenSubmit) {
                await apiFetch(`/api/liquidaciones/${saved.id}/submit`, { method: 'PATCH' });
                toast.success('Liquidación enviada a revisión del administrador');
            } else {
                toast.success('Borrador guardado');
            }
            setEditing(null);
            fetchLiquidaciones(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const syncFromContract = async () => {
        setBusy(true);
        try {
            const updated = await apiFetch(`/api/liquidaciones/${editing.id}/sync-contrato`, { method: 'POST' });
            setEditing(updated);
            toast.success('Datos re-importados del contrato');
            fetchLiquidaciones(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const review = async (liq, decision) => {
        if (decision === 'REJECTED' && !reviewNote.trim()) {
            toast.error('Escribe el motivo de la devolución para el agente.');
            return;
        }
        setBusy(true);
        try {
            await apiFetch(`/api/liquidaciones/${liq.id}/review`, {
                method: 'PATCH',
                body: { decision, note: reviewNote.trim() || undefined },
            });
            toast.success(decision === 'APPROVED' ? 'Liquidación aprobada' : 'Liquidación devuelta al agente');
            setPreview(null);
            setReviewNote('');
            fetchLiquidaciones(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const submitExisting = async (liq) => {
        setBusy(true);
        try {
            await apiFetch(`/api/liquidaciones/${liq.id}/submit`, { method: 'PATCH' });
            toast.success('Liquidación enviada a revisión del administrador');
            setPreview(null);
            fetchLiquidaciones(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const reopenAndEdit = async (liq) => {
        setBusy(true);
        try {
            const updated = await apiFetch(`/api/liquidaciones/${liq.id}/reopen`, { method: 'PATCH' });
            toast.success('Liquidación reabierta. Corrige y envíala de nuevo a revisión.');
            setConfirmReopen(null);
            setPreview(null);
            fetchLiquidaciones(true);
            openEdit(updated);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const removeLiquidacion = async (liq) => {
        setBusy(true);
        try {
            await apiFetch(`/api/liquidaciones/${liq.id}`, { method: 'DELETE' });
            toast.success('Liquidación eliminada');
            setConfirmDelete(null);
            fetchLiquidaciones(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleDownload = async (liq) => {
        try {
            await downloadLiquidacionPdf(liq);
        } catch (err) {
            toast.error(friendlyError(err));
        }
    };

    // WhatsApp: link público tokenizado, ventana abierta ANTES del await
    // (popup blockers), mismo patrón de contratos.
    const sendWhatsApp = async (liq) => {
        setBusy(true);
        const win = window.open('', '_blank');
        try {
            const res = await apiFetch(`/api/liquidaciones/${liq.id}/share`, { method: 'POST' });
            const nombre = nombreDe(liq);
            const msg = `Hola ${nombre} 👋, TuLlave Inmobiliaria le comparte la liquidación inicial de su contrato de arrendamiento. Puede consultarla y descargarla aquí: ${res.publicUrl}`;
            const url = buildWhatsAppUrl(liq.data?.origen?.arrendatarioCelular, msg);
            if (win) win.location.href = url;
            else window.location.href = url;
            toast.success('Liquidación compartida');
            setPreview(null);
            fetchLiquidaciones(true);
        } catch (err) {
            if (win) win.close();
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const sendEmail = async (liq) => {
        setBusy(true);
        try {
            const res = await apiFetch(`/api/liquidaciones/${liq.id}/email`, { method: 'POST' });
            toast.success(`Correo enviado a ${res.emailedTo}`);
            setPreview(null);
            fetchLiquidaciones(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    // ── Pagos ──
    const openPago = (liq) => {
        const hoy = new Date();
        const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        setPagoTarget(liq);
        setPagoForm({ fecha, valor: '', nota: '' });
    };

    const pagoSaldoResultante = useMemo(() => {
        if (!pagoTarget) return null;
        const valor = Number(pagoForm.valor) || 0;
        return Math.max(0, (pagoTarget.calc?.saldo ?? 0) - valor);
    }, [pagoTarget, pagoForm.valor]);

    const registrarPago = async () => {
        const valor = Number(pagoForm.valor) || 0;
        if (valor <= 0) {
            toast.error('Ingresa el valor del pago.');
            return;
        }
        setBusy(true);
        try {
            const updated = await apiFetch(`/api/liquidaciones/${pagoTarget.id}/pagos`, {
                method: 'POST',
                body: { valor, fecha: pagoForm.fecha, nota: pagoForm.nota.trim() || undefined },
            });
            toast.success(updated.status === 'PAID' ? '¡Liquidación pagada en su totalidad!' : 'Pago registrado');
            setPagoTarget(null);
            if (preview && preview.id === updated.id) setPreview(updated);
            fetchLiquidaciones(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const eliminarPago = async (liq, pagoId) => {
        setBusy(true);
        try {
            const updated = await apiFetch(`/api/liquidaciones/${liq.id}/pagos/${pagoId}`, { method: 'DELETE' });
            toast.success('Pago eliminado');
            if (preview && preview.id === updated.id) setPreview(updated);
            fetchLiquidaciones(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    // ── Filtros ──
    const agentOptions = useMemo(() => {
        const map = new Map();
        for (const l of liquidaciones) {
            if (l.user?.id) map.set(l.user.id, l.user.name || `Agente ${l.user.id}`);
        }
        return [...map.entries()].map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [liquidaciones]);

    const byAgent = (isAdmin && agentFilter)
        ? liquidaciones.filter((l) => String(l.user?.id) === agentFilter)
        : liquidaciones;
    const bySaldo = soloConSaldo
        ? byAgent.filter((l) => l.status === 'APPROVED' && (l.calc?.saldo ?? 0) > 0)
        : byAgent;
    const filtered = statusFilter ? bySaldo.filter((l) => l.status === statusFilter) : bySaldo;
    const pendingCount = liquidaciones.filter((l) => l.status === 'PENDING_APPROVAL').length;
    const totalPorCobrar = liquidaciones
        .filter((l) => l.status === 'APPROVED')
        .reduce((s, l) => s + (l.calc?.saldo ?? 0), 0);

    const origen = editing?.data?.origen || {};
    const editableNow = editing && EDITABLE_STATUSES.includes(editing.status);

    return (
        <div>
            <PageHeader
                title="Liquidaciones"
                subtitle={isAdmin
                    ? `Liquidaciones iniciales de arrendamiento${pendingCount ? ` — ${pendingCount} por revisar` : ''}${totalPorCobrar > 0 ? ` · Por cobrar: ${money(totalPorCobrar)}` : ''}`
                    : 'Liquidación inicial del contrato: se crea desde un contrato de arrendamiento aprobado'}
            >
                <Link to="/contracts">
                    <Button variant="secondary" icon={ExternalLink}>Ir a contratos</Button>
                </Link>
            </PageHeader>

            {/* Filtros: agente (admin) + solo con saldo */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
                {isAdmin && agentOptions.length > 0 && (
                    <div className="relative sm:max-w-xs w-full sm:w-auto">
                        <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <Select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="pl-10">
                            <option value="">Todos los agentes ({liquidaciones.length})</option>
                            {agentOptions.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name} ({liquidaciones.filter((l) => l.user?.id === a.id).length})
                                </option>
                            ))}
                        </Select>
                    </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={soloConSaldo}
                        onChange={(e) => setSoloConSaldo(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm font-semibold text-gray-600">Solo con saldo pendiente</span>
                </label>
            </div>

            {/* Filtros por estado */}
            <div className="flex gap-2 flex-wrap mb-5">
                <button
                    onClick={() => setStatusFilter('')}
                    className={cn('px-3 py-1.5 rounded-full text-xs font-bold transition',
                        !statusFilter ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50')}
                >
                    Todas ({bySaldo.length})
                </button>
                {Object.entries(LIQUIDACION_STATUS).map(([key, s]) => {
                    const count = bySaldo.filter((l) => l.status === key).length;
                    if (count === 0) return null;
                    return (
                        <button
                            key={key}
                            onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
                            className={cn('px-3 py-1.5 rounded-full text-xs font-bold transition',
                                statusFilter === key ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50')}
                        >
                            {s.label} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Lista */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={Receipt}
                    title="Sin liquidaciones"
                    description={(statusFilter || agentFilter || soloConSaldo)
                        ? 'No hay liquidaciones con los filtros seleccionados.'
                        : 'Crea la primera desde un contrato de arrendamiento aprobado: botón "Liquidación" en la página de Contratos.'}
                />
            ) : (
                <div className="space-y-3">
                    {filtered.map((l) => {
                        const status = LIQUIDACION_STATUS[l.status] || LIQUIDACION_STATUS.DRAFT;
                        const editable = EDITABLE_STATUSES.includes(l.status);
                        return (
                            <div key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-card p-4 sm:p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge className={status.badge}>{status.label}</Badge>
                                            {l.data?.origen?.codigoWasi && (
                                                <Badge className="bg-indigo-50 text-indigo-700">
                                                    Wasi {l.data.origen.codigoWasi}
                                                </Badge>
                                            )}
                                            {isAdmin && l.user?.name && (
                                                <Badge className="bg-brand-50 text-brand-700 inline-flex items-center gap-1">
                                                    <User className="w-3 h-3" />
                                                    {l.user.name}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="font-bold text-gray-900 mt-2 truncate">{nombreDe(l)}</p>
                                        <p className="text-sm text-gray-500 truncate">
                                            {l.data?.origen?.direccionCompleta || 'Sin dirección'}
                                        </p>
                                        <p className="text-sm mt-1">
                                            <span className="text-gray-500">Total {money(l.calc?.totalGeneral)}</span>
                                            {l.status === 'PAID' ? (
                                                <span className="font-bold text-emerald-600 ml-2">Pagada</span>
                                            ) : (
                                                <span className={cn('font-bold ml-2',
                                                    l.status === 'APPROVED' && (l.calc?.saldo ?? 0) > 0 ? 'text-brand-700' : 'text-gray-700')}>
                                                    Saldo {money(l.calc?.saldo)}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Actualizada {formatDateTime(l.updatedAt)}
                                            {l.sentAt ? ` · Enviada ${formatDateTime(l.sentAt)}` : ''}
                                        </p>
                                        {l.status === 'REJECTED' && l.reviewNote && (
                                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1 mt-2">
                                                Devuelta: {l.reviewNote}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Button variant="ghost" size="sm" icon={Eye} onClick={() => { setPreview(l); setReviewNote(''); }}>
                                            Ver
                                        </Button>
                                        {editable && (
                                            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(l)}>
                                                Editar
                                            </Button>
                                        )}
                                        {l.status === 'APPROVED' && (
                                            <Button variant="ghost" size="sm" icon={Banknote}
                                                className="text-emerald-700 hover:bg-emerald-50"
                                                onClick={() => openPago(l)}>
                                                Registrar pago
                                            </Button>
                                        )}
                                        {isReopenable(l) && (
                                            <Button variant="ghost" size="sm" icon={RotateCcw}
                                                className="text-orange-600 hover:bg-orange-50"
                                                onClick={() => setConfirmReopen(l)}>
                                                Corregir
                                            </Button>
                                        )}
                                        {isSendable(l) && (
                                            <>
                                                <Button variant="ghost" size="sm" icon={Download} onClick={() => handleDownload(l)}>
                                                    PDF
                                                </Button>
                                                {l.data?.origen?.arrendatarioCelular && (
                                                    <Button variant="ghost" size="sm" icon={MessageCircle}
                                                        className="text-emerald-600 hover:bg-emerald-50"
                                                        onClick={() => sendWhatsApp(l)} aria-label="Enviar por WhatsApp" />
                                                )}
                                                {l.data?.origen?.arrendatarioEmail && (
                                                    <Button variant="ghost" size="sm" icon={Mail}
                                                        className="text-blue-600 hover:bg-blue-50"
                                                        onClick={() => sendEmail(l)} aria-label="Enviar por correo" />
                                                )}
                                            </>
                                        )}
                                        {(editable || isAdmin) && (
                                            <Button variant="ghost" size="sm" icon={Trash2}
                                                className="text-red-500 hover:bg-red-50"
                                                onClick={() => setConfirmDelete(l)} aria-label="Eliminar" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Modal formulario: A (bloqueado) + B (config) + C (resumen) ── */}
            <Modal
                open={!!editing}
                onClose={() => !busy && setEditing(null)}
                title={`Liquidación de ${origen.arrendatarioNombre || 'arrendamiento'}`}
                maxWidth="max-w-4xl"
            >
                {editing && (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr,290px] gap-5">
                            <div className="max-h-[62vh] overflow-y-auto scrollbar-thin pr-1 -mr-1 space-y-5">
                                {/* A. Datos del contrato (bloqueados) */}
                                <section>
                                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                        <h4 className="font-bold text-gray-900 text-sm">A. Datos del contrato</h4>
                                        <div className="flex items-center gap-2">
                                            {editableNow && (
                                                <Button variant="ghost" size="sm" icon={RefreshCw} loading={busy} onClick={syncFromContract}>
                                                    Re-importar
                                                </Button>
                                            )}
                                            <Link to="/contracts" className="text-xs font-bold text-brand-600 hover:underline inline-flex items-center gap-1">
                                                Editar contrato de origen <ExternalLink className="w-3 h-3" />
                                            </Link>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mb-3">
                                        Estos datos vienen del contrato y no se editan aquí, para que contrato y liquidación nunca queden inconsistentes.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-gray-50 border border-gray-200 rounded-xl p-3">
                                        {[
                                            ['Arrendatario', origen.arrendatarioNombre],
                                            ['C.C.', origen.arrendatarioCedula],
                                            ['Correo', origen.arrendatarioEmail],
                                            ['Celular', origen.arrendatarioCelular],
                                            ['Código Wasi', origen.codigoWasi],
                                            ['Dirección', origen.direccionCompleta],
                                            ['Inicio del contrato', origen.fechaInicioContrato ? fechaCorta(origen.fechaInicioContrato) : ''],
                                            ['Fin del contrato', origen.fechaFinContrato ? fechaCorta(origen.fechaFinContrato) : ''],
                                            ['Canon mensual', money(origen.canonMensual)],
                                            ['Administración mensual', Number(origen.administracionMensual) > 0 ? money(origen.administracionMensual) : 'No aplica'],
                                        ].map(([label, value]) => (
                                            <div key={label} className="min-w-0">
                                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
                                                <p className="text-gray-800 font-semibold truncate">{value || '—'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* B. Configuración del cobro */}
                                <section>
                                    <h4 className="font-bold text-gray-900 text-sm mb-3">B. Configuración de la liquidación</h4>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <Field label="Fecha inicial del cobro *">
                                                <Input type="date" disabled={!editableNow} value={config.fechaInicialCobro || ''}
                                                    onChange={(e) => setCfg('fechaInicialCobro', e.target.value)} />
                                            </Field>
                                            <Field label="Fecha final del primer cobro *">
                                                <Input type="date" disabled={!editableNow} value={config.fechaFinalCobro || ''}
                                                    onChange={(e) => setCfg('fechaFinalCobro', e.target.value)} />
                                            </Field>
                                            <Field label="Días cobrados *" hint="Se calcula con las fechas; puedes ajustarlo">
                                                <Input type="number" min="0" inputMode="numeric" disabled={!editableNow}
                                                    value={config.diasCobrados ?? ''}
                                                    onChange={(e) => setCfg('diasCobrados', e.target.value)} />
                                            </Field>
                                        </div>
                                        {Number(origen.administracionMensual) > 0 && (
                                            <Field label="Cobro de la administración">
                                                <Select disabled={!editableNow} value={config.admonModo || 'PROPORCIONAL'}
                                                    onChange={(e) => setCfg('admonModo', e.target.value)}>
                                                    {Object.entries(ADMON_MODOS).map(([k, v]) => (
                                                        <option key={k} value={k}>{v}</option>
                                                    ))}
                                                </Select>
                                            </Field>
                                        )}
                                        <div className="grid grid-cols-[1fr,auto] gap-3 items-start">
                                            <Field label="Derechos de contrato y firma digital (%)" hint="Porcentaje sobre canon + administración">
                                                <Input type="number" min="0" max="100" step="0.5" inputMode="decimal" disabled={!editableNow}
                                                    value={config.pctDerechos ?? ''}
                                                    onChange={(e) => setCfg('pctDerechos', e.target.value)} />
                                            </Field>
                                            <IvaCheckbox checked={config.aplicaIvaDerechos} disabled={!editableNow}
                                                onChange={(v) => setCfg('aplicaIvaDerechos', v)} />
                                        </div>
                                        <div className="grid grid-cols-[1fr,auto] gap-3 items-start">
                                            <Field label="Estudio aseguradora ($)">
                                                <MoneyInput disabled={!editableNow} value={config.estudioValor}
                                                    onChange={(v) => setCfg('estudioValor', v)} />
                                            </Field>
                                            <IvaCheckbox checked={config.aplicaIvaEstudio} disabled={!editableNow}
                                                onChange={(v) => setCfg('aplicaIvaEstudio', v)} />
                                        </div>
                                        <div className="grid grid-cols-[1fr,auto] gap-3 items-start">
                                            <Field label="Póliza ($)" hint="Dejar en 0 si no aplica">
                                                <MoneyInput disabled={!editableNow} value={config.polizaValor}
                                                    onChange={(v) => setCfg('polizaValor', v)} />
                                            </Field>
                                            <IvaCheckbox checked={config.aplicaIvaPoliza} disabled={!editableNow}
                                                onChange={(v) => setCfg('aplicaIvaPoliza', v)} />
                                        </div>

                                        {/* Abonos previos */}
                                        <div>
                                            <p className="text-sm font-semibold text-gray-700 mb-2">Abonos previos (reserva, arras…)</p>
                                            <div className="space-y-2">
                                                {(config.abonosPrevios || []).map((a, i) => (
                                                    <div key={i} className="grid grid-cols-[130px,1fr,1fr,auto] gap-2 items-center">
                                                        <Input type="date" disabled={!editableNow} value={a.fecha || ''}
                                                            onChange={(e) => setCfg('abonosPrevios', config.abonosPrevios.map((x, j) => j === i ? { ...x, fecha: e.target.value } : x))} />
                                                        <MoneyInput disabled={!editableNow} value={a.valor}
                                                            onChange={(v) => setCfg('abonosPrevios', config.abonosPrevios.map((x, j) => j === i ? { ...x, valor: v } : x))} />
                                                        <Input placeholder="Nota" disabled={!editableNow} value={a.nota || ''}
                                                            onChange={(e) => setCfg('abonosPrevios', config.abonosPrevios.map((x, j) => j === i ? { ...x, nota: e.target.value } : x))} />
                                                        {editableNow && (
                                                            <button type="button" className="text-red-400 hover:text-red-600 p-1"
                                                                onClick={() => setCfg('abonosPrevios', config.abonosPrevios.filter((_, j) => j !== i))}
                                                                aria-label="Quitar abono">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {editableNow && (
                                                    <Button type="button" variant="outline" size="sm" icon={Plus}
                                                        onClick={() => setCfg('abonosPrevios', [...(config.abonosPrevios || []), { fecha: '', valor: '', nota: '' }])}>
                                                        Agregar abono
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Otros cargos o descuentos */}
                                        <div>
                                            <p className="text-sm font-semibold text-gray-700 mb-2">Otros cargos o descuentos</p>
                                            <div className="space-y-2">
                                                {(config.otros || []).map((o, i) => (
                                                    <div key={i} className="grid grid-cols-[1fr,130px,110px,auto,auto] gap-2 items-center">
                                                        <Input placeholder="Concepto" disabled={!editableNow} value={o.concepto || ''}
                                                            onChange={(e) => setCfg('otros', config.otros.map((x, j) => j === i ? { ...x, concepto: e.target.value } : x))} />
                                                        <MoneyInput disabled={!editableNow} value={o.valor}
                                                            onChange={(v) => setCfg('otros', config.otros.map((x, j) => j === i ? { ...x, valor: v } : x))} />
                                                        <select className={inputClass} disabled={!editableNow} value={o.tipo || 'CARGO'}
                                                            onChange={(e) => setCfg('otros', config.otros.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x))}>
                                                            <option value="CARGO">Cargo</option>
                                                            <option value="DESCUENTO">Descuento</option>
                                                        </select>
                                                        {o.tipo !== 'DESCUENTO' ? (
                                                            <IvaCheckbox checked={o.aplicaIva} disabled={!editableNow}
                                                                onChange={(v) => setCfg('otros', config.otros.map((x, j) => j === i ? { ...x, aplicaIva: v } : x))} />
                                                        ) : <span />}
                                                        {editableNow && (
                                                            <button type="button" className="text-red-400 hover:text-red-600 p-1"
                                                                onClick={() => setCfg('otros', config.otros.filter((_, j) => j !== i))}
                                                                aria-label="Quitar">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {editableNow && (
                                                    <Button type="button" variant="outline" size="sm" icon={Plus}
                                                        onClick={() => setCfg('otros', [...(config.otros || []), { concepto: '', valor: '', tipo: 'CARGO', aplicaIva: false }])}>
                                                        Agregar cargo/descuento
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* C. Resumen en vivo */}
                            <aside className="lg:border-l lg:border-gray-100 lg:pl-5">
                                <h4 className="font-bold text-gray-900 text-sm mb-3">C. Resumen</h4>
                                <div className="lg:sticky lg:top-0 max-h-[62vh] overflow-y-auto scrollbar-thin">
                                    {liveCalc && <Resumen calc={liveCalc} compact />}
                                </div>
                            </aside>
                        </div>

                        {configErrors.length > 0 && (
                            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-4">
                                Faltan: {configErrors.join(' · ')}. Puedes guardar el borrador, pero no enviarlo a revisión.
                            </p>
                        )}

                        {editableNow && (
                            <div className="flex flex-wrap items-center justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
                                <Button variant="secondary" size="sm" loading={busy} onClick={() => saveConfig()}>
                                    Guardar borrador
                                </Button>
                                <Button size="sm" icon={Send} loading={busy} disabled={configErrors.length > 0}
                                    onClick={() => saveConfig({ thenSubmit: true })}>
                                    Enviar a revisión
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </Modal>

            {/* ── Modal vista previa / revisión ─────────────────────────── */}
            <Modal
                open={!!preview}
                onClose={() => !busy && setPreview(null)}
                title={preview ? `Liquidación de ${nombreDe(preview)}` : ''}
                maxWidth="max-w-2xl"
            >
                {preview && (
                    <>
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <Badge className={(LIQUIDACION_STATUS[preview.status] || LIQUIDACION_STATUS.DRAFT).badge}>
                                {(LIQUIDACION_STATUS[preview.status] || LIQUIDACION_STATUS.DRAFT).label}
                            </Badge>
                            {preview.data?.origen?.codigoWasi && (
                                <Badge className="bg-indigo-50 text-indigo-700">Wasi {preview.data.origen.codigoWasi}</Badge>
                            )}
                            {!SENDABLE_STATUSES.includes(preview.status) && (
                                <span className="text-xs text-gray-400">El PDF saldrá con marca de agua BORRADOR hasta que el admin la apruebe</span>
                            )}
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto scrollbar-thin border border-gray-200 rounded-xl p-4 bg-gray-50/30 space-y-4">
                            <div className="text-sm text-gray-600 space-y-0.5">
                                <p className="font-bold text-gray-900">{nombreDe(preview)}</p>
                                <p>{preview.data?.origen?.direccionCompleta}</p>
                                {preview.data?.config?.fechaInicialCobro && (
                                    <p className="text-xs text-gray-400">
                                        Período: {fechaCorta(preview.data.config.fechaInicialCobro)} al {fechaCorta(preview.data.config.fechaFinalCobro)}
                                    </p>
                                )}
                            </div>
                            {preview.calc && <Resumen calc={preview.calc} />}

                            {/* Pagos registrados */}
                            {(preview.pagos || []).length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Pagos registrados</p>
                                    <div className="space-y-1">
                                        {preview.pagos.map((p) => (
                                            <div key={p.id} className="flex items-center justify-between gap-2 text-sm bg-white border border-gray-100 rounded-lg px-2.5 py-1.5">
                                                <span className="min-w-0 truncate text-gray-600">
                                                    {fechaCorta(p.fecha)}{p.nota ? ` · ${p.nota}` : ''}
                                                    <span className="block text-[11px] text-gray-400">Registró: {p.registrador?.name || '—'}</span>
                                                </span>
                                                <span className="flex items-center gap-1.5 whitespace-nowrap">
                                                    <span className="font-semibold text-emerald-700">{money(p.valor)}</span>
                                                    {isAdmin && (
                                                        <button type="button" className="text-red-400 hover:text-red-600 p-0.5"
                                                            onClick={() => eliminarPago(preview, p.id)} aria-label="Eliminar pago">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Devolución: nota del admin */}
                        {isAdmin && preview.status === 'PENDING_APPROVAL' && (
                            <div className="mt-4">
                                <Field label="Nota para el agente (obligatoria si devuelves)">
                                    <Input
                                        value={reviewNote}
                                        onChange={(e) => setReviewNote(e.target.value)}
                                        placeholder="Ej.: revisar los días cobrados"
                                    />
                                </Field>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
                            <Button variant="secondary" size="sm" icon={Download} onClick={() => handleDownload(preview)}>
                                Descargar PDF
                            </Button>
                            {preview.status === 'APPROVED' && (
                                <Button variant="success" size="sm" icon={Banknote} onClick={() => openPago(preview)}>
                                    Registrar pago
                                </Button>
                            )}
                            {isSendable(preview) && (
                                <>
                                    <Button variant="success" size="sm" icon={MessageCircle} loading={busy}
                                        disabled={!preview.data?.origen?.arrendatarioCelular}
                                        onClick={() => sendWhatsApp(preview)}>
                                        WhatsApp
                                    </Button>
                                    <Button size="sm" icon={Mail} loading={busy}
                                        disabled={!preview.data?.origen?.arrendatarioEmail}
                                        onClick={() => sendEmail(preview)}>
                                        Enviar correo
                                    </Button>
                                </>
                            )}
                            {isReopenable(preview) && (
                                <Button variant="ghost" size="sm" icon={RotateCcw}
                                    className="text-orange-600 hover:bg-orange-50"
                                    onClick={() => setConfirmReopen(preview)}>
                                    Corregir
                                </Button>
                            )}
                            {EDITABLE_STATUSES.includes(preview.status) && (
                                <>
                                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => { setPreview(null); openEdit(preview); }}>
                                        Editar
                                    </Button>
                                    <Button size="sm" icon={Send} loading={busy}
                                        disabled={validateLiquidacionConfig(preview.data?.config).length > 0}
                                        onClick={() => submitExisting(preview)}>
                                        Enviar a revisión
                                    </Button>
                                </>
                            )}
                            {isAdmin && preview.status === 'PENDING_APPROVAL' && (
                                <>
                                    <Button variant="danger-soft" size="sm" icon={Undo2} loading={busy}
                                        onClick={() => review(preview, 'REJECTED')}>
                                        Devolver
                                    </Button>
                                    <Button variant="success" size="sm" icon={CheckCircle} loading={busy}
                                        onClick={() => review(preview, 'APPROVED')}>
                                        Aprobar
                                    </Button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </Modal>

            {/* ── Modal registrar pago ──────────────────────────────────── */}
            <Modal open={!!pagoTarget} onClose={() => !busy && setPagoTarget(null)} title="Registrar pago">
                {pagoTarget && (
                    <>
                        <p className="text-sm text-gray-600 mb-4">
                            <strong>{nombreDe(pagoTarget)}</strong> — saldo actual{' '}
                            <strong className="text-brand-700">{money(pagoTarget.calc?.saldo)}</strong>
                        </p>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Fecha del pago *">
                                    <Input type="date" value={pagoForm.fecha}
                                        onChange={(e) => setPagoForm({ ...pagoForm, fecha: e.target.value })} />
                                </Field>
                                <Field label="Valor *">
                                    <MoneyInput value={pagoForm.valor}
                                        onChange={(v) => setPagoForm({ ...pagoForm, valor: v })} />
                                </Field>
                            </div>
                            <Field label="Nota (opcional)">
                                <Input placeholder="Ej.: transferencia Davivienda" value={pagoForm.nota}
                                    onChange={(e) => setPagoForm({ ...pagoForm, nota: e.target.value })} />
                            </Field>
                            {Number(pagoForm.valor) > 0 && (
                                <p className={cn('text-sm font-semibold rounded-lg px-3 py-2',
                                    pagoSaldoResultante === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-600')}>
                                    {pagoSaldoResultante === 0
                                        ? '✓ Con este pago la liquidación queda PAGADA'
                                        : `Saldo después del pago: ${money(pagoSaldoResultante)}`}
                                </p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 pt-5">
                            <Button variant="secondary" size="sm" onClick={() => setPagoTarget(null)}>Cancelar</Button>
                            <Button variant="success" size="sm" icon={Banknote} loading={busy} onClick={registrarPago}>
                                Registrar
                            </Button>
                        </div>
                    </>
                )}
            </Modal>

            {/* ── Confirmación de borrado ───────────────────────────────── */}
            <Modal open={!!confirmDelete} onClose={() => !busy && setConfirmDelete(null)} title="Eliminar liquidación">
                {confirmDelete && (
                    <>
                        <p className="text-sm text-gray-600">
                            ¿Eliminar la liquidación de <strong>{nombreDe(confirmDelete)}</strong>?
                            {(confirmDelete.pagos || []).length > 0 && ' Se eliminarán también sus pagos registrados.'}
                            {' '}Esta acción no se puede deshacer.
                        </p>
                        <div className="flex justify-end gap-2 pt-5">
                            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
                            <Button variant="danger" size="sm" loading={busy} onClick={() => removeLiquidacion(confirmDelete)}>
                                Eliminar
                            </Button>
                        </div>
                    </>
                )}
            </Modal>

            {/* ── Confirmación de reapertura ────────────────────────────── */}
            <Modal open={!!confirmReopen} onClose={() => !busy && setConfirmReopen(null)} title="Corregir liquidación aprobada">
                {confirmReopen && (
                    <>
                        <p className="text-sm text-gray-600">
                            La liquidación de <strong>{nombreDe(confirmReopen)}</strong> perderá la aprobación y volverá a estado editable.
                            Al corregirla deberás enviarla de nuevo a revisión del administrador.
                        </p>
                        <div className="flex justify-end gap-2 pt-5">
                            <Button variant="secondary" size="sm" onClick={() => setConfirmReopen(null)}>Cancelar</Button>
                            <Button size="sm" icon={RotateCcw} loading={busy} onClick={() => reopenAndEdit(confirmReopen)}>
                                Reabrir y corregir
                            </Button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
}
