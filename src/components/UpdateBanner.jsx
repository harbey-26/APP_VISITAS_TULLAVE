// Banner que avisa al usuario cuando hay una versión de APK más reciente.
// Solo se muestra dentro del APK nativo (no en la web) y solo si la versión
// instalada NO coincide con la publicada por el backend en /api/app/version.
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Download, X } from 'lucide-react';
import { API_URL } from '../config';

const DISMISSED_KEY = 'visittrack_update_dismissed_for';

export default function UpdateBanner() {
    const [info, setInfo] = useState(null); // { current, latest, apkUrl }

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return; // solo en APK
        let cancelled = false;
        (async () => {
            try {
                const [installed, res] = await Promise.all([
                    CapacitorApp.getInfo(),
                    fetch(`${API_URL}/api/app/version`),
                ]);
                if (!res.ok) return;
                const remote = await res.json();
                if (cancelled) return;
                if (installed.version !== remote.latest) {
                    const dismissed = localStorage.getItem(DISMISSED_KEY);
                    if (dismissed === remote.latest) return; // ya lo cerró para esta versión
                    setInfo({ current: installed.version, latest: remote.latest, apkUrl: remote.apkUrl });
                }
            } catch { /* silencioso */ }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!info) return null;

    const dismiss = () => {
        localStorage.setItem(DISMISSED_KEY, info.latest);
        setInfo(null);
    };

    return (
        <div className="bg-brand-600 text-white px-4 py-2.5 flex items-center gap-3 shadow-md">
            <Download className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">Nueva versión disponible</p>
                <p className="text-xs text-white/80 leading-tight">Tienes {info.current} · disponible {info.latest}</p>
            </div>
            <a
                href={info.apkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-brand-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-brand-50 transition flex-shrink-0"
            >
                Descargar
            </a>
            <button
                onClick={dismiss}
                aria-label="Cerrar"
                className="text-white/80 hover:text-white p-1 flex-shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
