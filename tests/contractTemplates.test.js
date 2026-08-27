import { describe, it, expect } from 'vitest';
import {
    CONTRACT_TEMPLATES, CONTRACT_STATUS, EDITABLE_STATUSES, REOPENABLE_STATUSES,
    emptyFormData, prefillFromVisit, validateContractData, fieldApplies,
} from '../src/utils/contractTemplates.js';
import { buildContractDocument } from '../src/utils/contractDocument.js';

// Flujo de estados y reapertura (corregir un contrato aprobado).
describe('estados del contrato', () => {
    it('REOPENED existe, es editable y NO se puede compartir', () => {
        expect(CONTRACT_STATUS.REOPENED).toBeTruthy();
        expect(EDITABLE_STATUSES).toContain('REOPENED');
    });

    it('solo los aprobados son reabribles (los enviados no, por ahora)', () => {
        expect(REOPENABLE_STATUSES).toEqual(['APPROVED']);
        expect(REOPENABLE_STATUSES).not.toContain('SENT');
    });
});

// Integridad de las definiciones de plantilla.
describe('CONTRACT_TEMPLATES', () => {
    it('define los dos tipos con secciones y campos con key/label/type', () => {
        for (const type of ['ADMINISTRACION', 'ARRENDAMIENTO']) {
            const t = CONTRACT_TEMPLATES[type];
            expect(t.sections.length).toBeGreaterThan(0);
            for (const s of t.sections) {
                for (const f of s.fields) {
                    expect(f.key, `${type}/${s.title}`).toBeTruthy();
                    expect(f.label).toBeTruthy();
                    expect(f.type).toBeTruthy();
                }
            }
        }
    });

    it('no repite keys dentro de una plantilla', () => {
        for (const t of Object.values(CONTRACT_TEMPLATES)) {
            const keys = t.sections.flatMap((s) => s.fields.map((f) => f.key));
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
});

describe('emptyFormData / fieldApplies', () => {
    it('aplica defaults (checkbox, listas, fecha de hoy)', () => {
        const d = emptyFormData('ARRENDAMIENTO');
        expect(d.deudores).toEqual([]);
        expect(d.ciudadFirma).toBe('Bogotá D.C.');
        expect(d.duracionMeses).toBe('12');
        expect(d.fechaFirma).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('showIf oculta campos condicionados', () => {
        const field = { key: 'numeroGarajes', showIf: { key: 'garajes', equals: true } };
        expect(fieldApplies(field, { garajes: false })).toBe(false);
        expect(fieldApplies(field, { garajes: true })).toBe(true);
    });
});

describe('prefillFromVisit', () => {
    const visit = {
        clientName: 'Irma Lucía Valenzuela',
        clientPhone: '3142154621',
        clientEmail: 'milu@example.com',
        property: { address: 'KR 135 17 84 TO 2 AP 1501', client: 'Estación Fontibón PH' },
    };

    it('mapea cliente y propiedad a los campos de administración (en MAYÚSCULAS)', () => {
        const d = prefillFromVisit('ADMINISTRACION', visit);
        expect(d.propietarioNombre).toBe('IRMA LUCÍA VALENZUELA');
        expect(d.propietarioTelefono).toBe('3142154621');
        expect(d.direccionInmueble).toBe('KR 135 17 84 TO 2 AP 1501');
        expect(d.conjunto).toBe('ESTACIÓN FONTIBÓN PH');
    });

    it('mapea al arrendatario en arrendamiento y conserva el correo tal cual', () => {
        const d = prefillFromVisit('ARRENDAMIENTO', visit);
        expect(d.arrendatarioNombre).toBe('IRMA LUCÍA VALENZUELA');
        expect(d.direccionInmueble).toBe('KR 135 17 84 TO 2 AP 1501');
        expect(d.arrendatarioEmail).toBe('milu@example.com'); // los correos no se tocan
    });

    it('tolera visita nula', () => {
        expect(prefillFromVisit('ADMINISTRACION', null)).toEqual({});
    });
});

describe('validateContractData', () => {
    it('reporta los requeridos faltantes', () => {
        const errors = validateContractData('ADMINISTRACION', emptyFormData('ADMINISTRACION'));
        expect(errors.some((e) => e.includes('Nombre completo'))).toBe(true);
        expect(errors.some((e) => e.includes('Canon'))).toBe(true);
    });

    it('no exige campos ocultos por showIf', () => {
        const data = { ...emptyFormData('ADMINISTRACION'), garajes: false };
        const errors = validateContractData('ADMINISTRACION', data);
        expect(errors.some((e) => e.includes('garaje'))).toBe(false);
    });

    it('valida requeridos dentro de la lista de deudores', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), deudores: [{ nombre: 'Ramón' }] };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Deudor solidario 1'))).toBe(true);
    });

    it('sin deudores no exige nada: el codeudor es opcional', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), deudores: [] };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Deudor solidario'))).toBe(false);
    });

    it('una tarjeta de deudor agregada pero dejada en blanco no bloquea el envío', () => {
        // Así queda la tarjeta al pulsar "Agregar": vacía salvo los defaults
        const enBlanco = {
            nombre: '', cedula: '', lugarExpedicion: 'Bogotá D.C.', direccion: '',
            torre: '', apto: '', conjunto: '', ciudad: 'Bogotá D.C.', celular: '', email: '',
        };
        const data = { ...emptyFormData('ARRENDAMIENTO'), deudores: [enBlanco] };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Deudor solidario'))).toBe(false);
    });

    it('una tarjeta en blanco con los defaults en MAYÚSCULAS tampoco bloquea', () => {
        // El formulario guarda los textos en mayúsculas: si el agente tocó un
        // campo con default, la tarjeta "vacía" trae 'BOGOTÁ D.C.'
        const enBlancoUpper = {
            nombre: '', cedula: '', lugarExpedicion: 'BOGOTÁ D.C.', direccion: '',
            torre: '', apto: '', conjunto: '', ciudad: 'BOGOTÁ D.C.', celular: '', email: '',
        };
        const data = { ...emptyFormData('ARRENDAMIENTO'), deudores: [enBlancoUpper] };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Deudor solidario'))).toBe(false);
    });

    it('una tarjeta parcialmente diligenciada sí sigue exigiendo sus requeridos', () => {
        const parcial = { nombre: '', cedula: '', lugarExpedicion: 'Bogotá D.C.', direccion: '', ciudad: 'Bogotá D.C.', celular: '3001234567' };
        const data = { ...emptyFormData('ARRENDAMIENTO'), deudores: [parcial] };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Deudor solidario 1'))).toBe(true);
    });

    it('rechaza montos no numéricos', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), canon: 'abc' };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Canon'))).toBe(true);
    });

    it('tipo desconocido', () => {
        expect(validateContractData('OTRO', {})).toEqual(['Tipo de contrato desconocido']);
    });
});

