import { createContext, useContext, useState, useEffect } from 'react';

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

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            if (isTokenExpired(token)) {
                // Token expirado → limpiar sesión silenciosamente
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                setToken(null);
            } else {
                const savedUser = localStorage.getItem('user');
                if (savedUser) {
                    try { setUser(JSON.parse(savedUser)); } catch { /* json corrupto */ }
                }
            }
        }
        setLoading(false);
    }, [token]);

    const login = (userData, authToken) => {
        setUser(userData);
        setToken(authToken);
        localStorage.setItem('token', authToken);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
