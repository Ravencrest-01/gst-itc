import React from "react";
import { cn } from "@/lib/utils";

// A simple native select that fits the Shadcn aesthetic
export const Select = React.forwardRef(({ className, children, error, ...props }, ref) => {
  return (
    <div className="w-full">
      <select
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-destructive focus:ring-destructive",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-destructive mt-1">{error}</span>}
    </div>
  );
});
Select.displayName = "Select";
