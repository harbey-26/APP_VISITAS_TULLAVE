import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { Eye, EyeOff, Loader2, CheckCircle2, MapPin } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fallo en el inicio de sesión');

            login(data.user, data.token);

            // Animación de éxito antes de redirigir
            setIsSuccess(true);
            setTimeout(() => navigate('/'), 1300);
        } catch (err) {
            setError(err.message);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-rose-50 p-4">

            {/* Tarjeta centrada */}
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">

                {/* Logo */}
                <div className="flex justify-center mb-5">
                    <img
                        src="/logo.png"
                        alt="TuLlave Inmobiliaria"
                        className="h-14 w-auto object-contain"
                    />
                </div>

                {/* Identidad de marca */}
                <div className="text-center mb-5">
                    <h1 className="text-xl font-extrabold text-gray-900 leading-tight">
                        Gestión de visitas<br />inmobiliarias
                    </h1>
                    <p className="text-gray-500 text-xs mt-2 leading-relaxed">
                        Programación de visitas, agenda digital y reportes para TuLlave Inmobiliaria.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
                        {['Agenda digital', 'Visitas', 'Reportes PDF'].map(f => (
                            <span key={f} className="inline-flex items-center gap-1 bg-brand-600/10 text-brand-600 text-xs font-medium px-2.5 py-1 rounded-full">
                                <MapPin className="w-3 h-3" />
                                {f}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Divisor */}
                <div className="border-t border-gray-100 mb-5" />

                <div className="mb-5 text-center">
                    <h2 className="text-xl font-bold text-gray-900">Iniciar Sesión</h2>
                    <p className="text-gray-500 text-sm mt-1">Accede a tu panel de agente</p>
                </div>

                {error && (
                    <div className="bg-red-50 border-l-4 border-brand-600 text-red-700 p-3 rounded-lg mb-5 text-sm flex items-start gap-2 animate-slide-up">
                        <span className="shrink-0 mt-0.5">⚠</span>
                        <p>{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-gray-700 text-sm font-semibold mb-1.5">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="correo@tullave.com"
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm disabled:opacity-50"
                            required
                            disabled={isSuccess}
                        />
                    </div>

                    <div>
                        <label className="block text-gray-700 text-sm font-semibold mb-1.5">
                            Contraseña
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm disabled:opacity-50"
                                required
                                disabled={isSuccess}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    {/* Botón con animación de éxito */}
                    <button
                        type="submit"
                        disabled={isLoading || isSuccess}
                        className={`w-full py-3.5 rounded-xl font-bold mt-2 flex items-center justify-center gap-2 transition-all duration-500 active:scale-[0.98]
                            ${isSuccess
                                ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30 scale-[1.02]'
                                : 'bg-brand-600 hover:bg-brand-700 shadow-lg shadow-brand-600/25 disabled:opacity-70 disabled:cursor-not-allowed'
                            } text-white`}
                    >
                        {isSuccess ? (
                            <span className="flex items-center gap-2 animate-slide-up">
                                <CheckCircle2 className="w-5 h-5" />
                                ¡Bienvenido!
                            </span>
                        ) : isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Verificando...
                            </>
                        ) : (
                            'Iniciar Sesión'
                        )}
                    </button>
                </form>

                <p className="text-center text-xs text-gray-400 mt-6">
                    ¿No tienes acceso? Solicítalo a tu administrador.
                </p>

                <p className="text-center text-[10px] text-gray-300 mt-4 leading-relaxed">
                    © 2026 Harbey Perdomo. Todos los derechos reservados.<br />
                    Software propietario — uso autorizado únicamente.
                </p>
            </div>
        </div>
    );
}
