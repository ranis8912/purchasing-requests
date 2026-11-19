import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build straight into the backend so FastAPI serves the SPA from the same origin (no CORS).
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../backend/static", emptyOutDir: true, sourcemap: false },
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
});
