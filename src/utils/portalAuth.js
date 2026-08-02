import jwt from 'jsonwebtoken';

// P1: Tokens del Portal de Clientes. Se firman con un secreto DERIVADO del
// JWT_SECRET: un token del portal jamás valida contra los endpoints del
// equipo (auth.middleware) ni al revés — los dos mundos quedan aislados
// aunque compartan la variable de entorno.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET no está definida. Configura la variable de entorno antes de iniciar el servidor.');
}
const PORTAL_SECRET = `${JWT_SECRET}::portal-clientes`;

// Sesión larga (30 días): el cliente entra por OTP, sin contraseña que
// recordar — re-pedir el código cada semana sería fricción innecesaria.
export const generatePortalToken = (email) => {
    return jwt.sign({ email, portal: true }, PORTAL_SECRET, { expiresIn: '30d' });
};

export const verifyPortalToken = (token) => {
    const decoded = jwt.verify(token, PORTAL_SECRET);
    if (!decoded.portal || !decoded.email) throw new Error('Token inválido');
    return decoded;
};
