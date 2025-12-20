import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Lazy load pages
const Home = lazy(() => import('./pages/Home'));
const ProblemList = lazy(() => import('./pages/ProblemList'));
const ProblemDetail = lazy(() => import('./pages/ProblemDetail'));
const SubmissionList = lazy(() => import('./pages/SubmissionList'));
const SubmissionDetail = lazy(() => import('./pages/SubmissionDetail'));
const AdminAddProblem = lazy(() => import('./pages/AdminAddProblem'));
const AdminEditProblem = lazy(() => import('./pages/AdminEditProblem'));
const AdminContestCreate = lazy(() => import('./pages/AdminContestCreate'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const ContestList = lazy(() => import('./pages/ContestList'));
const ContestDetail = lazy(() => import('./pages/ContestDetail'));
const ContestLeaderboard = lazy(() => import('./pages/ContestLeaderboard'));
const ContestSubmissionList = lazy(() => import('./pages/ContestSubmissionList'));
const ContestProblem = lazy(() => import('./pages/ContestProblem'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const UserLayout = lazy(() => import('./pages/UserLayout'));
const UserInfo = lazy(() => import('./pages/UserInfo'));
const UserCode = lazy(() => import('./pages/UserCode'));
const UserSecurity = lazy(() => import('./pages/UserSecurity'));
const UserPreferences = lazy(() => import('./pages/UserPreferences'));

import { AuthProvider, useAuth } from './context/AuthContext';
import { UserUIProvider } from './context/UserUIContext';
import LanguageSwitcher from './components/LanguageSwitcher';
import UserAvatarMenu from './components/UserAvatarMenu';
import Footer from './components/Footer';

function NavBar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const isAdmin = user && typeof user.role === 'string' && user.role.toUpperCase() === 'ADMIN';

  return (
    <nav className="bg-primary dark:bg-gray-900 text-white p-4 shadow-md transition-colors duration-200">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">
          <Link to="/">{t('nav.title')}</Link>
        </h1>
        <div className="space-x-4 flex items-center">
          <Link to="/" className="hover:text-secondary transition-colors font-medium">{t('nav.home')}</Link>
          <Link to="/problems" className="hover:text-secondary transition-colors font-medium">{t('nav.problems')}</Link>
          <Link to="/contest" className="hover:text-secondary transition-colors font-medium">{t('nav.contest')}</Link>
          <Link to="/submissions" className="hover:text-secondary transition-colors font-medium">{t('nav.submissions')}</Link>
          
          {isAdmin && (
            <>
              <Link to="/admin" className="hover:text-secondary transition-colors font-medium">{t('admin.title')}</Link>
              <Link to="/admin/add" className="hover:text-secondary transition-colors font-medium">{t('nav.addProblem')}</Link>
            </>
          )}

          {user ? (
            <UserAvatarMenu />
          ) : (
            <>
              <Link to="/login" className="hover:text-secondary transition-colors font-medium">{t('nav.login')}</Link>
              <Link to="/register" className="hover:text-secondary transition-colors font-medium">{t('nav.register')}</Link>
            </>
          )}
          
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  );
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) return <div>{t('common.loading')}</div>;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = user && typeof user.role === 'string' && user.role.toUpperCase() === 'ADMIN';

  if (adminOnly && !isAdmin) {
    return <Navigate to="/problems" replace />;
  }

  return children;
}

function NotFound() {
  const { t } = useTranslation();
  
  return (
    <div className="text-center py-20">
      <h2 className="text-3xl font-bold text-primary mb-4">{t('error.404.title')}</h2>
      <p className="text-gray-600 mb-6">{t('error.404.description')}</p>
      <Link to="/problems" className="text-primary hover:text-blue-700 font-semibold">{t('error.404.backToProblems')}</Link>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <UserUIProvider>
      <Router>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans flex flex-col transition-colors duration-200">
          <NavBar />

          <div className="container mx-auto p-6 flex-grow">
            <Suspense fallback={
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
              </div>
            }>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                
                <Route path="/" element={<Home />} />
                <Route path="/problems" element={<ProblemList />} />
                <Route path="/problem/:id" element={<ProblemDetail />} />
                <Route path="/submissions" element={<SubmissionList />} />
                <Route path="/submission/:id" element={<SubmissionDetail />} />
                <Route path="/contest" element={<ContestList />} />
                <Route path="/contest/:id" element={<ProtectedRoute><ContestDetail /></ProtectedRoute>} />
                <Route path="/contest/:id/leaderboard" element={<ProtectedRoute><ContestLeaderboard /></ProtectedRoute>} />
                <Route path="/contest/:id/submissions" element={<ProtectedRoute><ContestSubmissionList /></ProtectedRoute>} />
                <Route path="/contest/:id/problem/:order" element={<ProtectedRoute><ContestProblem /></ProtectedRoute>} />
                
                <Route path="/admin" element={
                  <ProtectedRoute adminOnly={true}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/add" element={
                  <ProtectedRoute adminOnly={true}>
                    <AdminAddProblem />
                  </ProtectedRoute>
                } />
                <Route path="/admin/edit/:id" element={
                  <ProtectedRoute adminOnly={true}>
                    <AdminEditProblem />
                  </ProtectedRoute>
                } />
                <Route path="/admin/contests/:id/edit" element={
                  <ProtectedRoute adminOnly={true}>
                    <AdminContestCreate />
                  </ProtectedRoute>
                } />
                <Route path="/admin/contests/new" element={
                  <ProtectedRoute adminOnly={true}>
                    <AdminContestCreate />
                  </ProtectedRoute>
                } />
                <Route path="/user" element={<ProtectedRoute><UserLayout /></ProtectedRoute>}>
                  <Route path="info" element={<UserInfo />} />
                  <Route path="code" element={<UserCode />} />
                  <Route path="security" element={<UserSecurity />} />
                  <Route path="preferences" element={<UserPreferences />} />
                  <Route index element={<Navigate to="info" replace />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </div>

          <Footer />
        </div>
      </Router>
      </UserUIProvider>
    </AuthProvider>
  );
}

export default App;
