// Roles del equipo (isomorfo: lo importan frontend y backend):
//  - AGENT     agente inmobiliario — su agenda, sus contratos, ejecuta visitas
//  - ADMIN     acceso total
//  - ASISTENTE vista de administrador (visibilidad global de los módulos)
//              pero SIN gestión de usuarios, SIN autorizar (aprobar/devolver,
//              pagos, aplicar incrementos…) y SIN crear/ejecutar visitas:
//              la agenda es de solo lectura
//  - PORTAL    usuario sistema del Portal de Clientes (no inicia sesión)
//
// "Staff" = visibilidad global de administrador (ADMIN o ASISTENTE). Las
// acciones que autorizan o mutan siguen chequeando ADMIN explícitamente.
export const esStaff = (role) => role === 'ADMIN' || role === 'ASISTENTE';
