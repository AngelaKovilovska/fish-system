import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';

// Lazy-loaded pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChecklistForm = lazy(() => import('./pages/ChecklistForm'));
const ChecklistHistory = lazy(() => import('./pages/ChecklistHistory'));
const RecordDetail = lazy(() => import('./pages/RecordDetail'));
const Reports = lazy(() => import('./pages/Reports'));
const ManageNorms = lazy(() => import('./pages/admin/ManageNorms'));
const ManageUsers = lazy(() => import('./pages/admin/ManageUsers'));
const ManagePoolMeasurements = lazy(() => import('./pages/admin/ManagePoolMeasurements'));
const ManageFoodInventory = lazy(() => import('./pages/admin/ManageFoodInventory'));
const AdminHub = lazy(() => import('./pages/admin/AdminHub'));
const MealForm = lazy(() => import('./pages/MealForm'));
const MealHistory = lazy(() => import('./pages/MealHistory'));
const AICalculator = lazy(() => import('./pages/AICalculator'));
const EntryHub = lazy(() => import('./pages/EntryHub'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="wave-loader"><span /><span /><span /><span /></div>
    </div>
  );
}

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
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/entry" element={<EntryHub />} />
          <Route path="/checklist" element={<ChecklistForm />} />
          <Route path="/checklist/:id" element={<ChecklistForm />} />
          <Route path="/history" element={<ChecklistHistory />} />
          <Route path="/history/:id" element={<RecordDetail />} />
          <Route path="/meals" element={<MealHistory />} />
          <Route path="/meal/:mealType" element={<MealForm />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/ai-calculator" element={<AICalculator />} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminHub /></ProtectedRoute>} />
          <Route path="/admin/norms" element={<ProtectedRoute adminOnly><ManageNorms /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute adminOnly><ManageUsers /></ProtectedRoute>} />
          <Route path="/admin/measurements" element={<ProtectedRoute adminOnly><ManagePoolMeasurements /></ProtectedRoute>} />
          <Route path="/admin/inventory" element={<ProtectedRoute adminOnly><ManageFoodInventory /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
