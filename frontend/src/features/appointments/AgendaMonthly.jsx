import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClinic } from "@/store/clinicStore";
import { cn } from "@/lib/utils";

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

const SLOTS_PER_DAY = 22; // capacidad operativa diaria estimada

const loadLevel = (count) => {
  const ratio = count / SLOTS_PER_DAY;
  if (count === 0) return { label: "Vacío", color: "bg-slate-200 dark:bg-slate-800", text: "text-muted-foreground" };
  if (ratio <= 0.3) return { label: "Baja", color: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400" };
  if (ratio <= 0.6) return { label: "Media", color: "bg-sky-500/15", text: "text-sky-600 dark:text-sky-400" };
  if (ratio <= 0.85) return { label: "Alta", color: "bg-amber-500/20", text: "text-amber-700 dark:text-amber-400" };
  return { label: "Saturada", color: "bg-rose-500/20", text: "text-rose-600 dark:text-rose-400" };
};

export default function AgendaMonthly({ onCreate, onOpenDay }) {
  const { appointments } = useClinic();
  const [cursor, setCursor] = useState(new Date());

  const grid = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startDow = (first.getDay() + 6) % 7; // Lun=0
    const last = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= last; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = {};
    appointments.forEach((a) => { (map[a.date] ||= []).push(a); });
    return map;
  }, [appointments]);

  const shiftMonth = (d) => { const n = new Date(cursor); n.setMonth(n.getMonth() + d); setCursor(n); };
  const iso = (d) => d.toISOString().slice(0, 10);

  const handleDayClick = (d) => {
    onOpenDay?.(d);
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" onClick={() => shiftMonth(-1)} data-testid="month-prev"><ChevronLeft size={14} /></Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => shiftMonth(1)} data-testid="month-next"><ChevronRight size={14} /></Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Hoy</Button>
            <p className="text-sm font-medium ml-2">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</p>
          </div>
          {onCreate && <Button size="sm" onClick={onCreate}><Plus size={14} className="mr-1" /> Crear cita</Button>}
        </div>

        <div className="grid grid-cols-7 border-b border-border bg-secondary/30">
          {DAYS.map((d) => (
            <div key={d} className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground text-center">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7" data-testid="month-grid">
          {grid.map((d, i) => {
            if (!d) return <div key={i} className="h-28 border-b border-r border-border/60 bg-secondary/10" />;
            const list = byDay[iso(d)] || [];
            const confirmed = list.filter((a) => a.status === "Confirmada").length;
            const pending = list.filter((a) => a.status === "Pendiente").length;
            const level = loadLevel(list.length);
            const isToday = iso(d) === iso(new Date());
            return (
              <button
                key={i}
                onClick={() => handleDayClick(d)}
                data-testid={`month-cell-${iso(d)}`}
                className="h-28 text-left p-2 border-b border-r border-border/60 hover:bg-secondary/40 transition-colors flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-medium", isToday ? "size-6 grid place-items-center rounded-full bg-primary text-primary-foreground" : "text-foreground")}>{d.getDate()}</span>
                  {list.length > 0 && (
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", level.color, level.text)}>
                      {list.length}
                    </span>
                  )}
                </div>
                {list.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {confirmed > 0 && <p className="text-[10px] text-emerald-600 dark:text-emerald-400">● {confirmed} confirmadas</p>}
                    {pending > 0 && <p className="text-[10px] text-amber-600 dark:text-amber-400">● {pending} pendientes</p>}
                  </div>
                )}
                <div className="mt-auto">
                  <span className={cn("text-[10px] font-medium", level.text)}>{level.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span>Indicadores de carga:</span>
          {["Baja","Media","Alta","Saturada"].map((l) => {
            const fake = { Baja: 4, Media: 12, Alta: 18, Saturada: 22 }[l];
            const lv = loadLevel(fake);
            return <span key={l} className={cn("px-2 py-0.5 rounded", lv.color, lv.text)}>{l}</span>;
          })}
        </div>
      </div>
    </>
  );
}
