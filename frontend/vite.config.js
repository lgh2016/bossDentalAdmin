import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      include: "**/*.{js,jsx,ts,tsx}",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Permite que archivos .js contengan JSX (compat con el código actual del proyecto)
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    // HMR a través del ingress de Emergent (https/wss en 443)
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
    // Permitir el host del preview público de Emergent
    allowedHosts: true,
    watch: {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/build/**",
        "**/dist/**",
        "**/coverage/**",
      ],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
