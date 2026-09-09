// Roles del equipo (isomorfo: lo importan frontend y backend):
//  - AGENT     agente inmobiliario — su agenda, sus contratos, ejecuta visitas
//  - ADMIN     acceso total
//  - ASISTENTE vista de administrador (visibilidad global de los módulos)
//              pero SIN gestión de usuarios y SIN autorizar (aprobar/devolver,
//              pagos, aplicar incrementos…). En la agenda SÍ crea, edita y
//              reasigna visitas (#71). Sep 2026: también puede tener visitas
//              asignadas (aparece en el selector de agente) y ejecutar/cerrar
//              SOLO las suyas, como un agente; las ajenas siguen sin ejecutar
//  - PORTAL    usuario sistema del Portal de Clientes (no inicia sesión)
//
// "Staff" = visibilidad global de administrador (ADMIN o ASISTENTE). Las
// acciones que autorizan o mutan siguen chequeando ADMIN explícitamente.
export const esStaff = (role) => role === 'ADMIN' || role === 'ASISTENTE';
