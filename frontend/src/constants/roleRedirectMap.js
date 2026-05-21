/**
 * Mapper centralizado de rol → ruta inicial.
 * Usa exclusivamente las rutas ya existentes en /app/frontend/src/routes/AppRoutes.jsx.
 *
 * Soporta los nombres reales del backend (ADMIN/RECEPTION/DENTIST/PATIENT)
 * y los nombres internos en español del proyecto (RECEPCIONISTA/DENTISTA/PACIENTE).
 */
export const ROLE_HOME = {
  ADMIN: "/dashboard",
  RECEPTION: "/dashboard",
  DENTIST: "/dashboard",
  PATIENT: "/dashboard",
  // alias internos (compat con clinicStore + guards previos)
  RECEPCIONISTA: "/dashboard",
  DENTISTA: "/dashboard",
  PACIENTE: "/dashboard",
};

/**
 * Mapea el nombre de rol que viene del backend (RECEPTION/DENTIST/PATIENT)
 * al nombre interno usado por los guards/components del frontend.
 * ADMIN se mantiene igual.
 */
export const BACKEND_TO_INTERNAL_ROLE = {
  ADMIN: "ADMIN",
  RECEPTION: "RECEPCIONISTA",
  DENTIST: "DENTISTA",
  PATIENT: "PACIENTE",
};

export const INTERNAL_TO_BACKEND_ROLE = Object.fromEntries(
  Object.entries(BACKEND_TO_INTERNAL_ROLE).map(([k, v]) => [v, k]),
);

export function resolveHomeForUser(user) {
  if (!user) return "/login";
  const r = user.roleName || user.role || "";
  return ROLE_HOME[r] || "/dashboard";
}

export function internalRoleFromUser(user) {
  if (!user) return null;
  const name = user.roleName || user.role?.name || user.role || null;
  return BACKEND_TO_INTERNAL_ROLE[name] || name;
}
