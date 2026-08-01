// Cálculo de la liquidación inicial de un contrato de arrendamiento.
// Replica las fórmulas del Excel de la inmobiliaria:
//   - canon día = canon mensual / días reales del mes de inicio del cobro
//   - admón proporcional = (admón mensual / 30) × días (divisor 30 fijo, como el Excel)
//   - derechos de contrato y firma digital = % de (canon + admón) mensual
//   - IVA 19% opcional por concepto; saldo = total − abonos (pagada si llega a 0)
// Compartido por frontend (resumen en vivo), backend (congelar totales al
// aprobar) y PDF — sin imports de Prisma ni React.

import { partesFecha } from './fechaLetras.js';

export const IVA_PCT = 19;

export const LIQUIDACION_STATUS = {
    DRAFT: { label: 'Borrador', badge: 'bg-gray-100 text-gray-700' },
    REOPENED: { label: 'En corrección', badge: 'bg-orange-100 text-orange-700' },
    PENDING_APPROVAL: { label: 'En revisión', badge: 'bg-amber-100 text-amber-700' },
    APPROVED: { label: 'Aprobada', badge: 'bg-emerald-100 text-emerald-700' },
    REJECTED: { label: 'Devuelta', badge: 'bg-red-100 text-red-700' },
    PAID: { label: 'Pagada', badge: 'bg-blue-100 text-blue-700' },
};

// Estados en los que la configuración puede editarse.
export const EDITABLE_STATUSES = ['DRAFT', 'REJECTED', 'REOPENED'];

// Estados desde los que puede enviarse al cliente (link público / correo).
// "Enviada" no es estado propio: queda registrado en sentAt.
export const SENDABLE_STATUSES = ['APPROVED', 'PAID'];

// Agrupación de los conceptos en el documento. Cada grupo presente recibe una
// letra (A, B, C…) y sus ítems una numeración corrida (1, 2, 3…), para que los
// subtotales puedan citarlos explícitamente ("Subtotal A (ítems 1 + 2)") en
// lugar de usar categorías genéricas — pedido del cliente: el arrendatario debe
// poder rastrear de dónde sale cada suma.
export const GRUPOS = [
    { clave: 'ARRENDAMIENTO', titulo: 'Arrendamiento del período liquidado' },
    { clave: 'LEGALIZACION', titulo: 'Gastos de legalización del contrato' },
    { clave: 'OTROS', titulo: 'Otros cargos y descuentos' },
];

const GRUPO_DE_TIPO = {
    PROPORCIONAL: 'ARRENDAMIENTO',
    SERVICIO: 'LEGALIZACION',
    OTRO: 'OTROS',
    DESCUENTO: 'OTROS',
};

const LETRAS = 'ABCDEFGH';

// "ítem 3" | "ítems 1 + 2" — etiqueta de los números que componen un subtotal;
// el "+" es intencional: muestra que el subtotal ES esa suma.
export function etiquetaItems(nums = []) {
    if (nums.length === 0) return '';
    if (nums.length === 1) return `ítem ${nums[0]}`;
    return `ítems ${nums.join(' + ')}`;
}

// "el ítem 3" | "los ítems 3 y 4" | "los ítems 1, 3 y 4" — para texto corrido.
export function etiquetaItemsProsa(nums = []) {
    if (nums.length === 0) return '';
    if (nums.length === 1) return `el ítem ${nums[0]}`;
    return `los ítems ${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`;
}

