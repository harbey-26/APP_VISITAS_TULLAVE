import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { API_URL } from '../config';

const NotificationsContext = createContext(null);

// IDs ya "alertados" como toast en este dispositivo — evita re-avisar en cada
// arranque mientras la notificación siga sin leerse (la lectura vive en el servidor).
const ALERTED_KEY = 'visittrack_alerted_broadcasts';

const loadAlerted = () => {
    try { return new Set(JSON.parse(localStorage.getItem(ALERTED_KEY) || '[]')); }
    catch { return new Set(); }
};
const saveAlerted = (set) => {
    try { localStorage.setItem(ALERTED_KEY, JSON.stringify([...set])); } catch { /* lleno */ }
};

export function NotificationsProvider({ children }) {
    const { token } = useAuth();
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const alertedRef = useRef(loadAlerted());

    const unreadCount = items.reduce((n, i) => n + (i.read ? 0 : 1), 0);

    const refresh = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/broadcasts/inbox`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            setItems(list);

            // Toast solo para no leídas aún no alertadas en este dispositivo
            let changed = false;
            for (const b of list) {
                if (!b.read && !alertedRef.current.has(b.id)) {
                    alertedRef.current.add(b.id);
                    changed = true;
                    toast.info(`📢 ${b.title}: ${b.body}`);
                }
            }
            if (changed) saveAlerted(alertedRef.current);
        } catch { /* silencioso */ } finally {
            setLoading(false);
        }
    }, [token, toast]);

    const markRead = useCallback(async (id) => {
        setItems(prev => prev.map(i => (i.id === id ? { ...i, read: true } : i)));
        if (!token) return;
        try {
            await fetch(`${API_URL}/api/broadcasts/${id}/read`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` },
            });
        } catch { /* el optimista ya actualizó la UI */ }
    }, [token]);

    const markAllRead = useCallback(async () => {
        setItems(prev => prev.map(i => ({ ...i, read: true })));
        if (!token) return;
        try {
            await fetch(`${API_URL}/api/broadcasts/read-all`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` },
            });
        } catch { /* idem */ }
    }, [token]);

    useEffect(() => {
        if (!token) { setItems([]); return; }
        refresh();
        const interval = setInterval(refresh, 60000);
        // Refresh inmediato al volver del background o ganar foco la ventana
        // (típico cuando el agente abre la app tras una push de notificación)
        const onVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        document.addEventListener('visibilitychange', onVisibilityOrFocus);
        window.addEventListener('focus', onVisibilityOrFocus);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityOrFocus);
            window.removeEventListener('focus', onVisibilityOrFocus);
        };
    }, [token, refresh]);

    return (
        <NotificationsContext.Provider
            value={{ items, loading, unreadCount, refresh, markRead, markAllRead }}
        >
            {children}
        </NotificationsContext.Provider>
    );
}

export const useNotifications = () => useContext(NotificationsContext);
