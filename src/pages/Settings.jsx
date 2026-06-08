// M8: Pantalla de configuración (admin) — incluye integración con Google Calendar
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config';
import { Card, PageHeader, Button, Badge } from '../components/ui';
import { Calendar as CalIcon, CheckCircle2, XCircle, ExternalLink, Loader2 } from 'lucide-react';

export default function Settings() {
    const { token } = useAuth();
    const toast = useToast();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);

    const refresh = async () => {
        try {
            const res = await fetch(`${API_URL}/api/integrations/google/status`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setStatus(await res.json());
        } finally { setLoading(false); }
    };

    useEffect(() => { refresh(); }, []);

    const connect = () => {
        // El endpoint /start hace redirect 302 a Google. Abrimos en pestaña nueva
        // y pasamos el JWT por query — no podemos meter Authorization en una nueva
        // navegación.
        const url = `${API_URL || ''}/api/integrations/google/start?token=${encodeURIComponent(token)}`;
        window.open(url, '_blank', 'noopener');
        toast.info('Te abrimos Google en otra pestaña. Vuelve aquí cuando termines.');
    };

    const disconnect = async () => {
        if (!confirm('¿Desconectar Google Calendar? Los eventos ya creados quedan en el calendario pero no se sincronizarán cambios.')) return;
        setWorking(true);
        try {
            const res = await fetch(`${API_URL}/api/integrations/google/disconnect`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) { toast.success('Desconectado'); await refresh(); }
            else toast.error('No se pudo desconectar');
        } finally { setWorking(false); }
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Configuración" subtitle="Integraciones y ajustes" />

            <Card>
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                        <CalIcon className="w-6 h-6 text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-semibold text-gray-900">Google Calendar</h3>
                            {loading
                                ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                : !status?.enabled
                                    ? <Badge className="bg-gray-100 text-gray-600">No configurado</Badge>
                                    : status.connected
                                        ? <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 inline" />Conectado</Badge>
                                        : <Badge className="bg-gray-100 text-gray-600"><XCircle className="w-3 h-3 inline" />Desconectado</Badge>}
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                            Sincroniza automáticamente las visitas a una cuenta corporativa de Google Calendar.
                            Cuando creas, reasignas o eliminas una visita, el evento se actualiza en el calendar conectado.
                        </p>

                        {!loading && !status?.enabled && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                Falta configurar <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> y <code>GOOGLE_REDIRECT_URI</code>
                                en el servidor (Railway). Ver <code>docs/google-calendar-setup.md</code>.
                            </p>
                        )}

                        {!loading && status?.enabled && status.connected && (
                            <div className="space-y-2">
                                <p className="text-sm text-gray-700">
                                    Cuenta: <span className="font-medium">{status.accountEmail || 'desconocida'}</span>
                                </p>
                                <p className="text-xs text-gray-500">
                                    Calendar: {status.calendarId || 'primary'}
                                </p>
                                <div className="flex gap-2 mt-3">
                                    <Button variant="secondary" onClick={connect}>
                                        Reconectar <ExternalLink className="w-4 h-4 ml-1.5" />
                                    </Button>
                                    <Button variant="danger" onClick={disconnect} disabled={working}>
                                        Desconectar
                                    </Button>
                                </div>
                            </div>
                        )}

                        {!loading && status?.enabled && !status.connected && (
                            <Button onClick={connect}>
                                Conectar Google Calendar <ExternalLink className="w-4 h-4 ml-1.5" />
                            </Button>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
