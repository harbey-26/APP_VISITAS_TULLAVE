// Definición declarativa de los contratos que la inmobiliaria diligencia:
// tipos, campos por sección (con pre-llenado desde una visita), estados del
// flujo de aprobación y validación. Compartido por frontend (formulario y
// vista previa) y backend (validación al crear/editar).
//
// Tipos de campo: text, textarea, email, phone, date, money, number, select,
// checkbox, list (grupo repetible con itemFields).
// `showIf: { key, equals }` — el campo solo aplica si data[key] === equals.
// `prefill` — clave de origen al crear desde una visita:
//   clientName | clientPhone | clientEmail | address | conjunto

export const EMPRESA = {
    razonSocial: 'TU LLAVE INMOBILIARIA S.A.S',
    nit: '901.090.444-1',
    matriculaMercantil: '02831426',
    fechaMatricula: 'veinte (20) de junio de dos mil diecisiete (2017)',
    matriculaArrendador: '20170149',
    representanteLegal: 'JOSÉ DANIEL PERDOMO MONTOYA',
    cedulaRepresentante: '1.072.962.752',
    direccion: 'Cra 11 No. 90 – 07 Of 406',
    ciudad: 'Bogotá D.C.',
    telefono: '(1) 463 0137',
    celular: '319 401 5500',
    email: 'info@tullaveinmobiliaria.com.co',
    emailAdministrativo: 'gerenciaadministrativa@tullaveinmobiliaria.com.co',
    bancoRecaudo: 'Banco Davivienda',
    cuentaRecaudo: 'cuenta de Ahorros No. 009100739565',
};

// Estados del flujo: el agente diligencia (DRAFT), envía a revisión
// (PENDING_APPROVAL), el admin aprueba (APPROVED) o devuelve (REJECTED,
// vuelve a ser editable), y tras compartirse queda SENT (fase 2).
// REOPENED = un contrato aprobado que se reabrió para corregir un error;
// vuelve a ser editable y debe pasar de nuevo por aprobación del admin.
export const CONTRACT_STATUS = {
    DRAFT: { label: 'Borrador', badge: 'bg-gray-100 text-gray-700' },
    REOPENED: { label: 'En corrección', badge: 'bg-orange-100 text-orange-700' },
    PENDING_APPROVAL: { label: 'En revisión', badge: 'bg-amber-100 text-amber-700' },
    APPROVED: { label: 'Aprobado', badge: 'bg-emerald-100 text-emerald-700' },
    REJECTED: { label: 'Devuelto', badge: 'bg-red-100 text-red-700' },
    SENT: { label: 'Enviado', badge: 'bg-blue-100 text-blue-700' },
};

// Estados en los que el agente puede editar/reenviar el contrato.
export const EDITABLE_STATUSES = ['DRAFT', 'REJECTED', 'REOPENED'];

// Estados desde los que un contrato aprobado puede reabrirse para corregir.
// SENT queda fuera por ahora: el cliente ya tiene el link/PDF enviado.
export const REOPENABLE_STATUSES = ['APPROVED'];

const TIPOS_INMUEBLE = ['Apartamento', 'Casa', 'Local', 'Oficina', 'Bodega', 'Consultorio'];

