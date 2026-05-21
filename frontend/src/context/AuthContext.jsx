import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "@/services/authApi";
import { session } from "@/services/session";
import { setOnSessionExpired } from "@/services/httpClient";
import { ALLOW_MOCK_FALLBACK } from "@/config/api";
import { authService as mockAuthService } from "@/services/auth.service";
import { BACKEND_TO_INTERNAL_ROLE } from "@/constants/roleRedirectMap";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";

const AuthContext = createContext(null);

/**
 * Adapta el user real del backend al shape esperado por componentes
 * existentes (role: 'ADMIN'|'RECEPCIONISTA'|'DENTISTA'|'PACIENTE', name, email, avatar, id).
 */
function adaptUser(user, source = "backend") {
  if (!user) return null;
  if (source === "mock") return user;
  const backendRole = user.roleName || user.role?.name || null;
  const internalRole = BACKEND_TO_INTERNAL_ROLE[backendRole] || backendRole;
  return {
    id: user.id ?? null,
    name: user.fullName || user.name || "",
    email: user.email || "",
    role: internalRole,
    roleName: backendRole,
    roleLabel: user.roleLabel || null,
    branch: user.branchName || null,
    branchId: user.branchId ?? null,
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.fullName || user.email || "BD")}`,
    _source: "backend",
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const u = session.getUser();
    if (u) return adaptUser(u, "backend");
    return mockAuthService.getUser();
  });
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  const logoutRef = useRef(() => {});

  const logout = useCallback(() => {
    authApi.logout();
    mockAuthService.logout();
    setUser(null);
  }, []);
  logoutRef.current = logout;

  // Conectar httpClient → si refresh falla, cierra sesión.
  useEffect(() => {
    setOnSessionExpired(() => logoutRef.current?.());
  }, []);

  // Bootstrap al cargar la app: si hay accessToken, validar; si no, fallback mock user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const accessToken = session.getAccessToken();
      if (accessToken) {
        try {
          const me = await authApi.me();
          if (!cancelled) {
            session.setUser(me);
            setUser(adaptUser(me, "backend"));
          }
        } catch (e) {
          // /auth/me falló → httpClient ya intentó refresh; si seguimos aquí, sesión muerta.
          if (!cancelled) {
            session.clear();
            const fallback = mockAuthService.getUser();
            setUser(fallback || null);
          }
        }
      }
      if (!cancelled) setBootstrapping(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      try {
        const res = await authApi.login({ email, password });
        const adapted = adaptUser(res.user, "backend");
        setUser(adapted);
        return adapted;
      } catch (err) {
        const status = err?.response?.status;
        const isNetwork = !err?.response && (err?.code === "ERR_NETWORK" || err?.message === "Network Error" || err?.code === "ECONNABORTED");
        // Fallback a mock SOLO si el backend no respondió (offline / CORS / unreachable) y está habilitado.
        if (isNetwork && ALLOW_MOCK_FALLBACK) {
          const mockResult = await mockAuthService.login(email, password);
          const adapted = { ...mockResult.user, _source: "mock" };
          setUser(adapted);
          return adapted;
        }
        // 4xx → propagar error real (credenciales inválidas, etc.)
        if (status === 401 || status === 400) {
          const message = err?.response?.data?.message || "Credenciales incorrectas";
          const e = new Error(message);
          e.code = "INVALID_CREDENTIALS";
          throw e;
        }
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Inactividad por rol
  useInactivityTimer({
    enabled: !!user,
    roleName: user?.roleName || user?.role,
    onTimeout: () => logoutRef.current?.(),
  });

  const value = useMemo(
    () => ({ user, loading, bootstrapping, login, logout, isAuthenticated: !!user }),
    [user, loading, bootstrapping, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
