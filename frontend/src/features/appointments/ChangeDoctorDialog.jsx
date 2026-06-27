import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { doctorsApi } from "@/services/doctorsApi";
import { appointmentLifecycleApi } from "@/services/appointmentLifecycleApi";

export default function ChangeDoctorDialog({ open, onOpenChange, appointment }) {
  const [doctorId, setDoctorId] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(null);

  useEffect(() => {
    if (!open) { setConflict(null); return; }
    setDoctorId(appointment?.doctorId ? String(appointment.doctorId) : "");
    setConflict(null);
    setLoading(true);
    const ctrl = new AbortController();
    doctorsApi.listActive({ branchId: 1, signal: ctrl.signal })
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError") return;
        setDoctors([]);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, appointment?.appointmentId]);

  if (!appointment) return null;

  const callAssign = async (confirmReplace = false) => {
    setSubmitting(true);
    try {
      await appointmentLifecycleApi.assignDoctor(appointment.appointmentId || appointment.id, Number(doctorId), { confirmReplace });
      toast.success(appointment.doctorId ? "Doctor cambiado correctamente" : "Doctor asignado correctamente");
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.code === "DOCTOR_BLOCK_CONFLICT") {
        setConflict(detail);
        return;
      }
      toast.error(typeof detail === "string" ? detail : "No fue posible asignar el doctor");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = (e) => { e.preventDefault(); if (!doctorId) { toast.error("Selecciona un doctor"); return; } callAssign(false); };
  const confirmReplace = () => callAssign(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="change-doctor-dialog">
        <DialogHeader>
          <DialogTitle>{appointment.doctorId ? "Cambiar doctor" : "Asignar doctor"}</DialogTitle>
          <DialogDescription>Cita de {appointment.patientName} · {appointment.date} {appointment.time}</DialogDescription>
        </DialogHeader>

        {!conflict && (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label className="text-xs">Doctor</Label>
              <Select value={doctorId} onValueChange={setDoctorId} disabled={loading}>
                <SelectTrigger className="mt-1" data-testid="change-doctor-select">
                  <SelectValue placeholder={loading ? "Cargando doctores…" : "Selecciona doctor"} />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.fullName || `${d.name} ${d.lastName}`}{d.specialty ? ` · ${d.specialty}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
              <Button type="submit" disabled={submitting || loading} data-testid="change-doctor-submit">
                {submitting ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Guardando…</> : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {conflict && (
          <div className="space-y-3" data-testid="reassign-conflict">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-medium text-amber-700 dark:text-amber-300">El doctor ya tiene una asignación activa</p>
                <p className="text-foreground/80">
                  Paciente: <span className="font-medium">{conflict.conflictPatientName || "—"}</span>
                  {conflict.conflictTime ? ` · ${conflict.conflictTime}` : ""}
                </p>
                <p className="text-muted-foreground">Si confirmas, el paciente anterior será desasignado y volverá a la sala de espera. La acción queda en auditoría.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConflict(null)} disabled={submitting} data-testid="reassign-back">Volver</Button>
              <Button type="button" variant="destructive" onClick={confirmReplace} disabled={submitting} data-testid="reassign-replace">
                {submitting ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Reemplazando…</> : "Reemplazar asignación"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