export const CONTRACT_TEMPLATES = {
    ADMINISTRACION: {
        label: 'Contrato de administración de inmueble',
        shortLabel: 'Administración',
        description: 'El propietario entrega el inmueble a TuLlave para administrarlo y arrendarlo.',
        // #23: la fecha final se calcula sola a partir de inicio + vigencia
        autoEndDate: { start: 'fechaInicio', months: 'duracionMeses', end: 'fechaTerminacion' },
        sections: [
            {
                title: 'Propietario / Mandante',
                fields: [
                    { key: 'propietarioNombre', label: 'Nombre completo', type: 'text', required: true, prefill: 'clientName' },
                    { key: 'propietarioCedula', label: 'No. de identificación', type: 'text', required: true },
                    { key: 'propietarioDireccion', label: 'Dirección de notificación (calle)', type: 'address', required: true },
                    { key: 'propietarioTorre', label: 'Torre / Bloque de notificación', type: 'text', hint: 'Opcional' },
                    { key: 'propietarioApto', label: 'Apartamento / Oficina de notificación', type: 'text', hint: 'Opcional' },
                    { key: 'propietarioConjunto', label: 'Conjunto / Edificio de notificación', type: 'text', hint: 'Opcional' },
                    { key: 'propietarioTelefono', label: 'Teléfono', type: 'phone', required: true, prefill: 'clientPhone' },
                    { key: 'propietarioEmail', label: 'Correo electrónico', type: 'email', prefill: 'clientEmail' },
                    {
                        key: 'otrosPropietarios', label: 'Otro propietario', type: 'list', default: [],
                        hint: 'Si el inmueble tiene más de un dueño, agrégalos aquí',
                        itemFields: [
                            { key: 'nombre', label: 'Nombre completo', type: 'text', required: true },
                            { key: 'cedula', label: 'No. de identificación', type: 'text', required: true },
                            { key: 'direccion', label: 'Dirección de notificación', type: 'address', required: true },
                            { key: 'telefono', label: 'Teléfono', type: 'phone' },
                            { key: 'email', label: 'Correo electrónico', type: 'email' },
                        ],
                    },
                ],
            },
            {
                title: 'Inmueble',
                fields: [
                    { key: 'tipoInmueble', label: 'Tipo de inmueble', type: 'select', required: true, options: TIPOS_INMUEBLE },
                    { key: 'ciudadInmueble', label: 'Ciudad de ubicación', type: 'text', required: true, default: 'Bogotá D.C.' },
                    { key: 'direccionInmueble', label: 'Dirección del inmueble (calle)', type: 'address', required: true, prefill: 'address' },
                    { key: 'torreInmueble', label: 'Torre / Bloque', type: 'text', hint: 'Opcional. Ej.: Torre 2' },
                    { key: 'aptoInmueble', label: 'Apartamento / Interior', type: 'text', hint: 'Opcional. Ej.: Apto 706' },
                    { key: 'conjunto', label: 'Conjunto / Edificio (si aplica)', type: 'text', prefill: 'conjunto' },
                    { key: 'matriculaInmobiliaria', label: 'Matrícula inmobiliaria', type: 'text', required: true },
                    { key: 'estrato', label: 'Estrato', type: 'select', options: ['1', '2', '3', '4', '5', '6'] },
                    { key: 'chip', label: 'Chip catastral', type: 'text' },
                    { key: 'cedulaCatastral', label: 'Cédula catastral', type: 'text' },
                    { key: 'areaM2', label: 'Área (m²)', type: 'text', required: true },
                    { key: 'areaTerraza', label: 'Área terraza / balcón', type: 'text', default: 'N/A' },
                    { key: 'escrituraNumero', label: 'Escritura pública No. (linderos)', type: 'text', required: true },
                    { key: 'escrituraFecha', label: 'Fecha de la escritura', type: 'date', required: true },
                    { key: 'escrituraNotaria', label: 'Notaría', type: 'text', required: true, hint: 'Ej.: Notaría Veintiuno de Bogotá D.C.' },
                    { key: 'garajes', label: 'Tiene garaje(s)', type: 'checkbox', default: false },
                    { key: 'numeroGarajes', label: 'Número de garaje(s)', type: 'text', showIf: { key: 'garajes', equals: true } },
                    { key: 'deposito', label: 'Tiene depósito', type: 'checkbox', default: false },
                    { key: 'numeroDeposito', label: 'Número de depósito', type: 'text', showIf: { key: 'deposito', equals: true } },
                    { key: 'gravamenes', label: 'Tiene gravámenes / limitaciones', type: 'checkbox', default: false },
                    { key: 'tipoGravamen', label: 'Tipo de gravamen', type: 'text', showIf: { key: 'gravamenes', equals: true } },
                    { key: 'regimenPH', label: 'Sometido a propiedad horizontal', type: 'checkbox', default: true },
                    { key: 'cuotaAdministracion', label: 'Cuota de administración ($)', type: 'money', showIf: { key: 'regimenPH', equals: true } },
                ],
            },
            {
                title: 'Condiciones del contrato',
                fields: [
                    { key: 'fechaInicio', label: 'Fecha de inicio', type: 'date', required: true },
                    { key: 'duracionMeses', label: 'Duración (meses)', type: 'number', required: true, default: 12 },
                    { key: 'fechaTerminacion', label: 'Fecha de terminación', type: 'date', required: true, hint: 'Se calcula sola con inicio + duración; puedes ajustarla' },
                    { key: 'canon', label: 'Canon de arrendamiento ($)', type: 'money', required: true },
                    { key: 'aplicaIva', label: 'El canon genera IVA', type: 'checkbox', default: false },
                    { key: 'reajuste', label: 'Reajuste', type: 'text', default: 'IPC' },
                    {
                        key: 'comisionDescripcion', label: 'Comisión por administración', type: 'textarea', required: true,
                        default: '6% más IVA 19% durante los primeros seis (6) meses; 8% más IVA 19% en adelante',
                        hint: 'Porcentajes y períodos tal como deben quedar en el contrato',
                    },
                    { key: 'fianzaPct', label: 'Fianza / póliza de arrendamiento (%)', type: 'number', required: true, default: 3 },
                ],
            },
            {
                title: 'Firma',
                fields: [
                    { key: 'ciudadFirma', label: 'Ciudad de firma', type: 'text', required: true, default: 'Bogotá D.C.' },
                    { key: 'fechaFirma', label: 'Fecha de firma', type: 'date', required: true, default: 'today' },
                ],
            },
        ],
    },

    ARRENDAMIENTO: {
        label: 'Contrato de arrendamiento para inmueble de vivienda urbana',
        shortLabel: 'Arrendamiento',
        description: 'Contrato entre TuLlave (arrendador) y el inquilino, con deudores solidarios.',
        // #23: la fecha final se calcula sola a partir de inicio + vigencia
        autoEndDate: { start: 'fechaInicio', months: 'duracionMeses', end: 'fechaVencimiento' },
        sections: [
            {
                title: 'Arrendatario',
                fields: [
                    { key: 'arrendatarioNombre', label: 'Nombre completo', type: 'text', required: true, prefill: 'clientName' },
                    { key: 'arrendatarioCedula', label: 'C.C. No.', type: 'text', required: true },
                    { key: 'arrendatarioLugarExpedicion', label: 'Lugar de expedición', type: 'text', required: true, default: 'Bogotá D.C.' },
                    { key: 'arrendatarioDireccion', label: 'Dirección de notificación (calle)', type: 'address', required: true, hint: 'Independiente de la del inmueble; puede ser otra' },
                    { key: 'arrendatarioTorre', label: 'Torre / Bloque de notificación', type: 'text', hint: 'Opcional. Ej.: Torre 2' },
                    { key: 'arrendatarioApto', label: 'Apartamento / Oficina de notificación', type: 'text', hint: 'Opcional. Ej.: Apto 706' },
                    { key: 'arrendatarioConjunto', label: 'Conjunto / Edificio de notificación', type: 'text', hint: 'Opcional' },
                    { key: 'arrendatarioCiudad', label: 'Ciudad', type: 'text', required: true, default: 'Bogotá D.C.' },
                    { key: 'arrendatarioCelular', label: 'Celular', type: 'phone', required: true, prefill: 'clientPhone' },
                    { key: 'arrendatarioEmail', label: 'Correo electrónico', type: 'email', prefill: 'clientEmail' },
                ],
            },
            {
                title: 'Deudores solidarios',
                fields: [
                    {
                        key: 'deudores', label: 'Deudor solidario', type: 'list', default: [],
                        itemFields: [
                            { key: 'nombre', label: 'Nombre completo', type: 'text', required: true },
                            { key: 'cedula', label: 'C.C. No.', type: 'text', required: true },
                            { key: 'lugarExpedicion', label: 'Lugar de expedición', type: 'text', default: 'Bogotá D.C.' },
                            { key: 'direccion', label: 'Dirección de notificación', type: 'address', required: true },
                            { key: 'ciudad', label: 'Ciudad', type: 'text', default: 'Bogotá D.C.' },
                            { key: 'celular', label: 'Celular', type: 'phone' },
                            { key: 'email', label: 'Correo electrónico', type: 'email' },
                        ],
                    },
                ],
            },
            {
                title: 'Inmueble y condiciones',
                fields: [
                    { key: 'direccionInmueble', label: 'Dirección del inmueble (calle)', type: 'address', required: true, prefill: 'address' },
                    { key: 'torreInmueble', label: 'Torre / Bloque', type: 'text', hint: 'Opcional. Ej.: Torre 2' },
                    { key: 'aptoInmueble', label: 'Apartamento / Interior', type: 'text', hint: 'Opcional. Ej.: Apto 706' },
                    { key: 'conjuntoInmueble', label: 'Conjunto / Edificio', type: 'text', hint: 'Opcional. Como aparece en el certificado de libertad', prefill: 'conjunto' },
                    { key: 'ciudadInmueble', label: 'Ciudad', type: 'text', required: true, default: 'Bogotá D.C.' },
                    { key: 'fechaInicio', label: 'Fecha de iniciación', type: 'date', required: true },
                    { key: 'duracionMeses', label: 'Vigencia (meses)', type: 'number', required: true, default: 12 },
                    { key: 'fechaVencimiento', label: 'Fecha de vencimiento', type: 'date', required: true, hint: 'Se calcula sola con iniciación + vigencia; puedes ajustarla' },
                    { key: 'canon', label: 'Canon de arrendamiento mensual ($)', type: 'money', required: true },
                    { key: 'cuotaAdministracion', label: 'Cuota de administración mensual ($)', type: 'money', hint: 'Dejar vacío si no aplica' },
                ],
            },
            {
                title: 'Firma',
                fields: [
                    { key: 'ciudadFirma', label: 'Ciudad de firma', type: 'text', required: true, default: 'Bogotá D.C.' },
                    { key: 'fechaFirma', label: 'Fecha de firma', type: 'date', required: true, default: 'today' },
                ],
            },
        ],
    },
};

