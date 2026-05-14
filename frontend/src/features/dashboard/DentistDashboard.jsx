import { CalendarDays, Users, Stethoscope, ClipboardList, ChevronRight } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import KpiCard from "@/shared/KpiCard";
import Section from "@/shared/Section";
import StatusBadge from "@/shared/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { appointments, patients, treatments } from "@/mocks";
import { formatDateLong } from "@/utils/format";
import { Link } from "react-router-dom";

export default function DentistDashboard() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const myDoctorId = "d-1"; // map demo dentist user to doctor
  const myAppointments = appointments.filter((a) => a.doctorId === myDoctorId);
  const todayMine = myAppointments.filter((a) => a.date === today);
  const upcoming = myAppointments.filter((a) => a.date > today).slice(0, 5);
  const myPatients = patients.filter((p) => p.assignedDoctorId === myDoctorId);
  const myTreatments = treatments.filter((t) => t.doctorId === myDoctorId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={formatDateLong(today)}
        title={`Buenos días, ${user.name.split(" ").slice(0, 2).join(" ")}`}
        subtitle="Tu jornada clínica de un vistazo."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard testId="kpi-mis-citas" label="Mis citas hoy" value={todayMine.length} icon={CalendarDays} accent />
        <KpiCard label="Próximas" value={upcoming.length} icon={CalendarDays} />
        <KpiCard label="Pacientes asignados" value={myPatients.length} icon={Users} />
        <KpiCard label="Tratamientos activos" value={myTreatments.filter((t) => t.status === "En curso").length} icon={Stethoscope} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section className="lg:col-span-2" title="Mis citas de hoy" action={<Link to="/mis-citas" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">Ver todo <ChevronRight size={12} /></Link>}>
          <div className="divide-y divide-border">
            {todayMine.map((a) => (
              <div key={a.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <div className="w-14 text-sm font-mono">{a.time}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.type} · {a.duration} min</p>
                </div>
                <StatusBadge value={a.status} />
              </div>
            ))}
            {todayMine.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sin citas hoy.</p>}
          </div>
        </Section>

        <Section title="Próximas citas">
          <div className="space-y-3">
            {upcoming.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{a.patientName}</p>
                  <StatusBadge value={a.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.date} · {a.time} · {a.type}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Tratamientos en curso" action={<Link to="/tratamientos" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">Ver todo <ChevronRight size={12} /></Link>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {myTreatments.map((t) => (
            <div key={t.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <ClipboardList size={13} />
                <span>{t.patientName}</span>
              </div>
              <p className="text-sm font-medium">{t.name}</p>
              <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${t.progress}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">{t.sessions.done}/{t.sessions.total} sesiones · {t.progress}%</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
