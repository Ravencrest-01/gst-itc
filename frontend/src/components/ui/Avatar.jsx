import React from "react";
import { cn } from "@/lib/utils";

export const Avatar = React.forwardRef(({ className, src, alt, fallback, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted", className)}
    {...props}
  >
    {src ? (
      <img className="aspect-square h-full w-full object-cover" src={src} alt={alt} />
    ) : (
      <span className="flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium">
        {fallback}
      </span>
    )}
  </div>
));
Avatar.displayName = "Avatar";
