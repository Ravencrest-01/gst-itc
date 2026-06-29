import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import SideNavBar from './components/layout/SideNavBar';
import TopAppBar from './components/layout/TopAppBar';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

function AuthenticatedLayout() {
  return (
    <>
      <SideNavBar />
      <TopAppBar />
      <Dashboard />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AuthenticatedLayout />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
