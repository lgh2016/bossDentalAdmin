import { cn } from "@/lib/utils";

const MAP = {
  Confirmada: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  "En curso": "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  "En consulta": "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  "Llegó": "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20",
  Atendida: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20",
  Reprogramada: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  Pendiente: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  Completada: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20",
  Completado: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20",
  Cancelada: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
  Cancelado: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
  Pagado: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  Activo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  Inactivo: "bg-slate-500/10 text-slate-500 ring-slate-500/20",
  Nuevo: "bg-primary/10 text-primary ring-primary/20",
  Contactado: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  "Cita agendada": "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20",
  Convertido: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  "En curso ": "bg-sky-500/10 text-sky-600",
  Alta: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
  Media: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  Baja: "bg-slate-500/10 text-slate-500 ring-slate-500/20",
};

export default function StatusBadge({ value }) {
  const cls = MAP[value] || "bg-secondary text-foreground/70 ring-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        cls,
      )}
    >
      <span className="size-1 rounded-full bg-current opacity-70" />
      {value}
    </span>
  );
}
