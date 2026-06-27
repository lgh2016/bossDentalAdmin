import { cn } from "@/lib/utils";
import { statusLabel, statusClasses } from "@/utils/appointmentStatus";

const LEGACY_MAP = {
  Confirmada: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  "En curso": "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  "En consulta": "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  "Llegó": "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300",
  Atendida: "bg-zinc-500/15 text-zinc-700 ring-zinc-500/25 dark:text-zinc-300",
  Reprogramada: "bg-orange-500/12 text-orange-700 ring-orange-500/25 dark:text-orange-300",
  Reagendada: "bg-orange-500/12 text-orange-700 ring-orange-500/25 dark:text-orange-300",
  Pendiente: "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300",
  Completada: "bg-zinc-500/15 text-zinc-700 ring-zinc-500/25 dark:text-zinc-300",
  Completado: "bg-zinc-500/15 text-zinc-700 ring-zinc-500/25 dark:text-zinc-300",
  Cancelada: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  Cancelado: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  Pagado: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  Activo: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  Inactivo: "bg-slate-500/10 text-slate-500 ring-slate-500/20",
  Nuevo: "bg-primary/10 text-primary ring-primary/20",
  Contactado: "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  "Cita agendada": "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300",
  Convertido: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  "En atención": "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  Asignada: "bg-blue-500/12 text-blue-700 ring-blue-500/25 dark:text-blue-300",
  "Sin cita": "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300",
  "No asistió": "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  Bloqueada: "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300",
  Alta: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  Media: "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300",
  Baja: "bg-slate-500/10 text-slate-500 ring-slate-500/20",
};

/**
 * StatusBadge — discreto y elegante.
 * Acepta dos formas de uso:
 *   <StatusBadge value="Confirmada" />            → legacy string
 *   <StatusBadge appointment={appt} />            → calcula etiqueta desde walkIn/statusCode/doctorAsignado
 *
 * `size`: "sm" (default) | "xs"
 */
export default function StatusBadge({ value, appointment, size = "sm", className }) {
  const label = appointment ? statusLabel(appointment) : value;
  const cls = appointment ? statusClasses(appointment) : (LEGACY_MAP[value] || "bg-secondary text-foreground/70 ring-border");
  const sizing = size === "xs"
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2 py-0.5 text-[11px]";
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset whitespace-nowrap",
        sizing,
        cls,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
