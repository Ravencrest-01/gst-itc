import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogOut, User, Plus, WifiOff, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useActiveClient } from "@/context/ActiveClientContext";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import { Select } from "../ui/Select";
import { listClients } from "@/api";

export function Topbar() {
  const { user, logout } = useAuth();
  const { activeClientId, setActiveClientId } = useActiveClient();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    // Load clients for the switcher
    const fetchClients = async () => {
      try {
        const data = await listClients();
        // Assuming response is an array of clients
        setClients(Array.isArray(data) ? data : data.items || []);
      } catch (err) {
        console.error("Failed to load clients for topbar");
      }
    };
    fetchClients();

    // Setup online/offline listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="h-16 border-b bg-background flex items-center justify-between px-6 shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        {/* Mobile menu button (stubbed for now) */}
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        
        {/* Client Switcher */}
        <div className="hidden sm:flex items-center gap-2 w-64">
          <Select 
            value={activeClientId || ""} 
            onChange={(e) => setActiveClientId(e.target.value)}
            className="h-9 font-medium"
          >
            <option value="" disabled>Select Workspace...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {isOffline && (
          <div className="flex items-center gap-2 text-xs font-medium text-destructive bg-destructive/10 px-3 py-1.5 rounded-full">
            <WifiOff className="h-3.5 w-3.5" />
            Offline Mode
          </div>
        )}

        <Button size="sm" onClick={() => navigate("/runs/new")} className="hidden sm:flex">
          <Plus className="mr-2 h-4 w-4" />
          New Reconciliation
        </Button>

        <div className="h-6 w-px bg-border mx-1"></div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col text-right hidden sm:flex">
            <span className="text-sm font-medium leading-none">{user?.full_name || user?.name || "User"}</span>
            <span className="text-xs text-muted-foreground mt-1">{user?.workspace_name || "Workspace"}</span>
          </div>
          <div className="relative group">
            <Avatar fallback={user?.name?.charAt(0).toUpperCase() || "U"} className="cursor-pointer" />
            <div className="absolute right-0 top-full mt-2 w-48 rounded-md border bg-popover p-1 shadow-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <div className="px-2 py-1.5 text-sm font-medium border-b mb-1 sm:hidden">
                {user?.name}
              </div>
              <Link to="/settings/profile" className="flex items-center w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                <User className="mr-2 h-4 w-4" />
                Profile Settings
              </Link>
              <button 
                onClick={handleLogout}
                className="flex items-center w-full rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
