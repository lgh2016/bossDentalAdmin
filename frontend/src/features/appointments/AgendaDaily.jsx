import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, UserCheck, RefreshCw, FileText, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/shared/StatusBadge";
import { useClinic } from "@/store/clinicStore";
import { formatDateLong } from "@/utils/format";
import AppointmentDrawer from "./AppointmentDrawer";

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);

export default function AgendaDaily({ onCreate, controlledDate, onDateChange }) {
  const { appointments, branches } = useClinic();
  const [internalDate, setInternalDate] = useState(new Date());
  const date = controlledDate || internalDate;
  const setDate = (d) => { if (onDateChange) onDateChange(d); else setInternalDate(d); };
  const [branch, setBranch] = useState("Todas");
  const [selected, setSelected] = useState(null);

  const iso = date.toISOString().slice(0, 10);
  const day = useMemo(() =>
    appointments.filter((a) => a.date === iso && (branch === "Todas" || a.branch === branch))
      .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, iso, branch]);

  const shift = (d) => { const next = new Date(date); next.setDate(next.getDate() + d); setDate(next); };

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)} data-testid="agenda-prev"><ChevronLeft size={14} /></Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)} data-testid="agenda-next"><ChevronRight size={14} /></Button>
            <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>Hoy</Button>
            <span className="text-sm font-medium capitalize ml-2">{formatDateLong(iso)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-muted-foreground" />
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-8 w-36 text-xs" data-testid="agenda-branch-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todas">Todas las sucursales</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {onCreate && <Button size="sm" onClick={onCreate} data-testid="agenda-create-btn"><Plus size={14} className="mr-1" /> Crear cita</Button>}
          </div>
        </div>

        <div className="grid grid-cols-[60px_1fr] divide-x divide-border">
          <div>
            {HOURS.map((h) => (
              <div key={h} className="h-24 px-2 text-[11px] text-muted-foreground border-b border-border/60 last:border-0 pt-1">{String(h).padStart(2, "0")}:00</div>
            ))}
          </div>
          <div className="relative">
            {HOURS.map((h) => <div key={h} className="h-24 border-b border-border/60 last:border-0" />)}
            {day.map((a) => {
              const [h, m] = a.time.split(":").map(Number);
              const top = ((h - 8) * 60 + m) * (96 / 60);
              const height = Math.max(48, a.duration * (96 / 60));
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  data-testid={`appt-card-${a.id}`}
                  className={`absolute left-2 right-2 text-left rounded-lg border p-2.5 transition-colors ${a.hasArrived ? "border-emerald-500/40 bg-emerald-500/8 hover:bg-emerald-500/15" : "border-primary/30 bg-primary/8 hover:bg-primary/15"}`}
                  style={{ top, height }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">{a.patientName}</p>
                    <StatusBadge value={a.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{a.time} · {a.type} · {a.branch}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{a.doctorName}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista compacta para móvil + acciones rápidas */}
        <div className="border-t border-border divide-y divide-border lg:hidden">
          {day.map((a) => (
            <div key={a.id} className="p-3 flex items-center gap-3">
              <span className="text-xs font-mono w-12">{a.time}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.patientName}</p>
                <p className="text-xs text-muted-foreground truncate">{a.type} · {a.doctorName}</p>
              </div>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => setSelected(a)}><FileText size={14} /></Button>
            </div>
          ))}
        </div>
      </div>

      <AppointmentDrawer open={!!selected} onOpenChange={(v) => !v && setSelected(null)} appointment={selected} />
    </>
  );
}
