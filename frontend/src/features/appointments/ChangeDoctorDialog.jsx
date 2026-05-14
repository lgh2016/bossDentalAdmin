import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClinic, clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function ChangeDoctorDialog({ open, onOpenChange, appointment }) {
  const { user } = useAuth();
  const { doctors } = useClinic();
  const [doctorId, setDoctorId] = useState(appointment?.doctorId || "");
  const [reason, setReason] = useState("");

  if (!appointment) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!doctorId) { toast.error("Selecciona un doctor"); return; }
    clinicStore.assignDoctor(appointment.id, doctorId, reason, user);
    const action = appointment.doctorId ? "cambiado" : "asignado";
    toast.success(`Doctor ${action} correctamente`);
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="change-doctor-dialog">
        <DialogHeader>
          <DialogTitle>{appointment.doctorId ? "Cambiar doctor" : "Asignar doctor"}</DialogTitle>
          <DialogDescription>Cita de {appointment.patientName} · {appointment.date} {appointment.time}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs">Doctor</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger className="mt-1" data-testid="change-doctor-select"><SelectValue placeholder="Selecciona doctor" /></SelectTrigger>
              <SelectContent>{doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.specialty}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Motivo del cambio</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. agenda saturada, especialidad, ajuste operativo…" className="mt-1 min-h-[64px]" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" data-testid="change-doctor-submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
