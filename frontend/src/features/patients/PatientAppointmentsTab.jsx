import { useCallback, useEffect, useState } from "react";
import { RefreshCw, X, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { patientsApi } from "@/services/patientsApi";

const trimSec = (t) => (t ? String(t).slice(0, 5) : "");

// Estilos del badge a partir de statusColor enviado por el backend.
const COLOR_STYLES = {
  GREEN:  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
  RED:    "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30",
  AMBER:  "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30",
  YELLOW: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30",
  BLUE:   "bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30",
  GRAY:   "bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30",
};
const badgeClass = (color) => COLOR_STYLES[color] || COLOR_STYLES.GRAY;

export default function PatientAppointmentsTab({ patientId, onCreate, onReschedule, onCancel, reloadKey = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await patientsApi.getAppointments(patientId);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError("No fue posible cargar las citas del paciente.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onCreate} data-testid="appts-create"><Plus size={13} className="mr-1" /> Crear cita</Button>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground p-6 text-center">
          <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando citas…
        </p>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600 dark:text-rose-400">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground p-6 text-center rounded-xl border border-dashed border-border">Sin citas registradas.</p>
      )}

      {items.length > 0 && (
        <div className="rounded-xl border border-border divide-y divide-border">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 flex-wrap" data-testid={`patient-appt-${a.id}`}>
              <div className="w-36 text-xs">
                {a.appointmentDate} · <span className="font-mono">{trimSec(a.startTime)}{a.endTime ? `–${trimSec(a.endTime)}` : ""}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.reason || "—"} · <span className="text-muted-foreground">{a.branchName || "—"}</span></p>
                <p className="text-xs text-muted-foreground truncate">{a.doctorName || "Sin asignar"}</p>
              </div>
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", badgeClass(a.statusColor))}>
                {a.statusName || a.statusCode}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!a.canReschedule}
                  onClick={() => onReschedule?.(a)}
                  data-testid={`appt-reschedule-${a.id}`}
                >
                  <RefreshCw size={12} className="mr-1" />Reagendar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-500"
                  disabled={!a.canCancel}
                  onClick={() => onCancel?.(a)}
                  data-testid={`appt-cancel-${a.id}`}
                >
                  <X size={12} className="mr-1" />Cancelar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
