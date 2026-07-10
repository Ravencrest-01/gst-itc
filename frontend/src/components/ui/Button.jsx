import React from 'react';
import { cn } from '../../lib/utils';

export function Button({ 
  children, 
  variant = 'default', 
  size, 
  block, 
  as: Component = 'button', 
  className,
  disabled,
  ...props 
}) {
  const baseClasses = "inline-flex items-center justify-center rounded-radius font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";
  
  const variants = {
    default: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    accent: "bg-accent text-accent-foreground hover:bg-accent/90",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    ghost: "hover:bg-accent hover:text-accent-foreground bg-transparent border-transparent",
  };
  
  const sizes = {
    default: "h-10 px-4 py-2 text-sm",
    sm: "h-8 rounded-radius px-3 text-xs",
  };

  return (
    <Component
      className={cn(
        baseClasses,
        variants[variant],
        sizes[size === 'sm' ? 'sm' : 'default'],
        block ? "w-full" : "",
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </Component>
  );
}
