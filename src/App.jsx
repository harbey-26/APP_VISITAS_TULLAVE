import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider } from './context/NotificationsContext';
import Login from './pages/Login';
import Agenda from './pages/Agenda';
import VisitExecution from './pages/VisitExecution';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Properties from './pages/Properties';
import Tracking from './pages/Tracking';
import Notifications from './pages/Notifications';
import Layout from './components/layout/Layout';

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
                    </Route>
                    <Route path="*" element={<Navigate to="/agenda" replace />} />
                </Routes>
            </Router>
            </NotificationsProvider>
            </ToastProvider>
        </AuthProvider>
    );
}

export default App;