export function getTemplate(type) {
    return CONTRACT_TEMPLATES[type] || null;
}

// Fecha local "YYYY-MM-DD" (nunca UTC — regla del proyecto para Bogotá).
function hoyLocal() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

// ¿El campo aplica según las respuestas actuales? (showIf declarativo)
export function fieldApplies(field, data) {
    if (!field.showIf) return true;
    return (data?.[field.showIf.key] ?? false) === field.showIf.equals;
}

// Objeto de datos inicial con los defaults de la plantilla.
export function emptyFormData(type) {
    const template = getTemplate(type);
    if (!template) return {};
    const data = {};
    for (const section of template.sections) {
        for (const f of section.fields) {
            if (f.type === 'list') data[f.key] = [];
            else if (f.type === 'checkbox') data[f.key] = f.default ?? false;
            else if (f.default === 'today') data[f.key] = hoyLocal();
            else data[f.key] = f.default != null ? String(f.default) : '';
        }
    }
    return data;
}

// Pre-llenado desde una visita (con property incluido). Devuelve solo los
// campos con dato disponible, para mezclar sobre emptyFormData.
export function prefillFromVisit(type, visit) {
    const template = getTemplate(type);
    if (!template || !visit) return {};
    const sources = {
        clientName: visit.clientName || '',
        clientPhone: visit.clientPhone || '',
        clientEmail: visit.clientEmail || '',
        address: visit.property?.address || '',
        conjunto: visit.property?.client || '',
    };
    const data = {};
    const upperTypes = ['text', 'address', 'phone'];
    for (const section of template.sections) {
        for (const f of section.fields) {
            if (!f.prefill || !sources[f.prefill]) continue;
            // El formulario guarda en mayúsculas; el pre-llenado también
            data[f.key] = upperTypes.includes(f.type)
                ? String(sources[f.prefill]).toUpperCase()
                : sources[f.prefill];
        }
    }
    return data;
}

