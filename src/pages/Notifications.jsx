import { useEffect } from 'react';
import { Bell, CheckCheck, Megaphone } from 'lucide-react';
import { useNotifications } from '../context/NotificationsContext';
import { PageHeader, Button, EmptyState, Spinner } from '../components/ui';

// Tiempo relativo en español
function timeAgo(iso) {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'hace un momento';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    if (diff < 172800) return 'ayer';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Notifications() {
    const { items, loading, unreadCount, markRead, markAllRead, refresh } = useNotifications();

    useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-5">
            <PageHeader
                title="Notificaciones"
                subtitle={unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
            >
                <Button
                    variant="secondary"
                    icon={CheckCheck}
                    disabled={unreadCount === 0}
                    onClick={markAllRead}
                >
                    Marcar todas como leídas
                </Button>
            </PageHeader>

            {loading && items.length === 0 ? (
                <div className="flex justify-center py-16"><Spinner /></div>
            ) : items.length === 0 ? (
                <EmptyState
                    icon={Bell}
                    title="No tienes notificaciones"
                    description="Los comunicados del administrador aparecerán aquí."
                />
            ) : (
                <div className="space-y-2.5">
                    {items.map((n) => (
                        <button
                            key={n.id}
                            onClick={() => !n.read && markRead(n.id)}
                            className={`w-full text-left flex gap-3 p-4 rounded-2xl border transition-all ${
                                n.read
                                    ? 'bg-white border-gray-100'
                                    : 'bg-brand-50/60 border-brand-100 hover:bg-brand-50 cursor-pointer'
                            }`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                n.read ? 'bg-gray-100 text-gray-400' : 'bg-brand-600 text-white'
                            }`}>
                                <Megaphone className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className={`font-bold text-sm leading-snug ${n.read ? 'text-gray-700' : 'text-gray-900'}`}>
                                        {n.title}
                                    </p>
                                    {!n.read && (
                                        <span className="text-[10px] font-bold text-white bg-brand-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                            NUEVA
                                        </span>
                                    )}
                                </div>
                                <p className={`text-sm mt-0.5 ${n.read ? 'text-gray-500' : 'text-gray-700'}`}>
                                    {n.body}
                                </p>
                                <p className="text-xs text-gray-400 mt-1.5">{timeAgo(n.createdAt)}</p>
                            </div>
                            {!n.read && (
                                <span className="w-2.5 h-2.5 rounded-full bg-brand-600 flex-shrink-0 mt-1.5" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
