import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider } from './context/NotificationsContext';
import Login from './pages/Login';
import Layout from './components/layout/Layout';

// Code-splitting por ruta: cada página se descarga solo cuando se navega a
// ella (un agente que solo usa la Agenda no baja el Dashboard ni Tracking).
// Login y Layout quedan eager: son la primera pantalla siempre.
//
// Tras un deploy, los chunks viejos dan 404 si la app quedó abierta durante
// la actualización; en ese caso recargamos una vez para tomar la versión nueva.
const lazyPage = (importer) => lazy(() =>
    importer().catch((err) => {
        const KEY = 'chunk_reload_at';
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last > 30_000) {
            sessionStorage.setItem(KEY, String(Date.now()));
            window.location.reload();
            return new Promise(() => {}); // mantiene el Suspense mientras recarga
        }
        throw err;
    })
);

const Agenda = lazyPage(() => import('./pages/Agenda'));
const VisitExecution = lazyPage(() => import('./pages/VisitExecution'));
const Dashboard = lazyPage(() => import('./pages/Dashboard'));
const Users = lazyPage(() => import('./pages/Users'));
const Properties = lazyPage(() => import('./pages/Properties'));
const Tracking = lazyPage(() => import('./pages/Tracking'));
const Notifications = lazyPage(() => import('./pages/Notifications'));
const Settings = lazyPage(() => import('./pages/Settings'));
const Contracts = lazyPage(() => import('./pages/Contracts'));

const LoadingScreen = () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Cargando...</p>
        </div>
    </div>
);

const ProtectedRoute = ({ children }) => {
    const { token, loading } = useAuth();

    if (loading) return <LoadingScreen />;
    if (!token) return <Navigate to="/login" />;

    return children;
};

const AdminRoute = ({ children }) => {
    const { user, loading } = useAuth();
    if (loading) return <LoadingScreen />;
    return user && user.role === 'ADMIN' ? children : <Navigate to="/" replace />;
};

function App() {
    return (
        <AuthProvider>
            <ToastProvider>
            <NotificationsProvider>
            <Router>
                <Suspense fallback={<LoadingScreen />}>
                <Routes>
                    <Route path="/login" element={<Login />} />

                    <Route path="/" element={
                        <ProtectedRoute>
                            <Layout />
                        </ProtectedRoute>
                    }>
                        <Route index element={<Navigate to="/agenda" replace />} />
                        <Route path="agenda" element={<Agenda />} />
                        <Route path="notifications" element={<Notifications />} />
                        <Route path="visit/:id" element={<VisitExecution />} />
                        <Route path="contracts" element={<Contracts />} />
                        <Route path="dashboard" element={
                            <AdminRoute>
                                <Dashboard />
                            </AdminRoute>
                        } />
                        <Route path="users" element={
                            <AdminRoute>
                                <Users />
                            </AdminRoute>
                        } />
                        <Route path="properties" element={
                            <AdminRoute>
                                <Properties />
                            </AdminRoute>
                        } />
                        <Route path="tracking" element={
                            <AdminRoute>
                                <Tracking />
                            </AdminRoute>
                        } />
                        <Route path="settings" element={
                            <AdminRoute>
                                <Settings />
                            </AdminRoute>
                        } />
                    </Route>
                    <Route path="*" element={<Navigate to="/agenda" replace />} />
                </Routes>
                </Suspense>
            </Router>
            </NotificationsProvider>
            </ToastProvider>
        </AuthProvider>
    );
}

export default App;
