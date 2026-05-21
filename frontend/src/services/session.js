/**
 * Gestión centralizada de sesión.
 * Persistencia en localStorage + lectura síncrona.
 */
const KEYS = {
  access: "bd_access_token",
  refresh: "bd_refresh_token",
  user: "bd_user",
  lastActivity: "bd_last_activity",
};

const safeParse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

export const session = {
  // --- Tokens ---
  setAccessToken(token) {
    if (token) localStorage.setItem(KEYS.access, token);
    else localStorage.removeItem(KEYS.access);
  },
  getAccessToken() { return localStorage.getItem(KEYS.access); },

  setRefreshToken(token) {
    if (token) localStorage.setItem(KEYS.refresh, token);
    else localStorage.removeItem(KEYS.refresh);
  },
  getRefreshToken() { return localStorage.getItem(KEYS.refresh); },

  // --- User ---
  setUser(user) {
    if (user) localStorage.setItem(KEYS.user, JSON.stringify(user));
    else localStorage.removeItem(KEYS.user);
  },
  getUser() { return safeParse(localStorage.getItem(KEYS.user)); },

  // --- Last activity ---
  setLastActivity(ts) { localStorage.setItem(KEYS.lastActivity, String(ts || Date.now())); },
  getLastActivity() { return Number(localStorage.getItem(KEYS.lastActivity)) || 0; },

  // --- Save full auth payload ---
  saveAuth({ accessToken, refreshToken, user }) {
    if (accessToken !== undefined) this.setAccessToken(accessToken);
    if (refreshToken !== undefined) this.setRefreshToken(refreshToken);
    if (user !== undefined) this.setUser(user);
    this.setLastActivity(Date.now());
  },

  clear() {
    localStorage.removeItem(KEYS.access);
    localStorage.removeItem(KEYS.refresh);
    localStorage.removeItem(KEYS.user);
    localStorage.removeItem(KEYS.lastActivity);
  },
};

/**
 * Normaliza la respuesta del usuario que viene del backend Spring Boot.
 * Estructura recibida:
 *   { id, name, lastName, email, role: { id, name, description }, branch: { id, name } }
 *
 * Retorna un user con accesos cómodos para el frontend, manteniendo el original.
 */
export function normalizeUser(raw) {
  if (!raw) return null;
  return {
    ...raw,
    roleName: raw.role?.name || null,
    roleLabel: raw.role?.description || raw.role?.name || null,
    branchName: raw.branch?.name || null,
    branchId: raw.branch?.id ?? null,
    fullName: [raw.name, raw.lastName].filter(Boolean).join(" ").trim(),
  };
}
