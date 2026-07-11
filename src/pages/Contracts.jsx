import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch, friendlyError } from '../utils/api';
import {
    CONTRACT_TEMPLATES, CONTRACT_STATUS, EDITABLE_STATUSES,
    getTemplate, emptyFormData, prefillFromVisit, validateContractData, fieldApplies,
} from '../utils/contractTemplates';
import { buildContractDocument } from '../utils/contractDocument';
import { downloadContractPdf } from '../utils/contractPdf';
import {
    Button, Badge, PageHeader, EmptyState, Skeleton, Modal, Field, Input, Select, SearchCombobox, inputClass, cn,
} from '../components/ui';
import { buildWhatsAppUrl } from '../utils/phone';
import { useJsApiLoader } from '@react-google-maps/api';
import { MAPS_LOADER_OPTIONS } from '../utils/mapsLoader';
import AddressAutocomplete from '../components/AddressAutocomplete';
import {
    FileText, Plus, Pencil, Eye, Send, Download, Trash2, CheckCircle,
    Undo2, ChevronLeft, ChevronRight, UserPlus, X, MessageCircle, Mail, RotateCcw, User,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────
// Contratos: el agente diligencia el formulario del contrato (Administración
// o Arrendamiento), lo envía a revisión y el admin da el visto bueno. Solo
// los contratos aprobados se descargan sin marca de agua "BORRADOR".
// ──────────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = Object.entries(CONTRACT_TEMPLATES).map(([value, t]) => ({
    value, label: t.shortLabel, description: t.description,
}));

// Nombre de la contraparte para mostrar en la tarjeta.
function clientOfContract(c) {
    return c.data?.propietarioNombre || c.data?.arrendatarioNombre || 'Sin nombre';
}

const clientPhoneOf = (c) => c.data?.propietarioTelefono || c.data?.arrendatarioCelular || '';
const clientEmailOf = (c) => c.data?.propietarioEmail || c.data?.arrendatarioEmail || '';
const isSendable = (c) => c.status === 'APPROVED' || c.status === 'SENT';
// Reabrir para corregir: solo aprobados (los enviados quedan bloqueados por ahora)
const isReopenable = (c) => c.status === 'APPROVED';

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

// ─── Campo dinámico del formulario ────────────────────────────────────
// Los campos de texto libre se guardan SIEMPRE en mayúsculas (los contratos
// van en mayúsculas y así se evitan inconsistencias); correos, montos y
// fechas se conservan tal cual. Las direcciones usan Google Places para
// estandarizar la escritura (con degradación a texto libre si Maps no carga).

function DynamicField({ field, value, onChange, mapsLoaded }) {
    const common = { value: value ?? '', onChange: (e) => onChange(e.target.value) };
    const upper = {
        value: value ?? '',
        onChange: (e) => onChange(e.target.value.toUpperCase()),
        className: 'uppercase',
    };
    switch (field.type) {
        case 'select':
            return (
                <Select {...common}>
                    <option value="">-- Seleccionar --</option>
                    {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
            );
        case 'textarea':
            return <textarea {...common} rows={3} className={inputClass} />;
        case 'date':
            return <Input type="date" {...common} />;
        case 'money':
        case 'number':
            return <Input type="number" min="0" inputMode="numeric" {...common} />;
        case 'email':
            return <Input type="email" {...common} />;
        case 'phone':
            return <Input type="tel" {...common} />;
        case 'address':
            return (
                <AddressAutocomplete
                    isLoaded={!!mapsLoaded}
                    value={value ?? ''}
                    placeholder="Escribe y elige una sugerencia…"
                    onChange={({ address }) => onChange((address || '').toUpperCase())}
                    className={cn(inputClass, 'uppercase')}
                />
            );
        default:
            return <Input type="text" {...upper} />;
    }
}

function CheckboxField({ field, value, onChange }) {
    return (
        <label className="flex items-center gap-3 py-2 cursor-pointer select-none">
            <input
                type="checkbox"
                checked={!!value}
                onChange={(e) => onChange(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm font-semibold text-gray-700">{field.label}</span>
        </label>
    );
}

// Lista repetible (deudores solidarios).
function ListField({ field, items, onChange, mapsLoaded }) {
    const list = Array.isArray(items) ? items : [];
    const update = (i, key, value) => {
        const next = list.map((item, idx) => (idx === i ? { ...item, [key]: value } : item));
        onChange(next);
    };
    const addItem = () => {
        const empty = {};
        for (const f of field.itemFields) empty[f.key] = f.default || '';
        onChange([...list, empty]);
    };
    return (
        <div className="space-y-4">
            {list.length === 0 && (
                <p className="text-sm text-gray-400">Sin {field.label.toLowerCase()}s registrados (opcional).</p>
            )}
            {list.map((item, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 relative bg-gray-50/50">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-700">{field.label} {i + 1}</p>
                        <button
                            type="button"
                            onClick={() => onChange(list.filter((_, idx) => idx !== i))}
                            className="text-red-400 hover:text-red-600 p-1"
                            aria-label="Quitar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {field.itemFields.map((f) => (
                            <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
                                <DynamicField field={f} value={item[f.key]} onChange={(v) => update(i, f.key, v)} mapsLoaded={mapsLoaded} />
                            </Field>
                        ))}
                    </div>
                </div>
            ))}
            <Button type="button" variant="outline" size="sm" icon={UserPlus} onClick={addItem}>
                Agregar {field.label.toLowerCase()}
            </Button>
        </div>
    );
}

