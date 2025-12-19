import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Home from './pages/Home';
import ProblemList from './pages/ProblemList';
import ProblemDetail from './pages/ProblemDetail';
import SubmissionList from './pages/SubmissionList';
import SubmissionDetail from './pages/SubmissionDetail';
import AdminAddProblem from './pages/AdminAddProblem';
import AdminEditProblem from './pages/AdminEditProblem';
import AdminContestCreate from './pages/AdminContestCreate';
import AdminDashboard from './pages/AdminDashboard';
import ContestList from './pages/ContestList';
import ContestDetail from './pages/ContestDetail';
import ContestLeaderboard from './pages/ContestLeaderboard';
import ContestSubmissionList from './pages/ContestSubmissionList';
import ContestProblem from './pages/ContestProblem';
import Login from './pages/Login';
import Register from './pages/Register';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserUIProvider } from './context/UserUIContext';
import LanguageSwitcher from './components/LanguageSwitcher';
import UserAvatarMenu from './components/UserAvatarMenu';
import Footer from './components/Footer';
import UserLayout from './pages/UserLayout';
import UserInfo from './pages/UserInfo';
import UserCode from './pages/UserCode';
import UserSecurity from './pages/UserSecurity';
import UserPreferences from './pages/UserPreferences';

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
          </div>

          <Footer />
        </div>
      </Router>
      </UserUIProvider>
    </AuthProvider>
  );
}

export default App;
