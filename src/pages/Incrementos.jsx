import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch, friendlyError } from '../utils/api';
import {
    INCREMENTO_STATUS, TIPOS_INDICE, SEMAFOROS, GRUPOS_DASHBOARD,
    semaforo, compararUrgencia, hoyISO,
} from '../utils/incrementoCalc';
import { cartaIncremento } from '../utils/incrementoDocument';
import { downloadIncrementoPdf } from '../utils/incrementoPdf';
import { formatoCifra } from '../utils/numeroALetras';
import { fechaCorta } from '../utils/fechaLetras';
import { buildWhatsAppUrl } from '../utils/phone';
import { esStaff } from '../utils/roles';
import {
    Button, Badge, PageHeader, EmptyState, Skeleton, Modal, Field, Input, Select, cn,
} from '../components/ui';
import {
    TrendingUp, Eye, Download, MessageCircle, Mail, CheckCircle, X, Plus,
    Pencil, Trash2, Upload, Percent, RefreshCw, PlayCircle, History,
    FolderSync, AlertTriangle, User, ChevronDown, ChevronUp,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────
// I1 — Módulo de Incrementos de canon (#44): base de fichas auto-alimentada,
// dashboard semaforizado, carta automática (PDF/WhatsApp/correo con
// trazabilidad), historial por contrato y procesamiento masivo del mes.
// Admin ve/gestiona todo; el agente ve y envía las de sus contratos.
// ──────────────────────────────────────────────────────────────────────

const money = (v) => `$ ${formatoCifra(Math.round(v || 0))}`;
const pctTxt = (p) => (p == null ? '—' : `${String(p).replace('.', ',')}%`);

function formatDateTime(iso) {
    try {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: 'America/Bogota', day: 'numeric', month: 'short',
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

function SemaforoDot({ clave, withLabel = false }) {
    const s = SEMAFOROS[clave];
    if (!s) return null;
    return (
        <span className="inline-flex items-center gap-1.5" title={s.label}>
            <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', s.dot)} />
            {withLabel && <span className="text-xs font-semibold text-gray-600">{s.label}</span>}
        </span>
    );
}

// Vista previa HTML de la carta — mismos bloques del PDF (incrementoDocument)
function CartaPreview({ snapshot }) {
    const carta = cartaIncremento(snapshot);
    return (
        <div className="bg-white text-[13px] leading-relaxed text-gray-800 space-y-3">
            <p>{carta.ciudadFecha}</p>
            <div>
                {carta.destinatario.map((l, i) => (
                    <p key={i} className={i === 1 ? 'font-bold' : ''}>{l}</p>
                ))}
            </div>
            <p className="font-bold">{carta.referencia}</p>
            <p>{carta.saludo}</p>
            {carta.parrafos.map((p, i) => <p key={i} className="text-justify">{p}</p>)}
            <div className="max-w-sm mx-auto border border-gray-200 rounded-xl overflow-hidden">
                {carta.tabla.map(([label, valor], i) => (
                    <div key={i} className={cn(
                        'flex justify-between px-3 py-2 border-b border-gray-100 last:border-0',
                        i === carta.tabla.length - 1 && 'bg-gray-100 font-bold',
                    )}>
                        <span>{label}</span><span>{valor}</span>
                    </div>
                ))}
            </div>
            <p className="font-bold text-xs">{carta.montoEnLetras}</p>
            {carta.parrafosCierre.map((p, i) => <p key={i} className="text-justify">{p}</p>)}
            <p>{carta.despedida}</p>
            <div className="pt-6">
                {carta.firma.map((l, i) => (
                    <p key={i} className={i === 0 ? 'font-bold' : 'text-xs text-gray-600'}>{l}</p>
                ))}
            </div>
        </div>
    );
}

// ── Cabeceras reconocidas en el CSV de importación (#45) ──
// Se acepta cualquier alias; la primera fila del archivo debe ser el encabezado.
const CSV_ALIASES = {
    codigoWasi: ['codigo wasi', 'codigowasi', 'codigo', 'wasi'],
    arrendatarioNombre: ['nombre', 'arrendatario', 'contratante', 'nombre contratante'],
    arrendatarioCedula: ['cedula', 'identificacion', 'cc', 'nit', 'documento'],
    arrendatarioEmail: ['correo', 'email', 'e-mail'],
    arrendatarioCelular: ['celular', 'telefono', 'tel'],
    direccion: ['direccion', 'direccion inmueble', 'inmueble'],
    fechaInicioContrato: ['fecha inicio', 'fecha de inicio', 'inicio', 'fecha inicio contrato'],
    canonActual: ['canon', 'canon actual', 'canon mensual', 'valor canon'],
    tipoIndice: ['tipo indice', 'indice', 'tipo de indice'],
    pctFijo: ['pct fijo', '% fijo', 'porcentaje fijo'],
    puntosAdicionales: ['puntos', 'puntos adicionales'],
    notas: ['notas', 'observaciones'],
};

function parseCsv(texto) {
    const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lineas.length < 2) return { error: 'El archivo debe tener encabezado y al menos una fila.' };
    const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';
    const normalizar = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const headers = lineas[0].split(sep).map(normalizar);
    const campoDe = headers.map((h) =>
        Object.keys(CSV_ALIASES).find((k) => CSV_ALIASES[k].includes(h)) || null);
    if (!campoDe.includes('arrendatarioNombre') || !campoDe.includes('fechaInicioContrato') || !campoDe.includes('canonActual')) {
        return { error: 'El encabezado debe incluir al menos: nombre, fecha inicio y canon.' };
    }
    const filas = lineas.slice(1).map((linea) => {
        const celdas = linea.split(sep);
        const fila = {};
        campoDe.forEach((campo, i) => {
            if (!campo || celdas[i] == null) return;
            let v = celdas[i].trim().replace(/^"|"$/g, '');
            if (campo === 'canonActual') v = v.replace(/[^\d]/g, '');
            if (campo === 'fechaInicioContrato') {
                // Acepta DD/MM/YYYY además de YYYY-MM-DD
                const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (m) v = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            }
            if (campo === 'tipoIndice') {
                const t = normalizar(v);
                v = t.includes('fijo') ? 'FIJO' : t.includes('punto') || t.includes('plus') ? 'IPC_PLUS' : 'IPC';
            }
            if (v !== '') fila[campo] = v;
        });
        return fila;
    }).filter((f) => Object.keys(f).length > 0);
    return { filas };
}

const FICHA_VACIA = {
    codigoWasi: '', arrendatarioNombre: '', arrendatarioCedula: '',
    arrendatarioEmail: '', arrendatarioCelular: '', direccion: '',
    fechaInicioContrato: '', canonActual: '', tipoIndice: 'IPC',
    puntosAdicionales: 0, pctFijo: 0, notas: '',
};

export default function Incrementos() {
    const { user } = useAuth();
    const toast = useToast();
    const isAdmin = user?.role === 'ADMIN';
    // El asistente ve todo el radar (visibilidad staff en el backend) pero es
    // de SOLO CONSULTA: ver cartas y PDF, sin enviar, ajustar ni aplicar.
    const soloConsulta = user?.role === 'ASISTENTE';

    const [tab, setTab] = useState('tareas');           // tareas | fichas
    const [incrementos, setIncrementos] = useState([]);
    const [fichas, setFichas] = useState([]);
    const [indices, setIndices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroGrupo, setFiltroGrupo] = useState(null);
    const [filtroStatus, setFiltroStatus] = useState('');
    const [busy, setBusy] = useState(false);

    // Modales
    const [preview, setPreview] = useState(null);       // incremento (vista previa carta)
    const [fichaForm, setFichaForm] = useState(null);   // { id?, ...campos }
    const [showImport, setShowImport] = useState(false);
    const [showIndices, setShowIndices] = useState(false);
    const [anular, setAnular] = useState(null);         // incremento
    const [motivoAnular, setMotivoAnular] = useState('');
    const [ajustar, setAjustar] = useState(null);       // incremento
    const [aplicar, setAplicar] = useState(null);       // incremento
    const [fichaHistorial, setFichaHistorial] = useState(null); // ficha expandida

    const load = async () => {
        try {
            const [incs, fchs, inds] = await Promise.all([
                apiFetch('/api/incrementos'),
                apiFetch('/api/incrementos/fichas'),
                apiFetch('/api/incrementos/indices'),
            ]);
            setIncrementos(incs);
            setFichas(fchs);
            setIndices(inds);
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Dashboard (#48): contadores por grupo de urgencia ──
    const grupos = useMemo(() => {
        const counts = Object.fromEntries(GRUPOS_DASHBOARD.map((g) => [g.clave, 0]));
        for (const i of incrementos) if (i.grupo) counts[i.grupo] += 1;
        return counts;
    }, [incrementos]);

    const hoy = hoyISO();
    const visibles = useMemo(() => {
        let lista = [...incrementos];
        if (filtroGrupo) lista = lista.filter((i) => i.grupo === filtroGrupo);
        if (filtroStatus) lista = lista.filter((i) => i.status === filtroStatus);
        return lista.sort((a, b) => compararUrgencia(a, b, hoy));
    }, [incrementos, filtroGrupo, filtroStatus, hoy]);

    // ── Acciones sobre incrementos ──

    const handleWhatsApp = async (inc) => {
        const celular = inc.ficha?.arrendatarioCelular;
        if (!celular) return toast.error('La ficha no tiene celular del arrendatario.');
        // Abrir el popup ANTES del await (popup blockers)
        const win = window.open('', '_blank');
        try {
            const res = await apiFetch(`/api/incrementos/${inc.id}/share`, { method: 'POST' });
            const msg = `Hola ${inc.ficha.arrendatarioNombre} 👋, TuLlave Inmobiliaria le comparte la carta de incremento anual del canon de arrendamiento del inmueble ${inc.ficha.direccion}. Puede consultarla y descargarla aquí: ${res.publicUrl}`;
            const url = buildWhatsAppUrl(celular, msg);
            if (win) win.location.href = url;
            else window.location.href = url;
            toast.success('Carta compartida');
            load();
        } catch (err) {
            if (win) win.close();
            toast.error(friendlyError(err));
        }
    };

    const handleEmail = async (inc) => {
        if (!inc.ficha?.arrendatarioEmail) return toast.error('La ficha no tiene correo del arrendatario.');
        setBusy(true);
        try {
            const res = await apiFetch(`/api/incrementos/${inc.id}/email`, { method: 'POST' });
            toast.success(`Carta enviada a ${res.emailedTo}`);
            setPreview(null);
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleAplicar = async () => {
        setBusy(true);
        try {
            await apiFetch(`/api/incrementos/${aplicar.id}/aplicar`, { method: 'PATCH' });
            toast.success('Incremento aplicado: la ficha quedó con el nuevo canon');
            setAplicar(null);
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleAnular = async () => {
        setBusy(true);
        try {
            await apiFetch(`/api/incrementos/${anular.id}/anular`, { method: 'PATCH', body: { motivo: motivoAnular } });
            toast.success('Incremento anulado');
            setAnular(null); setMotivoAnular('');
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleAjustar = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await apiFetch(`/api/incrementos/${ajustar.id}`, {
                method: 'PATCH',
                body: { indicePct: Number(ajustar.pct), fechaEfectiva: ajustar.fecha },
            });
            toast.success('Incremento ajustado');
            setAjustar(null);
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleProcesarMes = async () => {
        setBusy(true);
        try {
            const r = await apiFetch('/api/incrementos/procesar-mes', { method: 'POST' });
            toast.success(
                `Procesado: ${r.detectados} nuevo(s), ${r.listos} carta(s) listas` +
                (r.sinIndice > 0 ? `, ${r.sinIndice} sin índice IPC` : '') +
                (r.incompletos > 0 ? `, ${r.incompletos} con datos incompletos` : ''),
            );
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleBackfill = async () => {
        setBusy(true);
        try {
            const r = await apiFetch('/api/incrementos/fichas/backfill', { method: 'POST' });
            toast.success(`${r.creadas} ficha(s) creadas desde contratos aprobados (${r.revisados} revisados)`);
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    // ── Fichas ──

    const handleSaveFicha = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const body = {
                ...fichaForm,
                canonActual: Number(fichaForm.canonActual),
                puntosAdicionales: Number(fichaForm.puntosAdicionales) || 0,
                pctFijo: Number(fichaForm.pctFijo) || 0,
            };
            delete body.id;
            if (fichaForm.id) {
                await apiFetch(`/api/incrementos/fichas/${fichaForm.id}`, { method: 'PATCH', body });
            } else {
                await apiFetch('/api/incrementos/fichas', { method: 'POST', body });
            }
            toast.success(fichaForm.id ? 'Ficha actualizada' : 'Ficha creada');
            setFichaForm(null);
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleToggleActiva = async (ficha) => {
        try {
            await apiFetch(`/api/incrementos/fichas/${ficha.id}`, { method: 'PATCH', body: { activa: !ficha.activa } });
            toast.success(ficha.activa ? 'Ficha desactivada (sale del radar)' : 'Ficha reactivada');
            load();
        } catch (err) {
            toast.error(friendlyError(err));
        }
    };

    const anioActual = new Date().getFullYear();
    const indiceDe = (anio) => indices.find((i) => i.anio === anio);

    if (loading) {
        return (
            <div className="p-4 lg:p-8 space-y-4">
                <Skeleton className="h-9 w-64" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
                </div>
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
        );
    }

    return (
        <div className="p-4 lg:p-8 max-w-6xl mx-auto pb-24 lg:pb-8">
            <PageHeader
                title="Incrementos de canon"
                subtitle={soloConsulta
                    ? 'Consulta de aniversarios de contrato y cartas de incremento'
                    : isAdmin
                        ? 'Aniversarios de contrato, cartas de incremento y aplicación del nuevo canon'
                        : 'Incrementos de los contratos a tu cargo'}
            >
                {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setShowIndices(true)}>
                            <Percent className="w-4 h-4" /> IPC
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleProcesarMes} disabled={busy}>
                            <PlayCircle className="w-4 h-4" /> Procesar incrementos del mes
                        </Button>
                    </div>
                )}
            </PageHeader>

            {/* Aviso si el año no tiene IPC configurado (bloquea cartas IPC) */}
            {isAdmin && !indiceDe(anioActual) && (
                <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>
                        No has configurado el IPC de {anioActual}. Sin él no se pueden calcular los incrementos pactados por IPC.{' '}
                        <button onClick={() => setShowIndices(true)} className="font-bold underline">Configurar ahora</button>
                    </p>
                </div>
            )}

            {/* ── Dashboard de urgencia (#48) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {GRUPOS_DASHBOARD.map((g) => (
                    <button
                        key={g.clave}
                        onClick={() => setFiltroGrupo(filtroGrupo === g.clave ? null : g.clave)}
                        className={cn(
                            'text-left bg-white rounded-2xl border p-4 transition shadow-sm hover:shadow-md',
                            filtroGrupo === g.clave ? 'border-brand-600 ring-2 ring-brand-100' : 'border-gray-100',
                        )}
                    >
                        <p className="text-2xl">{g.emoji} <span className="font-extrabold text-gray-900">{grupos[g.clave]}</span></p>
                        <p className="text-xs font-semibold text-gray-500 mt-1">{g.titulo}</p>
                    </button>
                ))}
            </div>

            {/* ── Tabs ── */}
            <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-2xl p-1 w-fit">
                {[['tareas', 'Incrementos'], ['fichas', `Fichas (${fichas.length})`]].map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={cn(
                            'px-4 py-2 rounded-xl text-sm font-bold transition',
                            tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'tareas' && (
                <>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="w-auto text-sm">
                            <option value="">Todos los estados</option>
                            {Object.entries(INCREMENTO_STATUS).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </Select>
                        {filtroGrupo && (
                            <button
                                onClick={() => setFiltroGrupo(null)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 bg-brand-50 rounded-full px-3 py-1.5"
                            >
                                {GRUPOS_DASHBOARD.find((g) => g.clave === filtroGrupo)?.titulo} <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {visibles.length === 0 ? (
                        <EmptyState
                            icon={TrendingUp}
                            title="Sin incrementos en el radar"
                            description={isAdmin
                                ? 'Las tareas se crean solas cuando un contrato se acerca a su aniversario. Usa "Procesar incrementos del mes" para detectarlas ahora, o revisa la pestaña Fichas.'
                                : 'Cuando un contrato tuyo se acerque a su aniversario, su incremento aparecerá aquí.'}
                        />
                    ) : (
                        <div className="space-y-3">
                            {visibles.map((inc) => {
                                const st = INCREMENTO_STATUS[inc.status] || {};
                                const sem = semaforo(inc, hoy);
                                return (
                                    <div key={inc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <SemaforoDot clave={inc.semaforo} />
                                                    <p className="font-bold text-gray-900 truncate">{inc.ficha?.arrendatarioNombre}</p>
                                                    <Badge className={st.badge}>{st.label}</Badge>
                                                    {inc.sinIndice && inc.status === 'PENDIENTE' && (
                                                        <Badge className="bg-amber-100 text-amber-700">Sin índice</Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5 truncate">{inc.ficha?.direccion}</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    <span className="font-semibold">Incremento {inc.periodo}</span>
                                                    {' · '}rige desde el {fechaCorta(inc.fechaEfectiva)}
                                                    {inc.dias >= 0
                                                        ? <> · faltan <span className="font-bold">{inc.dias}</span> días</>
                                                        : <> · <span className="font-bold text-red-600">venció hace {-inc.dias} días</span></>}
                                                </p>
                                                <p className="text-sm mt-1.5">
                                                    <span className="text-gray-500">{money(inc.canonAnterior)}</span>
                                                    {' → '}
                                                    <span className="font-extrabold text-gray-900">
                                                        {inc.nuevoCanonVigente != null ? money(inc.nuevoCanonVigente) : 'pendiente de índice'}
                                                    </span>
                                                    {inc.pctVigente != null && (
                                                        <span className="ml-1.5 text-xs font-bold text-emerald-700">+{pctTxt(inc.pctVigente)}</span>
                                                    )}
                                                </p>
                                                {inc.cartaEnviadaAt && (
                                                    <p className="text-[11px] text-gray-400 mt-1">
                                                        Carta enviada el {formatDateTime(inc.cartaEnviadaAt)}
                                                        {inc.enviadaPorNombre && <> por {inc.enviadaPorNombre}</>}
                                                        {inc.enviadaA && <> a {inc.enviadaA}</>}
                                                    </p>
                                                )}
                                                {inc.status === 'ANULADA' && inc.anuladoMotivo && (
                                                    <p className="text-[11px] text-red-500 mt-1">Anulado: {inc.anuladoMotivo}</p>
                                                )}
                                                {inc.faltantes.length > 0 && inc.status === 'PENDIENTE' && (
                                                    <p className="text-[11px] text-amber-600 mt-1">⚠ {inc.faltantes.join(' · ')}</p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Button variant="ghost" size="sm" title="Ver carta" onClick={() => setPreview(inc)}>
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                {inc.status !== 'ANULADA' && !inc.sinIndice && (
                                                    <>
                                                        <Button variant="ghost" size="sm" title="Descargar PDF" onClick={() => downloadIncrementoPdf(inc)}>
                                                            <Download className="w-4 h-4" />
                                                        </Button>
                                                        {!soloConsulta && (
                                                            <>
                                                                <Button variant="ghost" size="sm" title="Enviar por WhatsApp" onClick={() => handleWhatsApp(inc)}>
                                                                    <MessageCircle className="w-4 h-4 text-green-600" />
                                                                </Button>
                                                                <Button variant="ghost" size="sm" title="Enviar por correo" disabled={busy} onClick={() => handleEmail(inc)}>
                                                                    <Mail className="w-4 h-4 text-blue-600" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                                {isAdmin && inc.status === 'PENDIENTE' && (
                                                    <Button variant="ghost" size="sm" title="Ajustar % o fecha"
                                                        onClick={() => setAjustar({ id: inc.id, pct: inc.pctVigente ?? '', fecha: inc.fechaEfectiva })}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                {isAdmin && ['PENDIENTE', 'ENVIADA'].includes(inc.status) && inc.nuevoCanonVigente != null && (
                                                    <Button variant="ghost" size="sm" title="Aplicar nuevo canon" onClick={() => setAplicar(inc)}>
                                                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                                                    </Button>
                                                )}
                                                {isAdmin && ['PENDIENTE', 'ENVIADA'].includes(inc.status) && (
                                                    <Button variant="ghost" size="sm" title="Anular" onClick={() => setAnular(inc)}>
                                                        <X className="w-4 h-4 text-red-500" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Leyenda del semáforo (#52) */}
                    <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5">
                        {['NEGRO', 'ROJO', 'NARANJA', 'AMARILLO', 'VERDE', 'AZUL'].map((k) => (
                            <SemaforoDot key={k} clave={k} withLabel />
                        ))}
                    </div>
                </>
            )}

            {tab === 'fichas' && (
                <>
                    {isAdmin && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            <Button size="sm" onClick={() => setFichaForm({ ...FICHA_VACIA })}>
                                <Plus className="w-4 h-4" /> Nueva ficha
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
                                <Upload className="w-4 h-4" /> Importar CSV
                            </Button>
                            <Button variant="secondary" size="sm" disabled={busy} onClick={handleBackfill}
                                title="Crear fichas para los contratos de arrendamiento aprobados que aún no tengan una">
                                <FolderSync className="w-4 h-4" /> Cargar desde contratos
                            </Button>
                        </div>
                    )}
                    {fichas.length === 0 ? (
                        <EmptyState
                            icon={TrendingUp}
                            title="Sin fichas de incremento"
                            description={isAdmin
                                ? 'Carga los contratos existentes con "Cargar desde contratos", importa los históricos por CSV o crea fichas manualmente.'
                                : 'Cuando un contrato tuyo sea aprobado, su ficha aparecerá aquí automáticamente.'}
                        />
                    ) : (
                        <div className="space-y-3">
                            {fichas.map((f) => (
                                <div key={f.id} className={cn('bg-white rounded-2xl border shadow-sm p-4', f.activa ? 'border-gray-100' : 'border-gray-200 opacity-60')}>
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-bold text-gray-900 truncate">{f.arrendatarioNombre}</p>
                                                {f.codigoWasi && <Badge className="bg-gray-100 text-gray-600">Wasi {f.codigoWasi}</Badge>}
                                                {!f.activa && <Badge className="bg-gray-200 text-gray-600">Inactiva</Badge>}
                                                {f.contract && <Badge className="bg-blue-50 text-blue-600">Contrato #{f.contract.id}</Badge>}
                                                <Badge className="bg-gray-100 text-gray-600">{TIPOS_INDICE[f.tipoIndice]?.label || f.tipoIndice}{f.tipoIndice === 'IPC_PLUS' ? ` +${f.puntosAdicionales}` : f.tipoIndice === 'FIJO' ? ` ${f.pctFijo}%` : ''}</Badge>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5 truncate">{f.direccion || 'Sin dirección'}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Inicio: <span className="font-semibold">{fechaCorta(f.fechaInicioContrato)}</span>
                                                {f.proximoAniversario && (
                                                    <> · Próximo aniversario: <span className="font-semibold">{fechaCorta(f.proximoAniversario.fecha)}</span></>
                                                )}
                                            </p>
                                            <p className="text-sm mt-1">
                                                Canon vigente: <span className="font-extrabold">{money(f.canonActual)}</span>
                                            </p>
                                            {f.user && <p className="text-[11px] text-gray-400 mt-0.5 inline-flex items-center gap-1"><User className="w-3 h-3" />{f.user.name}</p>}
                                            {f.faltantes.length > 0 && (
                                                <p className="text-[11px] text-amber-600 mt-1">⚠ {f.faltantes.join(' · ')}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {f.incrementos.length > 0 && (
                                                <Button variant="ghost" size="sm" title="Historial de incrementos"
                                                    onClick={() => setFichaHistorial(fichaHistorial?.id === f.id ? null : f)}>
                                                    <History className="w-4 h-4" />
                                                    {fichaHistorial?.id === f.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                </Button>
                                            )}
                                            {isAdmin && (
                                                <>
                                                    <Button variant="ghost" size="sm" title="Editar" onClick={() => setFichaForm({
                                                        id: f.id, codigoWasi: f.codigoWasi || '', arrendatarioNombre: f.arrendatarioNombre,
                                                        arrendatarioCedula: f.arrendatarioCedula || '', arrendatarioEmail: f.arrendatarioEmail || '',
                                                        arrendatarioCelular: f.arrendatarioCelular || '', direccion: f.direccion || '',
                                                        fechaInicioContrato: f.fechaInicioContrato, canonActual: f.canonActual,
                                                        tipoIndice: f.tipoIndice, puntosAdicionales: f.puntosAdicionales, pctFijo: f.pctFijo,
                                                        notas: f.notas || '',
                                                    })}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" title={f.activa ? 'Desactivar (contrato terminado)' : 'Reactivar'}
                                                        onClick={() => handleToggleActiva(f)}>
                                                        {f.activa ? <Trash2 className="w-4 h-4 text-red-400" /> : <RefreshCw className="w-4 h-4 text-emerald-600" />}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Historial de incrementos por contrato (#53) ── */}
                                    {fichaHistorial?.id === f.id && (
                                        <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                                            {[...f.incrementos].sort((a, b) => b.periodo - a.periodo).map((inc) => {
                                                const st = INCREMENTO_STATUS[inc.status] || {};
                                                return (
                                                    <div key={inc.id} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-xl px-3 py-2 flex-wrap">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold">Incremento {inc.periodo}</span>
                                                            <Badge className={st.badge}>{st.label}</Badge>
                                                            <span className="text-gray-600">
                                                                {money(inc.canonAnterior)} → {inc.nuevoCanonVigente != null ? money(inc.nuevoCanonVigente) : '—'}
                                                                {inc.pctVigente != null && <span className="text-xs text-emerald-700 font-bold ml-1">+{pctTxt(inc.pctVigente)}</span>}
                                                            </span>
                                                            {inc.cartaEnviadaAt && (
                                                                <span className="text-[11px] text-gray-400">carta: {formatDateTime(inc.cartaEnviadaAt)}</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button variant="ghost" size="sm" title="Ver carta" onClick={() => setPreview(inc)}>
                                                                <Eye className="w-4 h-4" />
                                                            </Button>
                                                            {!inc.sinIndice && (
                                                                <Button variant="ghost" size="sm" title="PDF" onClick={() => downloadIncrementoPdf(inc)}>
                                                                    <Download className="w-4 h-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── Modal: vista previa de la carta (#49) ── */}
            <Modal open={!!preview} onClose={() => setPreview(null)} title={`Carta de incremento ${preview?.periodo || ''}`} maxWidth="max-w-2xl">
                {preview && (
                    preview.snapshot?.pct == null ? (
                        <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-4">
                            Este incremento no tiene índice: configura el IPC de {preview.periodo} para calcular el nuevo canon y generar la carta.
                        </p>
                    ) : (
                        <>
                            <div className="max-h-[60vh] overflow-y-auto border border-gray-100 rounded-2xl p-4 mb-4">
                                <CartaPreview snapshot={preview.snapshot} />
                            </div>
                            <div className="flex flex-wrap gap-2 justify-end">
                                <Button variant="secondary" onClick={() => downloadIncrementoPdf(preview)}>
                                    <Download className="w-4 h-4" /> PDF
                                </Button>
                                {preview.status !== 'ANULADA' && !soloConsulta && (
                                    <>
                                        <Button variant="secondary" onClick={() => handleWhatsApp(preview)}>
                                            <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
                                        </Button>
                                        <Button disabled={busy || !preview.ficha?.arrendatarioEmail} onClick={() => handleEmail(preview)}>
                                            <Mail className="w-4 h-4" /> Enviar por correo
                                        </Button>
                                    </>
                                )}
                            </div>
                            {!preview.ficha?.arrendatarioEmail && (
                                <p className="text-[11px] text-amber-600 mt-2 text-right">La ficha no tiene correo del arrendatario.</p>
                            )}
                        </>
                    )
                )}
            </Modal>

            {/* ── Modal: aplicar (cierra el ciclo) ── */}
            <Modal open={!!aplicar} onClose={() => setAplicar(null)} title="Aplicar nuevo canon">
                {aplicar && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            El canon de <span className="font-bold">{aplicar.ficha?.arrendatarioNombre}</span> pasará de{' '}
                            <span className="font-bold">{money(aplicar.canonAnterior)}</span> a{' '}
                            <span className="font-bold text-emerald-700">{money(aplicar.nuevoCanonVigente)}</span> y la ficha
                            quedará lista para el ciclo del próximo año.
                        </p>
                        {aplicar.status === 'PENDIENTE' && (
                            <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3">
                                ⚠ La carta de este incremento aún no se ha enviado. Puedes aplicar de todas formas si el aviso se hizo por fuera del sistema.
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setAplicar(null)}>Cancelar</Button>
                            <Button disabled={busy} onClick={handleAplicar}><CheckCircle className="w-4 h-4" /> Aplicar</Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Modal: anular ── */}
            <Modal open={!!anular} onClose={() => { setAnular(null); setMotivoAnular(''); }} title="Anular incremento">
                <div className="space-y-4">
                    <Field label="Motivo (obligatorio)">
                        <Input value={motivoAnular} onChange={(e) => setMotivoAnular(e.target.value)}
                            placeholder="Ej.: el contrato terminó antes del aniversario" />
                    </Field>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => { setAnular(null); setMotivoAnular(''); }}>Cancelar</Button>
                        <Button variant="danger" disabled={busy || !motivoAnular.trim()} onClick={handleAnular}>Anular</Button>
                    </div>
                </div>
            </Modal>

            {/* ── Modal: ajustar % / fecha (admin) ── */}
            <Modal open={!!ajustar} onClose={() => setAjustar(null)} title="Ajustar incremento">
                {ajustar && (
                    <form onSubmit={handleAjustar} className="space-y-4">
                        <Field label="Porcentaje a aplicar (%)" hint="Reemplaza el índice del período solo para este incremento">
                            <Input type="number" step="0.01" min="0" max="100" required
                                value={ajustar.pct} onChange={(e) => setAjustar({ ...ajustar, pct: e.target.value })} />
                        </Field>
                        <Field label="Fecha efectiva">
                            <Input type="date" required value={ajustar.fecha}
                                onChange={(e) => setAjustar({ ...ajustar, fecha: e.target.value })} />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={() => setAjustar(null)}>Cancelar</Button>
                            <Button type="submit" disabled={busy}>Guardar</Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* ── Modal: ficha (crear/editar, admin) ── */}
            <Modal open={!!fichaForm} onClose={() => setFichaForm(null)} title={fichaForm?.id ? 'Editar ficha' : 'Nueva ficha de incremento'} maxWidth="max-w-lg">
                {fichaForm && (
                    <form onSubmit={handleSaveFicha} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Código Wasi"><Input value={fichaForm.codigoWasi} onChange={(e) => setFichaForm({ ...fichaForm, codigoWasi: e.target.value })} /></Field>
                            <Field label="Identificación"><Input value={fichaForm.arrendatarioCedula} onChange={(e) => setFichaForm({ ...fichaForm, arrendatarioCedula: e.target.value })} /></Field>
                        </div>
                        <Field label="Nombre del arrendatario *"><Input required value={fichaForm.arrendatarioNombre} onChange={(e) => setFichaForm({ ...fichaForm, arrendatarioNombre: e.target.value })} /></Field>
                        <Field label="Dirección del inmueble"><Input value={fichaForm.direccion} onChange={(e) => setFichaForm({ ...fichaForm, direccion: e.target.value })} /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Correo"><Input type="email" value={fichaForm.arrendatarioEmail} onChange={(e) => setFichaForm({ ...fichaForm, arrendatarioEmail: e.target.value })} /></Field>
                            <Field label="Celular"><Input value={fichaForm.arrendatarioCelular} onChange={(e) => setFichaForm({ ...fichaForm, arrendatarioCelular: e.target.value })} /></Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Fecha inicio contrato *"><Input type="date" required value={fichaForm.fechaInicioContrato} onChange={(e) => setFichaForm({ ...fichaForm, fechaInicioContrato: e.target.value })} /></Field>
                            <Field label="Canon vigente ($) *"><MoneyInput value={fichaForm.canonActual} onChange={(v) => setFichaForm({ ...fichaForm, canonActual: v })} /></Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Índice pactado">
                                <Select value={fichaForm.tipoIndice} onChange={(e) => setFichaForm({ ...fichaForm, tipoIndice: e.target.value })}>
                                    {Object.entries(TIPOS_INDICE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </Select>
                            </Field>
                            {fichaForm.tipoIndice === 'IPC_PLUS' && (
                                <Field label="Puntos adicionales"><Input type="number" step="0.01" min="0" value={fichaForm.puntosAdicionales} onChange={(e) => setFichaForm({ ...fichaForm, puntosAdicionales: e.target.value })} /></Field>
                            )}
                            {fichaForm.tipoIndice === 'FIJO' && (
                                <Field label="% fijo pactado"><Input type="number" step="0.01" min="0" value={fichaForm.pctFijo} onChange={(e) => setFichaForm({ ...fichaForm, pctFijo: e.target.value })} /></Field>
                            )}
                        </div>
                        <Field label="Notas"><Input value={fichaForm.notas} onChange={(e) => setFichaForm({ ...fichaForm, notas: e.target.value })} /></Field>
                        <div className="flex justify-end gap-2 pt-1">
                            <Button type="button" variant="secondary" onClick={() => setFichaForm(null)}>Cancelar</Button>
                            <Button type="submit" disabled={busy}>{fichaForm.id ? 'Guardar' : 'Crear ficha'}</Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* ── Modal: importación CSV (#45) ── */}
            <ImportCsvModal open={showImport} onClose={() => setShowImport(false)} onDone={load} toast={toast} />

            {/* ── Modal: índices IPC (#46) ── */}
            <IndicesModal open={showIndices} onClose={() => setShowIndices(false)} indices={indices} onSaved={load} toast={toast} busy={busy} setBusy={setBusy} />
        </div>
    );
}

function ImportCsvModal({ open, onClose, onDone, toast }) {
    const [filas, setFilas] = useState(null);
    const [resultado, setResultado] = useState(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const texto = await file.text();
        const r = parseCsv(texto);
        if (r.error) { toast.error(r.error); setFilas(null); }
        else { setFilas(r.filas); setResultado(null); }
        e.target.value = '';
    };

    const handleImport = async () => {
        setBusy(true);
        try {
            const r = await apiFetch('/api/incrementos/fichas/importar', { method: 'POST', body: { filas } });
            setResultado(r);
            setFilas(null);
            if (r.creadas > 0) onDone();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    const cerrar = () => { setFilas(null); setResultado(null); onClose(); };

    return (
        <Modal open={open} onClose={cerrar} title="Importar contratos históricos (CSV)" maxWidth="max-w-lg">
            <div className="space-y-4">
                <p className="text-xs text-gray-500">
                    Archivo CSV con encabezado. Columnas reconocidas: <span className="font-semibold">código Wasi,
                    nombre, cédula, correo, celular, dirección, fecha inicio (YYYY-MM-DD o DD/MM/YYYY), canon,
                    tipo índice</span>. Se omiten las filas con código Wasi ya registrado.
                </p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-brand-600 file:text-white file:font-bold file:text-xs" />
                {filas && (
                    <>
                        <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                            {filas.slice(0, 30).map((f, i) => (
                                <div key={i} className="px-3 py-2 text-xs">
                                    <span className="font-bold">{f.arrendatarioNombre || '(sin nombre)'}</span>
                                    {f.codigoWasi && <span className="text-gray-400"> · {f.codigoWasi}</span>}
                                    <span className="text-gray-500"> · {f.fechaInicioContrato || 'sin fecha'} · ${formatoCifra(f.canonActual || 0)}</span>
                                </div>
                            ))}
                            {filas.length > 30 && <p className="px-3 py-2 text-[11px] text-gray-400">… y {filas.length - 30} más</p>}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setFilas(null)}>Descartar</Button>
                            <Button disabled={busy} onClick={handleImport}><Upload className="w-4 h-4" /> Importar {filas.length} fila(s)</Button>
                        </div>
                    </>
                )}
                {resultado && (
                    <div className="text-sm space-y-2">
                        <p className="font-bold text-emerald-700">✓ {resultado.creadas} ficha(s) creadas de {resultado.total}</p>
                        {resultado.errores.length > 0 && (
                            <div className="max-h-40 overflow-y-auto bg-red-50 rounded-xl p-3 space-y-1">
                                {resultado.errores.map((e, i) => (
                                    <p key={i} className="text-xs text-red-600">Fila {e.fila}: {e.error}</p>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-end"><Button variant="secondary" onClick={cerrar}>Cerrar</Button></div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

function IndicesModal({ open, onClose, indices, onSaved, toast, busy, setBusy }) {
    const anioActual = new Date().getFullYear();
    const [anio, setAnio] = useState(anioActual);
    const [pct, setPct] = useState('');
    const [fuente, setFuente] = useState('');

    const handleSave = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await apiFetch(`/api/incrementos/indices/${anio}`, { method: 'PUT', body: { pct: Number(pct), fuente } });
            toast.success(`IPC de ${anio} guardado (${pct}%)`);
            setPct(''); setFuente('');
            onSaved();
        } catch (err) {
            toast.error(friendlyError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="IPC por año de aplicación">
            <div className="space-y-4">
                <p className="text-xs text-gray-500">
                    El índice del año se aplica a los incrementos cuyo aniversario cae en ese año
                    (normalmente el IPC certificado por el DANE del año inmediatamente anterior).
                </p>
                {indices.length > 0 && (
                    <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                        {indices.map((i) => (
                            <div key={i.anio} className="flex justify-between px-3 py-2 text-sm">
                                <span className="font-bold">{i.anio}</span>
                                <span>{String(i.pct).replace('.', ',')}% {i.fuente && <span className="text-xs text-gray-400">({i.fuente})</span>}</span>
                            </div>
                        ))}
                    </div>
                )}
                <form onSubmit={handleSave} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Año de aplicación">
                            <Input type="number" min="2020" max="2100" required value={anio} onChange={(e) => setAnio(e.target.value)} />
                        </Field>
                        <Field label="IPC / índice (%)">
                            <Input type="number" step="0.01" min="0" max="100" required placeholder="5,20" value={pct} onChange={(e) => setPct(e.target.value)} />
                        </Field>
                    </div>
                    <Field label="Fuente (opcional)">
                        <Input placeholder={`Ej.: DANE — IPC ${anio - 1}`} value={fuente} onChange={(e) => setFuente(e.target.value)} />
                    </Field>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
                        <Button type="submit" disabled={busy}>Guardar índice</Button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
