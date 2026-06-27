import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Plugin minimalista: en el preview de Emergent el ingress corta el WebSocket
// de HMR de Vite periódicamente. Cuando el WS se reconecta, el cliente de Vite
// ejecuta `location.reload()` y la app "se recarga sola". Inyectamos un script
// en <head> que neutraliza `location.reload` para que sólo lo dispare la app
// (vía `window.__BD_ALLOW_RELOAD__ = true`).
const blockHmrReloadPlugin = () => ({
  name: "boss-dental-block-hmr-reload",
  transformIndexHtml() {
    return [
      {
        tag: "script",
        injectTo: "head-prepend",
        children: `
;(function(){
  try{
    var nativeReload = window.location.reload.bind(window.location);
    Object.defineProperty(window.location, "reload", {
      configurable: true,
      writable: true,
      value: function(){
        if (window.__BD_ALLOW_RELOAD__) return nativeReload();
        console.warn("[BossDental] location.reload() bloqueado (HMR auto-reload).");
      }
    });
  }catch(e){}
})();
        `.trim(),
      },
    ];
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carga manual de .env para poder ramificar la configuración de HMR.
  // Incluye los prefijos del proyecto + el flag DISABLE_HMR.
  const env = loadEnv(mode, process.cwd(), ["VITE_", "REACT_APP_", "DISABLE_HMR"]);

  // En el preview de Emergent el ingress corta el WebSocket de HMR periódicamente;
  // cuando Vite cliente reconecta ejecuta `location.reload()` y la app parece
  // recargarse sola. En ese entorno se setea DISABLE_HMR=true en frontend/.env y
  // así apagamos sólo el HMR (y bloqueamos cualquier reload residual) sin
  // afectar el resto del dev server.
  const disableHmr = ["1", "true", "yes"].includes(String(env.DISABLE_HMR || "").toLowerCase());

  return {
    // Sólo se expone al cliente lo que tenga prefijo VITE_.
    envPrefix: ["VITE_"],
    plugins: [
      react({
        include: "**/*.{js,jsx,ts,tsx}",
      }),
      ...(disableHmr ? [blockHmrReloadPlugin()] : []),
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
      // HMR a través del ingress de Emergent (https/wss en 443).
      // En preview se desactiva para evitar location.reload() al caerse el WS.
      hmr: disableHmr
        ? false
        : {
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
  };
});
