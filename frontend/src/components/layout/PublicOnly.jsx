import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loading } from '../states/States';

export function PublicOnly({ children }) {
  const { user, booting } = useAuth();

  if (booting) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loading />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
