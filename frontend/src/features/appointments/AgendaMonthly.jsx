import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { appointmentsApi } from "@/services/appointmentsApi";

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

// Mapeo loadLevel del backend → estilos
const LEVEL_STYLES = {
  VACIO:     { label: "Vacío",     pill: "bg-slate-200 dark:bg-slate-800",   text: "text-muted-foreground" },
  BAJA:      { label: "Baja",      pill: "bg-emerald-500/15",                text: "text-emerald-600 dark:text-emerald-400" },
  MEDIA:     { label: "Media",     pill: "bg-sky-500/15",                    text: "text-sky-600 dark:text-sky-400" },
  ALTA:      { label: "Alta",      pill: "bg-amber-500/20",                  text: "text-amber-700 dark:text-amber-400" },
  SATURADA:  { label: "Saturada",  pill: "bg-rose-500/20",                   text: "text-rose-600 dark:text-rose-400" },
};
const styleFor = (lvl) => LEVEL_STYLES[lvl] || LEVEL_STYLES.VACIO;

const iso = (d) => d.toISOString().slice(0, 10);

export default function AgendaMonthly({ branchId = 1, dentistId, onOpenDay, filterSlot }) {
  const [cursor, setCursor] = useState(new Date());
  const [data, setData] = useState([]); // [{date, totalAppointments, loadLevel, ...}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const year = cursor.getFullYear();
  const monthIdx = cursor.getMonth(); // 0-11
  const monthNum = monthIdx + 1;

  // Carga única: cambios de mes o de dentistId disparan refetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await appointmentsApi.scheduleMonth({ year, month: monthNum, branchId, dentistId });
        if (!cancelled) setData(Array.isArray(res) ? res : []);
      } catch {
        if (!cancelled) { setData([]); setError("No fue posible cargar la agenda mensual."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year, monthNum, branchId, dentistId]);

  const byDate = useMemo(() => {
    const map = {};
    data.forEach((d) => { map[d.date] = d; });
    return map;
  }, [data]);

  const grid = useMemo(() => {
    const first = new Date(year, monthIdx, 1);
    const startDow = (first.getDay() + 6) % 7; // Lun=0
    const last = new Date(year, monthIdx + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= last; d++) cells.push(new Date(year, monthIdx, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, monthIdx]);

  const shiftMonth = (d) => { const n = new Date(cursor); n.setMonth(n.getMonth() + d); setCursor(n); };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-8" onClick={() => shiftMonth(-1)} data-testid="month-prev"><ChevronLeft size={14} /></Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => shiftMonth(1)} data-testid="month-next"><ChevronRight size={14} /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Hoy</Button>
          <p className="text-sm font-medium ml-2">{MONTHS[monthIdx]} {year}</p>
          {loading && <Loader2 size={14} className="ml-2 animate-spin text-muted-foreground" />}
        </div>
        {filterSlot}
      </div>

      {error && <p className="px-4 py-3 text-sm text-rose-500">{error}</p>}

      <div className="grid grid-cols-7 border-b border-border bg-secondary/30">
        {DAYS.map((d) => (
          <div key={d} className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground text-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7" data-testid="month-grid">
        {grid.map((d, i) => {
          if (!d) return <div key={i} className="h-28 border-b border-r border-border/60 bg-secondary/10" />;
          const key = iso(d);
          const cell = byDate[key];
          const total = cell?.totalAppointments ?? 0;
          const confirmed = cell?.confirmedCount ?? 0;
          const completed = cell?.completedCount ?? 0;
          const style = styleFor(cell?.loadLevel);
          const isToday = key === iso(new Date());
          return (
            <button
              key={i}
              onClick={() => onOpenDay?.(d)}
              data-testid={`month-cell-${key}`}
              className="h-28 text-left p-2 border-b border-r border-border/60 hover:bg-secondary/40 transition-colors flex flex-col"
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-xs font-medium", isToday ? "size-6 grid place-items-center rounded-full bg-primary text-primary-foreground" : "text-foreground")}>{d.getDate()}</span>
                {total > 0 && (
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", style.pill, style.text)}>{total}</span>
                )}
              </div>
              {total > 0 && (
                <div className="mt-2 space-y-0.5">
                  {confirmed > 0 && <p className="text-[10px] text-emerald-600 dark:text-emerald-400">● {confirmed} confirmadas</p>}
                  {completed > 0 && <p className="text-[10px] text-sky-600 dark:text-sky-400">● {completed} completadas</p>}
                </div>
              )}
              <div className="mt-auto">
                <span className={cn("text-[10px] font-medium", style.text)}>{style.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span>Indicadores de carga:</span>
        {["BAJA","MEDIA","ALTA","SATURADA"].map((lvl) => {
          const s = styleFor(lvl);
          return <span key={lvl} className={cn("px-2 py-0.5 rounded", s.pill, s.text)}>{s.label}</span>;
        })}
      </div>
    </div>
  );
}
