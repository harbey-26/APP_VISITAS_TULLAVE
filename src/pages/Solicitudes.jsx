import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch, friendlyError } from '../utils/api';
import {
    SOLICITUD_ESTADOS, ESTADOS_ABIERTOS, PRIORIDADES, MEDIOS_INGRESO,
    SOLICITANTE_TIPOS, DP_TIPOS, URGENCIAS, compararBandeja,
} from '../utils/solicitudFlow.js';
import { hoyISO } from '../utils/incrementoCalc';
import { fechaCorta } from '../utils/fechaLetras';
import { formatoCifra } from '../utils/numeroALetras';
import { buildWhatsAppUrl } from '../utils/phone';
import { PORTAL_URL, mensajePortal } from '../utils/portalShare';
import {
    Button, Badge, PageHeader, EmptyState, Skeleton, Modal, Field, Input, Select, cn,
} from '../components/ui';
import {
    Inbox, Plus, Settings2, LayoutDashboard, ListTodo, AlertTriangle,
    Clock, CheckCircle2, User, X, Globe, Copy, MessageCircle,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────
// S1 — Centro de Solicitudes (epic #32): radicación de expedientes con
// consecutivo, bandeja por funcionario (#43), listado filtrable y dashboard
// de indicadores (#40). El detalle del expediente vive en /solicitudes/:id.
// ──────────────────────────────────────────────────────────────────────

function formatDateTime(iso) {
    try {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: 'America/Bogota', day: 'numeric', month: 'short',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(iso));
    } catch { return ''; }
}

const FORM_VACIO = {
    tipo: '', prioridad: 'MEDIA', medioIngreso: 'WHATSAPP', asunto: '',
    descripcion: '', solicitanteNombre: '', solicitanteTipo: 'ARRENDATARIO',
    solicitanteTelefono: '', solicitanteEmail: '', propertyId: '', contractId: '',
    responsableId: '', dpTipo: 'GENERAL',
};

function UrgenciaBadge({ urgencia }) {
    const u = URGENCIAS[urgencia];
    if (!u || urgencia === 'SIN_TERMINO') return null;
    return <Badge className={u.badge}>{u.label}</Badge>;
}