// Valida los datos del formulario contra la plantilla. Devuelve lista de
// mensajes de error (vacía si todo está bien). Usada por frontend y backend.
export function validateContractData(type, data) {
    const template = getTemplate(type);
    if (!template) return ['Tipo de contrato desconocido'];
    if (!data || typeof data !== 'object') return ['Datos del contrato inválidos'];

    const errors = [];
    const requiredMissing = (value) =>
        value == null || (typeof value === 'string' && value.trim() === '');

    for (const section of template.sections) {
        for (const f of section.fields) {
            if (!fieldApplies(f, data)) continue;
            const value = data[f.key];
            if (f.type === 'list') {
                const items = Array.isArray(value) ? value : [];
                items.forEach((item, i) => {
                    for (const sub of f.itemFields) {
                        if (sub.required && requiredMissing(item?.[sub.key])) {
                            errors.push(`${f.label} ${i + 1}: falta "${sub.label}"`);
                        }
                    }
                });
                continue;
            }
            if (f.required && requiredMissing(value)) {
                errors.push(`Falta "${f.label}" (${section.title})`);
            }
            if ((f.type === 'money' || f.type === 'number') && value != null && String(value).trim() !== '') {
                const n = Number(value);
                if (isNaN(n) || n < 0) errors.push(`"${f.label}" debe ser un número válido`);
            }
        }
    }
    return errors;
}
