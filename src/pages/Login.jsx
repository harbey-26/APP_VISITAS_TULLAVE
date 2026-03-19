import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { Eye, EyeOff, Loader2, MapPin } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
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
            navigate('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row">

            {/* Panel izquierdo — identidad de marca */}
            <div className="relative lg:flex-1 bg-brand-600 flex flex-col items-center justify-center p-10 lg:p-16 min-h-[38vh] lg:min-h-screen overflow-hidden">

                {/* Círculos decorativos */}
                <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/5" />
                <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-white/5" />
                <div className="absolute top-1/2 right-8 w-32 h-32 rounded-full bg-white/5 -translate-y-1/2" />

                {/* Contenido */}
                <div className="relative z-10 flex flex-col items-center lg:items-start text-center lg:text-left max-w-sm">
                    <img
                        src="/logo.png"
                        alt="TuLlave Inmobiliaria"
                        className="h-14 lg:h-20 w-auto mb-8 object-contain brightness-0 invert drop-shadow-lg"
                    />
                    <h1 className="text-white text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight">
                        Gestión de visitas<br />inmobiliarias
                    </h1>
                    <p className="text-white/70 mt-4 text-sm lg:text-base leading-relaxed">
                        Rastreo en tiempo real de agentes, programación de visitas y reportes para TuLlave Inmobiliaria.
                    </p>

                    {/* Pills de características */}
                    <div className="flex flex-wrap gap-2 mt-6 justify-center lg:justify-start">
                        {['GPS en tiempo real', 'Agenda digital', 'Reportes PDF'].map(f => (
                            <span key={f} className="inline-flex items-center gap-1.5 bg-white/15 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                                <MapPin className="w-3 h-3" />
                                {f}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Panel derecho — formulario */}
            <div className="flex-1 lg:max-w-md bg-white flex items-center justify-center p-8 lg:p-12">
                <div className="w-full max-w-sm">

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-900">Iniciar sesión</h2>
                        <p className="text-gray-500 text-sm mt-1">Accede a tu panel de trabajo</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border-l-4 border-brand-600 text-red-700 p-3 rounded-lg mb-6 text-sm flex items-start gap-2">
                            <span className="shrink-0 mt-0.5">⚠</span>
                            <p>{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-gray-700 text-sm font-semibold mb-1.5">
                                Correo electrónico
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="correo@tullave.com"
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
                                required
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
                                    className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
                                    required
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

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 active:scale-[0.98] transition-all font-bold shadow-lg shadow-brand-600/25 mt-2 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Ingresando...
                                </>
                            ) : (
                                'Ingresar'
                            )}
                        </button>
                    </form>

                    <p className="text-center text-xs text-gray-400 mt-8">
                        TuLlave Inmobiliaria · Sistema de visitas
                    </p>
                </div>
            </div>
        </div>
    );
}
