import { httpClient } from "./httpClient";
import { API_ENDPOINTS } from "@/config/api";
import { session, normalizeUser } from "./session";

export const authApi = {
  /**
   * POST /auth/login
   * Recibe: { email, password }
   * Devuelve: { token, refreshToken, user }
   * Mapeo: token -> accessToken
   */
  async login(credentials) {
    const { data } = await httpClient.post(API_ENDPOINTS.auth.login, credentials);
    const accessToken = data?.token || data?.accessToken;
    const refreshToken = data?.refreshToken;
    const user = normalizeUser(data?.user);
    if (!accessToken) throw new Error("Login response sin accessToken");
    if (!user) throw new Error("Login response sin user");
    session.saveAuth({ accessToken, refreshToken, user });
    return { accessToken, refreshToken, user };
  },

  /**
   * GET /auth/me — requiere Bearer
   */
  async me() {
    const { data } = await httpClient.get(API_ENDPOINTS.auth.me);
    return normalizeUser(data);
  },

  /**
   * POST /auth/validate — requiere Bearer
   * Devuelve: { valid: bool, email }
   */
  async validate() {
    const { data } = await httpClient.post(API_ENDPOINTS.auth.validate);
    return !!data?.valid;
  },

  /**
   * POST /auth/refresh — manejado internamente por httpClient.
   * Esta función se expone por compatibilidad si se quiere forzar refresh.
   */
  async refresh() {
    const refreshToken = session.getRefreshToken();
    if (!refreshToken) throw new Error("No refresh token");
    const { data } = await httpClient.post(API_ENDPOINTS.auth.refresh, { refreshToken });
    const newAccess = data?.accessToken || data?.token || null;
    const newRefresh = data?.refreshToken || refreshToken;
    if (newAccess) session.setAccessToken(newAccess);
    if (newRefresh) session.setRefreshToken(newRefresh);
    return { accessToken: newAccess, refreshToken: newRefresh };
  },

  /**
   * Logout local. Si en algún momento el backend expone /auth/logout, agregar aquí.
   */
  logout() {
    session.clear();
  },
};
