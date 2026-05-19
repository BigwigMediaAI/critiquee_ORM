import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import SADashboard from './pages/superadmin/SADashboard';
import SAClients from './pages/superadmin/SAClients';
import SASettings from './pages/superadmin/SASettings';
import AdminDashboard from './pages/admin/AdminDashboard';
import Reviews from './pages/admin/Reviews';
import ReviewDetail from './pages/admin/ReviewDetail';
import Social from './pages/admin/Social';
import CreatePost from './pages/admin/CreatePost';
import Departments from './pages/admin/Departments';
import Platforms from './pages/admin/Platforms';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';
import Branches from './pages/admin/Branches';
import GoogleMyBusiness from './pages/admin/GoogleMyBusiness';
import ShareReviewLink from './pages/admin/ShareReviewLink';
import EventQR from './pages/admin/EventQR';
import OAuthCallback from './pages/admin/OAuthCallback';
import ReviewForm from './pages/public/ReviewForm';
import EventRegistration from './pages/public/EventRegistration';
import PrivacyPolicy from './pages/public/PrivacyPolicy';
import TermsAndConditions from './pages/public/TermsAndConditions';
import DeptDashboard from './pages/dept/DeptDashboard';
import DeptSettings from './pages/dept/DeptSettings';
import './App.css';

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-lg">H</span>
        </div>
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

function RoleRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
  if (user?.role === 'business_admin') return <Navigate to="/admin" replace />;
  if (user?.role === 'department') return <Navigate to="/dept" replace />;
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <BranchProvider>
          <Toaster position="top-right" richColors closeButton />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/review/:branchId" element={<ReviewForm />} />
              <Route path="/event/:eventId" element={<EventRegistration />} />
              <Route path="/pp" element={<PrivacyPolicy />} />
              <Route path="/tandc" element={<TermsAndConditions />} />
              <Route path="/" element={<RoleRedirect />} />

              {/* Super Admin */}
              <Route element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route path="/super-admin" element={<SADashboard />} />
                <Route path="/super-admin/clients" element={<SAClients />} />
                <Route path="/super-admin/share-review" element={<ShareReviewLink />} />
                <Route path="/super-admin/settings" element={<SASettings />} />
              </Route>

              {/* Business Admin */}
              <Route element={
                <ProtectedRoute allowedRoles={['business_admin']}>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/reviews" element={<Reviews />} />
                <Route path="/admin/reviews/:id" element={<ReviewDetail />} />
                <Route path="/admin/social" element={<Social />} />
                <Route path="/admin/create-post" element={<CreatePost />} />
                <Route path="/admin/departments" element={<Departments />} />
                <Route path="/admin/platforms" element={<Platforms />} />
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/settings" element={<Settings />} />
                <Route path="/admin/branches" element={<Branches />} />
                <Route path="/admin/gmb" element={<GoogleMyBusiness />} />
                <Route path="/admin/share-review" element={<ShareReviewLink />} />
                <Route path="/admin/events" element={<EventQR />} />
                <Route path="/admin/oauth/callback" element={<OAuthCallback />} />
              </Route>

              {/* Department User */}
              <Route element={
                <ProtectedRoute allowedRoles={['department']}>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route path="/dept" element={<DeptDashboard />} />
                <Route path="/dept/share-review" element={<ShareReviewLink />} />
                <Route path="/dept/settings" element={<DeptSettings />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </BranchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