describe('buildContractDocument', () => {
    // #22: los valores dinámicos llevan un centinela invisible (negrilla); se
    // quita para poder comparar el texto plano.
    const clean = (s) => String(s).split(String.fromCharCode(1)).join('');
    const textoCompleto = (doc) => clean(doc.blocks
        .map((b) => [b.lead, b.text, b.label, b.value].filter(Boolean).join(' '))
        .join('\n'));

    it('administración: interpola datos en cuadro resumen y cláusulas', () => {
        const data = {
            ...emptyFormData('ADMINISTRACION'),
            propietarioNombre: 'IRMA LUCÍA VALENZUELA',
            canon: '1047100',
            fianzaPct: '3',
            fechaInicio: '2026-08-01',
            regimenPH: true,
            cuotaAdministracion: '152900',
        };
        const doc = buildContractDocument('ADMINISTRACION', data);
        expect(doc.title).toBe('CONTRATO DE ADMINISTRACIÓN DE INMUEBLES'); // plural, como la proforma
        expect(doc.pageHeader.title).toBe('CONTRATO DE ADMINISTRACIÓN DE INMUEBLES');
        const table = doc.blocks.find((b) => b.kind === 'table');
        const flat = clean(table.rows.map((r) => r.join(': ')).join('\n'));
        expect(flat).toContain('IRMA LUCÍA VALENZUELA');
        expect(flat).toContain('UN MILLÓN CUARENTA Y SIETE MIL CIEN PESOS ($1.047.100)');
        const leads = doc.blocks.filter((b) => b.kind === 'clause').map((b) => b.lead).join('\n');
        expect(leads).toContain('CLÁUSULA VIGÉSIMA PRIMERA');
        expect(textoCompleto(doc)).toContain('Ley 527 de 1999');
    });

    it('administración: soporta varios propietarios (cuadro resumen + firmas)', () => {
        const data = {
            ...emptyFormData('ADMINISTRACION'),
            propietarioNombre: 'IRMA VALENZUELA', propietarioCedula: '1016',
            otrosPropietarios: [
                { nombre: 'CARLOS PÉREZ', cedula: '79906', direccion: 'CL 1', telefono: '300', email: 'c@x.com' },
                { nombre: 'ANA GÓMEZ', cedula: '52001', direccion: 'CL 2' },
            ],
        };
        const doc = buildContractDocument('ADMINISTRACION', data);
        const table = doc.blocks.find((b) => b.kind === 'table');
        const flat = clean(table.rows.map((r) => r.join(': ')).join('\n'));
        // numerados cuando hay varios dueños
        expect(flat).toContain('Propietario 1/Mandante: IRMA VALENZUELA');
        expect(flat).toContain('Propietario 2/Mandante: CARLOS PÉREZ');
        expect(flat).toContain('Propietario 3/Mandante: ANA GÓMEZ');
        // una firma de mandante por cada propietario + el administrador
        const firmas = doc.blocks.filter((b) => b.kind === 'signature');
        const roles = firmas.map((f) => f.role);
        expect(roles).toEqual(['MANDANTE 1', 'MANDANTE 2', 'MANDANTE 3', 'ADMINISTRADOR']);
    });

    it('administración: un solo propietario mantiene el formato original', () => {
        const data = { ...emptyFormData('ADMINISTRACION'), propietarioNombre: 'IRMA VALENZUELA' };
        const doc = buildContractDocument('ADMINISTRACION', data);
        const table = doc.blocks.find((b) => b.kind === 'table');
        const flat = clean(table.rows.map((r) => r.join(': ')).join('\n'));
        expect(flat).toContain('Propietario/Mandante: IRMA VALENZUELA');
        expect(flat).not.toContain('Propietario 1/Mandante');
        const firmas = doc.blocks.filter((b) => b.kind === 'signature');
        expect(firmas.map((f) => f.role)).toEqual(['MANDANTE(S)', 'ADMINISTRADOR']);
    });

    it('arrendamiento: TERCERA lleva el canon (no la suma) y la cuota aparte', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            arrendatarioNombre: 'MARÍA RIVERA',
            canon: '1047100',
            cuotaAdministracion: '152900',
            fechaInicio: '2026-08-01',
            deudores: [{ nombre: 'RAMÓN MARTÍNEZ', cedula: '79.906.371', lugarExpedicion: 'Bogotá D.C.' }],
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const tercera = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('TERCERA'));
        expect(clean(tercera.text)).toContain('arrendamiento es la suma de UN MILLÓN CUARENTA Y SIETE MIL CIEN PESOS ($1.047.100)');
        expect(clean(tercera.text)).toContain('CIENTO CINCUENTA Y DOS MIL NOVECIENTOS PESOS ($152.900)');
        expect(clean(tercera.text)).not.toContain('$1.200.000'); // nunca la suma
        const texto = textoCompleto(doc);
        expect(texto).toContain('RAMÓN MARTÍNEZ');
        expect(texto).toContain('primero (01) de agosto de dos mil veintiséis (2026)');
        const firmas = doc.blocks.filter((b) => b.kind === 'signature');
        expect(firmas.length).toBe(3); // arrendador + arrendatario + 1 deudor
        expect(doc.pageHeader.code).toBe('F-GCT-005'); // código de formato de la proforma
    });

    it('no duplica la ciudad si la dirección de Google ya la trae', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            direccionInmueble: 'Cl. 17d #111a-35, Bogotá, Colombia',
            ciudadInmueble: 'Bogotá D.C.',
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const segunda = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('SEGUNDA'));
        expect(clean(segunda.text)).toContain('CL. 17D #111A-35, BOGOTÁ, COLOMBIA.');
        expect(clean(segunda.text)).not.toContain('COLOMBIA, BOGOTÁ D.C.');
        expect(clean(segunda.text)).not.toMatch(/\.\./); // sin doble punto final
    });

    it('imprime en MAYÚSCULAS los datos guardados en minúsculas (correos intactos)', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            arrendatarioNombre: 'Jose daniel Perdomo montoya',
            arrendatarioEmail: 'perdomo.16@gmail.com',
            deudores: [{ nombre: 'Laura Daza huertas', cedula: '1030617868', lugarExpedicion: 'Bogotá D.C.', email: 'laura@x.com' }],
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const texto = doc.blocks.map((b) => [b.lead, b.text, b.label, b.value, ...(b.lines || [])].filter(Boolean).join(' ')).join('\n');
        expect(texto).toContain('JOSE DANIEL PERDOMO MONTOYA');
        expect(texto).toContain('LAURA DAZA HUERTAS');
        expect(texto).toContain('perdomo.16@gmail.com'); // correo sin tocar
        expect(texto).not.toContain('Jose daniel');
    });

    it('cláusula SEGUNDA compone Torre/Apto/Conjunto del inmueble (#20/#21)', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            direccionInmueble: 'Cra 98 #2-44', torreInmueble: 'Torre 2',
            aptoInmueble: 'Apto 706', conjuntoInmueble: 'Conjunto Parque Central',
            ciudadInmueble: 'Bogotá D.C.',
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const segunda = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('SEGUNDA'));
        expect(clean(segunda.text)).toContain('CRA 98 #2-44, TORRE 2, APTO 706, CONJUNTO PARQUE CENTRAL');
    });

    it('omite Torre/Apto/Conjunto vacíos en la dirección (ej.: casas)', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), direccionInmueble: 'Cl 50 #10-20', ciudadInmueble: 'Bogotá D.C.' };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const segunda = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('SEGUNDA'));
        expect(clean(segunda.text)).toContain('CL 50 #10-20');
        expect(clean(segunda.text)).not.toMatch(/,\s*,/); // sin comas dobles por campos vacíos
    });

    it('dirección de notificación del arrendatario es independiente y con Torre/Apto (#26)', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            arrendatarioNombre: 'MARIA', arrendatarioDireccion: 'Cra 11 #90-07',
            arrendatarioTorre: 'Torre 3', arrendatarioApto: 'OF 406',
            direccionInmueble: 'Otra dirección del inmueble', ciudadInmueble: 'Bogotá D.C.',
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const firmaArr = doc.blocks.find((b) => b.kind === 'signature' && b.role === 'EL ARRENDATARIO');
        const dir = firmaArr.lines.find((l) => l.startsWith('Dir. Notificación'));
        expect(dir).toContain('CRA 11 #90-07, TORRE 3, OF 406');
        expect(dir).not.toContain('OTRA DIRECCIÓN'); // independiente del inmueble
    });

    it('encabezado usa líneas etiqueta/valor (kv), no tabla, como la proforma', () => {
        const doc = buildContractDocument('ARRENDAMIENTO', emptyFormData('ARRENDAMIENTO'));
        expect(doc.blocks.some((b) => b.kind === 'kv' && b.label === 'ARRENDADOR (ES):')).toBe(true);
        expect(doc.blocks.some((b) => b.kind === 'table')).toBe(false);
    });

    it('sin cuota de administración usa la variante "no aplica"', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), canon: '1000000' };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const quinta = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('QUINTA'));
        expect(quinta.text).toContain('No aplica');
        const primera = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('PRIMERA'));
        expect(primera.text).not.toContain('una cuota de administración');
    });

    it('administración: la notaría se escribe como número y sale en letras con "NOTARÍA" y su ciudad', () => {
        const doc = buildContractDocument('ADMINISTRACION', {
            ...emptyFormData('ADMINISTRACION'), escrituraNotaria: '53', escrituraNotariaCiudad: 'Bogotá D.C.',
        });
        const table = doc.blocks.find((b) => b.kind === 'table');
        const linderos = clean(table.rows.find((r) => /Linderos/i.test(clean(r[0])))[1]);
        expect(linderos).toContain('EN LA NOTARÍA CINCUENTA Y TRES (53) DE BOGOTÁ D.C.');
        expect(linderos).not.toMatch(/EN LA 53\b/); // ya no queda el número pelado
    });

    it('administración: sin ciudad de notaría no queda un "DE" colgando', () => {
        const data = { ...emptyFormData('ADMINISTRACION'), escrituraNotaria: '13' };
        data.escrituraNotariaCiudad = ''; // borrador viejo sin el campo
        const doc = buildContractDocument('ADMINISTRACION', data);
        const table = doc.blocks.find((b) => b.kind === 'table');
        const linderos = clean(table.rows.find((r) => /Linderos/i.test(clean(r[0])))[1]);
        expect(linderos).toContain('EN LA NOTARÍA TRECE (13)');
        expect(linderos).not.toMatch(/\(13\) DE\s*$/);
    });

    it('administración: respeta texto libre de notaría en borradores viejos', () => {
        const doc = buildContractDocument('ADMINISTRACION', { ...emptyFormData('ADMINISTRACION'), escrituraNotaria: 'Notaría 5 de Bogotá' });
        const table = doc.blocks.find((b) => b.kind === 'table');
        const linderos = clean(table.rows.find((r) => /Linderos/i.test(clean(r[0])))[1]);
        expect(linderos).toContain('NOTARÍA 5 DE BOGOTÁ');
    });

    it('arrendamiento: la dirección del deudor solidario compone Torre/Apto/Conjunto', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            deudores: [{ nombre: 'RAMÓN', cedula: '79', direccion: 'Cl 10 #5-20', torre: 'Torre 3', apto: 'Apto 502', conjunto: 'Los Pinos' }],
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const firma = doc.blocks.find((b) => b.kind === 'signature' && /DEUDOR/.test(b.role));
        const dir = firma.lines.find((l) => l.startsWith('Dir. Notificación'));
        expect(clean(dir)).toContain('CL 10 #5-20, TORRE 3, APTO 502, LOS PINOS');
    });

    it('devuelve null para tipo desconocido', () => {
        expect(buildContractDocument('OTRO', {})).toBeNull();
    });
});

