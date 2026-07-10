import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export function Modal({ isOpen, onClose, title, children, footer, wide = false }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className={cn("bg-card text-card-foreground rounded-xl shadow-lg border border-border w-full flex flex-col max-h-[90vh] animate-in zoom-in-95", wide ? "max-w-3xl" : "max-w-md")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button 
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, danger = false, busy = false }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={title || (danger ? "Are you sure?" : "Confirm")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button 
            variant={danger ? "danger" : "primary"} 
            onClick={onConfirm} 
            disabled={busy}
          >
            {busy ? "Processing..." : "Confirm"}
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground">{message}</p>
    </Modal>
  );
}
