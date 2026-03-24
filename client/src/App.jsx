import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChecklistForm from './pages/ChecklistForm';
import ChecklistHistory from './pages/ChecklistHistory';
import RecordDetail from './pages/RecordDetail';
import Reports from './pages/Reports';
import ManageNorms from './pages/admin/ManageNorms';
import ManageUsers from './pages/admin/ManageUsers';
import ManagePoolMeasurements from './pages/admin/ManagePoolMeasurements';
import ManageFoodInventory from './pages/admin/ManageFoodInventory';
import AdminHub from './pages/admin/AdminHub';
import MealForm from './pages/MealForm';
import MealHistory from './pages/MealHistory';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Се вчитува...</div>;
  }

  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" />;

  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Се вчитува...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/checklist" element={<ChecklistForm />} />
        <Route path="/checklist/:id" element={<ChecklistForm />} />
        <Route path="/history" element={<ChecklistHistory />} />
        <Route path="/history/:id" element={<RecordDetail />} />
        <Route path="/meals" element={<MealHistory />} />
        <Route path="/meal/:mealType" element={<MealForm />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminHub /></ProtectedRoute>} />
        <Route path="/admin/norms" element={<ProtectedRoute adminOnly><ManageNorms /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><ManageUsers /></ProtectedRoute>} />
        <Route path="/admin/measurements" element={<ProtectedRoute adminOnly><ManagePoolMeasurements /></ProtectedRoute>} />
        <Route path="/admin/inventory" element={<ProtectedRoute adminOnly><ManageFoodInventory /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