// Referencia que pide el banco al consignar. Regla del cliente:
//   - en conjunto/edificio → NOMBRE DEL CONJUNTO + TORRE + APARTAMENTO
//   - casa o sin conjunto  → DIRECCIÓN + BARRIO
// Los componentes vienen sueltos en `origen` (los guarda buildOrigen). Para las
// liquidaciones creadas antes de que se guardaran, se reconstruye lo que se
// pueda desde `direccionCompleta`, que buildOrigen armó con este orden:
//   dirección, Torre X, Apto Y, conjunto, barrio, ciudad
// Solo se deducen las partes inequívocas: nunca se inventa un conjunto.
export function referenciaPago(origen = {}) {
    const limpio = (v) => String(v ?? '').trim();
    let conjunto = limpio(origen.conjuntoInmueble);
    let torre = limpio(origen.torreInmueble);
    let apto = limpio(origen.aptoInmueble);
    let direccion = limpio(origen.direccionInmueble);
    const barrio = limpio(origen.barrioInmueble);

    const tieneComponentes = conjunto || torre || apto || direccion;
    if (!tieneComponentes) {
        const partes = limpio(origen.direccionCompleta).split(',').map((p) => p.trim()).filter(Boolean);
        if (partes.length === 0) return '';
        direccion = partes[0];
        let ultimoIndice = 0;
        partes.forEach((p, i) => {
            const mTorre = p.match(/^Torre\s+(.+)$/i);
            const mApto = p.match(/^Apto\s+(.+)$/i);
            if (mTorre) { torre = mTorre[1]; ultimoIndice = i; }
            if (mApto) { apto = mApto[1]; ultimoIndice = i; }
        });
        // El conjunto es el segmento siguiente a Torre/Apto, y solo si aún
        // queda otro detrás (la ciudad): si no, ese segmento ES la ciudad.
        if (ultimoIndice > 0 && partes.length >= ultimoIndice + 3) {
            conjunto = partes[ultimoIndice + 1];
        }
    }

    // El agente puede escribir "Torre 2" o solo "2" (y lo mismo con el apto):
    // se quita el prefijo para no imprimir "TORRE TORRE 2".
    torre = torre.replace(/^(torre|bloque)\s+/i, '');
    apto = apto.replace(/^(apto|apartamento|apartaestudio|interior)\s+/i, '');

    const enMayusculas = (s) => s.toLocaleUpperCase('es-CO');
    const referencia = conjunto
        ? [conjunto, torre && `TORRE ${torre}`, apto && `APTO ${apto}`]
        : [direccion, barrio];
    return enMayusculas(referencia.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
}

export const ADMON_MODOS = {
    PROPORCIONAL: 'Proporcional a los días',
    COMPLETA: 'Mes completo',
    NO_COBRAR: 'No cobrar',
};

// Días reales del mes de una fecha "YYYY-MM-DD" (31/30/29/28); 0 si inválida.
export function diasDelMes(fecha) {
    const p = partesFecha(fecha);
    if (!p) return 0;
    return new Date(p.year, p.month, 0).getDate();
}

// Días entre dos fechas "YYYY-MM-DD", ambos extremos incluidos (como cuenta
// el Excel: del 5 al 31 de julio son 27 días... 31−5+1). Nunca negativo.
export function diasEntre(inicial, final) {
    const a = partesFecha(inicial);
    const b = partesFecha(final);
    if (!a || !b) return 0;
    const ms = new Date(b.year, b.month - 1, b.day) - new Date(a.year, a.month - 1, a.day);
    return Math.max(0, Math.round(ms / 86400000) + 1);
}

// Coerciona montos que pueden venir como texto formateado ("1.300.000" — los
// campos money del contrato guardan solo dígitos, pero por si acaso). COP sin
// centavos: el punto es separador de miles, se descarta.
const num = (v) => {
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    if (v === null || v === undefined || v === '') return 0;
    const limpio = String(v).replace(/[^\d-]/g, '');
    const n = Number(limpio);
    return isNaN(n) ? 0 : n;
};

const iva = (base, aplica) => (aplica ? Math.round(base * IVA_PCT / 100) : 0);

// Valida la configuración antes de enviar a revisión → array de mensajes.
export function validateLiquidacionConfig(config = {}) {
    const errors = [];
    if (!partesFecha(config.fechaInicialCobro)) errors.push('Falta la fecha inicial del cobro');
    if (!partesFecha(config.fechaFinalCobro)) errors.push('Falta la fecha final del primer cobro');
    if (partesFecha(config.fechaInicialCobro) && partesFecha(config.fechaFinalCobro)
        && diasEntre(config.fechaInicialCobro, config.fechaFinalCobro) === 0) {
        errors.push('La fecha final del cobro debe ser igual o posterior a la inicial');
    }
    const dias = num(config.diasCobrados);
    if (dias <= 0) errors.push('Los días cobrados deben ser mayores a cero');
    const pct = num(config.pctDerechos);
    if (pct < 0 || pct > 100) errors.push('El porcentaje de derechos debe estar entre 0 y 100');
    for (const o of config.otros || []) {
        if (!String(o.concepto || '').trim()) errors.push('Todo cargo/descuento necesita un concepto');
        if (num(o.valor) <= 0) errors.push(`El valor de "${o.concepto || 'cargo/descuento'}" debe ser mayor a cero`);
    }
    for (const a of config.abonosPrevios || []) {
        if (num(a.valor) <= 0) errors.push('Todo abono necesita un valor mayor a cero');
    }
    return errors;
}

// Calcula la liquidación completa a partir de { origen, config } y los pagos
// registrados. Devuelve las líneas de cobro y todos los totales; nunca lanza
// con datos incompletos (devuelve ceros) para poder usarse como resumen en vivo.
export function calcularLiquidacion({ origen = {}, config = {} } = {}, pagos = []) {
    const canonMensual = num(origen.canonMensual);
    const admonMensual = num(origen.administracionMensual);
    const dias = Math.max(0, num(config.diasCobrados));
    const divisorMes = diasDelMes(config.fechaInicialCobro) || 30;

    const lineas = [];

    // — Proporcional del primer período —
    const canonDia = canonMensual / divisorMes;
    const canonProporcional = Math.round(canonDia * dias);
    if (canonMensual > 0) {
        lineas.push({
            tipo: 'PROPORCIONAL',
            concepto: 'Canon de arrendamiento',
            detalle: `$${canonMensual.toLocaleString('es-CO')} ÷ ${divisorMes} días × ${dias} días`,
            base: canonProporcional, iva: 0, total: canonProporcional,
        });
    }

    let admonCobrada = 0;
    if (admonMensual > 0 && config.admonModo !== 'NO_COBRAR') {
        const completa = config.admonModo === 'COMPLETA';
        admonCobrada = completa ? admonMensual : Math.round((admonMensual / 30) * dias);
        lineas.push({
            tipo: 'PROPORCIONAL',
            concepto: 'Cuota de administración',
            detalle: completa ? 'Mes completo' : `$${admonMensual.toLocaleString('es-CO')} ÷ 30 días × ${dias} días`,
            base: admonCobrada, iva: 0, total: admonCobrada,
        });
    }
    const subtotalProporcional = canonProporcional + admonCobrada;

    // — Servicios —
    const pct = num(config.pctDerechos);
    if (pct > 0) {
        const base = Math.round((canonMensual + admonMensual) * pct / 100);
        const ivaDerechos = iva(base, config.aplicaIvaDerechos);
        lineas.push({
            tipo: 'SERVICIO',
            concepto: 'Derechos de contrato y firma digital',
            detalle: `${pct}% de canon + administración`,
            base, iva: ivaDerechos, total: base + ivaDerechos,
        });
    }
    const estudio = num(config.estudioValor);
    if (estudio > 0) {
        const ivaEstudio = iva(estudio, config.aplicaIvaEstudio);
        lineas.push({
            tipo: 'SERVICIO', concepto: 'Estudio aseguradora', detalle: '',
            base: estudio, iva: ivaEstudio, total: estudio + ivaEstudio,
        });
    }
    const poliza = num(config.polizaValor);
    if (poliza > 0) {
        const ivaPoliza = iva(poliza, config.aplicaIvaPoliza);
        lineas.push({
            tipo: 'SERVICIO', concepto: 'Póliza', detalle: '',
            base: poliza, iva: ivaPoliza, total: poliza + ivaPoliza,
        });
    }

    // — Otros cargos y descuentos —
    for (const o of config.otros || []) {
        const valor = num(o.valor);
        if (valor <= 0) continue;
        const descuento = o.tipo === 'DESCUENTO';
        const ivaOtro = descuento ? 0 : iva(valor, o.aplicaIva);
        const signo = descuento ? -1 : 1;
        lineas.push({
            tipo: descuento ? 'DESCUENTO' : 'OTRO',
            concepto: String(o.concepto || '').trim() || (descuento ? 'Descuento' : 'Otro cargo'),
            detalle: '',
            base: signo * valor, iva: ivaOtro, total: signo * valor + ivaOtro,
        });
    }

    // — Numeración e itemización por grupos —
    // El número de ítem y la letra del grupo son la columna vertebral del
    // documento: la tabla, los subtotales y el total se citan entre sí con
    // ellos, de modo que el IVA se presenta UNA sola vez (columna propia) y
    // nunca se re-suma abajo. Solo se numeran los grupos con líneas.
    lineas.forEach((l, i) => {
        l.num = i + 1;
        l.grupo = GRUPO_DE_TIPO[l.tipo] || 'OTROS';
    });
    const grupos = GRUPOS
        .map(({ clave, titulo }) => {
            const items = lineas.filter((l) => l.grupo === clave);
            return {
                clave,
                titulo,
                nums: items.map((l) => l.num),
                base: items.reduce((s, l) => s + l.base, 0),
                iva: items.reduce((s, l) => s + l.iva, 0),
                total: items.reduce((s, l) => s + l.total, 0),
            };
        })
        .filter((g) => g.nums.length > 0)
        .map((g, i) => ({ ...g, letra: LETRAS[i] }));

    const totalBase = lineas.reduce((s, l) => s + l.base, 0);
    const totalIva = lineas.reduce((s, l) => s + l.iva, 0);
    const totalGeneral = totalBase + totalIva;
    // Ítems que llevan IVA — la nota al pie del documento los cita para que
    // quede claro que ya viene incluido en el total y no se suma otra vez.
    const itemsConIva = lineas.filter((l) => l.iva > 0).map((l) => l.num);

    // — Abonos: los previos (config) + los pagos registrados en el sistema —
    const abonos = [
        ...(config.abonosPrevios || []).map((a) => ({
            fecha: a.fecha || null, valor: num(a.valor), nota: a.nota || 'Abono previo', registrado: false,
        })),
        ...pagos.map((p) => ({
            fecha: p.fecha || null, valor: num(p.valor), nota: p.nota || 'Pago registrado', registrado: true,
        })),
    ].filter((a) => a.valor > 0);
    const totalAbonos = abonos.reduce((s, a) => s + a.valor, 0);

    const saldoRaw = totalGeneral - totalAbonos;
    return {
        canonDia: Math.round(canonDia),
        divisorMes,
        dias,
        lineas,
        grupos,
        subtotalProporcional,
        totalBase,
        totalIva,
        itemsConIva,
        totalGeneral,
        abonos,
        totalAbonos,
        saldoRaw,
        saldo: Math.max(0, saldoRaw),
        pagada: totalGeneral > 0 && saldoRaw <= 0,
    };
}