export default function Solicitudes() {
    const { user } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'ADMIN';

    const [tab, setTab] = useState('bandeja'); // bandeja | listado | dashboard
    const [solicitudes, setSolicitudes] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [contratos, setContratos] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [filtroEstado, setFiltroEstado] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    const [bandejaDe, setBandejaDe] = useState(''); // admin: ver bandeja de otro
    const [form, setForm] = useState(null);
    const [showTipos, setShowTipos] = useState(false);
    const [nuevoTipo, setNuevoTipo] = useState('');
    const [buscaAdmTipo, setBuscaAdmTipo] = useState('');

    const load = async () => {
        try {
            // Admin: TODOS los tipos (con los inactivos, para poder
            // reactivarlos en el modal); los formularios usan tiposActivos
            const [sols, tps, st] = await Promise.all([
                apiFetch('/api/solicitudes'),
                apiFetch(isAdmin ? '/api/solicitudes/tipos?todas=1' : '/api/solicitudes/tipos'),
                apiFetch('/api/solicitudes/stats'),
            ]);
            setSolicitudes(sols);
            setTipos(tps);
            setStats(st);
            if (isAdmin) {
                apiFetch('/api/users').then(setUsuarios).catch(() => {});
            }
            apiFetch('/api/contracts').then(setContratos).catch(() => {});
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const hoy = hoyISO();
    const labelTipo = (clave) => tipos.find((t) => t.clave === clave)?.label || clave;
    const tiposActivos = useMemo(() => tipos.filter((t) => t.activo), [tipos]);

    // Buscador de tipos (#35): los tipos pueden crecer — filtra la lista
    // desplegable por texto, sin acentos
    const [buscaTipo, setBuscaTipo] = useState('');
    const normaliza = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const tiposFiltrados = useMemo(
        () => tiposActivos.filter((t) => normaliza(t.label).includes(normaliza(buscaTipo))),
        [tiposActivos, buscaTipo], // eslint-disable-line react-hooks/exhaustive-deps
    );

    // ── Contrato relacionado: solo contratos VIGENTES (aprobados/enviados),
    // con buscador; para terminaciones, solo arrendamientos. Al elegirlo se
    // pre-llenan los datos del arrendatario (incluido el correo → la
    // solicitud queda visible en su portal) ──
    const [buscaContrato, setBuscaContrato] = useState('');
    const dirContrato = (d = {}) => [
        d.direccionInmueble,
        d.torreInmueble && `Torre ${d.torreInmueble}`,
        d.aptoInmueble && `Apto ${d.aptoInmueble}`,
        d.conjuntoInmueble,
    ].filter(Boolean).join(', ');
    const contratosVigentes = useMemo(() => {
        let lista = contratos.filter((c) => ['APPROVED', 'SENT'].includes(c.status));
        if (form?.tipo === 'TERMINACION_DE_CONTRATO') lista = lista.filter((c) => c.type === 'ARRENDAMIENTO');
        const q = normaliza(buscaContrato);
        if (q) {
            lista = lista.filter((c) => normaliza(
                `#${c.id} ${c.data?.arrendatarioNombre || ''} ${c.data?.propietarioNombre || ''} ${c.data?.arrendatarioCedula || ''} ${dirContrato(c.data)}`,
            ).includes(q));
        }
        return lista;
    }, [contratos, form?.tipo, buscaContrato]); // eslint-disable-line react-hooks/exhaustive-deps

    const vincularContrato = (contractId) => {
        const c = contratos.find((x) => String(x.id) === String(contractId));
        if (!c) return setForm((f) => ({ ...f, contractId }));
        const d = c.data || {};
        // Pre-llenar SOLO lo que esté vacío — no pisar lo digitado
        setForm((f) => ({
            ...f,
            contractId,
            solicitanteNombre: f.solicitanteNombre || d.arrendatarioNombre || '',
            solicitanteTelefono: f.solicitanteTelefono || d.arrendatarioCelular || '',
            solicitanteEmail: f.solicitanteEmail || d.arrendatarioEmail || '',
            solicitanteTipo: f.solicitanteNombre ? f.solicitanteTipo : 'ARRENDATARIO',
        }));
    };

    // ── Bandeja (#43): mi trabajo abierto (o el del funcionario elegido) ──
    const bandeja = useMemo(() => {
        let abiertas = solicitudes.filter((s) => ESTADOS_ABIERTOS.includes(s.estado));
        if (isAdmin) {
            const uid = bandejaDe ? Number(bandejaDe) : user.id;
            abiertas = abiertas.filter((s) => s.responsableId === uid || (!bandejaDe && !s.responsableId));
        }
        return [...abiertas].sort((a, b) => compararBandeja(a, b, hoy));
    }, [solicitudes, isAdmin, bandejaDe, user.id, hoy]);

    const bandejaPorTipo = useMemo(() => {
        const grupos = {};
        for (const s of bandeja) {
            grupos[s.tipo] = grupos[s.tipo] || [];
            grupos[s.tipo].push(s);
        }
        return Object.entries(grupos).sort((a, b) => b[1].length - a[1].length);
    }, [bandeja]);

    const visibles = useMemo(() => {
        let lista = [...solicitudes];
        if (filtroEstado) lista = lista.filter((s) => s.estado === filtroEstado);
        if (filtroTipo) lista = lista.filter((s) => s.tipo === filtroTipo);
        return lista;
    }, [solicitudes, filtroEstado, filtroTipo]);

    const handleRadicar = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const body = { ...form };
            for (const k of ['propertyId', 'contractId', 'responsableId']) {
                body[k] = body[k] ? Number(body[k]) : null;
            }
            if (form.tipo !== 'DERECHOS_DE_PETICION') delete body.dpTipo;
            const creada = await apiFetch('/api/solicitudes', { method: 'POST', body });
            toast.success(`Radicada: ${creada.radicado}`);
            setForm(null);
            navigate(`/solicitudes/${creada.id}`);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleCrearTipo = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await apiFetch('/api/solicitudes/tipos', { method: 'POST', body: { label: nuevoTipo } });
            toast.success(r.reactivado ? 'El tipo estaba desactivado: se reactivó con su historial' : 'Tipo creado');
            setNuevoTipo('');
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    // Copiar el link del portal para pegarlo en cualquier canal (correo,
    // WhatsApp Web, etc.). El fallback cubre WebViews sin Clipboard API.
    const copiarPortal = async () => {
        try {
            await navigator.clipboard.writeText(PORTAL_URL);
            toast.success('Link del portal copiado');
        } catch {
            window.prompt('Copie el link del portal:', PORTAL_URL);
        }
    };

    const CardSolicitud = ({ s }) => {
        const est = SOLICITUD_ESTADOS[s.estado] || {};
        const pri = PRIORIDADES[s.prioridad] || {};
        return (
            <button
                onClick={() => navigate(`/solicitudes/${s.id}`)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition"
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', est.dot)} />
                    <span className="font-mono text-xs font-bold text-gray-500">{s.radicado}</span>
                    <Badge className={est.badge}>{est.label}</Badge>
                    <Badge className={pri.badge}>{pri.label}</Badge>
                    <UrgenciaBadge urgencia={s.urgencia} />
                </div>
                <p className="font-bold text-gray-900 mt-1.5 truncate">{s.asunto}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {labelTipo(s.tipo)} · {s.solicitanteNombre}
                    {s.property?.address && <> · {s.property.address}</>}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                    {formatDateTime(s.createdAt)} · {MEDIOS_INGRESO[s.medioIngreso] || s.medioIngreso}
                    {s.responsable && <> · <User className="w-3 h-3 inline" /> {s.responsable.name}</>}
                    {s.fechaVencimiento && <> · vence {fechaCorta(s.fechaVencimiento)}</>}
                </p>
            </button>
        );
    };

    if (loading) {
        return (
            <div className="p-4 lg:p-8 space-y-4">
                <Skeleton className="h-9 w-64" />
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
        );
    }

    return (
        <div className="p-4 lg:p-8 max-w-6xl mx-auto pb-24 lg:pb-8">
            <PageHeader
                title="Centro de Solicitudes"
                subtitle="Cada solicitud es un expediente con radicado y trazabilidad completa"
            >
                <div className="flex flex-wrap gap-2">
                    {isAdmin && (
                        <Button variant="secondary" size="sm" onClick={() => setShowTipos(true)}>
                            <Settings2 className="w-4 h-4" /> Tipos
                        </Button>
                    )}
                    <Button size="sm" onClick={() => { setBuscaTipo(''); setBuscaContrato(''); setForm({ ...FORM_VACIO, tipo: tiposActivos[0]?.clave || '' }); }}>
                        <Plus className="w-4 h-4" /> Radicar solicitud
                    </Button>
                </div>
            </PageHeader>

            {/* ── Portal de Clientes: link para compartir con los clientes
                (pedido ago 2026). Copiar lo deja listo para pegar en cualquier
                canal; WhatsApp abre el selector de chat con el mensaje ── */}
            <div className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
                {/* min-w alto a propósito: en móvil (390px) fuerza a los
                    botones a bajar a su propia línea en vez de estrujar el
                    texto */}
                <div className="flex items-center gap-2.5 flex-1 min-w-[230px]">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                        <Globe className="w-5 h-5 text-brand-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">Portal de Clientes</p>
                        <a href={PORTAL_URL} target="_blank" rel="noreferrer"
                            className="text-xs font-semibold text-brand-600 hover:underline truncate block">
                            {PORTAL_URL.replace('https://', '')}
                        </a>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="secondary" size="sm" icon={Copy} onClick={copiarPortal}>
                        Copiar link
                    </Button>
                    <Button variant="success" size="sm" icon={MessageCircle}
                        onClick={() => window.open(buildWhatsAppUrl('', mensajePortal()), '_blank')}>
                        WhatsApp
                    </Button>
                </div>
            </div>

            {/* KPIs de cabecera (#40) */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                        <p className="text-2xl font-extrabold text-gray-900">{stats.abiertas}</p>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5 flex items-center gap-1"><Inbox className="w-3.5 h-3.5" /> Abiertas</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                        <p className="text-2xl font-extrabold text-gray-900">{stats.cerradas}</p>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Cerradas</p>
                    </div>
                    <div className={cn('rounded-2xl border p-4 shadow-sm', stats.vencidas > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100')}>
                        <p className={cn('text-2xl font-extrabold', stats.vencidas > 0 ? 'text-red-700' : 'text-gray-900')}>{stats.vencidas}</p>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Vencidas</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                        <p className="text-2xl font-extrabold text-gray-900">
                            {stats.promedioHoras == null ? '—' : stats.promedioHoras < 48 ? `${stats.promedioHoras} h` : `${Math.round(stats.promedioHoras / 24)} d`}
                        </p>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Respuesta promedio</p>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-2xl p-1 w-fit">
                {[['bandeja', 'Mi bandeja', ListTodo], ['listado', `Todas (${solicitudes.length})`, Inbox], ['dashboard', 'Indicadores', LayoutDashboard]].map(([key, label, Icon]) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={cn(
                            'px-4 py-2 rounded-xl text-sm font-bold transition inline-flex items-center gap-1.5',
                            tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700',
                        )}
                    >
                        <Icon className="w-4 h-4" /> {label}
                    </button>
                ))}
            </div>

            {/* ── Bandeja de trabajo (#43) ── */}
            {tab === 'bandeja' && (
                <>
                    {isAdmin && (
                        <div className="mb-4 flex items-center gap-2">
                            <Select value={bandejaDe} onChange={(e) => setBandejaDe(e.target.value)} className="w-auto text-sm">
                                <option value="">Mi bandeja (y sin asignar)</option>
                                {usuarios.map((u) => <option key={u.id} value={u.id}>Bandeja de {u.name}</option>)}
                            </Select>
                        </div>
                    )}
                    {bandeja.length === 0 ? (
                        <EmptyState icon={ListTodo} title="Bandeja vacía"
                            description="No hay solicitudes abiertas asignadas. Las nuevas aparecerán aquí ordenadas por urgencia." />
                    ) : (
                        <div className="space-y-5">
                            {bandejaPorTipo.map(([tipo, lista]) => (
                                <div key={tipo}>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                                        {labelTipo(tipo)} ({lista.length})
                                        {lista.some((s) => s.urgencia === 'VENCIDA') && <span className="ml-2 text-red-600">● vencidas</span>}
                                    </p>
                                    <div className="space-y-2">
                                        {lista.map((s) => <CardSolicitud key={s.id} s={s} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── Listado completo ── */}
            {tab === 'listado' && (
                <>
                    <div className="flex flex-wrap gap-2 mb-4">
                        <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-auto text-sm">
                            <option value="">Todos los estados</option>
                            {Object.entries(SOLICITUD_ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </Select>
                        <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="w-auto text-sm">
                            <option value="">Todos los tipos</option>
                            {tipos.map((t) => <option key={t.clave} value={t.clave}>{t.label}</option>)}
                        </Select>
                    </div>
                    {visibles.length === 0 ? (
                        <EmptyState icon={Inbox} title="Sin solicitudes"
                            description="Radica la primera solicitud con el botón de arriba." />
                    ) : (
                        <div className="space-y-2">
                            {visibles.map((s) => <CardSolicitud key={s.id} s={s} />)}
                        </div>
                    )}
                </>
            )}

            {/* ── Indicadores (#40) ── */}
            {tab === 'dashboard' && stats && (
                <div className="grid lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <p className="font-bold text-gray-900 mb-3">Abiertas por tipo</p>
                        {Object.keys(stats.porTipo).length === 0 ? (
                            <p className="text-sm text-gray-400">Sin solicitudes abiertas.</p>
                        ) : Object.entries(stats.porTipo).sort((a, b) => b[1] - a[1]).map(([tipo, n]) => (
                            <div key={tipo} className="mb-2">
                                <div className="flex justify-between text-xs font-semibold text-gray-600 mb-0.5">
                                    <span>{labelTipo(tipo)}</span><span>{n}</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-brand-600 rounded-full" style={{ width: `${(n / stats.abiertas) * 100}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <p className="font-bold text-gray-900 mb-3">Por estado</p>
                        {Object.entries(stats.porEstado).map(([estado, n]) => {
                            const est = SOLICITUD_ESTADOS[estado] || {};
                            return (
                                <div key={estado} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                                    <span className="inline-flex items-center gap-2 text-sm">
                                        <span className={cn('w-2.5 h-2.5 rounded-full', est.dot)} /> {est.label || estado}
                                    </span>
                                    <span className="font-bold text-sm">{n}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:col-span-2">
                        <p className="font-bold text-gray-900 mb-3">Solicitudes radicadas por mes</p>
                        <div className="flex items-end gap-2 h-28">
                            {stats.tendencia.map((t) => {
                                const max = Math.max(...stats.tendencia.map((x) => x.total));
                                return (
                                    <div key={t.mes} className="flex-1 flex flex-col items-center gap-1">
                                        <span className="text-xs font-bold">{t.total}</span>
                                        <div className="w-full bg-brand-600/80 rounded-t-lg" style={{ height: `${(t.total / max) * 80}px` }} />
                                        <span className="text-[10px] text-gray-400">{t.mes.slice(5)}/{t.mes.slice(2, 4)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: radicar (#34) ── */}
            <Modal open={!!form} onClose={() => setForm(null)} title="Radicar solicitud" maxWidth="max-w-lg">
                {form && (
                    <form onSubmit={handleRadicar} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Tipo de solicitud *">
                                <Input
                                    value={buscaTipo}
                                    onChange={(e) => {
                                        const q = e.target.value;
                                        setBuscaTipo(q);
                                        // Un solo tipo coincide → se selecciona solo
                                        const match = tiposActivos.filter((t) => normaliza(t.label).includes(normaliza(q)));
                                        if (q && match.length === 1) setForm((f) => ({ ...f, tipo: match[0].clave }));
                                    }}
                                    placeholder="🔍 Buscar tipo…"
                                    className="mb-1.5"
                                />
                                <Select required value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                                    <option value="" disabled>Selecciona…</option>
                                    {(tiposFiltrados.length ? tiposFiltrados : tiposActivos).map((t) => (
                                        <option key={t.clave} value={t.clave}>{t.label}</option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Medio de ingreso *">
                                <Select value={form.medioIngreso} onChange={(e) => setForm({ ...form, medioIngreso: e.target.value })}>
                                    {Object.entries(MEDIOS_INGRESO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </Select>
                            </Field>
                        </div>
                        {form.tipo === 'DERECHOS_DE_PETICION' && (
                            <Field label="Clase de petición" hint="Define el término legal en días hábiles">
                                <Select value={form.dpTipo} onChange={(e) => setForm({ ...form, dpTipo: e.target.value })}>
                                    {Object.entries(DP_TIPOS).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label} ({v.diasHabiles} días hábiles)</option>
                                    ))}
                                </Select>
                            </Field>
                        )}
                        <Field label="Asunto *">
                            <Input required maxLength={200} value={form.asunto}
                                onChange={(e) => setForm({ ...form, asunto: e.target.value })}
                                placeholder="Ej.: Filtración en el baño del apto 301" />
                        </Field>
                        <Field label="Descripción">
                            <textarea
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                                rows={3} maxLength={3000} value={form.descripcion}
                                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Solicitante *">
                                <Input required placeholder="Nombre de quien solicita" value={form.solicitanteNombre}
                                    onChange={(e) => setForm({ ...form, solicitanteNombre: e.target.value })} />
                            </Field>
                            <Field label="Calidad">
                                <Select value={form.solicitanteTipo} onChange={(e) => setForm({ ...form, solicitanteTipo: e.target.value })}>
                                    {Object.entries(SOLICITANTE_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </Select>
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Teléfono"><Input value={form.solicitanteTelefono} onChange={(e) => setForm({ ...form, solicitanteTelefono: e.target.value })} /></Field>
                            <Field label="Correo"><Input type="email" value={form.solicitanteEmail} onChange={(e) => setForm({ ...form, solicitanteEmail: e.target.value })} /></Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Prioridad">
                                <Select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                                    {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </Select>
                            </Field>
                            <Field label="Contrato relacionado" hint="Necesario para terminaciones — solo contratos vigentes">
                                <Input
                                    value={buscaContrato}
                                    onChange={(e) => setBuscaContrato(e.target.value)}
                                    placeholder="🔍 Nombre, cédula o dirección…"
                                    className="mb-1.5"
                                />
                                <Select value={form.contractId} onChange={(e) => vincularContrato(e.target.value)}>
                                    <option value="">Ninguno</option>
                                    {contratosVigentes.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            #{c.id} · {c.data?.arrendatarioNombre || c.data?.propietarioNombre || c.type}{dirContrato(c.data) ? ` — ${dirContrato(c.data)}` : ''}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                        {form.contractId && (() => {
                            const c = contratos.find((x) => String(x.id) === String(form.contractId));
                            if (!c) return null;
                            const d = c.data || {};
                            return (
                                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-0.5">
                                    <p className="font-bold">Contrato #{c.id} · {c.type === 'ARRENDAMIENTO' ? 'Arrendamiento' : 'Administración'} ({c.status === 'SENT' ? 'enviado' : 'aprobado'})</p>
                                    {d.arrendatarioNombre && <p>Arrendatario: {d.arrendatarioNombre}{d.arrendatarioCedula ? ` · CC ${d.arrendatarioCedula}` : ''}</p>}
                                    {dirContrato(d) && <p>Inmueble: {dirContrato(d)}{d.ciudadInmueble ? `, ${d.ciudadInmueble}` : ''}</p>}
                                    {(d.fechaInicio || d.fechaVencimiento) && (
                                        <p>Vigencia: {d.fechaInicio ? fechaCorta(d.fechaInicio) : '¿?'} → {d.fechaVencimiento ? fechaCorta(d.fechaVencimiento) : '¿?'}</p>
                                    )}
                                    {d.canon && <p>Canon: $ {formatoCifra(d.canon)}</p>}
                                </div>
                            );
                        })()}
                        {isAdmin && (
                            <Field label="Responsable">
                                <Select value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })}>
                                    <option value="">Sin asignar</option>
                                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </Select>
                            </Field>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
                            <Button type="submit" disabled={busy}>Radicar</Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* ── Modal: administrar tipos (#35) ── */}
            <Modal open={showTipos} onClose={() => setShowTipos(false)} title="Tipos de solicitud">
                <div className="space-y-3">
                    <Input
                        placeholder="🔍 Buscar tipo…"
                        value={buscaAdmTipo}
                        onChange={(e) => setBuscaAdmTipo(e.target.value)}
                    />
                    <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-64 overflow-y-auto">
                        {tipos.filter((t) => normaliza(t.label).includes(normaliza(buscaAdmTipo))).map((t) => (
                            <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                <span className={cn(!t.activo && 'text-gray-400 line-through')}>{t.label}</span>
                                <button
                                    className="text-xs font-bold text-brand-600"
                                    onClick={async () => {
                                        try {
                                            await apiFetch(`/api/solicitudes/tipos/${t.id}`, { method: 'PATCH', body: { activo: !t.activo } });
                                            load();
                                        } catch (err) { toast.error(friendlyError(err)); }
                                    }}
                                >
                                    {t.activo ? 'Desactivar' : 'Activar'}
                                </button>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleCrearTipo} className="flex gap-2">
                        <Input placeholder="Nuevo tipo…" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} />
                        <Button type="submit" disabled={busy || !nuevoTipo.trim()}><Plus className="w-4 h-4" /></Button>
                    </form>
                    <div className="flex justify-end">
                        <Button variant="secondary" onClick={() => setShowTipos(false)}><X className="w-4 h-4" /> Cerrar</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
