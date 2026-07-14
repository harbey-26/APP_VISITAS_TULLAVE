// Genera el contenido del contrato (bloques de texto con los datos del
// formulario interpolados) replicando las proformas .docx de la inmobiliaria
// (julio 2026). Los bloques son agnósticos del medio: la vista previa HTML y
// el PDF (jspdf) los renderizan cada uno a su manera.
//
// Bloques:
//  - { kind: 'title', text }                        título centrado en negrita
//  - { kind: 'subtitle', text }                     p. ej. "CONDICIONES GENERALES"
//  - { kind: 'kv', label, value }                   línea "Etiqueta   valor" en negrita
//                                                   (encabezado del arrendamiento — la
//                                                   proforma NO usa tabla aquí)
//  - { kind: 'table', rows: [[etiqueta, valor]] }   cuadro resumen (administración)
//  - { kind: 'clause', lead, text }                 cláusula: lead en negrita inline
//                                                   + texto justificado
//  - { kind: 'paragraph', text }                    párrafo simple justificado
//  - { kind: 'signature', role, lines }             bloque de firma
//
// El documento también expone pageHeader (logo + código de formato y/o título
// repetido en cada página, como el membrete de la proforma).
//
// Si el abogado cambia una cláusula, se edita aquí.

import { EMPRESA, getTemplate } from './contractTemplates.js';
import { montoEnLetras, numeroALetras, formatoCifra } from './numeroALetras.js';
import { fechaCorta, fechaCortaCaps, fechaEnLetras } from './fechaLetras.js';

// #22: los valores dinámicos (los que diligencia el usuario) se envuelven en
// una marca para que el PDF y la vista previa los rendericen en NEGRILLA,
// distinguiéndolos del texto fijo de la plantilla. Los datos fijos de la
// empresa (EMPRESA.*) NO se marcan a propósito: no son datos dinámicos.
export const VALUE_MARK = String.fromCharCode(1); // centinela invisible
const b = (s) => (s === '' || s == null ? '' : `${VALUE_MARK}${s}${VALUE_MARK}`);

// Divide una cadena con marcas en segmentos [{ text, bold }].
export function splitMarks(str) {
    return String(str).split(VALUE_MARK)
        .map((text, i) => ({ text, bold: i % 2 === 1 }))
        .filter((s) => s.text !== '');
}

// Quita las marcas (para contextos de estilo uniforme, p. ej. encabezado).
export function stripMarks(str) {
    return String(str).split(VALUE_MARK).join('');
}

// Valor o raya para dejar el espacio visible en borradores incompletos.
const BLANK = '________';
const v = (x) => b(x != null && String(x).trim() !== '' ? String(x).trim() : BLANK);
const money = (x) => (x != null && String(x).trim() !== '' && !isNaN(Number(x))
    ? `${b(montoEnLetras(x))} moneda corriente`
    : b(BLANK));
const cifra = (x) => b(x != null && String(x).trim() !== '' && !isNaN(Number(x))
    ? `$${formatoCifra(x)}`
    : BLANK);
const fecha = (x) => b(fechaCorta(x) || BLANK);
const fechaCaps = (x) => b(fechaCortaCaps(x) || BLANK);
const fechaLetrasB = (x) => b(fechaEnLetras(x) || BLANK); // fecha en letras, en negrilla
const siNo = (x) => b(x ? 'SÍ' : 'NO');

// Notaría: el usuario escribe solo el número (p. ej. 13) y la ciudad aparte;
// el sistema compone "NOTARÍA TRECE (13) DE BOGOTÁ D.C.". Así se evitan
// errores de escritura. Retrocompatible: si en un borrador viejo quedó texto
// libre, lo respeta tal cual (sin anexar la ciudad, para no duplicar
// "de Bogotá") y solo antepone "NOTARÍA" si falta.
const notaria = (x, ciudad) => {
    const raw = x == null ? '' : String(x).trim();
    if (raw === '') return b(BLANK);
    if (/^\d+$/.test(raw) && Number(raw) > 0) {
        const ciudadTxt = ciudad != null && String(ciudad).trim() !== ''
            ? ` DE ${String(ciudad).trim().toUpperCase()}`
            : '';
        return b(`NOTARÍA ${numeroALetras(raw).toUpperCase()} (${Number(raw)})${ciudadTxt}`);
    }
    const up = raw.toUpperCase();
    return b(up.includes('NOTAR') ? up : `NOTARÍA ${up}`);
};

function mesesEnLetras(n) {
    const num = Number(n);
    if (!num || isNaN(num)) return b(BLANK);
    return b(`${numeroALetras(num).toUpperCase()} (${num}) MESES`);
}

// Une dirección y ciudad evitando duplicarla: las direcciones de Google
// Places ya suelen traer "..., Bogotá, Colombia".
// Devuelve texto PLANO (sin marcas); quien lo use decide si va en negrilla,
// para no chocar con sinPuntoFinal ni con el render de tablas.
function direccionCiudad(dir, ciudad) {
    const d = String(dir || '').trim() || BLANK;
    const c = String(ciudad || '').trim();
    if (!c) return d;
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    // "Bogotá D.C." → busca "bogota" dentro de la dirección normalizada
    const cityWord = norm(c).replace(/\bd\.?c\.?\b/g, '').replace(/[^a-z ]/g, ' ').trim().split(/\s+/)[0];
    if (cityWord && norm(d).includes(cityWord)) return d;
    return `${d}, ${c}`;
}

// Quita el punto final para poder cerrar la frase sin duplicarlo.
const sinPuntoFinal = (s) => String(s).replace(/\.+$/, '');

// Compone la dirección completa uniendo la calle base con Torre/Apto/Conjunto
// (los que tengan dato), separados por coma. El agente escribe cada parte con
// su palabra ("Torre 2", "Apto 706"), así que no anteponemos etiquetas (#20/#21/#26).
function componerDireccion(base, ...extras) {
    const partes = [base, ...extras]
        .map((x) => (x == null ? '' : String(x).trim()))
        .filter(Boolean);
    return partes.length ? partes.join(', ') : BLANK;
}

// ─────────────────────────── ADMINISTRACIÓN ───────────────────────────

