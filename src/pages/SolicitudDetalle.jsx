import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch, friendlyError } from '../utils/api';
import {
    SOLICITUD_ESTADOS, TRANSICIONES, PRIORIDADES, MEDIOS_INGRESO,
    SOLICITANTE_TIPOS, ACTUACION_TIPOS, ADJUNTO_CATEGORIAS, DP_TIPOS, DP_ALERTAS,
    URGENCIAS, REPARACION_PASOS,
    REPORTE_MEDIOS, REPORTE_PAGO_ESTADOS, TRANSICIONES_REPORTE,
} from '../utils/solicitudFlow.js';
import { calcularServicioPublico } from '../utils/servicioPublicoCalc.js';
import { downloadServicioPublicoPdf } from '../utils/servicioPublicoPdf.js';
import { compressImage } from '../utils/imageCompress.js';
import { formatoDuracion } from '../utils/videoDuration.js';
import { formatoCifra } from '../utils/numeroALetras';
import { fechaCorta } from '../utils/fechaLetras';
import { buildWhatsAppUrl } from '../utils/phone';
import { mensajePortal } from '../utils/portalShare';
import { downloadBlob } from '../utils/downloadBlob.js';
import {
    Button, Badge, EmptyState, Skeleton, Modal, Field, Input, Select, cn,
} from '../components/ui';
import {
    ArrowLeft, Paperclip, Send, User, Download, MessageCircle, Mail,
    Plus, Trash2, CheckCircle, FileText, Eye, StickyNote,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────
// S1 — Detalle del expediente: estado (máquina #33), línea de tiempo (#38),
// adjuntos (#39) y el panel de automatización según el tipo: reparaciones
// (#36), servicios públicos (#37), derechos de petición (#41) y terminación
// de contrato (#42).
// ──────────────────────────────────────────────────────────────────────

const money = (v) => `$ ${formatoCifra(Math.round(v || 0))}`;

function formatDateTime(iso) {
    try {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(iso));
    } catch { return ''; }
}

function MoneyInput({ value, onChange, disabled }) {
    return (
        <Input
            type="text" inputMode="numeric" placeholder="0" disabled={disabled}
            value={value != null && String(value) !== '' && Number(value) !== 0 ? formatoCifra(value) : ''}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        />
    );
}

function leerDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

// #58: duración del video con la metadata del elemento <video>, sin subirlo.
// NaN si el navegador no puede leerla (p. ej. MOV con códec no soportado) —
// en ese caso se deja pasar y el servidor decide (valida los átomos del MP4).
function duracionVideo(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
        v.onerror = () => { URL.revokeObjectURL(url); resolve(NaN); };
        v.src = url;
    });
}

// Convierte archivos del input en adjuntos listos para el endpoint (#39):
// imágenes comprimidas, videos validados (#58: MP4/MOV, máx. 1 min y 25 MB),
// el resto como data URL directo con tope de 5 MB. `categoria` puede ser fija
// o una función por archivo. Compartido entre el panel de Documentos y el
// formulario de respuesta.
async function archivosAAdjuntos(files, categoria, toast) {
    const adjuntos = [];
    for (const file of files) {
        let dataUrl;
        const esVideo = file.type.startsWith('video/');
        if (file.type.startsWith('image/')) {
            dataUrl = await compressImage(file);
        } else if (esVideo) {
            if (!['video/mp4', 'video/quicktime'].includes(file.type)) {
                toast.error(`"${file.name}": solo se aceptan videos MP4 o MOV.`);
                continue;
            }
            if (file.size > 25 * 1024 * 1024) {
                toast.error(`"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB — el máximo para videos es 25 MB.`);
                continue;
            }
            const dur = await duracionVideo(file);
            if (Number.isFinite(dur) && dur > 61) { // misma tolerancia de 1 s del backend
                toast.error(`"${file.name}" dura ${formatoDuracion(dur)} — el máximo es 1 minuto.`);
                continue;
            }
            dataUrl = await leerDataUrl(file);
        } else {
            if (file.size > 5 * 1024 * 1024) {
                toast.error(`"${file.name}" supera los 5 MB permitidos.`);
                continue;
            }
            dataUrl = await leerDataUrl(file);
        }
        adjuntos.push({
            nombre: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            categoria: esVideo ? 'VIDEO' : (typeof categoria === 'function' ? categoria(file) : categoria),
            dataUrl,
        });
    }
    return adjuntos;
}

const TextArea = (props) => (
    <textarea
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        {...props}
    />
);

