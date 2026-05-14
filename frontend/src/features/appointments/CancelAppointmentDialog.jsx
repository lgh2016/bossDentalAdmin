import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function CancelAppointmentDialog({ open, onOpenChange, appointment }) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");

  if (!appointment) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!reason.trim()) { toast.error("Motivo obligatorio"); return; }
    clinicStore.cancelAppointment(appointment.id, reason, user);
    toast.success("Cita cancelada");
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="cancel-appt-dialog">
        <DialogHeader>
          <DialogTitle>Cancelar cita</DialogTitle>
          <DialogDescription>{appointment.patientName} · {appointment.date} {appointment.time}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label className="text-xs">Motivo de la cancelación</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-[64px]" data-testid="cancel-appt-reason" /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Volver</Button>
            <Button type="submit" variant="destructive" data-testid="cancel-appt-submit">Confirmar cancelación</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
