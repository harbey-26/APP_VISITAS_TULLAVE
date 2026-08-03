import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET no está definida. Configura la variable de entorno antes de iniciar el servidor.');
}

export const hashPassword = async (password) => {
    return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};

export const generateToken = (user) => {
    // A8: `tv` (tokenVersion) permite revocar sesiones: si la versión del
    // token no coincide con la de la BD, el middleware rechaza con 401
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, tv: user.tokenVersion ?? 0 },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

export const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};
