/**
 * Configuración centralizada de API.
 * Todas las llamadas al backend deben tomar la URL desde aquí.
 */
const fromEnv = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = (fromEnv || "https://api.bossdental.com.mx").replace(/\/+$/, "");

// Endpoints relativos. Concatenarse con httpClient (baseURL = API_BASE_URL)
export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    me: "/auth/me",
    validate: "/auth/validate",
    refresh: "/auth/refresh",
  },
  patients: {
    list: "/patients", // POST crear, GET listar/buscar paginado
  },
  doctors: {
    active: "/doctors/active", // GET ?branchId=
  },
  appointments: {
    base: "/appointments",
    startSlots: "/appointments/start-slots", // GET ?doctorId=&branchId=&date=
    lock: "/appointments/lock", // POST
    cleanupExpiredLocks: "/appointments/cleanup-expired-locks", // POST
    scheduleMonth: "/appointments/schedule/month", // GET ?year=&month=&branchId=&dentistId=
    scheduleDay: "/appointments/schedule/day", // GET ?date=&branchId=&dentistId=
    // dinámicos: /appointments/{id} (GET detalle), /appointments/{id}/end-time (PUT),
    //           /appointments/{id}/confirm (PUT), /appointments/{id}/end-slots (GET ?startTime=)
  },
  dashboard: {
    todayCount: "/api/dashboard/appointments/today/count", // GET
    todayPaged: "/api/dashboard/appointments/today", // GET ?page=&size=
  },
};

// Modo mock-fallback: activar si el backend real no responde
export const ALLOW_MOCK_FALLBACK = true;
