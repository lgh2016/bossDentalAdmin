/**
 * Configuración centralizada de API.
 *
 * Única variable de entorno admitida: VITE_API_BASE_URL
 *
 * Ejemplos:
 *   - Local:   VITE_API_BASE_URL=http://127.0.0.1:8001/api
 *   - Preview: VITE_API_BASE_URL=https://<host>.preview.emergentagent.com/api
 *
 * Sin fallback silencioso. Si la variable no está configurada, se loguea
 * un error claro y las llamadas fallarán de inmediato (no apunta a producción).
 *
 * Todas las llamadas al backend deben pasar por este módulo.
 */
const fromEnv = import.meta.env.VITE_API_BASE_URL;

if (!fromEnv) {
  // eslint-disable-next-line no-console
  console.error(
    "[Boss Dental] VITE_API_BASE_URL no está configurada. " +
    "Define la URL del backend en frontend/.env (ej. http://127.0.0.1:8001/api).",
  );
}

// Sanea trailing slashes. Si falta, queda como cadena vacía (las requests fallarán
// con un error claro de URL inválida en lugar de pegarle a producción).
export const API_BASE_URL = (fromEnv || "").replace(/\/+$/, "");

// Endpoints relativos. Concatenarse con httpClient (baseURL = API_BASE_URL)
export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    me: "/auth/me",
    validate: "/auth/validate",
    refresh: "/auth/refresh",
  },
  patients: {
    list: "/patients",
  },
  doctors: {
    active: "/doctors/active",
  },
  appointments: {
    base: "/appointments",
    startSlots: "/appointments/start-slots",
    lock: "/appointments/lock",
    cleanupExpiredLocks: "/appointments/cleanup-expired-locks",
    scheduleMonth: "/appointments/schedule/month",
    scheduleDay: "/appointments/schedule/day",
  },
  dashboard: {
    todayCount: "/dashboard/appointments/today/count",
    todayPaged: "/dashboard/appointments/today",
  },
};

// Modo mock-fallback: desactivado — usamos FastAPI como único backend.
export const ALLOW_MOCK_FALLBACK = false;
