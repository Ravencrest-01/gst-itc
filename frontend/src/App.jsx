import React from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

// Layouts & Auth
import { RootLayout } from "./components/layout/RootLayout";
import { RequireAuth } from "./components/layout/RequireAuth";

// Pages
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ClientsList } from "./pages/ClientsList";
import { NewRun } from "./pages/NewRun";
import { RunResults } from "./pages/RunResults";
import { RunReview } from "./pages/RunReview";
import { SettingsStub } from "./pages/SettingsStub";
import { NotFound } from "./pages/NotFound";
import { Register } from "./pages/Register";
import { Reports } from "./pages/Reports";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/register",
    element: <Register />,
  },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      {
        element: <RootLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: "dashboard",
            element: <Dashboard />,
          },
          {
            path: "clients",
            element: <ClientsList />,
          },
          {
            path: "clients/:id",
            element: <Dashboard />, // Subbing dashboard for client overview for now
          },
          {
            path: "runs",
            element: <Navigate to="/dashboard" replace />, // Runs list is on dashboard
          },
          {
            path: "runs/new",
            element: <NewRun />,
          },
          {
            path: "runs/latest",
            element: <RunResults />, // Stub route to hit RunResults
          },
          {
            path: "runs/:runId",
            element: <RunResults />,
          },
          {
            path: "runs/:runId/review",
            element: <RunReview />,
          },
          {
            path: "*",
            element: <NotFound />,
          },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
