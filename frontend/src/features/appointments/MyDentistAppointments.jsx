import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import Section from "@/shared/Section";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { dentistApi } from "@/services/dentistApi";

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtSpanishDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MyDentistAppointments() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 30));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await dentistApi.agenda({ from, to, signal });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      setError("No fue posible cargar tu agenda.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const byDay = useMemo(() => {
    const groups = new Map();
    for (const a of items) {
      const k = a.appointmentDate;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi agenda"
        subtitle="Tus citas asignadas y por confirmar"
      />

      <div className="flex flex-wrap items-center gap-3" data-testid="agenda-range">
        <Button variant="outline" size="sm" onClick={() => { setFrom(addDays(from, -7)); setTo(addDays(to, -7)); }} data-testid="agenda-prev">
          <ChevronLeft size={14} className="mr-1" /> Semana anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          {fmtSpanishDate(from)} → {fmtSpanishDate(to)}
        </span>
        <Button variant="outline" size="sm" onClick={() => { setFrom(addDays(from, 7)); setTo(addDays(to, 7)); }} data-testid="agenda-next">
          Semana siguiente <ChevronRight size={14} className="ml-1" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setFrom(today); setTo(addDays(today, 30)); }} data-testid="agenda-reset">
          Hoy + 30 días
        </Button>
      </div>

      {loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center">
          <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando agenda…
        </p>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600">{error}</div>
      )}

      {!loading && !error && byDay.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Sin citas en este rango.
        </div>
      )}

      <div className="space-y-4" data-testid="agenda-days">
        {byDay.map(([date, list]) => (
          <Section key={date} title={`${fmtSpanishDate(date)} · ${list.length} cita${list.length === 1 ? "" : "s"}`}>
            <div className="divide-y divide-border">
              {list.map((a) => (
                <div key={a.appointmentId} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0" data-testid={`agenda-${a.appointmentId}`}>
                  <div className="w-16 text-sm font-mono">{a.time}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.patientName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.reason} · {a.doctorAsignadoName || a.doctorSolicitadoName || "Sin asignar"}
                    </p>
                  </div>
                  <StatusBadge value={a.statusName || a.statusCode} />
                </div>
              ))}
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}
