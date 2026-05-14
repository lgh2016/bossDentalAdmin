import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { Calendar, Clock, MapPin, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appointments } from "@/mocks";
import { formatDateLong } from "@/utils/format";

export default function NextAppointment({ patientId = "p-1" }) {
  const today = new Date().toISOString().slice(0, 10);
  const list = appointments.filter((a) => a.patientId === patientId && a.date >= today).slice(0, 4);
  const next = list[0];
  return (
    <div className="space-y-6">
      <PageHeader title="Mi próxima cita" subtitle="Detalles e información práctica para tu visita." />

      {next ? (
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="sm:col-span-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Cita programada</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight capitalize">{formatDateLong(next.date)}</h2>
              <p className="text-sm text-muted-foreground mt-1">{next.type} · {next.duration} min</p>
              <ul className="mt-6 space-y-2 text-sm">
                <li className="flex items-center gap-2"><Clock size={14} className="text-muted-foreground" /> {next.time}</li>
                <li className="flex items-center gap-2"><User size={14} className="text-muted-foreground" /> {next.doctorName}</li>
                <li className="flex items-center gap-2"><MapPin size={14} className="text-muted-foreground" /> Boss Dental, Centro de Especialidades</li>
                <li className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground" /> +52 55 0000 0000</li>
              </ul>
              <div className="mt-6 flex gap-2">
                <Button>Confirmar asistencia</Button>
                <Button variant="outline">Reprogramar</Button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Indicaciones</p>
              <ul className="mt-3 list-disc list-inside text-sm text-muted-foreground space-y-1.5">
                <li>Llega 10 minutos antes de tu cita.</li>
                <li>Trae tus radiografías recientes si las tienes.</li>
                <li>Cepilla tus dientes antes de la sesión.</li>
                <li>Evita comer 1 hora antes si será tratamiento.</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No tienes citas próximas.</p>
      )}

      <div>
        <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground mb-3">Otras citas próximas</p>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {list.slice(1).map((a) => (
            <div key={a.id} className="flex items-center gap-4 p-3">
              <Calendar size={14} className="text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{formatDateLong(a.date)}</p>
                <p className="text-xs text-muted-foreground">{a.time} · {a.type}</p>
              </div>
              <StatusBadge value={a.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
