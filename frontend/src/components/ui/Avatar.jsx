import React from 'react';
import { cn } from '../../lib/utils';

export function Avatar({ name, src, size = 'default', className }) {
  const initials = name 
    ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() 
    : '?';
    
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    default: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-xl',
  };

  return (
    <div 
      className={cn(
        "relative inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full bg-muted text-muted-foreground font-medium border border-border",
        sizes[size],
        className
      )}
    >
      {src ? (
        <img src={src} alt={name || 'Avatar'} className="w-full h-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
