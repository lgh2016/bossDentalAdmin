import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config.js";

// Development-only entry point. Production configuration stays untouched.
export default defineConfig((env) => mergeConfig(baseConfig(env), {
  server: {
    host: "127.0.0.1",
    port: 3001,
    strictPort: true,
    hmr: false,
    headers: {
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:8001; frame-src 'none'; object-src 'none'; base-uri 'self'",
      "X-DNS-Prefetch-Control": "off",
    },
  },
}));
