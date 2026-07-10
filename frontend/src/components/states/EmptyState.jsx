import React from "react";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon = FolderOpen, title = "No data found", description, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {description && <p className="mt-2 text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
