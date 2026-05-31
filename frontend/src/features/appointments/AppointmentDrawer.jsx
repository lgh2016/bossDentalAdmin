import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/shared/StatusBadge";
import { Calendar, Clock, MapPin, Stethoscope, UserCheck, RefreshCw, FileText, X, Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { appointmentsApi } from "@/services/appointmentsApi";
import ChangeDoctorDialog from "./ChangeDoctorDialog";

const trimSec = (t) => (t ? String(t).slice(0, 5) : "");

/**
 * Drawer reutilizable: puede recibir
 *   - `appointmentId` (consume GET /appointments/{id})  → caso real
 *   - `appointment` (objeto inline)                     → compatibilidad con flujo viejo
 */
export default function AppointmentDrawer({ open, onOpenChange, appointmentId, appointment: inlineAppt }) {
  const navigate = useNavigate();
  const [changeOpen, setChangeOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) { setData(null); setError(null); return; }
    if (inlineAppt) { setData(adaptInline(inlineAppt)); return; }
    if (!appointmentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await appointmentsApi.getById(appointmentId);
        if (!cancelled) setData(adaptBackend(res));
      } catch {
        if (!cancelled) setError("No fue posible cargar la cita.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, appointmentId, inlineAppt]);

  const goRecord = () => {
    if (!data?.patientId) return;
    onOpenChange(false);
    navigate(`/pacientes/${data.patientId}`);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md" data-testid="appointment-drawer">
          <SheetHeader>
            <SheetTitle>{data?.patientName || (loading ? "Cargando…" : "Cita")}</SheetTitle>
            <SheetDescription>
              {data ? `${data.reason || "—"}${data.durationMinutes ? ` · ${data.durationMinutes} min` : ""}` : "Detalle de cita"}
            </SheetDescription>
          </SheetHeader>

          {loading && (
            <div className="mt-8 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Cargando detalle…
            </div>
          )}

          {error && !loading && (
            <div className="mt-8 text-sm text-rose-500">{error}</div>
          )}

          {!loading && !error && data && (
            <>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar size={14} /> <span className="text-foreground">{data.date}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock size={14} />
                  <span className="text-foreground">
                    {trimSec(data.startTime)}{data.endTime ? ` – ${trimSec(data.endTime)}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={14} /> <span className="text-foreground">{data.branchName || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Stethoscope size={14} /> <span className="text-foreground">{data.dentistName || "Sin asignar"}</span>
                </div>
                <div className="flex items-center gap-2"><StatusBadge value={data.statusName || data.statusCode} /></div>
                {data.notes && <p className="text-xs text-muted-foreground italic">“{data.notes}”</p>}
              </div>

              <div className="mt-8 grid grid-cols-2 gap-2">
                <Button onClick={() => toast.info("Marcar llegada estará disponible próximamente")} data-testid="action-arrived">
                  <UserCheck size={14} className="mr-1.5" /> Marcar llegada
                </Button>
                <Button variant="outline" onClick={() => setChangeOpen(true)} data-testid="action-change-doctor">
                  <RefreshCw size={14} className="mr-1.5" /> {data.dentistId ? "Cambiar doctor" : "Asignar doctor"}
                </Button>
                <Button variant="outline" onClick={goRecord} data-testid="action-open-record" disabled={!data.patientId}>
                  <FileText size={14} className="mr-1.5" /> Expediente
                </Button>
                <Button variant="outline" onClick={() => toast.info("Marcar atendida estará disponible próximamente")} data-testid="action-finish">
                  <Check size={14} className="mr-1.5" /> Atendida
                </Button>
                <Button
                  variant="outline"
                  className="col-span-2 text-rose-600 hover:text-rose-700"
                  onClick={() => toast.info("Cancelar cita estará disponible próximamente")}
                  data-testid="action-cancel"
                >
                  <X size={14} className="mr-1.5" /> Cancelar cita
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ChangeDoctorDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        appointment={data ? legacyApptShape(data) : null}
      />
    </>
  );
}

// ============== adapters ==============
function adaptBackend(r) {
  return {
    appointmentId: r.appointmentId || r.id,
    date: r.date || r.appointmentDate,
    startTime: r.startTime || r.time,
    endTime: r.endTime,
    durationMinutes: r.durationMinutes,
    patientId: r.patientId,
    patientName: r.patientName,
    reason: r.reason,
    dentistId: r.dentistId,
    dentistName: r.dentistName,
    branchId: r.branchId,
    branchName: r.branchName,
    statusCode: r.statusCode,
    statusName: r.statusName,
    notes: r.notes,
  };
}

function adaptInline(a) {
  // Soporta el shape legado del clinicStore (mock) para compatibilidad con AgendaDaily si aún lo usa.
  return {
    appointmentId: a.appointmentId || a.id,
    date: a.date,
    startTime: a.startTime || a.time,
    endTime: a.endTime,
    durationMinutes: a.duration || a.durationMinutes,
    patientId: a.patientId,
    patientName: a.patientName,
    reason: a.reason || a.type,
    dentistId: a.dentistId || a.doctorId,
    dentistName: a.dentistName || a.doctorName,
    branchId: a.branchId,
    branchName: a.branchName || a.branch,
    statusCode: a.statusCode,
    statusName: a.statusName || a.status,
    notes: a.notes,
  };
}

// Shape esperado por ChangeDoctorDialog actual (no se modifica)
function legacyApptShape(d) {
  return {
    id: d.appointmentId,
    appointmentId: d.appointmentId,
    patientId: d.patientId,
    patientName: d.patientName,
    doctorId: d.dentistId,
    doctorName: d.dentistName,
    branch: d.branchName,
    date: d.date,
    time: trimSec(d.startTime),
    type: d.reason,
  };
}
