import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function RescheduleDialog({ open, onOpenChange, appointment }) {
  const { user } = useAuth();
  const [date, setDate] = useState(appointment?.date || "");
  const [time, setTime] = useState(appointment?.time || "");
  const [reason, setReason] = useState("");

  if (!appointment) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!date || !time) { toast.error("Fecha y hora requeridas"); return; }
    if (!reason.trim()) { toast.error("Indica el motivo"); return; }
    clinicStore.rescheduleAppointment(appointment.id, date, time, reason, user);
    toast.success("Cita reprogramada");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="reschedule-dialog">
        <DialogHeader>
          <DialogTitle>Reagendar cita</DialogTitle>
          <DialogDescription>{appointment.patientName} · actual: {appointment.date} {appointment.time}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Nueva fecha</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" data-testid="reschedule-date" /></div>
            <div><Label className="text-xs">Nueva hora</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" data-testid="reschedule-time" /></div>
          </div>
          <div><Label className="text-xs">Motivo</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del cambio…" className="mt-1 min-h-[64px]" data-testid="reschedule-reason" /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" data-testid="reschedule-submit">Reagendar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