function buildAdministracion(d) {
    const blocks = [];

    const linderos = `OBRAN EN ESCRITURA PÚBLICA No. ${v(d.escrituraNumero)} DE FECHA ${fechaCaps(d.escrituraFecha)} EN LA ${notaria(d.escrituraNotaria, d.escrituraNotariaCiudad)}`;

    // Copropietarios (además del primero). El texto legal ya está en plural.
    const otrosPropietarios = Array.isArray(d.otrosPropietarios)
        ? d.otrosPropietarios.filter((o) => o?.nombre)
        : [];
    const variosDuenos = otrosPropietarios.length > 0;

    blocks.push({ kind: 'kv', label: 'CIUDAD:', value: `${v(d.ciudadFirma)}   FECHA: ${fechaCaps(d.fechaFirma)}` });
    blocks.push({ kind: 'kv', label: 'ADMINISTRADOR:', value: `${EMPRESA.razonSocial} NIT ${EMPRESA.nit}` });

    // Filas del cuadro resumen para cada propietario (numeradas si hay varios).
    const filasPropietario = (nombre, cedula, direccion, telefono, email, n) => [
        [n ? `Propietario ${n}/Mandante` : 'Propietario/Mandante', v(nombre)],
        ['No. de Identificación', v(cedula)],
        ['Dirección de notificación', v(direccion)],
        ['Teléfono', v(telefono)],
        ['Correo electrónico', v(email)],
    ];

    // Dirección de notificación del primer propietario, con Torre/Apto/Conjunto (#26)
    const dirPropietario = componerDireccion(d.propietarioDireccion, d.propietarioTorre, d.propietarioApto, d.propietarioConjunto);
    // Dirección del inmueble con Torre/Apto (el Conjunto va en su propia fila) (#20/#21)
    const dirInmueble = componerDireccion(d.direccionInmueble, d.torreInmueble, d.aptoInmueble);

    blocks.push({
        kind: 'table',
        rows: [
            ...filasPropietario(d.propietarioNombre, d.propietarioCedula, dirPropietario, d.propietarioTelefono, d.propietarioEmail, variosDuenos ? 1 : null),
            ...otrosPropietarios.flatMap((o, i) => filasPropietario(o.nombre, o.cedula, o.direccion, o.telefono, o.email, i + 2)),
            ['Tipo de Inmueble', v(d.tipoInmueble)],
            ['Ciudad de Ubicación', v(d.ciudadInmueble)],
            ['Dirección', v(dirInmueble)],
            ['Matrícula Inmobiliaria', v(d.matriculaInmobiliaria)],
            ['Estrato', v(d.estrato)],
            ['Cédula Catastral', v(d.cedulaCatastral)],
            ['Chip', v(d.chip)],
            ['Linderos', linderos],
            ['Duración', `${mesesEnLetras(d.duracionMeses)}\nFECHA INICIO: ${fechaCaps(d.fechaInicio)}\nTERMINACIÓN: ${fechaCaps(d.fechaTerminacion)}`],
            ['Canon', money(d.canon)],
            ['Área', `${v(d.areaM2)} m²`],
            ['Área Terraza', v(d.areaTerraza)],
            ['IVA', siNo(d.aplicaIva)],
            ['Reajuste', v(d.reajuste)],
            ['Comisión por Administración', v(d.comisionDescripcion)],
            ['Fianza Integral o póliza de arrendamiento', `${v(d.fianzaPct)}% MÁS IVA 19% — SÍ`],
            ['Garajes', d.garajes ? `SÍ — Número de Garajes: ${v(d.numeroGarajes)}` : 'NO'],
            ['Depósito', d.deposito ? `SÍ — Número de Depósito: ${v(d.numeroDeposito)}` : 'NO'],
            ['Gravámenes/Limitaciones', d.gravamenes ? `SÍ — Tipo: ${v(d.tipoGravamen)}` : 'NO'],
            ...(d.conjunto ? [['Conjunto / Edificio', v(d.conjunto)]] : []),
            ['Reg. de Propiedad Horizontal', siNo(d.regimenPH)],
            ...(d.regimenPH ? [['Cuota de Administración', cifra(d.cuotaAdministracion)]] : []),
        ],
    });

    blocks.push({
        kind: 'paragraph',
        text: `Entre el (la) (los) (las) PROPIETARIO(A)(S)(AS) Y/O MANDANTE(S) identificado(s) en el cuadro resumen y de otra parte ${EMPRESA.razonSocial} identificada con NIT ${EMPRESA.nit}, con domicilio principal en la ciudad de ${EMPRESA.ciudad} y legalmente constituida según acredita con el certificado de existencia y representación legal expedido por la Cámara de Comercio de Bogotá, con matrícula No. ${EMPRESA.matriculaMercantil} del ${EMPRESA.fechaMatricula}, quien se encuentra bajo la inspección, vigilancia y control de la Subsecretaría de Control de Vivienda de la Secretaría Distrital del Hábitat y tiene la Matrícula de Arrendador No. ${EMPRESA.matriculaArrendador} expedida por dicha entidad, quien en adelante se denominará EL ADMINISTRADOR, se ha celebrado el presente contrato de Administración de bienes inmuebles, el cual se regirá por las siguientes:`,
    });

    blocks.push({ kind: 'subtitle', text: 'CLÁUSULAS' });

    const clausulas = [
        ['CLÁUSULA PRIMERA. - OBJETO DEL CONTRATO Y DESCRIPCIÓN DEL INMUEBLE:',
            `EL (LA) (LOS) (LAS) PROPIETARIO(A)(S)(AS) Y/O MANDANTE(S) entrega(n) al ADMINISTRADOR el inmueble identificado y descrito en el cuadro resumen, para que en forma exclusiva, a nombre, por cuenta y riesgo de EL (LA) (LOS) (LAS) PROPIETARIO(A)(S)(AS) Y/O MANDANTE(S), ejerza la gestión de administrar y arrendar, en su propio nombre, a partir de la fecha del presente contrato. PARÁGRAFO. - UBICACIÓN Y LINDEROS: Los linderos del inmueble se encuentran contenidos en la Escritura Pública indicada en el cuadro resumen (documento que se adjunta en copia al presente contrato).`],

        ['CLÁUSULA SEGUNDA. - FACULTADES DEL ADMINISTRADOR:',
            `A) Gestionar por los medios más usuales de publicidad la promoción del inmueble. B) Fijar el valor del canon de arrendamiento, teniendo en cuenta los factores del mercado, tipo de inmueble, destinación, condiciones especiales del contrato ofrecidas por el ARRENDATARIO, las sugerencias realizadas por EL MANDANTE y las reglamentaciones legales vigentes; el propietario debe saber el valor por el cual se va a arrendar y este valor no puede ser fijado a consideración del Administrador. C) Exigir al arrendatario solicitante y bajo la responsabilidad de éste la documentación requerida por la empresa de seguros de arrendamiento o ante la afianzadora para la aprobación de su solicitud. D) Suscribir el contrato de arrendamiento respectivo. E) Generar la facturación del canon de arrendamiento y demás emolumentos que deba asumir el arrendatario. F) Autorizar las prórrogas del contrato de arrendamiento que soliciten los arrendatarios, siempre y cuando el requerimiento se haga dentro de los términos exigidos por la Ley, debidamente justificadas y con autorización del propietario. G) Dar aviso de desahucio en los términos previstos por la Ley, y de acuerdo con las instrucciones que reciba por parte del MANDANTE.`],

        ['CLÁUSULA TERCERA. - OBLIGACIONES DEL ADMINISTRADOR:',
            `A) Contratar la publicidad para lograr el arrendamiento del inmueble. B) Analizar y efectuar la preselección de arrendatarios; antes de suscribir el contrato de arrendamiento el propietario debe saber el valor por el cual se va a arrendar y este valor no puede ser fijado a consideración del Administrador. C) Informar al PROPIETARIO la fecha a partir de la cual se arrendó el inmueble, lo mismo que el valor del canon de arrendamiento fijado. D) El administrador tramitará ante la empresa de seguros o ante la afianzadora la documentación necesaria para asegurar el inmueble; el pago de la misma está a cargo del propietario, cubriendo el canon de arrendamiento, el IVA y la cuota de administración si fuere el caso. PARÁGRAFO: El pago de la póliza se hará con cargo al propietario descontando de la renta mensual dicho valor y será responsabilidad del administrador el pago de la totalidad del canon y administración. E) Hacer la entrega del inmueble a los arrendatarios una vez firmado y legalizado el contrato de arrendamiento, elaborando el inventario de entrega del inmueble, el cual deberá ser confrontado a la terminación del mismo. F) Cobrar a el (los) ARRENDATARIO(S) el valor mensual del canon de arrendamiento pactado en el contrato y entregarlo a su vez al MANDANTE o a la persona que éste designe el día 15 del mes causado, previas las deducciones convenidas entre LAS PARTES, salvo casos excepcionales debidamente soportados por EL ADMINISTRADOR; obligación que se deberá cumplir durante todo el tiempo en que el contrato de arrendamiento se encuentre vigente con el arrendatario y cesará cuando el (los) inmueble(s) le sea(n) restituido(s) al ADMINISTRADOR. G) Presentar un informe de su gestión como ADMINISTRADOR en el que se consigne el detalle de los dineros recibidos, las erogaciones efectuadas y el saldo a favor y en contra que se abone o reclame a EL PROPIETARIO, 5 días después a la solicitud por escrito. H) Cancelar oportunamente y por cuenta de EL PROPIETARIO las cuentas de administración incluidas dentro del valor del canon. I) EL ADMINISTRADOR hará ejecutar oportunamente los trabajos que demande la reparación necesaria del (los) inmueble(s), previa autorización del PROPIETARIO. PARÁGRAFO: De no existir recursos, EL MANDANTE queda obligado a suministrarlos dentro de los tres (3) días hábiles siguientes a su solicitud, eximiendo a EL ADMINISTRADOR de toda responsabilidad de los daños que a terceros pueda ocasionar la no reparación del inmueble. J) Comunicar al PROPIETARIO lo relacionado con los incrementos en el canon, vencimientos y ofertas de renovación en relación con el (los) contrato(s) de arrendamiento(s) celebrado(s) sobre el (los) inmueble(s) administrado(s). K) Atender los requerimientos o exigencias de las distintas autoridades relacionadas con el (los) inmueble(s) arrendado(s), debiendo informar inmediatamente de tales eventos a EL PROPIETARIO. L) En el evento de que EL PROPIETARIO fallezca y se finalice el contrato de arrendamiento, el ADMINISTRADOR entregará el (los) inmueble(s) administrado(s) al albacea que el juzgado determine para la custodia de los bienes en sucesión. M) Realizar al (los) arrendatario(s) los requerimientos por incumplimiento de las obligaciones derivadas del contrato de arrendamiento. N) Pagar al PROPIETARIO el canon de arrendamiento dentro de los quince (15) días de cada mes, siempre y cuando el ADMINISTRADOR haya recibido previamente los recursos correspondientes por parte del arrendatario o cuente con disponibilidad de recursos propios para efectuar dicho pago. En caso de incumplimiento del arrendatario y de no existir disponibilidad de recursos por parte del ADMINISTRADOR, este no estará obligado a anticipar el canon de arrendamiento al PROPIETARIO. Una vez la aseguradora, afianzadora o entidad garante efectúe el reembolso de los cánones de arrendamiento siniestrados al ADMINISTRADOR, este procederá a realizar el pago al PROPIETARIO dentro del ciclo de pagos inmediatamente siguiente. O) Garantizar el pago de los servicios públicos que se encuentran a cargo del arrendatario durante la vigencia del contrato de arrendamiento. P) Suscribir el inventario junto a los arrendatarios, garantizando las mismas condiciones recibidas por el propietario.`],

        ['CLÁUSULA CUARTA. - OBLIGACIONES DEL PROPIETARIO:',
            `A) Mantener el (los) inmueble(s) en condiciones de servir para el fin propuesto, mientras sea promocionado por el ADMINISTRADOR y éste permanezca sin ser arrendado. B) Entregar al ADMINISTRADOR el inmueble en perfectas condiciones de conservación y mantenimiento de tal forma que sea apto para su utilización para vivienda o para el fin previsto, cuando su uso sea de carácter comercial. C) Autorizar las reparaciones necesarias en el (los) inmueble(s), en las oportunidades que se requieran para la conservación y el mantenimiento del (los) mismo(s), so pena de responder por los perjuicios causados al ARRENDATARIO, a terceros y ante el mismo ADMINISTRADOR, en el evento de que pudiere ser condenado a algún pago en los términos del Artículo 57 del C. de P. C. D) Suministrar al ADMINISTRADOR, en forma fidedigna y oportuna, la información que éste requiera en relación con el (los) inmueble(s), tendiente a facilitar el cumplimiento de la gestión encomendada. E) Restituir al ADMINISTRADOR las sumas de dinero que sin fundamento hubiese recibido de éste, con ocasión del presente contrato, dentro de los cinco días siguientes a la fecha de la respectiva cuenta de cobro. F) Comunicar al ADMINISTRADOR cualquier hecho que afecte el normal desarrollo de este contrato y del contrato de arrendamiento que sobre el (los) inmueble(s) se suscriba(n). G) Reconocer y cancelar al ADMINISTRADOR la remuneración por su gestión, en la cuantía indicada en el cuadro resumen, así mismo los impuestos que de acuerdo con las leyes tributarias se deriven de este contrato. H) Si por razón de la gestión desarrollada por el ADMINISTRADOR, el arrendatario resuelve adquirir el (los) inmueble(s) arrendado(s), EL PROPIETARIO le reconocerá la comisión generalmente aceptada por la intermediación en la compraventa correspondiente al tres por ciento (3%) del valor de la venta más el impuesto al valor agregado (IVA) correspondiente. I) Cancelar las cuentas de Administración y Servicios Públicos cuando no se encuentre vigente un contrato de arrendamiento. J) Entregar al ADMINISTRADOR: Escritura pública de adquisición del inmueble, Certificado de tradición del inmueble, RUT, Paz y salvo de administración si aplica, así como los demás que EL ADMINISTRADOR requiera. K) Entregar a paz y salvo los últimos recibos de servicios públicos y las cuotas de administración, durante el tiempo que el (los) inmueble(s) se encuentre(n) desocupado(s). L) El valor de las cuotas extraordinarias aprobadas por las asambleas de copropietarios es de responsabilidad exclusiva de (los) PROPIETARIO(S). M) La asistencia a las asambleas ordinarias o extraordinarias que determinen las administraciones bajo el régimen de propiedad horizontal es responsabilidad exclusiva de (los) PROPIETARIO(S); en caso de imposibilidad física deberá otorgar PODER ESPECIAL a la persona encargada en Bogotá de acuerdo con el contrato de administración suscrito. N) Respetar la vigencia de los contratos de arrendamiento: el PROPIETARIO no podrá exigir la devolución o entrega del respectivo inmueble con anterioridad a la fecha de terminación o sus prórrogas estipulada en el contrato de arrendamiento en referencia; caso contrario deberá cancelar, con destino al arrendatario, el valor de tres (3) cánones de arrendamiento vigentes como indemnización. O) Restituir a EL ADMINISTRADOR los dineros recibidos por concepto de cánones de arrendamiento que no se hubieran causado, lo cual deberá hacer de manera inmediata, esto es, dentro de los tres (3) días hábiles siguientes a haber sido requerido.`],

        ['CLÁUSULA QUINTA. - FIANZA/SEGURO:',
            `A) FIANZA DE ARRENDAMIENTO O SEGURO: Se descontará mensualmente del canon de arrendamiento una suma equivalente al ${v(d.fianzaPct)}% más IVA o la tarifa que se encuentre vigente en la afianzadora o aseguradora (AFFI) con la cual se contrata la póliza del contrato de arrendamiento, con el fin de asegurar el pago oportuno de los cánones de arrendamiento. B) FIANZA/SEGURO DE LA CUOTA DE ADMINISTRACIÓN: En caso de que el inmueble se encuentre ubicado en un edificio o conjunto residencial amparado por el Régimen de Propiedad Horizontal, se descontará un valor equivalente al ${v(d.fianzaPct)}% mensual más IVA del valor de la cuota de administración, con destino a la AFIANZADORA O ASEGURADORA. C) FIANZA INTEGRAL – AUTORIZACIÓN, ALCANCE Y LIMITACIÓN DE RESPONSABILIDAD: EL MANDANTE (PROPIETARIO) autoriza expresa e irrevocablemente al ADMINISTRADOR para contratar, a su cargo, una fianza integral durante la vigencia del contrato de arrendamiento, con una cobertura máxima de hasta UN MILLÓN DE PESOS MONEDA CORRIENTE ($1.000.000 m/cte). La fianza integral no generará un cobro mensual adicional, toda vez que este servicio se encuentra incluido dentro del porcentaje establecido en los literales A) y B) de la presente cláusula, correspondiente a la fianza o seguro contratado con la afianzadora o aseguradora. La fianza integral cubrirá, hasta el monto afianzado, los siguientes conceptos: (i) falta de pago de servicios públicos domiciliarios, (ii) daños ocasionados al inmueble, y (iii) faltantes imputables al (los) ARRENDATARIO(S). La procedencia, alcance, exclusiones, requisitos, tiempos y condiciones de reclamación de la fianza integral serán determinados exclusivamente por la afianzadora, conforme a sus políticas, reglamentos y condiciones vigentes al momento de cada reclamación, las cuales son ajenas a la voluntad y control del ADMINISTRADOR y podrán variar en el tiempo. En consecuencia, el ADMINISTRADOR actúa únicamente como intermediario y mandatario del MANDANTE en la gestión de la fianza, sin asumir en ningún caso la calidad de garante, fiador, asegurador ni responsable directo por las obligaciones afianzadas, ni por la aprobación, rechazo o pago de reclamaciones, decisiones que corresponden de manera exclusiva a la afianzadora. PARÁGRAFO: Siempre que el pago de los servicios públicos y de las cuotas de administración del inmueble no esté amparado mediante la afianzadora y/o el amparo no sea suficiente y el MANDANTE cuente con rentas pendientes de cobro, EL ADMINISTRADOR podrá pagar por cuenta del MANDANTE estos valores que se encuentran a cargo del (los) ARRENDATARIO(S) y no fueron oportunamente cancelados, para lo cual EL MANDANTE autoriza al ADMINISTRADOR la deducción de dichas sumas derivadas de esos conceptos.`],

        ['CLÁUSULA SEXTA. - VALOR DE LA COMISIÓN POR LA ADMINISTRACIÓN DEL INMUEBLE:',
            `EL PROPIETARIO se obliga con el ADMINISTRADOR a pagarle la remuneración establecida en el cuadro resumen como "Comisión", de los ingresos mensuales obtenidos por concepto de cánones de arrendamiento del (los) inmueble(s) administrado(s) y el valor de la cuota de administración, más el valor correspondiente al impuesto al valor agregado (IVA). Dichos conceptos serán deducidos directamente de los ingresos por cánones de arrendamiento, con preferencia sobre cualquier otro gasto o concepto. Así mismo se autoriza al ADMINISTRADOR para deducir y compensar mensualmente del monto de dichos cánones la suma correspondiente a los gastos que hiciere el ADMINISTRADOR en desarrollo de este contrato. PARÁGRAFO: En caso de que el MANDANTE suscriba contrato de arrendamiento por sí mismo o por interpuesta persona sobre el inmueble entregado en administración, a un cliente y/o tercero presentado o enviado por el ADMINISTRADOR, el MANDANTE deberá reconocer al ADMINISTRADOR a título de pena el valor del canon de arrendamiento que corresponda a dos (2) mensualidades, sin perjuicio de la respectiva reclamación por indemnización de perjuicios.`],

        ['CLÁUSULA SÉPTIMA. - VIGENCIA:',
            `Este contrato tendrá la vigencia establecida en el cuadro resumen, sin que en ningún caso pueda ser inferior al término de vigencia pactado dentro del contrato de arrendamiento que celebre EL ADMINISTRADOR sobre el inmueble. Las prórrogas del presente contrato se efectuarán de manera automática de acuerdo con lo pactado en el contrato de arrendamiento, siempre que no se haya dado el aviso de terminación con antelación de tres (3) meses a la terminación de la vigencia, salvo que EL ADMINISTRADOR y/o EL MANDANTE resuelva(n) darlo por terminado anticipadamente.`],

        ['CLÁUSULA OCTAVA. - TERMINACIÓN DEL CONTRATO POR EL PROPIETARIO:',
            `A) El PROPIETARIO podrá solicitar dar por terminado el contrato de administración, estando vigente el contrato de arrendamiento, mediante comunicación escrita remitida a la dirección de notificación con mínimo tres (3) meses. PARÁGRAFO: En caso de que el propietario de manera unilateral determine dar por terminado el contrato de arrendamiento, deberá cancelar con destino al arrendatario el equivalente de tres (3) meses del canon de arrendamiento vigente. B) En caso tal de que el contrato terminara antes del tiempo estipulado por parte del arrendatario sin justa causa, éste indemnizará al PROPIETARIO por un valor equivalente a tres (3) meses del canon de arrendamiento vigente, de los cuales el ADMINISTRADOR descontará para sí, a título de indemnización por la terminación anticipada del contrato de administración, el equivalente a un (1) canon mensual de arrendamiento vigente con el IVA cuando haya lugar. C) En caso de que el PROPIETARIO decida terminar el contrato de administración pero continuar con el de arrendamiento, reconocerá al ADMINISTRADOR DOS (2) cánones de arrendamiento más IVA.`],

        ['CLÁUSULA NOVENA. - TERMINACIÓN DEL CONTRATO POR EL ADMINISTRADOR O PROPIETARIO:',
            `El presente contrato podrá darse por terminado por parte del ADMINISTRADOR durante la vigencia del contrato de arrendamiento o de sus prórrogas en forma autónoma cuando el PROPIETARIO incumpla con sus obligaciones contractuales y/o cuando por procesos de embargo o sucesiones no sea posible que se entregue a un tercero la tenencia del respectivo inmueble y como consecuencia de ello se imposibilite continuar con el contrato de arrendamiento. En estos casos el ADMINISTRADOR podrá ceder el contrato de arrendamiento al CURADOR que se designe por la ley. PARÁGRAFO: Si EL ADMINISTRADOR quiere dar por terminado el presente contrato o no prorrogar su término, deberá dar aviso por escrito a EL MANDANTE con tres (3) meses de antelación a la fecha que fije para su terminación. El presente contrato podrá darse por terminado por parte del PROPIETARIO durante la vigencia del contrato de arrendamiento o de sus prórrogas en forma autónoma cuando el ADMINISTRADOR incumpla con sus obligaciones contractuales, en especial la de realizar el pago oportuno del canon de arrendamiento y póliza de seguro.`],

        ['CLÁUSULA DÉCIMA. - EXENCIÓN DE RESPONSABILIDAD:',
            `En virtud de este contrato, EL ADMINISTRADOR no se constituye en garante, avalista ni deudor solidario del (los) ARRENDATARIO(S), y por lo tanto no se obliga frente a EL MANDANTE por las conductas y obligaciones de los mismos o de terceros y/o por el incumplimiento de las obligaciones a cargo directo de EL (LOS) ARRENDATARIO(S) derivadas del contrato de arrendamiento, pago de servicios públicos, cuotas ordinarias y extraordinarias de Administración, etc., pero sí deberá requerir su cumplimiento. EL ADMINISTRADOR no será responsable por daños ocasionados al inmueble por causa de EL (LOS) ARRENDATARIO(S) y/o de terceros, como tampoco en los casos de incendio, desastres naturales, hurto y/o actos malintencionados de terceros. EL ADMINISTRADOR en ningún caso responderá por el lucro cesante que sufra EL MANDANTE como consecuencia de haber permanecido el inmueble objeto del contrato desocupado y sin generar renta, mientras no subsista contrato de arrendamiento sobre el mismo.`],

        ['CLÁUSULA DÉCIMA PRIMERA. - RESPONSABILIDAD:',
            `Salvo por causas atribuibles al ADMINISTRADOR debidamente demostradas, EL MANDANTE asume toda responsabilidad derivada de reclamaciones, querellas, procesos judiciales, policiales o administrativos, convocatoria a tribunales de arbitramento, conciliaciones extrajudiciales y devoluciones que se deriven de reclamaciones del (los) ARRENDATARIO(S) y/o de terceros. EL MANDANTE autoriza a EL ADMINISTRADOR para que en cualquier tiempo nombre apoderado judicial a cargo de EL MANDANTE a efectos de que defienda sus intereses, y asumirá el pago de los perjuicios que surjan como consecuencia de una condena de autoridad competente y/o una conciliación. Si por cualquier circunstancia EL ADMINISTRADOR fuere condenado a restituir excedentes de arrendamientos y/o pagar cualquier otra suma de dinero, EL MANDANTE se obliga a restituir las sumas de dinero asumidas por EL ADMINISTRADOR dentro de los cinco (5) días siguientes al aviso debidamente soportado que al respecto le dé EL ADMINISTRADOR, las cuales podrán ser cobradas ejecutivamente sin necesidad de requerimiento privado o judicial o constitución en mora, para lo cual bastará la sola confirmación del pago por parte de EL ADMINISTRADOR.`],

        ['CLÁUSULA DÉCIMA SEGUNDA. -',
            `EL ADMINISTRADOR se obliga a no exceder los límites de este contrato. Los actos cumplidos más allá de dichos límites sólo obligan a EL ADMINISTRADOR, salvo que el PROPIETARIO los ratifique.`],

        ['CLÁUSULA DÉCIMA TERCERA. -',
            `En caso de declararse por la autoridad judicial la nulidad de una o cualquiera de las cláusulas de este contrato, las demás continuarán vigentes y tendrán el carácter de obligatorias para las partes.`],

        ['CLÁUSULA DÉCIMA CUARTA. - NOTIFICACIONES:',
            `Las partes recibirán notificaciones en las direcciones y datos registrados en la primera parte de este contrato. PARÁGRAFO: Cualquier cambio en los datos de notificaciones deberá ser informado por escrito a la otra parte, y hasta que esto ocurra las aquí indicadas continuarán vigentes.`],

        ['CLÁUSULA DÉCIMA QUINTA. - MODIFICACIONES:',
            `Cualquier modificación al presente contrato deberá constar por escrito y ser suscrita por todos los que en él intervienen.`],

        ['CLÁUSULA DÉCIMA SEXTA. - MÉRITO EJECUTIVO:',
            `El presente contrato presta mérito ejecutivo para hacer efectivas todas las obligaciones en él contenidas.`],

        ['CLÁUSULA DÉCIMA SÉPTIMA. - CONCILIACIÓN:',
            `Cualquier controversia que surja entre LAS PARTES con ocasión de la celebración, interpretación, ejecución y/o terminación de este contrato será dirimida de común acuerdo a través de solicitud de conciliación que se convocará ante el Centro de Arbitraje y Conciliación de la Cámara de Comercio de Bogotá.`],

        ['CLÁUSULA DÉCIMA OCTAVA. -',
            `EL PROPIETARIO declara bajo su entera responsabilidad que tiene facultades legales para dar en administración el (los) inmueble(s) materia del presente contrato para su posterior arrendamiento; igualmente manifiesta que el (los) inmueble(s) está(n) libre(s) de pleitos o embargos vigentes.`],

        ['CLÁUSULA DÉCIMA NOVENA. - CESIÓN DE CONTRATO:',
            `El (los) propietario(s) acepta(n) desde ahora cualquier cesión que el administrador haga respecto del presente contrato y acepta(n) expresamente que la notificación legal se surta con el solo envío de la nota de cesión por correo físico certificado o por correo electrónico, a la dirección que aparece registrada en este contrato al pie de sus firmas.`],

        ['CLÁUSULA VIGÉSIMA. - HABEAS DATA:',
            `De acuerdo con lo establecido en la Ley mil quinientos ochenta y uno (1581) del diecisiete (17) de octubre de dos mil doce (2012) y el decreto reglamentario mil trescientos setenta y siete (1377) de dos mil trece (2013), EL PROPIETARIO autoriza al ADMINISTRADOR para que realice la recolección, almacenamiento, uso, circulación, supresión y, en general, el tratamiento de sus datos personales con fines como, pero sin limitarse a: realización de contactos, estudios estadísticos, estudio de mercado, compartir información con terceros que colaboran con la entidad, que tengan relación comercial y que para el cumplimiento de sus funciones deban acceder en alguna medida a la información. Así mismo, EL PROPIETARIO autoriza a que dicha información sea manejada a través de las bases de datos implementadas, manipuladas y reguladas por ${EMPRESA.razonSocial}, sus empresas aliadas y filiales, que deberán cumplir en todo caso con la normatividad antes indicada.`],

        ['CLÁUSULA VIGÉSIMA PRIMERA. - AUTORIZACIÓN PARA FIRMA ELECTRÓNICA:',
            `Las Partes declaran que el presente contrato será firmado electrónicamente; así mismo declaran que la aplicación utilizada provee un mecanismo de firma electrónica confiable que garantiza el cumplimiento de los requisitos previstos en la legislación vigente (Ley 527 de 1999 y demás normas que la reglamentan): autenticidad (identidad de los firmantes), integridad (no alteración del documento luego de su firma) y no repudio.`],
    ];
    for (const [lead, text] of clausulas) blocks.push({ kind: 'clause', lead, text });

    blocks.push({
        kind: 'paragraph',
        text: `En señal de conformidad, los contratantes suscriben este documento en dos ejemplares del mismo tenor y valor, el día ${fechaLetrasB(d.fechaFirma)}. Para efectos de recibir notificaciones judiciales y extrajudiciales, las partes a continuación y al suscribir este contrato proceden a indicar sus respectivas direcciones:`,
    });

    // Un bloque de firma por cada propietario (numerado si hay varios dueños).
    const firmaMandante = (nombre, cedula, direccion, telefono, email, role) => ({
        kind: 'signature',
        role,
        lines: [
            `NOMBRE: ${v(nombre)}`,
            `CÉDULA: ${v(cedula)}`,
            `DIRECCIÓN: ${v(direccion)}`,
            `TELÉFONO: ${v(telefono)}`,
            `EMAIL: ${v(email)}`,
        ],
    });
    blocks.push(firmaMandante(
        d.propietarioNombre, d.propietarioCedula, dirPropietario, d.propietarioTelefono, d.propietarioEmail,
        variosDuenos ? 'MANDANTE 1' : 'MANDANTE(S)',
    ));
    otrosPropietarios.forEach((o, i) => {
        blocks.push(firmaMandante(o.nombre, o.cedula, o.direccion, o.telefono, o.email, `MANDANTE ${i + 2}`));
    });
    blocks.push({
        kind: 'signature',
        role: 'ADMINISTRADOR',
        lines: [
            `NOMBRE: ${EMPRESA.representanteLegal}`,
            `CÉDULA: ${EMPRESA.cedulaRepresentante}`,
            `Representante legal`,
            `${EMPRESA.razonSocial} NIT: ${EMPRESA.nit}`,
            `TELÉFONO: ${EMPRESA.celular} - ${EMPRESA.telefono}`,
            `EMAIL: ${EMPRESA.email}`,
        ],
    });

    return {
        title: 'CONTRATO DE ADMINISTRACIÓN DE INMUEBLES',
        pageHeader: { title: 'CONTRATO DE ADMINISTRACIÓN DE INMUEBLES' },
        blocks,
    };
}

