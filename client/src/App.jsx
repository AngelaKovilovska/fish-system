import { Suspense } from 'react';
import { lazyPage } from './lib/lazyPage';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';

// Lazy-loaded pages
const Dashboard = lazyPage(() => import('./pages/Dashboard'));
const ChecklistForm = lazyPage(() => import('./pages/ChecklistForm'));
const ChecklistHistory = lazyPage(() => import('./pages/ChecklistHistory'));
const RecordDetail = lazyPage(() => import('./pages/RecordDetail'));
const Reports = lazyPage(() => import('./pages/Reports'));
const ManageNorms = lazyPage(() => import('./pages/admin/ManageNorms'));
const ManageUsers = lazyPage(() => import('./pages/admin/ManageUsers'));
const ManagePoolMeasurements = lazyPage(() => import('./pages/admin/ManagePoolMeasurements'));
const ManageFoodInventory = lazyPage(() => import('./pages/admin/ManageFoodInventory'));
const AdminHub = lazyPage(() => import('./pages/admin/AdminHub'));
const MealForm = lazyPage(() => import('./pages/MealForm'));
const MealHistory = lazyPage(() => import('./pages/MealHistory'));
const AICalculator = lazyPage(() => import('./pages/AICalculator'));
const EntryHub = lazyPage(() => import('./pages/EntryHub'));
const ProductionHub = lazyPage(() => import('./pages/ProductionHub'));
const ProductionNew = lazyPage(() => import('./pages/ProductionNew'));
const SalesNew = lazyPage(() => import('./pages/SalesNew'));
const SalesHistory = lazyPage(() => import('./pages/SalesHistory'));
const InventoryHub = lazyPage(() => import('./pages/InventoryHub'));
const FoodInventoryPage = lazyPage(() => import('./pages/FoodInventoryPage'));
const ProductInventoryPage = lazyPage(() => import('./pages/ProductInventoryPage'));

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
    return <div className="min-h-screen flex items-center justify-center text-(--text-muted)">Се вчитува...</div>;
  }

  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" />;

  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-(--text-muted)">Се вчитува...</div>;
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
          <Route path="/production" element={<ProductionHub />} />
          <Route path="/production/processing" element={<ProductionNew />} />
          <Route path="/production/sales" element={<SalesNew key="new" />} />
          <Route path="/production/sales/:id/edit" element={<SalesNew key="edit" />} />
          <Route path="/production/sales/history" element={<SalesHistory />} />
          <Route path="/inventory" element={<InventoryHub />} />
          <Route path="/inventory/food" element={<FoodInventoryPage />} />
          <Route path="/inventory/products" element={<ProductInventoryPage />} />
          {/* Legacy routes redirect */}
          <Route path="/sales/new" element={<Navigate to="/production/sales" />} />
          <Route path="/sales/history" element={<Navigate to="/production/sales/history" />} />
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
