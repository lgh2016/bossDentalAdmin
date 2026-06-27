import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { appointmentLifecycleApi } from "@/services/appointmentLifecycleApi";

/**
 * Diálogo profesional para cancelar una cita. Reemplaza window.prompt.
 */
export default function CancelAppointmentDialog({ open, onOpenChange, appointment, onCancelled }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!open) { setReason(""); setLoading(false); } }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!appointment?.appointmentId) return;
    setLoading(true);
    try {
      await appointmentLifecycleApi.cancel(appointment.appointmentId, reason.trim());
      toast.success("Cita cancelada");
      onCancelled?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible cancelar la cita");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="cancel-appt-dialog">
        <DialogHeader>
          <DialogTitle>Cancelar cita</DialogTitle>
          <DialogDescription>
            {appointment?.patientName ? `Paciente: ${appointment.patientName}` : "Esta acción no se puede deshacer."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs">Motivo (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. el paciente no podrá asistir, reagendará pronto…"
              rows={4}
              className="mt-1"
              data-testid="cancel-reason-input"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>No cancelar</Button>
            <Button type="submit" variant="destructive" disabled={loading} data-testid="cancel-confirm">
              {loading ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Cancelando…</> : "Cancelar cita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
