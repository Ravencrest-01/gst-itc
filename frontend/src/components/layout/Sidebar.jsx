import React from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  FileText,
  PieChart
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Users, label: "Clients", href: "/clients" },
  { icon: FileText, label: "Reconciliations", href: "/runs" },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 border-r bg-sidebar flex-shrink-0 flex flex-col hidden md:flex">
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <h1 className="font-bold tracking-tight text-sidebar-primary flex items-center gap-2">
          <div className="h-6 w-6 bg-primary rounded-md flex items-center justify-center text-primary-foreground text-xs font-bold">
            R
          </div>
          ITC-Rec Engine
        </h1>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive ? "text-sidebar-primary" : "text-muted-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground text-center">
        v1.0.0
      </div>
    </aside>
  );
}
