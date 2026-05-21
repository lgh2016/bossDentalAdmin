/**
 * Configuración centralizada de API.
 * Todas las llamadas al backend deben tomar la URL desde aquí.
 */
const fromEnv = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = (fromEnv || "http://localhost:8080/api").replace(/\/+$/, "");

// Endpoints relativos. Concatenarse con httpClient (baseURL = API_BASE_URL)
export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    me: "/auth/me",
    validate: "/auth/validate",
    refresh: "/auth/refresh",
  },
};

// Modo mock-fallback: activar si el backend real no responde
export const ALLOW_MOCK_FALLBACK = true;
