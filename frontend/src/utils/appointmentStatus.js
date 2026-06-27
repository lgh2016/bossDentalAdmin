/**
 * Mapeo de estados de cita a etiqueta visible (español) + clases visuales.
 * Una sola fuente de verdad — usar en agenda, drawer, dashboards, kpis.
 */

// Reglas de etiqueta (orden de prioridad):
//  1. walkIn === true                                       → "Sin cita"        (violeta)
//  2. statusCode === "CANCELLED"                            → "Cancelada"       (rojo)
//  3. statusCode === "COMPLETED" o "ATTENDED"               → "Atendida"        (gris)
//  4. statusCode === "IN_PROGRESS"                          → "En atención"    (azul)
//  5. statusCode === "ARRIVED" + doctorAsignado             → "Asignada"        (azul)
//  6. statusCode === "ARRIVED"                              → "Llegó"           (ámbar)
//  7. statusCode === "CONFIRMED" + rescheduledAt            → "Reagendada"     (naranja)
//  8. statusCode === "CONFIRMED"                            → "Confirmada"      (verde)
//  9. statusCode === "NO_SHOW"                              → "No asistió"     (rojo)
// 10. statusCode === "LOCKED"                               → "Bloqueada"       (ámbar)
// 11. fallback                                              → statusName || statusCode

const STYLE = {
  walkin:     { label: "Sin cita",    cls: "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300" },
  cancelled:  { label: "Cancelada",   cls: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300" },
  completed:  { label: "Atendida",    cls: "bg-zinc-500/15 text-zinc-700 ring-zinc-500/25 dark:text-zinc-300" },
  inprogress: { label: "En atención", cls: "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300" },
  assigned:   { label: "Asignada",    cls: "bg-blue-500/12 text-blue-700 ring-blue-500/25 dark:text-blue-300" },
  arrived:    { label: "Llegó",       cls: "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300" },
  rescheduled:{ label: "Reagendada",  cls: "bg-orange-500/12 text-orange-700 ring-orange-500/25 dark:text-orange-300" },
  confirmed:  { label: "Confirmada",  cls: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300" },
  noshow:     { label: "No asistió",  cls: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300" },
  locked:     { label: "Bloqueada",   cls: "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300" },
  fallback:   { label: "—",           cls: "bg-secondary text-foreground/70 ring-border" },
};

export function classifyAppointment(a) {
  if (!a) return "fallback";
  if (a.walkIn === true) return "walkin";
  const s = a.statusCode;
  if (s === "CANCELLED") return "cancelled";
  if (s === "COMPLETED" || s === "ATTENDED") return "completed";
  if (s === "IN_PROGRESS") return "inprogress";
  if (s === "ARRIVED") {
    return a.doctorAsignado != null ? "assigned" : "arrived";
  }
  if (s === "CONFIRMED") return a.rescheduledAt ? "rescheduled" : "confirmed";
  if (s === "NO_SHOW") return "noshow";
  if (s === "LOCKED") return "locked";
  return "fallback";
}

export function statusLabel(a) {
  const k = classifyAppointment(a);
  return STYLE[k]?.label || a?.statusName || a?.statusCode || "—";
}

export function statusClasses(a) {
  const k = classifyAppointment(a);
  return STYLE[k]?.cls || STYLE.fallback.cls;
}

/**
 * Devuelve el doctor que se debe MOSTRAR en la tarjeta compacta:
 *   - Si hay doctorAsignado → usar ese
 *   - Si no, doctorSolicitado
 *   - Si no, null (sin asignar)
 *
 * Para el detalle se exponen ambos.
 */
export function effectiveDoctor(a) {
  if (!a) return { id: null, name: null, kind: "none" };
  if (a.doctorAsignado != null) {
    return { id: a.doctorAsignado, name: a.doctorAsignadoName || a.doctorName, kind: "asignado" };
  }
  if (a.doctorSolicitado != null) {
    return { id: a.doctorSolicitado, name: a.doctorSolicitadoName || a.doctorName, kind: "solicitado" };
  }
  if (a.doctorId != null) {
    return { id: a.doctorId, name: a.doctorName, kind: "asignado" };
  }
  return { id: null, name: null, kind: "none" };
}
