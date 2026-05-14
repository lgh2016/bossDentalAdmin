import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/shared/StatusBadge";
import { appointments } from "@/mocks";
import { formatDateLong } from "@/utils/format";

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 08..18

export default function AgendaCalendar() {
  const [date, setDate] = useState(new Date());
  const iso = date.toISOString().slice(0, 10);
  const dayApts = appointments.filter((a) => a.date === iso);

  const shift = (d) => {
    const next = new Date(date);
    next.setDate(next.getDate() + d);
    setDate(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agenda diaria"
        title="Agenda"
        subtitle="Visualiza y gestiona las citas del día."
        actions={<Button data-testid="new-appointment-btn"><Plus size={14} className="mr-1" /> Crear cita</Button>}
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)} data-testid="agenda-prev"><ChevronLeft size={14} /></Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)} data-testid="agenda-next"><ChevronRight size={14} /></Button>
            <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>Hoy</Button>
          </div>
          <p className="text-sm font-medium capitalize">{formatDateLong(iso)}</p>
        </div>

        <div className="grid grid-cols-[60px_1fr] divide-x divide-border">
          <div>
            {HOURS.map((h) => (
              <div key={h} className="h-20 px-2 text-[11px] text-muted-foreground border-b border-border/60 last:border-0 pt-1">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div className="relative">
            {HOURS.map((h) => (
              <div key={h} className="h-20 border-b border-border/60 last:border-0" />
            ))}
            {dayApts.map((a) => {
              const [h, m] = a.time.split(":").map(Number);
              const startTop = ((h - 8) * 60 + m) * (80 / 60);
              const height = a.duration * (80 / 60);
              return (
                <div
                  key={a.id}
                  className="absolute left-2 right-2 rounded-md border border-primary/30 bg-primary/8 p-2 hover:bg-primary/15 transition-colors"
                  style={{ top: startTop, height }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium truncate">{a.patientName}</p>
                    <StatusBadge value={a.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{a.type} · {a.doctorName}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
