import axios from "axios";
import { API_BASE_URL, API_ENDPOINTS } from "@/config/api";
import { session } from "./session";

/**
 * httpClient — instancia central de axios.
 * - Inyecta Authorization: Bearer <accessToken> en todos los requests autenticados.
 * - Excluye los endpoints públicos de auth (login, refresh) del header.
 * - Maneja 401 → intenta refresh una vez → reintenta el request original.
 */
const PUBLIC_AUTH_PATHS = [API_ENDPOINTS.auth.login, API_ENDPOINTS.auth.refresh];

const isPublicAuthPath = (url = "") =>
  PUBLIC_AUTH_PATHS.some((p) => url.endsWith(p) || url === p);

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

httpClient.interceptors.request.use((config) => {
  const url = config.url || "";
  if (!isPublicAuthPath(url)) {
    const token = session.getAccessToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// --- Refresh queue (single flight) ---
let isRefreshing = false;
let pendingQueue = [];

const subscribe = (cb) => pendingQueue.push(cb);
const notifyAll = (newToken) => {
  pendingQueue.forEach((cb) => cb(newToken));
  pendingQueue = [];
};

let onSessionExpired = null;
export const setOnSessionExpired = (fn) => { onSessionExpired = fn; };

async function refreshAccessToken() {
  const refreshToken = session.getRefreshToken();
  if (!refreshToken) throw new Error("No refresh token");
  // Llamada directa (sin interceptor) para evitar recursión
  const { data } = await axios.post(
    `${API_BASE_URL}${API_ENDPOINTS.auth.refresh}`,
    { refreshToken },
    { headers: { "Content-Type": "application/json" } },
  );
  // Backend puede devolver: { accessToken, refreshToken, tokenType } (futuro)
  //                  o:    { token, refreshToken } (actual)
  //                  o:    { refreshToken } (temporal — sin nuevo accessToken)
  const newAccess = data?.accessToken || data?.token || null;
  const newRefresh = data?.refreshToken || refreshToken;
  if (newAccess) session.setAccessToken(newAccess);
  if (newRefresh) session.setRefreshToken(newRefresh);
  if (!newAccess) throw new Error("Refresh did not return a new access token");
  return newAccess;
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const url = original.url || "";

    // Sólo intentar refresh si el 401 ocurre fuera de endpoints públicos de auth
    if (status === 401 && !isPublicAuthPath(url) && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribe((newToken) => {
            if (!newToken) return reject(error);
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(httpClient(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        notifyAll(newToken);
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return httpClient(original);
      } catch (e) {
        isRefreshing = false;
        notifyAll(null);
        session.clear();
        if (onSessionExpired) onSessionExpired("refresh_failed");
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);
