import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { API_URL } from '../config';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

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
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100">
            <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center transform transition-all hover:scale-[1.01]">
                <img src="/logo.png" alt="Tu Llave Inmobiliaria" className="h-20 mx-auto mb-6 object-contain" />

                <h2 className="text-3xl font-bold text-gray-900 mb-2">Iniciar Sesión</h2>
                <p className="text-gray-500 mb-8 font-medium">Accede a tu panel de agente</p>

                {error && (
                    <div className="bg-red-50 border-l-4 border-brand-500 text-red-700 p-3 rounded mb-6 text-left text-sm">
                        <p>{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5 text-left">
                    <div>
                        <label className="block text-gray-700 text-sm font-semibold mb-1 pl-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-gray-700 text-sm font-semibold mb-1 pl-1">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 transition-colors font-bold shadow-lg shadow-red-200 mt-2"
                    >
                        Iniciar Sesión
                    </button>

                    <div className="pt-4 text-center">
                        <Link to="/register" className="text-brand-600 hover:text-brand-800 text-sm font-medium transition-colors">
                            ¿No tienes cuenta? Regístrate
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
