import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ActiveClientProvider } from './context/ActiveClientContext'
import { PreferencesProvider } from './context/PreferencesContext'
import { ToastProvider } from './context/ToastContext'
import { routes } from './routes'
import './index.css'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <PreferencesProvider>
        <AuthProvider>
          <ActiveClientProvider>
            <RouterProvider router={router} />
          </ActiveClientProvider>
        </AuthProvider>
      </PreferencesProvider>
    </ToastProvider>
  </StrictMode>,
)
