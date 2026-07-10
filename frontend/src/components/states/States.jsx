import React from 'react';

export function Loading() {
  return (
    <div className="flex justify-center items-center p-8">
      <span className="material-symbols-outlined animate-spin text-accent" style={{ fontSize: '32px' }}>
        progress_activity
      </span>
    </div>
  );
}

export function Empty({ icon = 'inbox', title = 'No data', message = '', action }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-radius border border-dashed border-border bg-card">
      <span className="material-symbols-outlined text-4xl text-muted-foreground mb-4">
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {message && <p className="text-muted-foreground mb-6 max-w-md">{message}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const isOffline = error?.status === 0 || error?.message?.includes('connect');
  
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-radius border border-destructive/20 bg-destructive/5">
      <span className="material-symbols-outlined text-4xl text-destructive mb-4">
        {isOffline ? 'cloud_off' : 'error'}
      </span>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {isOffline ? 'No backend connected' : 'Something went wrong'}
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        {error?.message || 'An unexpected error occurred.'}
      </p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-radius font-medium hover:opacity-90"
        >
          Retry
        </button>
      )}
    </div>
  );
}
