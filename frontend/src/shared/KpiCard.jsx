import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function KpiCard({ label, value, delta, icon: Icon, accent = false, testId }) {
  const positive = typeof delta === "number" ? delta >= 0 : null;
  return (
    <div
      data-testid={testId}
      className={cn(
        "group rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/15",
        accent && "ring-1 ring-primary/20",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <div className="size-8 rounded-md grid place-items-center bg-secondary text-foreground/70">
            <Icon size={15} strokeWidth={1.6} />
          </div>
        )}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-2xl sm:text-3xl font-semibold tracking-tight">{value}</p>
        {typeof delta === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
              positive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
            )}
          >
            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
}
