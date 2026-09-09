import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';

const AuthContext = createContext(null);

// C4: Decodificar JWT y verificar expiración sin librería externa
function isTokenExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 < Date.now();
    } catch {
        return true;
    }
}

// A6: Milisegundos que faltan para que expire el token
function msUntilExpiry(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 - Date.now();
    } catch {
        return 0;
    }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    const logout = useCallback(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }, []);

    // El `user` guardado en localStorage es el del momento del login. Si el
    // admin cambió el rol (o el nombre) después, la UI seguía armándose con el
    // viejo — un agente ascendido a asistente no veía el selector de agente y
    // el backend (que ya lo trataba como asistente) le rechazaba las visitas.
    const applyServerUser = useCallback((serverUser) => {
        if (!serverUser?.id) return;
        setUser(prev => {
            const next = { ...(prev || {}), ...serverUser };
            localStorage.setItem('user', JSON.stringify(next));
            return next;
        });
    }, []);

    // Sincronizar el usuario guardado con la BD al arrancar (silencioso: si
    // falla la red se sigue con el guardado; un 401 dispara el logout global)
    const syncUser = useCallback(async (currentToken) => {
        try {
            const serverUser = await apiFetch('/api/auth/me', { token: currentToken });
            applyServerUser(serverUser);
        } catch {
            // sin red / servicio caído: se conserva el user guardado
        }
    }, [applyServerUser]);

    // A6: Renovar token silenciosamente antes de que expire
    const attemptRefresh = useCallback(async (currentToken) => {
        try {
            const data = await apiFetch('/api/auth/refresh', { method: 'POST', token: currentToken });
            if (data.token) {
                setToken(data.token);
                localStorage.setItem('token', data.token);
            }
            applyServerUser(data.user);
        } catch {
            // Si el refresh falla, el usuario seguirá con el token actual hasta que expire
        }
    }, [applyServerUser]);

    useEffect(() => {
        if (token) {
            if (isTokenExpired(token)) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                setToken(null);
            } else {
                const savedUser = localStorage.getItem('user');
                if (savedUser) {
                    try { setUser(JSON.parse(savedUser)); } catch { /* json corrupto */ }
                }
                // A6: Si vence en menos de 24h, renovar proactivamente (el
                // refresh ya devuelve el usuario vigente); si no, sincronizarlo
                if (msUntilExpiry(token) < ONE_DAY_MS) {
                    attemptRefresh(token);
                } else {
                    syncUser(token);
                }
            }
        }
        setLoading(false);
    }, []);

    // A7: Escuchar 401 global disparado por apiFetch y cerrar sesión
    useEffect(() => {
        const handleUnauthorized = () => logout();
        window.addEventListener('auth:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
    }, [logout]);

    const login = (userData, authToken) => {
        setUser(userData);
        setToken(authToken);
        localStorage.setItem('token', authToken);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