// ─────────────────────────── ARRENDAMIENTO ───────────────────────────

function nombresDeudores(deudores) {
    const list = Array.isArray(deudores) ? deudores.filter((x) => x?.nombre) : [];
    if (list.length === 0) return BLANK;
    return list
        .map((x) => `${v(x.nombre)}, identificado(a) con C.C. No. ${v(x.cedula)} de ${v(x.lugarExpedicion)}`)
        .join('; ');
}

function buildArrendamiento(d) {
    const blocks = [];
    const deudores = Array.isArray(d.deudores) ? d.deudores.filter((x) => x?.nombre) : [];
    // Dirección completa del inmueble (calle + Torre/Apto/Conjunto) + ciudad (#20/#21)
    const dirInmueble = componerDireccion(d.direccionInmueble, d.torreInmueble, d.aptoInmueble, d.conjuntoInmueble);
    const inmueble = direccionCiudad(dirInmueble, d.ciudadInmueble);
    // Dirección de notificación del arrendatario, independiente del inmueble (#26)
    const dirNotifArrendatario = componerDireccion(d.arrendatarioDireccion, d.arrendatarioTorre, d.arrendatarioApto, d.arrendatarioConjunto);
    const tieneAdmin = Number(d.cuotaAdministracion || 0) > 0;

    // Encabezado tipo proforma: líneas etiqueta/valor en negrita (sin tabla)
    blocks.push({ kind: 'kv', label: 'Ciudad y Fecha', value: `${v(d.ciudadFirma)}, ${fecha(d.fechaFirma)}` });
    blocks.push({ kind: 'kv', label: 'ARRENDADOR (ES):', value: EMPRESA.razonSocial });
    blocks.push({ kind: 'kv', label: 'NIT:', value: EMPRESA.nit });
    blocks.push({ kind: 'kv', label: 'ARRENDATARIO (S):', value: v(d.arrendatarioNombre) });
    blocks.push({ kind: 'kv', label: 'C.C. No.', value: `${v(d.arrendatarioCedula)} DE ${v(d.arrendatarioLugarExpedicion).toUpperCase()}` });
    if (deudores.length > 0) {
        deudores.forEach((x, i) => {
            blocks.push({ kind: 'kv', label: i === 0 ? 'DEUDOR(ES) SOLIDARIOS:' : ' ', value: v(x.nombre).toUpperCase() });
            blocks.push({ kind: 'kv', label: 'C.C. No.', value: `${v(x.cedula)} DE ${v(x.lugarExpedicion).toUpperCase()}` });
        });
    } else {
        blocks.push({ kind: 'kv', label: 'DEUDOR(ES) SOLIDARIOS:', value: BLANK });
    }
    blocks.push({ kind: 'kv', label: 'FECHA DE INICIACIÓN:', value: fechaCaps(d.fechaInicio) });
    blocks.push({ kind: 'kv', label: 'FECHA DE VENCIMIENTO:', value: fechaCaps(d.fechaVencimiento) });

    blocks.push({ kind: 'subtitle', text: 'CONDICIONES GENERALES' });

    const clausulas = [
        ['PRIMERA: OBJETO DEL CONTRATO:',
            `Mediante el presente contrato EL ARRENDADOR concede al ARRENDATARIO el uso y goce del inmueble que más adelante se identifica, obligándose éste a pagar a aquél una renta de arrendamiento${tieneAdmin ? ', una cuota de administración' : ''} y a destinarlo exclusivamente para VIVIENDA URBANA de él y su familia. El presente contrato se regirá en todas sus partes por las cláusulas aquí consignadas, así como por los términos de la LEY 820 DE 2003 (Ley de arrendamiento de vivienda urbana), el Código Civil y demás normas concordantes vigentes.`],

        ['SEGUNDA: IDENTIFICACIÓN DEL INMUEBLE:',
            `El presente contrato recae sobre el siguiente inmueble: ${v(sinPuntoFinal(inmueble))}.`],

        ['TERCERA: PRECIO Y FORMA DE PAGO:',
            `El valor mensual del contrato por concepto de arrendamiento es la suma de ${money(d.canon)}${tieneAdmin ? `, y ${money(d.cuotaAdministracion)} corresponden a cuotas ordinarias de administración` : ''}, que EL ARRENDATARIO se obliga a pagar al ARRENDADOR en su totalidad, anticipadamente, dentro de los cinco (5) primeros días de cada período, a su orden por escrito o a quien éste autorice o delegue previamente y por escrito para recibir dicha renta. PARÁGRAFO PRIMERO: La mera tolerancia del ARRENDADOR en aceptar el pago del precio del arrendamiento${tieneAdmin ? ' y su cuota de administración' : ''} con posterioridad a su vencimiento no se entenderá como ánimo de novación o de modificación del término establecido para el pago en este contrato. PARÁGRAFO SEGUNDO: En caso de mora o retardo en el pago del precio mensual del contrato, de acuerdo con lo previsto en la presente cláusula, EL ARRENDADOR podrá dar por terminado unilateralmente con justa causa el presente contrato y exigir la entrega inmediata del inmueble, para lo cual el ARRENDATARIO renuncia expresamente a los requerimientos privados y judiciales previstos en la ley (artículos 1594 y 2007 del Código Civil). PARÁGRAFO — FORMA DE PAGO: El arrendatario pagará el precio del arrendamiento en las oficinas del arrendador, hoy ${EMPRESA.direccion} de la ciudad de ${sinPuntoFinal(EMPRESA.ciudad)}, o mediante consignación en la ${EMPRESA.cuentaRecaudo} del ${EMPRESA.bancoRecaudo} a nombre de ${EMPRESA.razonSocial}.`],

        ['CUARTA: SERVICIOS PÚBLICOS DOMICILIARIOS:',
            `A partir del momento en que el inmueble arrendado sea entregado al ARRENDATARIO y hasta la fecha de su desocupación y entrega al ARRENDADOR, serán a cargo de aquél el pago de los servicios públicos domiciliarios de ACUEDUCTO, ALCANTARILLADO, RECOLECCIÓN DE BASURAS, ENERGÍA ELÉCTRICA Y GAS DOMICILIARIO de acuerdo con la respectiva facturación. EL ARRENDADOR se reserva el derecho de solicitar mensualmente al ARRENDATARIO los recibos con la constancia de pago de los mismos. Las reclamaciones que tengan que ver con la óptima prestación o facturación de los servicios públicos anotados serán tramitadas directamente por EL ARRENDATARIO ante las respectivas empresas prestadoras del servicio. PARÁGRAFO PRIMERO: Cualquier servicio adicional o suntuario al que pretenda acceder el ARRENDATARIO deberá ser previamente AUTORIZADO por EL ARRENDADOR y en todo caso la responsabilidad de los mismos será a cargo del ARRENDATARIO, quien se obliga en este contrato, con anterioridad a la entrega del inmueble, a retirarlo y a solicitar la separación de valores por conceptos contratados por éste de la facturación general por servicios públicos domiciliarios del inmueble. PARÁGRAFO SEGUNDO: Si el ARRENDATARIO no paga oportunamente los servicios públicos antes señalados, este hecho se tendrá como incumplimiento del contrato, pudiendo el ARRENDADOR darlo por terminado unilateralmente sin necesidad de los requerimientos privados y judiciales previstos en la Ley. PARÁGRAFO TERCERO: En cualquier evento de mora o retardo en el cumplimiento de las obligaciones a cargo de EL ARRENDATARIO, EL ARRENDADOR queda facultado para exigir de aquél el pago de los honorarios de abogados y demás gastos de cobranza judicial y/o extrajudicial. Igualmente, si como consecuencia del no pago oportuno de los servicios públicos las empresas respectivas los suspenden o retiran el contador o línea telefónica, serán de cargo del ARRENDATARIO el pago de los intereses de mora, sanciones y los pagos que demande su reconexión.`],

        ['QUINTA: CUOTAS DE ADMINISTRACIÓN ORDINARIAS:',
            tieneAdmin
                ? `Se obliga también el arrendatario a pagar al ARRENDADOR, conjuntamente con el valor del canon, las cuotas ordinarias mensuales de administración, las cuales a la fecha de suscripción del presente contrato corresponden a la suma de ${money(d.cuotaAdministracion)}, que pagará por anticipado dentro de los cinco (5) primeros días de cada mensualidad, así como las que posteriormente sean aprobadas. PARÁGRAFO: EL ARRENDATARIO se compromete a cumplir y a respetar cabalmente todas y cada una de las normas establecidas por el reglamento de propiedad horizontal (si aplica) y su cuerpo normativo, que da por recibido con la suscripción del presente contrato.`
                : `No aplica para el presente contrato. En caso de que el inmueble llegue a estar sometido al régimen de propiedad horizontal, EL ARRENDATARIO se compromete a cumplir y a respetar cabalmente las normas establecidas por el reglamento de propiedad horizontal y su cuerpo normativo.`],

        ['SEXTA: VIGENCIA DEL CONTRATO:',
            `${mesesEnLetras(d.duracionMeses)}, que comienzan a contarse el ${fechaLetrasB(d.fechaInicio)}.`],

        ['SÉPTIMA: PRÓRROGAS:',
            `Si a la fecha del vencimiento del término inicial o de cualquiera de sus prórrogas ninguna de las partes ha dado aviso a la otra, con antelación no menor a tres (3) meses a la fecha de vencimiento, de su intención de darlo por terminado, el presente contrato de arrendamiento se entenderá prorrogado en iguales condiciones y por el mismo término indicado en la cláusula anterior, siempre y cuando cada una de las partes haya cumplido con las obligaciones a su cargo y el ARRENDATARIO se avenga a los reajustes autorizados por la Ley.`],

        ['OCTAVA: INCREMENTO DEL PRECIO:',
            `Vencido el primer año de vigencia de este contrato, y así sucesivamente cada doce (12) mensualidades, en caso de prórroga tácita o expresa, en forma automática y sin necesidad de requerimiento alguno entre las partes, el precio mensual del arrendamiento se incrementará en el cien por ciento (100%) del Índice de Precios al Consumidor del año calendario inmediatamente anterior a aquel en que deba efectuarse el reajuste.`],

        ['NOVENA: OBLIGACIONES DEL ARRENDATARIO:',
            `1. Pagar el precio del arrendamiento dentro del plazo y en el lugar estipulados en el presente contrato. 2. Cuidar el inmueble y las cosas recibidas en arrendamiento; en caso de daños o deterioros distintos a los derivados del uso normal o de la acción del tiempo, que fueren imputables al mal uso del inmueble o a su propia culpa, EL ARRENDATARIO deberá efectuar oportunamente y por su cuenta las reparaciones o sustituciones necesarias. 3. Pagar a tiempo los servicios, cosas o usos conexos y adicionales, así como las expensas comunes en los casos en que haya lugar, de conformidad con lo aquí establecido. 4. Cumplir las normas consagradas en los reglamentos de propiedad horizontal y las que expida el gobierno en protección de los derechos de todos los vecinos.`],

        ['DÉCIMA: OBLIGACIONES DEL ARRENDADOR:',
            `1. Entregar al ARRENDATARIO, en la fecha convenida o en el momento de la celebración del contrato, el inmueble dado en arrendamiento. 2. Entregar con el inmueble los servicios, cosas o usos conexos para el fin convenido.`],

        ['DÉCIMA PRIMERA: PREAVISOS PARA LA ENTREGA:',
            `Las partes se obligan a dar el correspondiente aviso para la restitución del inmueble con una antelación no menor de tres (3) meses respecto a la fecha de vencimiento del término inicial pactado o de cada una de las prórrogas. El aviso se debe dar por escrito a través del servicio postal autorizado, dirigido a la dirección del inmueble arrendado si la intención de darlo por terminado proviene del ARRENDADOR, o a las oficinas del ARRENDADOR si la intención de darlo por terminado proviene de los ARRENDATARIOS.`],

        ['DÉCIMA SEGUNDA: RECIBO Y ESTADO:',
            `EL ARRENDATARIO declara que ha recibido el inmueble objeto de este contrato en buen estado de servicio y presentación, conforme al inventario que suscribe por separado y que se considera incorporado a este documento; que se obliga a cuidarlo, conservarlo y mantenerlo, y que en el mismo estado lo restituirá al ARRENDADOR. Los daños al inmueble derivados del mal trato o descuido por parte del ARRENDATARIO durante su tenencia serán de su cargo, y EL ARRENDADOR estará facultado para hacerlos por su cuenta y posteriormente reclamar su valor al ARRENDATARIO.`],

        ['DÉCIMA TERCERA: REPARACIONES Y MEJORAS:',
            `Las reparaciones, variaciones y reformas efectuadas por el ARRENDATARIO al inmueble serán por cuenta de éste y requerirán previa autorización escrita del ARRENDADOR para desarrollarlas, entendiendo que de cualquier forma aquellas accederán al inmueble, sin lugar a indemnización para quien las efectuó. El arrendatario renuncia expresamente a descontar de la renta el valor de las reparaciones indispensables a que se refiere el artículo 27 de la Ley 820 de 2003.`],

        ['DÉCIMA CUARTA: CLÁUSULA PENAL:',
            `El incumplimiento por parte del arrendatario de cualquiera de las cláusulas de este contrato, y aun el simple retardo en el pago de una o más mensualidades y la evidente incursión en MORA y/o falta de pago, lo constituirá en deudor del ARRENDADOR por una suma equivalente al triple del precio mensual del arrendamiento que esté vigente en el momento en que tal incumplimiento se presente, a título de pena, que será exigible sin necesidad de requerimiento alguno y sin perjuicio de los demás derechos que tiene el ARRENDADOR para hacer cesar el arrendamiento y exigir judicialmente la entrega del inmueble. Se entenderá, en todo caso, que el pago de la pena no extingue la obligación principal y que el arrendador podrá pedir a la vez el pago de la renta y de la pena y la indemnización de perjuicios, si es el caso. Este contrato será prueba sumaria suficiente para el cobro de esta pena y el arrendatario o sus deudores solidarios renuncian expresamente a cualquier requerimiento privado o judicial para constituirlos en mora del pago de ésta o cualquier otra obligación derivada del contrato. PARÁGRAFO PRIMERO: Si EL ARRENDATARIO promueve unilateralmente y en forma anticipada la entrega del inmueble, antes del vencimiento del período inicial o de sus prórrogas, deberá pagar una indemnización equivalente a tres mensualidades del canon que se encuentre vigente (artículo 24, numeral 4, Ley 820 de 2003). PARÁGRAFO SEGUNDO: Si EL PROPIETARIO promueve unilateralmente y en forma anticipada la entrega del inmueble, antes del vencimiento del período inicial o de sus prórrogas, deberá pagar una indemnización a EL ARRENDATARIO equivalente a tres mensualidades del canon que se encuentre vigente (artículo 24, numeral 4, Ley 820 de 2003).`],

        ['DÉCIMA QUINTA: REQUERIMIENTOS:',
            `El arrendatario y los deudores solidarios que suscriben este contrato renuncian expresamente a los requerimientos de que tratan los artículos 2007 del C.C. y 424 del C. de P.C., y en general a los que consagre cualquier norma sustancial o procesal para efectos de la constitución en mora.`],

        ['DÉCIMA SEXTA: SUBARRIENDO Y PROHIBICIÓN DE CESIÓN:',
            `El arrendatario no está facultado para ceder el arriendo ni subarrendar, a menos que medie autorización previa y escrita del ARRENDADOR. En caso de contravención, el ARRENDADOR podrá dar por terminado el contrato de arrendamiento y exigir la entrega del inmueble. EL ARRENDATARIO autoriza y acepta cualquier cesión que haga EL ARRENDADOR del presente contrato, pero la misma no producirá efectos sino hasta cuando ésta se haya notificado al ARRENDATARIO y a sus deudores solidarios mediante comunicación enviada por correo certificado. La notificación se entenderá surtida desde la fecha de envío de la citada comunicación.`],

        ['DÉCIMA SÉPTIMA: EXENCIÓN DE RESPONSABILIDAD:',
            `EL ARRENDADOR no asume responsabilidad alguna por los daños o perjuicios que el ARRENDATARIO pueda sufrir por causas atribuibles a terceros o a otros arrendatarios de partes del mismo inmueble, o la culpa leve del ARRENDADOR o de otros arrendatarios o de sus empleados o dependientes, ni por robos, hurtos, ni por siniestros causados por incendio, inundación o terrorismo. Serán de cargo de EL ARRENDATARIO las medidas, dirección y manejo tomadas para la seguridad del bien.`],

        ['DÉCIMA OCTAVA: EXIGIBILIDAD Y MÉRITO EJECUTIVO:',
            `Las obligaciones de pagar sumas de dinero a cargo de cualquiera de las partes serán exigibles ejecutivamente con base en el presente contrato de arrendamiento y de conformidad con lo dispuesto en los Códigos Civil y de Procedimiento Civil. Respecto de las deudas a cargo del ARRENDATARIO por concepto de servicios públicos domiciliarios o expensas comunes dejadas de pagar, el ARRENDADOR podrá repetir lo pagado contra EL ARRENDATARIO por la vía ejecutiva mediante la presentación de las facturas, comprobantes o recibos de las correspondientes empresas debidamente pagados y la manifestación que haga el demandante bajo la gravedad del juramento de que dichas facturas fueron pagadas por él, la cual se entenderá prestada con la presentación de la demanda.`],

        ['DÉCIMA NOVENA: ABANDONO DEL INMUEBLE:',
            `En caso de abandono del inmueble, EL ARRENDATARIO faculta expresamente a cualquiera de sus deudores solidarios para que, junto con el ARRENDADOR o quien lo represente, acceda al inmueble objeto del presente contrato y reciba la tenencia del mismo, con el diligenciamiento de ACTA privada, judicial o extrajudicial de ENTREGA, suscrita por aquellos, con anotación clara del estado en que se encuentre, los faltantes al inventario y los conceptos adeudados que quedaren pendientes como consecuencia del abandono e incumplimiento.`],

        ['VIGÉSIMA: AUTORIZACIÓN:',
            `El arrendatario y sus deudores solidarios autorizan expresamente al ARRENDADOR, y a su eventual cesionario o subrogatorio, para incorporar, reportar, procesar y consultar en bancos de datos la información relacionada derivada de este contrato.`],

        ['VIGÉSIMA PRIMERA: DEUDORES SOLIDARIOS:',
            `Son deudores solidarios del presente contrato: ${nombresDeudores(d.deudores)}. Los suscritos, identificados anteriormente, se declaran deudores del ARRENDADOR en forma solidaria e indivisible junto con el ARRENDATARIO indicado al inicio de este documento, de todas las cargas y obligaciones contenidas en el presente contrato, tanto durante el término inicialmente pactado como durante sus prórrogas o renovaciones expresas o tácitas y hasta la restitución material del inmueble al ARRENDADOR. Responderán por el cumplimiento y pago por concepto de arrendamientos, servicios públicos, indemnizaciones, daños en el inmueble, cuotas de administración, cláusulas penales, gastos de cobranza, costas procesales y cualquier otra obligación derivada del contrato, las cuales podrán ser exigidas por el ARRENDADOR a cualquiera de los obligados por la vía ejecutiva, sin necesidad de requerimientos privados o judiciales; sin que por razón de esta solidaridad asuman el carácter de fiadores ni ARRENDATARIOS del inmueble objeto del presente contrato, pues tal calidad la asume exclusivamente EL ARRENDATARIO y sus respectivos causahabientes. En caso de abandono del inmueble, cualquiera de los arrendatarios y/o deudores solidarios podrá hacer entrega válidamente del inmueble al ARRENDADOR o a quien éste señale en la forma y términos señalados en este documento.`],

        ['VIGÉSIMA SEGUNDA: MODIFICACIONES AL CONTRATO, SOLEMNIDAD:',
            `Toda modificación, adición u otrosí que de común acuerdo realicen las partes al presente contrato deberá constar siempre por escrito para que tenga validez; de igual forma deberá ser suscrita por cada una de las partes vinculadas en la relación arrendaticia.`],

        ['VIGÉSIMA TERCERA: POSICIÓN CONTRACTUAL:',
            `Cuando quiera que, por cualquier causa, se termine la relación de mandato vigente entre el propietario y el ARRENDADOR, se entenderá que el propietario comenzará a ocupar la posición de ARRENDADOR dentro del presente contrato.`],

        ['VIGÉSIMA CUARTA: AUTORIZACIÓN PARA FIRMA ELECTRÓNICA:',
            `Las Partes declaran que el presente contrato será firmado electrónicamente; así mismo declaran que la aplicación utilizada provee un mecanismo de firma electrónica confiable que garantiza el cumplimiento de los requisitos previstos en la legislación vigente (Ley 527 de 1999 y demás normas que la reglamentan): autenticidad (identidad de los firmantes), integridad (no alteración del documento luego de su firma) y no repudio.`],
    ];
    for (const [lead, text] of clausulas) blocks.push({ kind: 'clause', lead, text });

    blocks.push({
        kind: 'paragraph',
        text: `Para constancia se firma por las partes el ${fechaLetrasB(d.fechaFirma)}, y declaran que han recibido copia del presente contrato. Para efectos de recibir notificaciones judiciales y extrajudiciales, las partes, en cumplimiento del Art. 12 de la Ley 820 de 2003, a continuación y al suscribir este contrato proceden a indicar sus respectivas direcciones:`,
    });

    blocks.push({
        kind: 'signature',
        role: 'EL ARRENDADOR',
        lines: [
            `NOMBRE: ${EMPRESA.razonSocial} NIT ${EMPRESA.nit}`,
            `Dir. Notificación: ${EMPRESA.direccion}`,
            `Ciudad: ${EMPRESA.ciudad}`,
            `Tel Oficina: ${EMPRESA.telefono}`,
            `Celular: ${EMPRESA.celular}`,
            `E-MAIL: ${EMPRESA.emailAdministrativo}`,
            `C.C. ${EMPRESA.cedulaRepresentante} — Representante legal`,
        ],
    });
    blocks.push({
        kind: 'signature',
        role: 'EL ARRENDATARIO',
        lines: [
            `NOMBRE: ${v(d.arrendatarioNombre)}`,
            `C.C. No. ${v(d.arrendatarioCedula)} DE ${v(d.arrendatarioLugarExpedicion).toUpperCase()}`,
            `Dir. Notificación: ${v(dirNotifArrendatario)}`,
            `Ciudad: ${v(d.arrendatarioCiudad)}`,
            `Celular: ${v(d.arrendatarioCelular)}`,
            `E-MAIL: ${v(d.arrendatarioEmail)}`,
        ],
    });
    deudores.forEach((x, i) => {
        blocks.push({
            kind: 'signature',
            role: deudores.length > 1 ? `DEUDOR SOLIDARIO ${i + 1}` : 'EL DEUDOR SOLIDARIO',
            lines: [
                `NOMBRE: ${v(x.nombre)}`,
                `C.C. No. ${v(x.cedula)} DE ${v(x.lugarExpedicion).toUpperCase()}`,
                `Dir. Notificación: ${v(componerDireccion(x.direccion, x.torre, x.apto, x.conjunto))}`,
                `Ciudad: ${v(x.ciudad)}`,
                `Celular: ${v(x.celular)}`,
                `E-MAIL: ${v(x.email)}`,
            ],
        });
    });

    return {
        title: 'CONTRATO DE ARRENDAMIENTO PARA INMUEBLE DE VIVIENDA URBANA',
        pageHeader: { title: 'CONTRATO DE ARRENDAMIENTO PARA INMUEBLE DE VIVIENDA URBANA', code: 'F-GCT-005' },
        blocks,
    };
}

// ─────────────────────────── API pública ───────────────────────────

// El contrato se imprime SIEMPRE en mayúsculas (como la proforma), incluso si
// el dato quedó guardado en minúsculas antes de que el formulario normalizara.
// Los correos se conservan tal cual.
function normalizeData(d) {
    const out = {};
    for (const [k, val] of Object.entries(d || {})) {
        if (Array.isArray(val)) out[k] = val.map((item) => (item && typeof item === 'object' ? normalizeData(item) : item));
        else if (typeof val === 'string' && !/email/i.test(k)) out[k] = val.toUpperCase();
        else out[k] = val;
    }
    return out;
}

// Devuelve { title, pageHeader: { title, code? }, blocks } o null si el tipo
// no existe. pageHeader replica el membrete de la proforma (logo + código de
// formato) en cada página.
export function buildContractDocument(type, data) {
    const template = getTemplate(type);
    if (!template) return null;
    const d = normalizeData(data);
    return type === 'ADMINISTRACION' ? buildAdministracion(d) : buildArrendamiento(d);
}
