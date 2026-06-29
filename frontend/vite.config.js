import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy keeps the browser same-origin so there are no CORS issues while
// your FastAPI backend runs on :8000. Calls to /api/* and /healthz are
// forwarded to the backend. Adjust the target if your API runs elsewhere.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/healthz": { target: "http://localhost:8000", changeOrigin: true, rewrite: () => "/" },
    },
  },
});
