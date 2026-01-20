import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Agenda from './pages/Agenda';
import VisitExecution from './pages/VisitExecution';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Properties from './pages/Properties';
import Layout from './components/layout/Layout';

const ProtectedRoute = ({ children }) => {
    const { token, loading } = useAuth();

    if (loading) return <div>Loading...</div>;
    if (!token) return <Navigate to="/login" />;

    return children;
};

const AdminRoute = ({ children }) => {
    const { user, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    return user && user.role === 'ADMIN' ? children : <Navigate to="/" replace />;
};

function App() {
    return (
        <AuthProvider>
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
                    </Route>
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
