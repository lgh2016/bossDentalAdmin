import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/shared/StatusBadge";
import { Calendar, Clock, MapPin, Stethoscope, UserCheck, RefreshCw, FileText, X, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import ChangeDoctorDialog from "./ChangeDoctorDialog";

export default function AppointmentDrawer({ open, onOpenChange, appointment }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [changeOpen, setChangeOpen] = useState(false);
  if (!appointment) return null;

  const arrived = () => { clinicStore.markArrived(appointment.id, user); toast.success("Llegada registrada"); };
  const cancel = () => { clinicStore.updateAppointmentStatus(appointment.id, "Cancelada", user); toast.success("Cita cancelada"); onOpenChange(false); };
  const finish = () => { clinicStore.updateAppointmentStatus(appointment.id, "Atendida", user); toast.success("Cita atendida"); };
  const open_record = () => { onOpenChange(false); navigate(`/pacientes/${appointment.patientId}`); };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md" data-testid="appointment-drawer">
          <SheetHeader>
            <SheetTitle>{appointment.patientName}</SheetTitle>
            <SheetDescription>{appointment.type} · {appointment.duration} min</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar size={14} /> <span className="text-foreground">{appointment.date}</span></div>
            <div className="flex items-center gap-2 text-muted-foreground"><Clock size={14} /> <span className="text-foreground">{appointment.time}</span></div>
            <div className="flex items-center gap-2 text-muted-foreground"><MapPin size={14} /> <span className="text-foreground">{appointment.branch}</span></div>
            <div className="flex items-center gap-2 text-muted-foreground"><Stethoscope size={14} /> <span className="text-foreground">{appointment.doctorName}</span></div>
            <div className="flex items-center gap-2"><StatusBadge value={appointment.status} /></div>
            {appointment.notes && <p className="text-xs text-muted-foreground">"{appointment.notes}"</p>}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-2">
            {!appointment.hasArrived && (
              <Button onClick={arrived} data-testid="action-arrived"><UserCheck size={14} className="mr-1.5" /> Marcar llegada</Button>
            )}
            <Button variant="outline" onClick={() => setChangeOpen(true)} data-testid="action-change-doctor"><RefreshCw size={14} className="mr-1.5" /> {appointment.doctorId ? "Cambiar doctor" : "Asignar doctor"}</Button>
            <Button variant="outline" onClick={open_record} data-testid="action-open-record"><FileText size={14} className="mr-1.5" /> Expediente</Button>
            <Button variant="outline" onClick={finish} data-testid="action-finish"><Check size={14} className="mr-1.5" /> Atendida</Button>
            <Button variant="outline" className="col-span-2 text-rose-600 hover:text-rose-700" onClick={cancel} data-testid="action-cancel"><X size={14} className="mr-1.5" /> Cancelar cita</Button>
          </div>
        </SheetContent>
      </Sheet>
      <ChangeDoctorDialog open={changeOpen} onOpenChange={setChangeOpen} appointment={appointment} />
    </>
  );
}