// ─── Vista previa del contrato (bloques → HTML) ───────────────────────

function ContractPreview({ type, data }) {
    const doc = useMemo(() => buildContractDocument(type, data), [type, data]);
    if (!doc) return null;
    return (
        <div className="bg-white text-gray-900 text-[13px] leading-relaxed space-y-3 font-sans">
            <h2 className="text-center font-bold text-sm uppercase pt-1">{doc.title}</h2>
            {doc.blocks.map((b, i) => {
                if (b.kind === 'title') return null; {/* el título va en el membrete */}
                if (b.kind === 'subtitle') {
                    return <h3 key={i} className="text-center font-bold pt-2">{b.text}</h3>;
                }
                if (b.kind === 'kv') {
                    return (
                        <div key={i} className="flex gap-2 font-bold">
                            <span className="w-44 flex-shrink-0">{b.label}</span>
                            <span className="whitespace-pre-wrap">{b.value}</span>
                        </div>
                    );
                }
                if (b.kind === 'table') {
                    return (
                        <table key={i} className="w-full border border-gray-400 text-[12px]">
                            <tbody>
                                {b.rows.map((r, j) => (
                                    <tr key={j} className="border-b border-gray-300 last:border-b-0">
                                        <td className="border-r border-gray-300 font-bold px-2 py-1 w-[32%] align-top">{r[0]}</td>
                                        <td className="px-2 py-1 align-top whitespace-pre-wrap">{r[1]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    );
                }
                if (b.kind === 'clause') {
                    return (
                        <p key={i} className="text-justify">
                            <strong>{b.lead}</strong> {b.text}
                        </p>
                    );
                }
                if (b.kind === 'signature') {
                    return (
                        <div key={i} className="pt-6">
                            <div className="border-t border-gray-500 w-56 mb-1" />
                            <p className="font-bold">{b.role}</p>
                            {b.lines.map((l, j) => <p key={j}>{l}</p>)}
                        </div>
                    );
                }
                return <p key={i} className="text-justify">{b.text}</p>;
            })}
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────

export default function Contracts() {
    const { user } = useAuth();
    const toast = useToast();
    const isAdmin = user?.role === 'ADMIN';
    // Google Places para los campos de dirección (opciones únicas del loader
    // — ver utils/mapsLoader.js; si falla, los campos degradan a texto libre)
    const { isLoaded: mapsLoaded } = useJsApiLoader(MAPS_LOADER_OPTIONS);

    const [contracts, setContracts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [agentFilter, setAgentFilter] = useState(''); // '' = todos (solo admin)
    const [busy, setBusy] = useState(false);

    // Modal de formulario (crear/editar)
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);      // contrato en edición o null
    const [formType, setFormType] = useState('');
    const [formData, setFormData] = useState({});
    const [formVisitId, setFormVisitId] = useState('');
    const [step, setStep] = useState(0);               // 0 = elegir tipo; 1..N = secciones
    const [visits, setVisits] = useState([]);

    // Modal de vista previa / revisión
    const [preview, setPreview] = useState(null);      // contrato o null
    const [reviewNote, setReviewNote] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [confirmReopen, setConfirmReopen] = useState(null);

    const fetchContracts = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch('/api/contracts');
            setContracts(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => { fetchContracts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Visitas para pre-llenar: últimos 60 días + próximos 30 (el buscador
    // del modal permite encontrar al cliente aunque la lista sea larga).
    const fetchVisits = async () => {
        try {
            const fmt = (d) => {
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${d.getFullYear()}-${mm}-${dd}`;
            };
            const from = new Date(); from.setDate(from.getDate() - 60);
            const to = new Date(); to.setDate(to.getDate() + 30);
            const data = await apiFetch(`/api/visits?startDate=${fmt(from)}&endDate=${fmt(to)}`);
            setVisits((Array.isArray(data) ? data : [])
                .filter((v) => v.clientName)
                .sort((a, b) => new Date(b.scheduledStart) - new Date(a.scheduledStart)));
        } catch { /* el picker de visitas es opcional */ }
    };

    const template = formType ? getTemplate(formType) : null;
    const totalSteps = template ? template.sections.length : 0;

    const openCreate = () => {
        setEditing(null);
        setFormType('');
        setFormData({});
        setFormVisitId('');
        setStep(0);
        setShowForm(true);
        fetchVisits();
    };

    const openEdit = (contract) => {
        setEditing(contract);
        setFormType(contract.type);
        setFormData({ ...emptyFormData(contract.type), ...contract.data });
        setFormVisitId(contract.visitId ? String(contract.visitId) : '');
        setStep(1);
        setShowForm(true);
    };

    const chooseType = (type) => {
        setFormType(type);
        let data = emptyFormData(type);
        const visit = visits.find((v) => v.id === parseInt(formVisitId));
        if (visit) data = { ...data, ...prefillFromVisit(type, visit) };
        setFormData(data);
        setStep(1);
    };

    const saveContract = async ({ thenSubmit = false } = {}) => {
        setBusy(true);
        try {
            let saved;
            if (editing) {
                saved = await apiFetch(`/api/contracts/${editing.id}`, { method: 'PATCH', body: { data: formData } });
            } else {
                const visit = visits.find((v) => v.id === parseInt(formVisitId));
                saved = await apiFetch('/api/contracts', {
                    method: 'POST',
                    body: {
                        type: formType,
                        data: formData,
                        visitId: visit?.id || null,
                        propertyId: visit?.property?.id || null,
                    },
                });
            }
            if (thenSubmit) {
                await apiFetch(`/api/contracts/${saved.id}/submit`, { method: 'PATCH' });
                toast.success('Contrato enviado a revisión del administrador');
            } else {
                toast.success('Borrador guardado');
            }
            setShowForm(false);
            fetchContracts(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const submitExisting = async (contract) => {
        setBusy(true);
        try {
            await apiFetch(`/api/contracts/${contract.id}/submit`, { method: 'PATCH' });
            toast.success('Contrato enviado a revisión del administrador');
            setPreview(null);
            fetchContracts(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const review = async (contract, decision) => {
        if (decision === 'REJECTED' && !reviewNote.trim()) {
            toast.error('Escribe el motivo de la devolución para el agente.');
            return;
        }
        setBusy(true);
        try {
            await apiFetch(`/api/contracts/${contract.id}/review`, {
                method: 'PATCH',
                body: { decision, note: reviewNote.trim() || undefined },
            });
            toast.success(decision === 'APPROVED' ? 'Contrato aprobado' : 'Contrato devuelto al agente');
            setPreview(null);
            setReviewNote('');
            fetchContracts(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const removeContract = async (contract) => {
        setBusy(true);
        try {
            await apiFetch(`/api/contracts/${contract.id}`, { method: 'DELETE' });
            toast.success('Contrato eliminado');
            setConfirmDelete(null);
            fetchContracts(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    // Reabrir un contrato aprobado para corregir: vuelve a ser editable y, al
    // confirmar, se abre directamente el formulario para hacer la corrección.
    const reopenAndEdit = async (contract) => {
        setBusy(true);
        try {
            const updated = await apiFetch(`/api/contracts/${contract.id}/reopen`, { method: 'PATCH' });
            toast.success('Contrato reabierto. Corrige y envíalo de nuevo a revisión.');
            setConfirmReopen(null);
            setPreview(null);
            fetchContracts(true);
            openEdit(updated);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleDownload = async (contract) => {
        try {
            await downloadContractPdf(contract);
        } catch (err) {
            toast.error(friendlyError(err));
        }
    };

    // Envío por WhatsApp: pide el link público tokenizado y abre wa.me con
    // el mensaje pre-armado hacia el teléfono del cliente. La ventana se abre
    // ANTES del await (los popup blockers solo permiten window.open dentro
    // del gesto del usuario); luego se le asigna la URL.
    const sendWhatsApp = async (contract) => {
        setBusy(true);
        const win = window.open('', '_blank');
        try {
            const res = await apiFetch(`/api/contracts/${contract.id}/share`, { method: 'POST' });
            const label = getTemplate(contract.type)?.label || 'contrato';
            const nombre = clientOfContract(contract);
            const msg = `Hola ${nombre} 👋, TuLlave Inmobiliaria le comparte su ${label}. Puede consultarlo y descargarlo aquí: ${res.publicUrl}`;
            const url = buildWhatsAppUrl(clientPhoneOf(contract), msg);
            if (win) win.location.href = url;
            else window.location.href = url; // WebView sin popups: navegar directo
            toast.success('Contrato marcado como enviado');
            setPreview(null);
            fetchContracts(true);
        } catch (err) {
            if (win) win.close();
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    // Envío por correo: el servidor genera el PDF y lo manda adjunto por
    // Gmail (integración Google de Ajustes) al correo del cliente.
    const sendEmail = async (contract) => {
        setBusy(true);
        try {
            const res = await apiFetch(`/api/contracts/${contract.id}/email`, { method: 'POST' });
            toast.success(`Correo enviado a ${res.emailedTo}`);
            setPreview(null);
            fetchContracts(true);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    // Agentes que tienen contratos (para el filtro del admin), ordenados por
    // nombre. Se derivan de los contratos cargados — no hace falta otro fetch.
    const agentOptions = useMemo(() => {
        const map = new Map();
        for (const c of contracts) {
            if (c.user?.id) map.set(c.user.id, c.user.name || `Agente ${c.user.id}`);
        }
        return [...map.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [contracts]);

    // Filtro por agente (solo admin) → luego por estado. Los conteos de los
    // chips de estado reflejan el agente seleccionado.
    const byAgent = (isAdmin && agentFilter)
        ? contracts.filter((c) => String(c.user?.id) === agentFilter)
        : contracts;
    const filtered = statusFilter ? byAgent.filter((c) => c.status === statusFilter) : byAgent;
    const pendingCount = contracts.filter((c) => c.status === 'PENDING_APPROVAL').length;

    // Validación de la sección visible (solo requeridos, para avisar temprano).
    const sectionErrors = useMemo(() => {
        if (!template || step < 1) return [];
        const section = template.sections[step - 1];
        const errors = [];
        for (const f of section.fields) {
            if (!fieldApplies(f, formData) || f.type === 'list') continue;
            const v = formData[f.key];
            if (f.required && (v == null || String(v).trim() === '')) errors.push(f.label);
        }
        return errors;
    }, [template, step, formData]);

    const allErrors = formType ? validateContractData(formType, formData) : [];

    return (
        <div>
            <PageHeader
                title="Contratos"
                subtitle={isAdmin
                    ? `Revisa y aprueba los contratos diligenciados por los agentes${pendingCount ? ` — ${pendingCount} por revisar` : ''}`
                    : 'Diligencia los contratos y envíalos a aprobación del administrador'}
            >
                <Button icon={Plus} onClick={openCreate}>Nuevo contrato</Button>
            </PageHeader>

            {/* Filtro por agente (solo admin) */}
            {isAdmin && agentOptions.length > 1 && (
                <div className="mb-3 sm:max-w-xs">
                    <div className="relative">
                        <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <Select
                            value={agentFilter}
                            onChange={(e) => setAgentFilter(e.target.value)}
                            className="pl-10"
                        >
                            <option value="">Todos los agentes ({contracts.length})</option>
                            {agentOptions.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name} ({contracts.filter((c) => c.user?.id === a.id).length})
                                </option>
                            ))}
                        </Select>
                    </div>
                </div>
            )}

            {/* Filtros por estado */}
            <div className="flex gap-2 flex-wrap mb-5">
                <button
                    onClick={() => setStatusFilter('')}
                    className={cn('px-3 py-1.5 rounded-full text-xs font-bold transition',
                        !statusFilter ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50')}
                >
                    Todos ({byAgent.length})
                </button>
                {Object.entries(CONTRACT_STATUS).map(([key, s]) => {
                    const count = byAgent.filter((c) => c.status === key).length;
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
                    icon={FileText}
                    title="Sin contratos"
                    description={(statusFilter || agentFilter) ? 'No hay contratos con los filtros seleccionados.' : 'Crea el primer contrato con el botón "Nuevo contrato".'}
                />
            ) : (
                <div className="space-y-3">
                    {filtered.map((c) => {
                        const status = CONTRACT_STATUS[c.status] || CONTRACT_STATUS.DRAFT;
                        const editable = EDITABLE_STATUSES.includes(c.status);
                        return (
                            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-card p-4 sm:p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge className="bg-slate-100 text-slate-700">
                                                {getTemplate(c.type)?.shortLabel || c.type}
                                            </Badge>
                                            <Badge className={status.badge}>{status.label}</Badge>
                                            {isAdmin && c.user?.name && (
                                                <Badge className="bg-brand-50 text-brand-700 inline-flex items-center gap-1">
                                                    <User className="w-3 h-3" />
                                                    {c.user.name}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="font-bold text-gray-900 mt-2 truncate">{clientOfContract(c)}</p>
                                        <p className="text-sm text-gray-500 truncate">
                                            {c.data?.direccionInmueble || c.property?.address || 'Sin dirección'}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Actualizado {formatDateTime(c.updatedAt)}
                                            {c.status === 'SENT' && c.sentAt ? ` · Enviado ${formatDateTime(c.sentAt)}` : ''}
                                        </p>
                                        {c.status === 'REJECTED' && c.reviewNote && (
                                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1 mt-2">
                                                Devuelto: {c.reviewNote}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Button variant="ghost" size="sm" icon={Eye} onClick={() => { setPreview(c); setReviewNote(''); }}>
                                            Ver
                                        </Button>
                                        {editable && (
                                            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(c)}>
                                                Editar
                                            </Button>
                                        )}
                                        {isReopenable(c) && (
                                            <Button variant="ghost" size="sm" icon={RotateCcw}
                                                className="text-orange-600 hover:bg-orange-50"
                                                onClick={() => setConfirmReopen(c)}>
                                                Corregir
                                            </Button>
                                        )}
                                        {isSendable(c) && (
                                            <>
                                                <Button variant="ghost" size="sm" icon={Download} onClick={() => handleDownload(c)}>
                                                    PDF
                                                </Button>
                                                {clientPhoneOf(c) && (
                                                    <Button variant="ghost" size="sm" icon={MessageCircle}
                                                        className="text-emerald-600 hover:bg-emerald-50"
                                                        onClick={() => sendWhatsApp(c)} aria-label="Enviar por WhatsApp" />
                                                )}
                                                {clientEmailOf(c) && (
                                                    <Button variant="ghost" size="sm" icon={Mail}
                                                        className="text-blue-600 hover:bg-blue-50"
                                                        onClick={() => sendEmail(c)} aria-label="Enviar por correo" />
                                                )}
                                            </>
                                        )}
                                        {(editable || isAdmin) && (
                                            <Button variant="ghost" size="sm" icon={Trash2}
                                                className="text-red-500 hover:bg-red-50"
                                                onClick={() => setConfirmDelete(c)} aria-label="Eliminar" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Modal formulario (wizard) ─────────────────────────────── */}
            <Modal
                open={showForm}
                onClose={() => !busy && setShowForm(false)}
                title={editing ? 'Editar contrato' : 'Nuevo contrato'}
                maxWidth="max-w-2xl"
            >
                <div className="max-h-[70vh] overflow-y-auto scrollbar-thin pr-1 -mr-1">
                    {step === 0 && (
                        <div className="space-y-4">
                            <Field label="Pre-llenar desde una visita (opcional)" hint="Busca por nombre del cliente o por dirección del inmueble; deja vacío para diligenciar desde cero">
                                <SearchCombobox
                                    items={visits}
                                    value={formVisitId}
                                    onChange={setFormVisitId}
                                    getPrimary={(v) => v.clientName}
                                    getSecondary={(v) => `${v.property?.address || 'sin dirección'} · ${formatDateTime(v.scheduledStart)}`}
                                    placeholder="Buscar cliente o dirección…"
                                    emptyText="Sin coincidencias en las visitas recientes."
                                />
                            </Field>
                            <p className="text-sm font-semibold text-gray-700">Tipo de contrato</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {TYPE_OPTIONS.map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => chooseType(t.value)}
                                        className="text-left border border-gray-200 rounded-2xl p-4 hover:border-brand-500 hover:bg-brand-50/50 transition group"
                                    >
                                        <FileText className="w-6 h-6 text-brand-600 mb-2" />
                                        <p className="font-bold text-gray-900 group-hover:text-brand-700">{t.label}</p>
                                        <p className="text-xs text-gray-500 mt-1">{t.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step >= 1 && template && (
                        <div>
                            {/* Progreso */}
                            <div className="flex items-center gap-1.5 mb-5">
                                {template.sections.map((s, i) => (
                                    <button
                                        key={s.title}
                                        type="button"
                                        onClick={() => setStep(i + 1)}
                                        className={cn('flex-1 h-1.5 rounded-full transition',
                                            i + 1 <= step ? 'bg-brand-600' : 'bg-gray-200')}
                                        aria-label={s.title}
                                    />
                                ))}
                            </div>
                            <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">
                                Paso {step} de {totalSteps} — {getTemplate(formType).shortLabel}
                            </p>
                            <h4 className="font-bold text-gray-900 mb-4">{template.sections[step - 1].title}</h4>

                            <div className="space-y-4">
                                {template.sections[step - 1].fields.map((f) => {
                                    if (!fieldApplies(f, formData)) return null;
                                    if (f.type === 'checkbox') {
                                        return (
                                            <CheckboxField key={f.key} field={f} value={formData[f.key]}
                                                onChange={(v) => setFormData({ ...formData, [f.key]: v })} />
                                        );
                                    }
                                    if (f.type === 'list') {
                                        return (
                                            <ListField key={f.key} field={f} items={formData[f.key]}
                                                onChange={(v) => setFormData({ ...formData, [f.key]: v })}
                                                mapsLoaded={mapsLoaded} />
                                        );
                                    }
                                    return (
                                        <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.hint}>
                                            <DynamicField field={f} value={formData[f.key]}
                                                onChange={(v) => setFormData({ ...formData, [f.key]: v })}
                                                mapsLoaded={mapsLoaded} />
                                        </Field>
                                    );
                                })}
                            </div>

                            {sectionErrors.length > 0 && (
                                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-4">
                                    Faltan: {sectionErrors.join(', ')}. Puedes guardar el borrador, pero no enviarlo a revisión.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Acciones del wizard */}
                {step >= 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-4 border-t border-gray-100">
                        <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={busy}
                            onClick={() => setStep(step > 1 ? step - 1 : editing ? 1 : 0)}>
                            Atrás
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" loading={busy} onClick={() => saveContract()}>
                                Guardar borrador
                            </Button>
                            {step < totalSteps ? (
                                <Button size="sm" icon={ChevronRight} onClick={() => setStep(step + 1)}>
                                    Siguiente
                                </Button>
                            ) : (
                                <Button size="sm" icon={Send} loading={busy} disabled={allErrors.length > 0}
                                    onClick={() => saveContract({ thenSubmit: true })}>
                                    Enviar a revisión
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Modal vista previa / revisión ─────────────────────────── */}
            <Modal
                open={!!preview}
                onClose={() => !busy && setPreview(null)}
                title={preview ? getTemplate(preview.type)?.label : ''}
                maxWidth="max-w-3xl"
            >
                {preview && (
                    <>
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <Badge className={(CONTRACT_STATUS[preview.status] || CONTRACT_STATUS.DRAFT).badge}>
                                {(CONTRACT_STATUS[preview.status] || CONTRACT_STATUS.DRAFT).label}
                            </Badge>
                            {preview.status !== 'APPROVED' && preview.status !== 'SENT' && (
                                <span className="text-xs text-gray-400">El PDF saldrá con marca de agua BORRADOR hasta que el admin lo apruebe</span>
                            )}
                        </div>
                        <div className="max-h-[55vh] overflow-y-auto scrollbar-thin border border-gray-200 rounded-xl p-4 sm:p-6 bg-gray-50/30">
                            <ContractPreview type={preview.type} data={preview.data} />
                        </div>

                        {/* Devolución: nota del admin */}
                        {isAdmin && preview.status === 'PENDING_APPROVAL' && (
                            <div className="mt-4">
                                <Field label="Nota para el agente (obligatoria si devuelves)">
                                    <Input
                                        value={reviewNote}
                                        onChange={(e) => setReviewNote(e.target.value)}
                                        placeholder="Ej.: revisar el número de matrícula inmobiliaria"
                                    />
                                </Field>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
                            <Button variant="secondary" size="sm" icon={Download} onClick={() => handleDownload(preview)}>
                                Descargar PDF
                            </Button>
                            {isSendable(preview) && (
                                <>
                                    <Button variant="success" size="sm" icon={MessageCircle} loading={busy}
                                        disabled={!clientPhoneOf(preview)}
                                        onClick={() => sendWhatsApp(preview)}>
                                        WhatsApp
                                    </Button>
                                    <Button size="sm" icon={Mail} loading={busy}
                                        disabled={!clientEmailOf(preview)}
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
                                        disabled={validateContractData(preview.type, preview.data).length > 0}
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

            {/* ── Confirmación de borrado ───────────────────────────────── */}
            <Modal open={!!confirmDelete} onClose={() => !busy && setConfirmDelete(null)} title="Eliminar contrato">
                {confirmDelete && (
                    <>
                        <p className="text-sm text-gray-600">
                            ¿Eliminar el contrato de <strong>{clientOfContract(confirmDelete)}</strong>? Esta acción no se puede deshacer.
                        </p>
                        <div className="flex justify-end gap-2 pt-5">
                            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
                            <Button variant="danger" size="sm" loading={busy} onClick={() => removeContract(confirmDelete)}>
                                Eliminar
                            </Button>
                        </div>
                    </>
                )}
            </Modal>

            {/* ── Confirmación de reapertura (corregir un aprobado) ──────── */}
            <Modal open={!!confirmReopen} onClose={() => !busy && setConfirmReopen(null)} title="Corregir contrato aprobado">
                {confirmReopen && (
                    <>
                        <p className="text-sm text-gray-600">
                            El contrato de <strong>{clientOfContract(confirmReopen)}</strong> perderá la aprobación y volverá a estado editable.
                            Al corregirlo deberás enviarlo de nuevo a revisión del administrador antes de compartirlo con el cliente.
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