// Persona jurídica como parte del contrato (NIT + representante legal).
describe('persona jurídica', () => {
    const clean = (s) => String(s).split(String.fromCharCode(1)).join('');

    it('fieldApplies soporta notEquals (y un dato ausente sigue aplicando)', () => {
        const field = { key: 'lugar', showIf: { key: 'tipo', notEquals: 'Persona jurídica' } };
        expect(fieldApplies(field, { tipo: 'Persona jurídica' })).toBe(false);
        expect(fieldApplies(field, { tipo: 'Persona natural' })).toBe(true);
        expect(fieldApplies(field, {})).toBe(true); // contrato viejo sin el campo
    });

    it('arrendamiento jurídica: exige representante legal y NO lugar de expedición', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            arrendatarioTipoPersona: 'Persona jurídica',
            arrendatarioLugarExpedicion: '',
        };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('representante legal'))).toBe(true);
        expect(errors.some((e) => e.includes('Lugar de expedición'))).toBe(false);
    });

    it('arrendamiento natural: no exige representante legal pero sí lugar de expedición', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), arrendatarioLugarExpedicion: '' };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('representante legal'))).toBe(false);
        expect(errors.some((e) => e.includes('Lugar de expedición'))).toBe(true);
    });

    it('deudor solidario jurídico exige su representante dentro de la lista', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            deudores: [{ tipoPersona: 'Persona jurídica', nombre: 'INVERSIONES XYZ SAS', cedula: '901222333', direccion: 'CL 1' }],
        };
        const errors = validateContractData('ARRENDAMIENTO', data);
        expect(errors.some((e) => e.includes('Deudor solidario 1') && e.includes('representante legal'))).toBe(true);
    });

    it('arrendamiento jurídica: encabezado y firma dicen NIT + representante, sin "DE BOGOTÁ"', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            arrendatarioTipoPersona: 'Persona jurídica',
            arrendatarioNombre: 'Inversiones XYZ SAS',
            arrendatarioCedula: '901222333',
            arrendatarioRepLegalNombre: 'Pedro Páramo',
            arrendatarioRepLegalCedula: '79111222',
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const nit = doc.blocks.find((b) => b.kind === 'kv' && b.label === 'NIT:' && clean(b.value).includes('901.222.333'));
        expect(nit).toBeTruthy();
        const rep = doc.blocks.find((b) => b.kind === 'kv' && b.label === 'REPRESENTANTE LEGAL:');
        expect(clean(rep.value)).toContain('PEDRO PÁRAMO');
        expect(clean(rep.value)).toContain('79.111.222');
        // no queda el "C.C. No. … DE BOGOTÁ" de persona natural
        expect(doc.blocks.some((b) => b.kind === 'kv' && b.label === 'C.C. No.')).toBe(false);
        const firma = doc.blocks.find((b) => b.kind === 'signature' && b.role === 'EL ARRENDATARIO');
        const lineas = firma.lines.map(clean).join('\n');
        expect(lineas).toContain('NIT 901.222.333');
        expect(lineas).toContain('REPRESENTANTE LEGAL: PEDRO PÁRAMO');
        expect(lineas).not.toContain('DE BOGOTÁ');
    });

    it('cláusula de deudores describe a la jurídica con NIT y representante', () => {
        const data = {
            ...emptyFormData('ARRENDAMIENTO'),
            deudores: [{
                tipoPersona: 'Persona jurídica', nombre: 'INVERSIONES XYZ SAS', cedula: '901222333',
                repLegalNombre: 'PEDRO PÁRAMO', repLegalCedula: '79111222', direccion: 'CL 1',
            }],
        };
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const vp = doc.blocks.find((b) => b.kind === 'clause' && b.lead.startsWith('VIGÉSIMA PRIMERA'));
        expect(clean(vp.text)).toContain('identificada con NIT 901.222.333, representada legalmente por PEDRO PÁRAMO');
    });

    it('administración jurídica: cuadro resumen con NIT y representante, y firma el representante', () => {
        const data = {
            ...emptyFormData('ADMINISTRACION'),
            propietarioTipoPersona: 'Persona jurídica',
            propietarioNombre: 'CONSTRUCTORA ABC SAS',
            propietarioCedula: '900111222',
            propietarioRepLegalNombre: 'ANA GÓMEZ',
            propietarioRepLegalCedula: '52001',
        };
        const doc = buildContractDocument('ADMINISTRACION', data);
        const table = doc.blocks.find((b) => b.kind === 'table');
        const flat = clean(table.rows.map((r) => r.join(': ')).join('\n'));
        expect(flat).toContain('NIT: 900.111.222');
        expect(flat).toContain('Representante legal: ANA GÓMEZ — C.C. 52.001');
        expect(flat).not.toContain('No. de Identificación');
        const firma = doc.blocks.find((b) => b.kind === 'signature' && b.role === 'MANDANTE(S)');
        const lineas = firma.lines.map(clean).join('\n');
        expect(lineas).toContain('NOMBRE: ANA GÓMEZ');
        expect(lineas).toContain('Representante legal');
        expect(lineas).toContain('CONSTRUCTORA ABC SAS NIT: 900.111.222');
    });

    it('contratos viejos sin tipo de persona siguen imprimiendo C.C. (retrocompatibilidad)', () => {
        const data = { ...emptyFormData('ARRENDAMIENTO'), arrendatarioNombre: 'MARÍA', arrendatarioCedula: '52123456' };
        delete data.arrendatarioTipoPersona;
        const doc = buildContractDocument('ARRENDAMIENTO', data);
        const cc = doc.blocks.find((b) => b.kind === 'kv' && b.label === 'C.C. No.');
        expect(clean(cc.value)).toContain('52.123.456');
    });
});
