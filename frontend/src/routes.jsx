import { Navigate } from 'react-router-dom';
import { RootLayout } from './components/layout/RootLayout';
import { RequireAuth } from './components/layout/RequireAuth';
import { PublicOnly } from './components/layout/PublicOnly';

import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientHome from './pages/ClientHome';
import Vendors from './pages/Vendors';
import Files from './pages/Files';
import Team from './pages/Team';
import Runs from './pages/Runs';
import NewRun from './pages/NewRun';
import RunResults from './pages/runs/RunResults';
import RunReview from './pages/runs/RunReview';
import Reports from './pages/Reports';
import Profile from './pages/settings/Profile';
import Preferences from './pages/settings/Preferences';
import Subscription from './pages/settings/Subscription';
import Integrations from './pages/settings/Integrations';
import Workspace from './pages/settings/Workspace';

// Placeholder Pages
const Placeholder = ({ name }) => <div className="p-4 border border-dashed rounded-md bg-secondary text-foreground text-center">Placeholder for {name}</div>;

export const routes = [
  {
    path: '/login',
    element: <PublicOnly><Login /></PublicOnly>
  },
  {
    path: '/register',
    element: <PublicOnly><Register /></PublicOnly>
  },
  {
    path: '/',
    element: <RequireAuth><RootLayout /></RequireAuth>,
    children: [
      { path: '', element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'onboarding', element: <Onboarding /> },
      { path: 'clients', element: <Clients /> },
      { path: 'clients/:id', element: <ClientHome /> },
      { path: 'clients/:id/vendors', element: <Vendors /> },
      { path: 'clients/:id/files', element: <Files /> },
      { path: 'clients/:id/runs', element: <Runs /> },
      { path: 'clients/:id/runs/new', element: <NewRun /> },
      { path: 'runs', element: <Navigate to="/dashboard" replace /> },
      { path: 'runs/:runId', element: <RunResults /> },
      { path: 'runs/:runId/review', element: <RunReview /> },
      { path: 'review', element: <Navigate to="/dashboard" replace /> },
      { path: 'files', element: <Navigate to="/dashboard" replace /> },
      { path: 'reports', element: <Reports /> },
      { path: 'members', element: <Team /> },
      { path: 'settings/profile', element: <Profile /> },
      { path: 'settings/preferences', element: <Preferences /> },
      { path: 'settings/subscription', element: <Subscription /> },
      { path: 'settings/integrations', element: <Integrations /> },
      { path: 'settings/workspace', element: <Workspace /> },
      { path: '*', element: <Placeholder name="Not Found (404)" /> },
    ]
  }
];
