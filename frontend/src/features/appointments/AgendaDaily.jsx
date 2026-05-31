import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/shared/StatusBadge";
import { formatDateLong } from "@/utils/format";
import { appointmentsApi } from "@/services/appointmentsApi";
import AppointmentDrawer from "./AppointmentDrawer";

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 08-18

const trimSec = (t) => (t ? String(t).slice(0, 5) : "");
const isoOf = (d) => d.toISOString().slice(0, 10);
const localDuration = (start, end) => {
  const [sh, sm] = trimSec(start).split(":").map(Number);
  const [eh, em] = trimSec(end).split(":").map(Number);
  return Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
};

// Adapta el item del WS /appointments/schedule/day al shape usado por el componente.
// El backend devuelve `id` y `appointmentDate`, pero el contrato esperado por el front es `appointmentId` y `date`.
const adaptDayItem = (a) => ({
  appointmentId: a.appointmentId ?? a.id,
  date: a.date ?? a.appointmentDate,
  startTime: a.startTime,
  endTime: a.endTime,
  patientId: a.patientId,
  patientName: a.patientName,
  reason: a.reason,
  dentistId: a.dentistId,
  dentistName: a.dentistName,
  branchId: a.branchId,
  branchName: a.branchName,
  statusCode: a.statusCode,
  statusName: a.statusName,
});

export default function AgendaDaily({ branchId = 1, dentistId, controlledDate, onDateChange, filterSlot }) {
  const [internalDate, setInternalDate] = useState(new Date());
  const date = controlledDate || internalDate;
  const setDate = (d) => { if (onDateChange) onDateChange(d); else setInternalDate(d); };

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const iso = isoOf(date);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await appointmentsApi.scheduleDay({ date: iso, branchId, dentistId });
        if (!cancelled) setItems(Array.isArray(res) ? res.map(adaptDayItem) : []);
      } catch {
        if (!cancelled) { setItems([]); setError("No fue posible cargar la agenda del día."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [iso, branchId, dentistId]);

  const shift = (d) => { const next = new Date(date); next.setDate(next.getDate() + d); setDate(next); };

  // Agrupar por doctor cuando NO hay dentistId seleccionado.
  const columns = useMemo(() => {
    if (dentistId != null) {
      const sorted = [...items].sort((a, b) => trimSec(a.startTime).localeCompare(trimSec(b.startTime)));
      return [{ dentistId, dentistName: sorted[0]?.dentistName || "Doctor", items: sorted }];
    }
    const groups = {};
    items.forEach((a) => {
      const k = a.dentistId ?? "_none";
      (groups[k] ||= { dentistId: a.dentistId, dentistName: a.dentistName || "Sin asignar", items: [] }).items.push(a);
    });
    Object.values(groups).forEach((g) => g.items.sort((a, b) => trimSec(a.startTime).localeCompare(trimSec(b.startTime))));
    return Object.values(groups).sort((a, b) => (a.dentistName || "").localeCompare(b.dentistName || ""));
  }, [items, dentistId]);

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)} data-testid="agenda-prev"><ChevronLeft size={14} /></Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)} data-testid="agenda-next"><ChevronRight size={14} /></Button>
            <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>Hoy</Button>
            <span className="text-sm font-medium capitalize ml-2">{formatDateLong(iso)}</span>
            {loading && <Loader2 size={14} className="ml-2 animate-spin text-muted-foreground" />}
          </div>
          {filterSlot}
        </div>

        {error && <p className="px-4 py-3 text-sm text-rose-500">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <p className="px-4 py-10 text-sm text-muted-foreground text-center">Sin citas para esta fecha.</p>
        )}

        {items.length > 0 && columns.length > 0 && (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[60px_1fr] divide-x divide-border min-w-full" style={{ gridTemplateColumns: `60px repeat(${columns.length}, minmax(220px, 1fr))` }}>
              {/* Header de columnas (por doctor) — sólo cuando agrupamos */}
              <div className="bg-secondary/30 border-b border-border" />
              {columns.map((c) => (
                <div key={c.dentistId ?? "none"} className="px-3 py-2 bg-secondary/30 border-b border-border text-xs font-medium truncate" data-testid={`agenda-col-${c.dentistId ?? "none"}`}>
                  {c.dentistName}
                </div>
              ))}

              {/* Columna de horas */}
              <div>
                {HOURS.map((h) => (
                  <div key={h} className="h-24 px-2 text-[11px] text-muted-foreground border-b border-border/60 last:border-0 pt-1">{String(h).padStart(2, "0")}:00</div>
                ))}
              </div>

              {/* Una columna por doctor */}
              {columns.map((c) => (
                <div key={c.dentistId ?? "none"} className="relative border-l border-border/60">
                  {HOURS.map((h) => <div key={h} className="h-24 border-b border-border/60 last:border-0" />)}
                  {c.items.map((a) => {
                    const [hh, mm] = trimSec(a.startTime).split(":").map(Number);
                    const dur = localDuration(a.startTime, a.endTime);
                    const top = ((hh - 8) * 60 + mm) * (96 / 60);
                    const height = Math.max(48, dur * (96 / 60));
                    return (
                      <button
                        key={a.appointmentId}
                        onClick={() => setSelectedId(a.appointmentId)}
                        data-testid={`appt-card-${a.appointmentId}`}
                        className="absolute left-1.5 right-1.5 text-left rounded-lg border p-2.5 transition-colors border-primary/30 bg-primary/8 hover:bg-primary/15"
                        style={{ top, height }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold truncate">{a.patientName}</p>
                          <StatusBadge value={a.statusName || a.statusCode} />
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {trimSec(a.startTime)}{a.endTime ? `–${trimSec(a.endTime)}` : ""} · {a.reason}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{a.dentistName}</p>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AppointmentDrawer
        open={!!selectedId}
        onOpenChange={(v) => !v && setSelectedId(null)}
        appointmentId={selectedId}
      />
    </>
  );
}
