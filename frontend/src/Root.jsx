import React from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "./auth/AuthContext";
import AuthScreens from "./pages/AuthScreens";
import App from "./App.jsx";

export default function Root() {
  const { user, booting } = useAuth();
  if (booting) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F5F7FA" }}>
        <Loader2 size={28} className="spin" color="#1F4E79" />
      </div>
    );
  }
  return user ? <App /> : <AuthScreens />;
}