export default function SolicitudDetalle() {
    const { id } = useParams();
    const { user } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'ADMIN';

    const [sol, setSol] = useState(null);
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [nota, setNota] = useState('');
    const [notaParaCliente, setNotaParaCliente] = useState(false);
    const [confirmEliminar, setConfirmEliminar] = useState(false);
    const [estadoModal, setEstadoModal] = useState(null); // { estado, nota }
    const [preview, setPreview] = useState(null);          // adjunto cargado
    const cerrada = sol && ['FINALIZADA', 'ARCHIVADA'].includes(sol.estado);

    const load = async () => {
        try {
            const s = await apiFetch(`/api/solicitudes/${id}`);
            setSol(s);
            if (isAdmin) apiFetch('/api/users').then(setUsuarios).catch(() => {});
        } catch (err) {
            toast.error(friendlyError(err));
            navigate('/solicitudes');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const patchData = async (seccion, valores, { silencioso = false } = {}) => {
        setBusy(true);
        try {
            const updated = await apiFetch(`/api/solicitudes/${id}/data`, {
                method: 'PATCH', body: { [seccion]: valores },
            });
            setSol(updated);
            if (!silencioso) toast.success('Expediente actualizado');
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleEstado = async () => {
        setBusy(true);
        try {
            const updated = await apiFetch(`/api/solicitudes/${id}/estado`, {
                method: 'PATCH',
                body: {
                    estado: estadoModal.estado,
                    nota: estadoModal.nota || undefined,
                    resultado: estadoModal.estado === 'FINALIZADA' ? (estadoModal.resultado || 'EXITOSA') : undefined,
                },
            });
            setSol(updated);
            setEstadoModal(null);
            toast.success(`Estado: ${SOLICITUD_ESTADOS[updated.estado].label}`);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleAsignar = async (responsableId) => {
        try {
            const updated = await apiFetch(`/api/solicitudes/${id}/asignar`, {
                method: 'PATCH', body: { responsableId: responsableId ? Number(responsableId) : null },
            });
            setSol(updated);
            toast.success('Responsable actualizado');
        } catch (err) {
            toast.error(friendlyError(err));
        }
    };

    const handleEliminar = async () => {
        setBusy(true);
        try {
            await apiFetch(`/api/solicitudes/${id}`, { method: 'DELETE' });
            toast.success(`${sol.radicado} eliminada`);
            navigate('/solicitudes');
        } catch (err) {
            toast.error(friendlyError(err));
            setBusy(false);
            setConfirmEliminar(false);
        }
    };

    const handleNota = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const updated = await apiFetch(`/api/solicitudes/${id}/notas`, {
                method: 'POST',
                body: { texto: nota, paraCliente: notaParaCliente || undefined },
            });
            setSol(updated);
            setNota('');
            setNotaParaCliente(false);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    // ── Adjuntos (#39): imágenes comprimidas, resto como data URL directo ──
    const handleFiles = async (e, categoria = 'OTRO') => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;
        setBusy(true);
        try {
            const adjuntos = await archivosAAdjuntos(files, categoria, toast);
            if (adjuntos.length === 0) return;
            // #58: cada video viaja en su propio request (hasta 25 MB en
            // base64); los demás archivos van juntos como siempre
            const lotes = adjuntos.filter((a) => a.mimeType.startsWith('video/')).map((a) => [a]);
            const resto = adjuntos.filter((a) => !a.mimeType.startsWith('video/'));
            if (resto.length) lotes.unshift(resto);
            let updated;
            for (const lote of lotes) {
                updated = await apiFetch(`/api/solicitudes/${id}/adjuntos`, { method: 'POST', body: { adjuntos: lote } });
            }
            setSol(updated);
            toast.success(`${adjuntos.length} archivo(s) adjuntados`);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const abrirAdjunto = async (adj, { descargar = false } = {}) => {
        try {
            const full = await apiFetch(`/api/solicitudes/${id}/adjuntos/${adj.id}`);
            if (descargar) {
                const blob = await (await fetch(full.dataUrl)).blob();
                downloadBlob(blob, full.nombre);
            } else {
                setPreview(full);
            }
        } catch (err) {
            toast.error(friendlyError(err));
        }
    };

    if (loading || !sol) {
        return (
            <div className="p-4 lg:p-8 space-y-4">
                <Skeleton className="h-9 w-64" />
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
        );
    }

    const est = SOLICITUD_ESTADOS[sol.estado] || {};
    const urg = URGENCIAS[sol.urgencia] || {};
    const transiciones = TRANSICIONES[sol.estado] || [];
    const dp = sol.data?.derechoPeticion;
    const rep = sol.data?.reparacion;
    const sp = sol.data?.servicioPublico || {};
    const spCalc = calcularServicioPublico(sp);
    const rp = sol.tipo === 'REPORTE_DE_PAGO' ? (sol.data?.reportePago || { estado: 'REPORTADO' }) : null;
    const grupo = (sol.data?.grupo?.radicados || []).filter((r) => r.id !== sol.id);

    return (
        <div className="p-4 lg:p-8 max-w-4xl mx-auto pb-24 lg:pb-8 space-y-4">
            {/* ── Cabecera ── */}
            <div>
                <button onClick={() => navigate('/solicitudes')} className="inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-800 mb-2">
                    <ArrowLeft className="w-4 h-4" /> Centro de Solicitudes
                </button>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-gray-500">{sol.radicado}</span>
                        <Badge className={est.badge}>{est.label}</Badge>
                        <Badge className={PRIORIDADES[sol.prioridad]?.badge}>{PRIORIDADES[sol.prioridad]?.label}</Badge>
                        {sol.urgencia !== 'SIN_TERMINO' && <Badge className={urg.badge}>{urg.label}</Badge>}
                        {/* Eliminar: misma regla del server — admin siempre; creador solo RECIBIDA */}
                        {(isAdmin || (sol.creadaPor === user?.id && sol.estado === 'RECIBIDA')) && (
                            <button
                                onClick={() => setConfirmEliminar(true)}
                                className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-700"
                                title="Eliminar solicitud"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                        )}
                    </div>
                    <h1 className="text-lg font-extrabold text-gray-900 mt-1.5">{sol.asunto}</h1>
                    {sol.descripcion && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{sol.descripcion}</p>}
                    <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
                        <p><span className="font-semibold">Solicitante:</span> {sol.solicitanteNombre} ({SOLICITANTE_TIPOS[sol.solicitanteTipo] || 'N/D'})</p>
                        <p><span className="font-semibold">Medio:</span> {MEDIOS_INGRESO[sol.medioIngreso]} · {formatDateTime(sol.createdAt)}</p>
                        {sol.solicitanteTelefono && <p><span className="font-semibold">Teléfono:</span> {sol.solicitanteTelefono}</p>}
                        {sol.solicitanteEmail && <p><span className="font-semibold">Correo:</span> {sol.solicitanteEmail}</p>}
                        {sol.property && <p><span className="font-semibold">Inmueble:</span> {sol.property.address}</p>}
                        {sol.contract && (
                            <p><span className="font-semibold">Contrato:</span>{' '}
                                <Link to={`/contracts`} className="text-brand-600 font-bold">#{sol.contract.id} ({sol.contract.type})</Link>
                            </p>
                        )}
                        {sol.fechaVencimiento && <p><span className="font-semibold">Vence:</span> {fechaCorta(sol.fechaVencimiento)}</p>}
                        <p><span className="font-semibold">Radicó:</span> {sol.creador?.name}</p>
                    </div>

                    {/* #57: expedientes de la misma radicación múltiple */}
                    {grupo.length > 0 && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap text-xs text-gray-500">
                            <span className="font-semibold">Radicada junto con:</span>
                            {grupo.map((g) => (
                                <Link key={g.id} to={`/solicitudes/${g.id}`}
                                    className="font-mono font-bold text-brand-600 hover:text-brand-800 bg-brand-50 rounded-lg px-2 py-0.5">
                                    {g.radicado}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Portal de Clientes por WhatsApp (ago 2026): invita al
                        solicitante al portal. Con correo registrado el mensaje
                        apunta a SU radicado; sin correo la invitación es
                        general (mensajePortal decide) */}
                    {sol.solicitanteTelefono && (
                        <div className="mt-3">
                            <Button variant="success" size="sm" icon={MessageCircle}
                                title={sol.solicitanteEmail ? '' : 'Sin correo registrado, el cliente no verá este expediente en el portal'}
                                onClick={() => window.open(buildWhatsAppUrl(sol.solicitanteTelefono, mensajePortal({
                                    nombre: sol.solicitanteNombre,
                                    radicado: sol.radicado,
                                    email: sol.solicitanteEmail,
                                })), '_blank')}>
                                Enviar portal por WhatsApp
                            </Button>
                        </div>
                    )}

                    {/* Responsable (#43) */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <User className="w-4 h-4 text-gray-400" />
                        {isAdmin ? (
                            <Select value={sol.responsableId || ''} onChange={(e) => handleAsignar(e.target.value)} className="w-auto text-sm">
                                <option value="">Sin responsable</option>
                                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </Select>
                        ) : (
                            <span className="text-sm font-semibold text-gray-700">{sol.responsable?.name || 'Sin responsable asignado'}</span>
                        )}
                    </div>

                    {/* Transiciones de estado (#33) */}
                    {transiciones.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                            {transiciones.map((destino) => {
                                const d = SOLICITUD_ESTADOS[destino];
                                const avanza = d.orden > est.orden;
                                return (
                                    <Button
                                        key={destino}
                                        size="sm"
                                        variant={avanza ? 'primary' : 'secondary'}
                                        onClick={() => setEstadoModal({ estado: destino, nota: '' })}
                                    >
                                        {destino === 'EN_GESTION' && sol.estado === 'FINALIZADA' ? 'Reabrir' : d.label}
                                    </Button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Automatización: Reporte de pago (#55) ── */}
            {rp && (
                <ReportePagoPanel
                    rp={rp}
                    disabled={cerrada || busy}
                    onSave={(valores) => patchData('reportePago', valores)}
                />
            )}

            {/* ── Automatización: Derechos de petición (#41) ── */}
            {dp && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="font-bold text-gray-900 mb-2">⚖️ Derecho de petición — término legal</p>
                    {sol.dpAlerta && (
                        <div className={cn('mb-3 rounded-xl px-3 py-2 text-sm font-bold',
                            sol.dpAlerta === 'VENCIDO' ? 'bg-gray-900 text-white'
                                : sol.dpAlerta === 'VENCE_HOY' ? 'bg-red-100 text-red-700'
                                    : sol.dpAlerta === 'TRES_DIAS' ? 'bg-orange-100 text-orange-700'
                                        : 'bg-yellow-100 text-yellow-700')}>
                            {DP_ALERTAS[sol.dpAlerta].emoji} {DP_ALERTAS[sol.dpAlerta].label} — vence el {fechaCorta(sol.fechaVencimiento)}
                        </div>
                    )}
                    <div className="grid sm:grid-cols-3 gap-3 items-end">
                        <Field label="Clase de petición">
                            <Select
                                disabled={cerrada || !!sol.data?.respuesta}
                                value={dp.dpTipo}
                                onChange={(e) => patchData('derechoPeticion', { dpTipo: e.target.value })}
                            >
                                {Object.entries(DP_TIPOS).map(([k, v]) => (
                                    <option key={k} value={k}>{v.label} ({v.diasHabiles} d.h.)</option>
                                ))}
                            </Select>
                        </Field>
                        <div className="text-sm">
                            <p className="text-xs font-semibold text-gray-500">Radicado el</p>
                            <p className="font-bold">{fechaCorta(dp.fechaRadicacion)}</p>
                        </div>
                        <div className="text-sm">
                            <p className="text-xs font-semibold text-gray-500">Vence (días hábiles)</p>
                            <p className="font-bold">{sol.fechaVencimiento ? fechaCorta(sol.fechaVencimiento) : '—'}</p>
                        </div>
                    </div>
                    {sol.data?.respuesta ? (
                        <RespuestaEnviada respuesta={sol.data.respuesta} />
                    ) : !cerrada && (
                        <RespuestaForm id={id} sol={sol} onSaved={setSol} toast={toast} />
                    )}
                </div>
            )}

            {/* ── Respuesta al solicitante — todos los tipos (en DP va dentro
                de su panel). Las respuestas formales (PDF) se adjuntan y se
                envían por correo igual que en el derecho de petición. ── */}
            {!dp && (sol.data?.respuesta || !cerrada) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="font-bold text-gray-900 mb-2">📨 Respuesta al solicitante</p>
                    {sol.data?.respuesta ? (
                        <RespuestaEnviada respuesta={sol.data.respuesta} />
                    ) : (
                        <>
                            <p className="text-sm text-gray-500">
                                Elabora la respuesta formal del expediente: puedes adjuntar documentos (PDF)
                                y el sistema la envía al correo del solicitante.
                            </p>
                            <RespuestaForm id={id} sol={sol} onSaved={setSol} toast={toast} />
                        </>
                    )}
                </div>
            )}

            {/* ── Automatización: Reparaciones (#36) ── */}
            {rep && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="font-bold text-gray-900 mb-3">🔧 Flujo de reparación</p>
                    <div className="space-y-1.5 mb-4">
                        {REPARACION_PASOS.map((p, i) => {
                            const idx = REPARACION_PASOS.findIndex((x) => x.clave === rep.subEstado);
                            const hecho = i <= idx;
                            const esSiguiente = i === idx + 1;
                            return (
                                <div key={p.clave} className="flex items-center gap-2 text-sm">
                                    <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                                        hecho ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400')}>
                                        {hecho ? '✓' : i + 1}
                                    </span>
                                    <span className={cn(hecho ? 'text-gray-800 font-semibold' : 'text-gray-400')}>{p.label}</span>
                                    {esSiguiente && !cerrada && (
                                        <Button size="sm" variant="secondary" disabled={busy}
                                            onClick={() => patchData('reparacion', { subEstado: p.clave })}>
                                            Marcar
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <Field label="Descripción del daño">
                        <TextArea rows={2} disabled={cerrada} defaultValue={rep.descripcionDano || ''}
                            onBlur={(e) => e.target.value !== (rep.descripcionDano || '') && patchData('reparacion', { descripcionDano: e.target.value }, { silencioso: true })} />
                    </Field>
                    <CotizacionesEditor rep={rep} disabled={cerrada || busy} onSave={(cotizaciones) => patchData('reparacion', { cotizaciones })} />
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                        <Field label="Autorización del propietario">
                            <Select disabled={cerrada} value={rep.autorizacion?.estado || 'PENDIENTE'}
                                onChange={(e) => patchData('reparacion', { autorizacion: { estado: e.target.value, fecha: new Date().toISOString().slice(0, 10) } })}>
                                <option value="PENDIENTE">Pendiente</option>
                                <option value="AUTORIZADO">Autorizado</option>
                                <option value="RECHAZADO">Rechazado</option>
                            </Select>
                        </Field>
                        <TecnicoEditor rep={rep} disabled={cerrada || busy} onSave={(tecnico) => patchData('reparacion', { tecnico })} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <label className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer', 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                            <Paperclip className="w-3.5 h-3.5" /> Fotos ANTES
                            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e, 'FOTO_ANTES')} />
                        </label>
                        <label className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer', 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                            <Paperclip className="w-3.5 h-3.5" /> Fotos DESPUÉS
                            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e, 'FOTO_DESPUES')} />
                        </label>
                    </div>
                </div>
            )}

            {/* ── Automatización: Servicios públicos (#37) ── */}
            {sol.tipo === 'SERVICIOS_PUBLICOS' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="font-bold text-gray-900 mb-3">💡 Liquidación proporcional del servicio</p>
                    <ServicioPublicoForm sp={sp} disabled={cerrada || busy} onSave={(cfg) => patchData('servicioPublico', cfg)} />
                    {spCalc.completo && (
                        <>
                            <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden text-sm">
                                <div className="grid grid-cols-4 bg-gray-800 text-white text-xs font-bold px-3 py-2">
                                    <span>Parte</span><span className="text-center">Días</span>
                                    <span className="text-right">Valor diario</span><span className="text-right">A pagar</span>
                                </div>
                                <div className="grid grid-cols-4 px-3 py-2 border-b border-gray-50">
                                    <span>Propietario</span><span className="text-center">{spCalc.diasPropietario}</span>
                                    <span className="text-right">{money(spCalc.valorDiario)}</span>
                                    <span className="text-right font-bold">{money(spCalc.valorPropietario)}</span>
                                </div>
                                <div className="grid grid-cols-4 px-3 py-2 border-b border-gray-50">
                                    <span>Arrendatario</span><span className="text-center">{spCalc.diasArrendatario}</span>
                                    <span className="text-right">{money(spCalc.valorDiario)}</span>
                                    <span className="text-right font-bold">{money(spCalc.valorArrendatario)}</span>
                                </div>
                                <div className="grid grid-cols-4 px-3 py-2 bg-gray-50 font-bold">
                                    <span>Total</span><span className="text-center">{spCalc.diasPeriodo}</span>
                                    <span /><span className="text-right">{money(spCalc.valorTotal)}</span>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 justify-end">
                                <Button variant="secondary" size="sm" onClick={() => downloadServicioPublicoPdf(sol)}>
                                    <Download className="w-4 h-4" /> PDF
                                </Button>
                                <Button variant="secondary" size="sm" onClick={async () => {
                                    const win = window.open('', '_blank');
                                    try {
                                        const r = await apiFetch(`/api/solicitudes/${id}/servicio-share`, { method: 'POST' });
                                        const msg = `Hola ${sol.solicitanteNombre} 👋, TuLlave Inmobiliaria le comparte la liquidación proporcional del servicio de ${sp.servicio} (radicado ${sol.radicado}): ${r.publicUrl}`;
                                        const url = buildWhatsAppUrl(sol.solicitanteTelefono, msg);
                                        if (win) win.location.href = url; else window.location.href = url;
                                        setSol(r);
                                    } catch (err) { if (win) win.close(); toast.error(friendlyError(err)); }
                                }}>
                                    <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
                                </Button>
                                <Button size="sm" disabled={busy || !sol.solicitanteEmail} title={sol.solicitanteEmail ? '' : 'El expediente no tiene correo del solicitante'}
                                    onClick={async () => {
                                        setBusy(true);
                                        try {
                                            const r = await apiFetch(`/api/solicitudes/${id}/servicio-email`, { method: 'POST' });
                                            setSol(r);
                                            toast.success(`Liquidación enviada a ${r.emailedTo}`);
                                        } catch (err) { toast.error(friendlyError(err)); } finally { setBusy(false); }
                                    }}>
                                    <Mail className="w-4 h-4" /> Enviar por correo
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Automatización: Terminación de contrato (#42) ── */}
            {sol.tipo === 'TERMINACION_DE_CONTRATO' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="font-bold text-gray-900 mb-2">📋 Verificación de condiciones contractuales</p>
                    {!sol.contract ? (
                        <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
                            Esta solicitud no tiene contrato vinculado: edítala y asocia el contrato de arrendamiento para verificar vigencia, preaviso y cláusula penal automáticamente.
                        </p>
                    ) : sol.terminacionCheck && (
                        <>
                            <Field label="Fecha deseada de entrega" hint="Por defecto, el vencimiento del contrato">
                                <div className="flex gap-2">
                                    <Input type="date" id="fecha-deseada-terminacion" disabled={cerrada}
                                        defaultValue={sol.data?.terminacion?.fechaDeseada || ''} />
                                    <Button size="sm" disabled={cerrada || busy} onClick={() => {
                                        const v = document.getElementById('fecha-deseada-terminacion')?.value;
                                        if (v && v !== (sol.data?.terminacion?.fechaDeseada || '')) {
                                            patchData('terminacion', { fechaDeseada: v });
                                        }
                                    }}>
                                        Verificar
                                    </Button>
                                </div>
                            </Field>
                            <div className="mt-3 space-y-2">
                                {sol.terminacionCheck.datosCompletos && (
                                    <div className="grid sm:grid-cols-3 gap-2 text-sm">
                                        <div className={cn('rounded-xl p-3', sol.terminacionCheck.vigente ? 'bg-emerald-50' : 'bg-amber-50')}>
                                            <p className="text-xs font-semibold text-gray-500">Vigencia</p>
                                            <p className="font-bold">{sol.terminacionCheck.vigente ? '✅ Vigente' : '⚠️ Fuera de vigencia'}</p>
                                        </div>
                                        <div className={cn('rounded-xl p-3', sol.terminacionCheck.preaviso.cumplido ? 'bg-emerald-50' : 'bg-red-50')}>
                                            <p className="text-xs font-semibold text-gray-500">Preaviso ({sol.terminacionCheck.preaviso.meses} meses)</p>
                                            <p className="font-bold">{sol.terminacionCheck.preaviso.cumplido ? '✅ Cumplido' : `❌ ${sol.terminacionCheck.preaviso.diasTarde} día(s) tarde`}</p>
                                        </div>
                                        <div className={cn('rounded-xl p-3', sol.terminacionCheck.clausulaPenal.aplica ? 'bg-red-50' : 'bg-emerald-50')}>
                                            <p className="text-xs font-semibold text-gray-500">Cláusula penal</p>
                                            <p className="font-bold">
                                                {sol.terminacionCheck.clausulaPenal.aplica
                                                    ? `❌ Aplica: ${money(sol.terminacionCheck.clausulaPenal.monto)}`
                                                    : '✅ No aplica'}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                                    {sol.terminacionCheck.observaciones.map((o, i) => (
                                        <p key={i} className="text-xs text-gray-700">• {o}</p>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Adjuntos (#39) ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-gray-900">📎 Documentos ({sol.adjuntos.length})</p>
                    <label className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer bg-brand-600 text-white hover:bg-brand-700">
                        <Plus className="w-3.5 h-3.5" /> Adjuntar
                        <input type="file" multiple className="hidden"
                            accept="image/*,video/mp4,video/quicktime,application/pdf,.eml,.msg"
                            onChange={(e) => handleFiles(e)} />
                    </label>
                </div>
                {sol.adjuntos.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin documentos. Adjunta fotos, facturas, cotizaciones o PDFs (máx. 5 MB c/u) y videos de hasta 1 minuto (MP4/MOV, máx. 25 MB).</p>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {sol.adjuntos.map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-2 py-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{a.nombre}</p>
                                    <p className="text-[11px] text-gray-400">
                                        {ADJUNTO_CATEGORIAS[a.categoria] || a.categoria} · {(a.size / 1024).toFixed(0)} KB · {formatDateTime(a.createdAt)}
                                    </p>
                                </div>
                                <div className="flex gap-1">
                                    {(a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/') || a.mimeType === 'application/pdf') && (
                                        <Button variant="ghost" size="sm" title="Ver" onClick={() => abrirAdjunto(a)}>
                                            <Eye className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="sm" title="Descargar" onClick={() => abrirAdjunto(a, { descargar: true })}>
                                        <Download className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Línea de tiempo (#38) ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="font-bold text-gray-900 mb-3">🕐 Línea de tiempo</p>
                <div className="space-y-3">
                    {sol.actuaciones.map((a) => (
                        <div key={a.id} className="flex gap-3">
                            <span className="text-base leading-6">{ACTUACION_TIPOS[a.tipo]?.icon || '•'}</span>
                            <div className="min-w-0">
                                <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.descripcion}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    {formatDateTime(a.createdAt)} · {a.user?.name || 'Sistema'}
                                    {a.meta?.paraCliente && (
                                        <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-px text-[10px] font-medium text-blue-700">
                                            📢 Visible para el cliente
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
                {!cerrada && (
                    <form onSubmit={handleNota} className="mt-4 space-y-2">
                        <div className="flex gap-2">
                            <Input placeholder="Agregar nota u observación…" value={nota} onChange={(e) => setNota(e.target.value)} />
                            <Button type="submit" disabled={busy || !nota.trim()} title="Agregar nota">
                                <StickyNote className="w-4 h-4" />
                            </Button>
                        </div>
                        {/* P1: informar el avance al cliente en su portal sin exponer notas internas */}
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={notaParaCliente}
                                onChange={(e) => setNotaParaCliente(e.target.checked)}
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                            />
                            📢 Visible para el cliente en el Portal (informarle el avance)
                        </label>
                    </form>
                )}
            </div>

            {/* ── Modal: confirmación de eliminación ── */}
            <Modal open={confirmEliminar} onClose={() => setConfirmEliminar(false)} title={`Eliminar ${sol.radicado}`}>
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Se eliminará el expediente completo con su línea de tiempo y adjuntos.
                        <b> Esta acción no se puede deshacer.</b>
                        {sol.medioIngreso === 'PORTAL' && ' El cliente dejará de verla en su portal.'}
                    </p>
                    <div className="flex gap-2 justify-end">
                        <Button variant="secondary" onClick={() => setConfirmEliminar(false)}>Cancelar</Button>
                        <Button variant="danger" icon={Trash2} onClick={handleEliminar} disabled={busy}>
                            Eliminar definitivamente
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ── Modal: confirmación de cambio de estado ── */}
            <Modal open={!!estadoModal} onClose={() => setEstadoModal(null)}
                title={estadoModal ? `Pasar a "${SOLICITUD_ESTADOS[estadoModal.estado]?.label}"` : ''}>
                {estadoModal && (
                    <div className="space-y-4">
                        {/* P1: el resultado del cierre lo ve el cliente en su portal */}
                        {estadoModal.estado === 'FINALIZADA' && (
                            <Field label="Resultado del cierre">
                                <Select
                                    value={estadoModal.resultado || 'EXITOSA'}
                                    onChange={(e) => setEstadoModal({ ...estadoModal, resultado: e.target.value })}
                                >
                                    <option value="EXITOSA">✅ Gestionada exitosamente</option>
                                    <option value="CON_NOVEDAD">⚠️ Cerrada con novedad</option>
                                </Select>
                            </Field>
                        )}
                        {/* SEGURIDAD/UX: esta nota SIEMPRE la ve el cliente (portal + correo
                            de aviso de estado). Decirlo en todos los estados evita que se
                            escriba aquí información interna; para eso está la nota de la
                            línea de tiempo, interna salvo que se marque "visible". */}
                        <Field label="📢 Nota para el cliente (la verá en su portal y le llegará por correo)">
                            <Input value={estadoModal.nota} onChange={(e) => setEstadoModal({ ...estadoModal, nota: e.target.value })}
                                placeholder={estadoModal.estado === 'FINALIZADA' ? 'Ej.: se reparó la fuga y quedó verificado' : 'Ej.: estamos coordinando la visita del técnico'} />
                            <p className="text-[11px] text-gray-500 mt-1">
                                Para observaciones internas (cotizaciones, gestiones con el propietario) usa la nota de la línea de tiempo.
                            </p>
                        </Field>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setEstadoModal(null)}>Cancelar</Button>
                            <Button disabled={busy} onClick={handleEstado}><Send className="w-4 h-4" /> Confirmar</Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Modal: vista previa de adjunto ── */}
            <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.nombre || ''} maxWidth="max-w-3xl">
                {preview && (
                    preview.mimeType.startsWith('image/') ? (
                        <img src={preview.dataUrl} alt={preview.nombre} className="max-h-[70vh] mx-auto rounded-xl" />
                    ) : preview.mimeType.startsWith('video/') ? (
                        // #58: reproductor del video dentro de la app
                        <video src={preview.dataUrl} controls autoPlay className="max-h-[70vh] w-full rounded-xl bg-black" />
                    ) : preview.mimeType === 'application/pdf' ? (
                        <iframe src={preview.dataUrl} title={preview.nombre} className="w-full h-[70vh] rounded-xl border border-gray-100" />
                    ) : (
                        <EmptyState icon={FileText} title="Sin vista previa" description="Descarga el archivo para verlo." />
                    )
                )}
            </Modal>
        </div>
    );
}

// Constancia de la respuesta ya enviada (la muestran el panel del DP y el
// panel genérico de respuesta).
function RespuestaEnviada({ respuesta }) {
    return (
        <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm">
            <p className="font-bold text-emerald-700 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Respuesta enviada</p>
            <p className="text-xs text-gray-600 mt-1">
                Por {respuesta.medio.toLowerCase()} el {fechaCorta(respuesta.fechaEnvio)}
            </p>
            <p className="text-gray-700 mt-2 whitespace-pre-wrap">{respuesta.texto}</p>
            {respuesta.adjuntos?.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                    {respuesta.adjuntos.map((a) => (
                        <p key={a.id} className="flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> {a.nombre}
                            <span className="text-gray-400">(en Documentos)</span>
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

// Respuesta al solicitante (#41, extendida a todos los tipos): texto + medio +
// registro del envío. P1: con medio CORREO el SISTEMA envía el correo al
// solicitante (con los adjuntos elegidos); los demás medios solo dejan
// constancia del envío hecho por fuera. Los documentos formales (PDF) se
// pueden subir directo desde aquí — quedan en el expediente y se marcan solos.
function RespuestaForm({ id, sol, onSaved, toast }) {
    const [abierto, setAbierto] = useState(false);
    const [texto, setTexto] = useState('');
    const [medio, setMedio] = useState('CORREO');
    const [adjuntoIds, setAdjuntoIds] = useState([]);
    const [busy, setBusy] = useState(false);
    const email = (sol?.solicitanteEmail || '').trim();

    const subirDocumentos = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;
        setBusy(true);
        try {
            const adjuntos = await archivosAAdjuntos(
                files,
                (f) => (f.type === 'application/pdf' ? 'PDF' : 'FOTO'),
                toast,
            );
            if (adjuntos.length === 0) return;
            const previos = new Set((sol?.adjuntos || []).map((a) => a.id));
            const updated = await apiFetch(`/api/solicitudes/${id}/adjuntos`, { method: 'POST', body: { adjuntos } });
            onSaved(updated);
            // Marcar los recién subidos como parte de la respuesta (máx. 3)
            const nuevos = (updated.adjuntos || []).filter((a) => !previos.has(a.id)).map((a) => a.id);
            setAdjuntoIds((prev) => [...prev, ...nuevos].slice(0, 3));
            toast.success(`${adjuntos.length} documento(s) listo(s) para la respuesta`);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    if (!abierto) {
        return (
            <Button size="sm" className="mt-3" onClick={() => setAbierto(true)}>
                <Send className="w-4 h-4" /> Elaborar respuesta
            </Button>
        );
    }
    return (
        <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                    const updated = await apiFetch(`/api/solicitudes/${id}/respuesta`, {
                        method: 'POST',
                        body: { texto, medio, adjuntoIds: adjuntoIds.length ? adjuntoIds : undefined },
                    });
                    onSaved(updated);
                    toast.success(medio === 'CORREO' ? `Respuesta enviada a ${email}` : 'Respuesta registrada');
                } catch (err) {
                    toast.error(friendlyError(err));
                } finally {
                    setBusy(false);
                }
            }}
        >
            <Field label="Texto de la respuesta">
                <TextArea rows={4} required value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Field>
            <Field label="Medio de envío">
                <Select value={medio} onChange={(e) => setMedio(e.target.value)}>
                    <option value="CORREO">Correo (el sistema lo envía)</option>
                    <option value="FISICO">Físico (solo registrar)</option>
                    <option value="WHATSAPP">WhatsApp (solo registrar)</option>
                    <option value="OTRO">Otro (solo registrar)</option>
                </Select>
            </Field>
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
                <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold">Documentos de la respuesta (máx. 3) — quedan en el expediente y el cliente los descarga desde su portal:</p>
                    <label className={cn(
                        'inline-flex items-center gap-1 font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0',
                        busy ? 'bg-gray-200 text-gray-400' : 'bg-brand-600 text-white hover:bg-brand-700 cursor-pointer',
                    )}>
                        <Paperclip className="w-3 h-3" /> Adjuntar PDF
                        <input
                            type="file" multiple className="hidden" disabled={busy}
                            accept="application/pdf,image/*"
                            onChange={subirDocumentos}
                        />
                    </label>
                </div>
                {sol?.adjuntos?.length > 0 ? (
                    sol.adjuntos.map((a) => (
                        <label key={a.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={adjuntoIds.includes(a.id)}
                                disabled={!adjuntoIds.includes(a.id) && adjuntoIds.length >= 3}
                                onChange={(e) => setAdjuntoIds(e.target.checked
                                    ? [...adjuntoIds, a.id]
                                    : adjuntoIds.filter((x) => x !== a.id))}
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                            />
                            <span className="truncate">{a.nombre}</span>
                        </label>
                    ))
                ) : (
                    <p className="text-gray-400">Sin documentos aún — adjunta el PDF de la respuesta formal si lo tienes.</p>
                )}
            </div>
            {medio === 'CORREO' && (
                email ? (
                    <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900">
                        📧 El sistema enviará este correo a <b>{email}</b>{adjuntoIds.length ? ` con ${adjuntoIds.length} adjunto(s)` : ''}.
                    </p>
                ) : (
                    <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                        ⚠️ El expediente no tiene correo del solicitante — agrégalo (editar solicitud) o elige otro medio.
                    </p>
                )
            )}
            <div className="flex justify-end">
                <Button type="submit" disabled={busy || !texto.trim() || (medio === 'CORREO' && !email)} loading={busy}>
                    <Send className="w-4 h-4" /> {medio === 'CORREO' ? 'Enviar respuesta' : 'Registrar envío'}
                </Button>
            </div>
        </form>
    );
}

// Cotizaciones de la reparación (#36)
// #55: datos del pago reportado + ciclo de conciliación. Guardado explícito
// (mismo criterio del formulario de servicios: guardar en blur pierde campos).
// Las transiciones de estado van con los botones; conciliar o rechazar pide
// una nota opcional (obligatoria de facto al rechazar: es el motivo que ve el
// cliente en el portal).
function ReportePagoPanel({ rp, disabled, onSave }) {
    const [f, setF] = useState({
        valor: rp.valor ?? '',
        fechaPago: rp.fechaPago || '',
        medioPago: rp.medioPago || 'OTRO',
        referencia: rp.referencia || '',
    });
    const [accion, setAccion] = useState(null); // { estado, nota } — conciliar/rechazar
    const est = REPORTE_PAGO_ESTADOS[rp.estado] || REPORTE_PAGO_ESTADOS.REPORTADO;
    const destinos = TRANSICIONES_REPORTE[rp.estado] || [];
    const editado = String(f.valor) !== String(rp.valor ?? '') || f.fechaPago !== (rp.fechaPago || '')
        || f.medioPago !== (rp.medioPago || 'OTRO') || f.referencia !== (rp.referencia || '');

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
                <p className="font-bold text-gray-900">🧾 Reporte de pago</p>
                <Badge className={est.badge}>{est.label}</Badge>
            </div>
            <div className="grid sm:grid-cols-4 gap-3">
                <Field label="Valor pagado">
                    <MoneyInput disabled={disabled} value={f.valor} onChange={(v) => setF({ ...f, valor: v })} />
                </Field>
                <Field label="Fecha del pago">
                    <Input type="date" disabled={disabled} value={f.fechaPago} onChange={(e) => setF({ ...f, fechaPago: e.target.value })} />
                </Field>
                <Field label="Medio de pago">
                    <Select disabled={disabled} value={f.medioPago} onChange={(e) => setF({ ...f, medioPago: e.target.value })}>
                        {Object.entries(REPORTE_MEDIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                </Field>
                <Field label="N° referencia">
                    <Input disabled={disabled} maxLength={80} value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} />
                </Field>
            </div>
            {editado && !disabled && (
                <Button size="sm" className="mt-2" onClick={() => onSave({
                    valor: Number(f.valor) || 0,
                    fechaPago: f.fechaPago || undefined,
                    medioPago: f.medioPago,
                    referencia: f.referencia || null,
                })}>
                    Guardar datos del pago
                </Button>
            )}

            {rp.resueltoPor && (
                <p className="mt-3 text-xs text-gray-500">
                    {est.label} por <b>{rp.resueltoPor}</b> el {formatDateTime(rp.resueltoAt)}
                    {rp.nota ? <> — {rp.nota}</> : null}
                </p>
            )}

            {!disabled && destinos.length > 0 && (
                accion ? (
                    <div className="mt-3 bg-gray-50 rounded-xl p-3">
                        <Field label={accion.estado === 'RECHAZADO'
                            ? 'Motivo del rechazo (el cliente lo verá en el portal)'
                            : 'Nota de la conciliación (opcional)'}>
                            <TextArea rows={2} maxLength={500} value={accion.nota} autoFocus
                                onChange={(e) => setAccion({ ...accion, nota: e.target.value })} />
                        </Field>
                        <div className="flex gap-2 mt-2">
                            <Button size="sm" variant={accion.estado === 'RECHAZADO' ? 'danger' : 'primary'}
                                disabled={accion.estado === 'RECHAZADO' && !accion.nota.trim()}
                                onClick={() => { onSave({ estado: accion.estado, nota: accion.nota.trim() || null }); setAccion(null); }}>
                                Confirmar {REPORTE_PAGO_ESTADOS[accion.estado].label.toLowerCase()}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setAccion(null)}>Cancelar</Button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {destinos.map((destino) => (
                            <Button key={destino} size="sm"
                                variant={destino === 'CONCILIADO' ? 'primary' : destino === 'RECHAZADO' ? 'danger' : 'secondary'}
                                onClick={() => ['CONCILIADO', 'RECHAZADO'].includes(destino)
                                    ? setAccion({ estado: destino, nota: '' })
                                    : onSave({ estado: destino })}>
                                {destino === 'EN_VERIFICACION' && ['CONCILIADO', 'RECHAZADO'].includes(rp.estado)
                                    ? 'Reabrir verificación'
                                    : REPORTE_PAGO_ESTADOS[destino].label}
                            </Button>
                        ))}
                    </div>
                )
            )}
        </div>
    );
}

function CotizacionesEditor({ rep, disabled, onSave }) {
    const [nueva, setNueva] = useState(null); // { proveedor, monto }
    const cotizaciones = rep.cotizaciones || [];
    return (
        <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-600">Cotizaciones ({cotizaciones.length})</p>
                {!disabled && !nueva && (
                    <button type="button" className="text-xs font-bold text-brand-600" onClick={() => setNueva({ proveedor: '', monto: '' })}>
                        + Agregar
                    </button>
                )}
            </div>
            {cotizaciones.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50">
                    <span>{c.proveedor}</span>
                    <span className="flex items-center gap-2">
                        <span className="font-bold">$ {formatoCifra(c.monto)}</span>
                        {!disabled && (
                            <button type="button" onClick={() => onSave(cotizaciones.filter((_, j) => j !== i))}>
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                        )}
                    </span>
                </div>
            ))}
            {nueva && (
                <div className="flex gap-2 mt-2">
                    <Input placeholder="Proveedor / técnico" value={nueva.proveedor}
                        onChange={(e) => setNueva({ ...nueva, proveedor: e.target.value })} />
                    <MoneyInput value={nueva.monto} onChange={(v) => setNueva({ ...nueva, monto: v })} />
                    <Button size="sm" disabled={!nueva.proveedor.trim() || !Number(nueva.monto)}
                        onClick={() => {
                            onSave([...cotizaciones, { proveedor: nueva.proveedor.trim(), monto: Number(nueva.monto), fecha: new Date().toISOString().slice(0, 10) }]);
                            setNueva(null);
                        }}>
                        OK
                    </Button>
                </div>
            )}
        </div>
    );
}

// Técnico asignado (#36)
function TecnicoEditor({ rep, disabled, onSave }) {
    const [editando, setEditando] = useState(false);
    const [tecnico, setTecnico] = useState({ nombre: '', telefono: '', fechaProgramada: '' });
    if (!editando) {
        return (
            <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Técnico asignado</p>
                {rep.tecnico?.nombre ? (
                    <p className="text-sm">
                        <span className="font-bold">{rep.tecnico.nombre}</span>
                        {rep.tecnico.fechaProgramada && <span className="text-gray-500"> · visita {fechaCorta(rep.tecnico.fechaProgramada)}</span>}
                        {!disabled && (
                            <button type="button" className="ml-2 text-xs font-bold text-brand-600"
                                onClick={() => { setTecnico({ ...rep.tecnico }); setEditando(true); }}>
                                Cambiar
                            </button>
                        )}
                    </p>
                ) : (
                    <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setEditando(true)}>
                        <Plus className="w-3.5 h-3.5" /> Registrar técnico
                    </Button>
                )}
            </div>
        );
    }
    return (
        <div className="space-y-2">
            <Input placeholder="Nombre del técnico" value={tecnico.nombre} onChange={(e) => setTecnico({ ...tecnico, nombre: e.target.value })} />
            <div className="flex gap-2">
                <Input placeholder="Teléfono" value={tecnico.telefono || ''} onChange={(e) => setTecnico({ ...tecnico, telefono: e.target.value })} />
                <Input type="date" value={tecnico.fechaProgramada || ''} onChange={(e) => setTecnico({ ...tecnico, fechaProgramada: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
                <Button size="sm" variant="secondary" onClick={() => setEditando(false)}>Cancelar</Button>
                <Button size="sm" disabled={!tecnico.nombre.trim()} onClick={() => { onSave(tecnico); setEditando(false); }}>Guardar</Button>
            </div>
        </div>
    );
}

// Configuración de la liquidación de servicio (#37). Guardado EXPLÍCITO con
// el botón "Calcular y guardar": guardar en cada blur provocaba re-renders a
// mitad de la edición y podía perder el último campo digitado.
function ServicioPublicoForm({ sp, disabled, onSave }) {
    const [cfg, setCfg] = useState({
        servicio: sp.servicio || '', numeroFactura: sp.numeroFactura || '',
        valorTotal: sp.valorTotal || '', fechaInicialPeriodo: sp.fechaInicialPeriodo || '',
        fechaFinalPeriodo: sp.fechaFinalPeriodo || '', fechaEntrega: sp.fechaEntrega || '',
    });
    const completo = cfg.servicio && Number(cfg.valorTotal) > 0
        && cfg.fechaInicialPeriodo && cfg.fechaFinalPeriodo && cfg.fechaEntrega;
    return (
        <div>
            <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Servicio *">
                    <Select disabled={disabled} value={cfg.servicio} onChange={(e) => setCfg({ ...cfg, servicio: e.target.value })}>
                        <option value="" disabled>Selecciona…</option>
                        {['Acueducto y alcantarillado', 'Energía', 'Gas natural', 'Aseo', 'Internet / TV', 'Otro'].map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </Select>
                </Field>
                <Field label="No. de factura"><Input disabled={disabled} value={cfg.numeroFactura} onChange={(e) => setCfg({ ...cfg, numeroFactura: e.target.value })} /></Field>
                <Field label="Valor total *"><MoneyInput disabled={disabled} value={cfg.valorTotal} onChange={(v) => setCfg({ ...cfg, valorTotal: v })} /></Field>
                <Field label="Inicio del período *"><Input type="date" disabled={disabled} value={cfg.fechaInicialPeriodo} onChange={(e) => setCfg({ ...cfg, fechaInicialPeriodo: e.target.value })} /></Field>
                <Field label="Fin del período *"><Input type="date" disabled={disabled} value={cfg.fechaFinalPeriodo} onChange={(e) => setCfg({ ...cfg, fechaFinalPeriodo: e.target.value })} /></Field>
                <Field label="Entrega del inmueble *" hint="El arrendatario responde desde este día">
                    <Input type="date" disabled={disabled} value={cfg.fechaEntrega} onChange={(e) => setCfg({ ...cfg, fechaEntrega: e.target.value })} />
                </Field>
            </div>
            <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={disabled || !completo}
                    onClick={() => onSave({ ...cfg, valorTotal: Number(cfg.valorTotal) || 0 })}>
                    Calcular y guardar
                </Button>
            </div>
        </div>
    );
}
