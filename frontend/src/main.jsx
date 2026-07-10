import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import { ActiveClientProvider } from "./context/ActiveClientContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { ToastProvider } from "./context/ToastContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PreferencesProvider>
      <ToastProvider>
        <AuthProvider>
          <ActiveClientProvider>
            <App />
          </ActiveClientProvider>
        </AuthProvider>
      </ToastProvider>
    </PreferencesProvider>
  </React.StrictMode>
);
