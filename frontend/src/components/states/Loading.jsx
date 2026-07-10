import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Loading({ className, text = "Loading..." }) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 space-y-4 text-muted-foreground", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-medium animate-pulse">{text}</p>
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      <Loading text="Loading application..." />
    </div>
  );
}
