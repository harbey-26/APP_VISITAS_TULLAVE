// Construye URL wa.me a partir de un número. Normaliza: deja solo dígitos y,
// si queda en 10 dígitos empezando por 3 (móvil Colombia), antepone "57".
// Compartido por Agenda y VisitExecution.
export function buildWhatsAppUrl(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    const normalized = (digits.length === 10 && digits.startsWith('3')) ? `57${digits}` : digits;
    return `https://wa.me/${normalized}`;
}
