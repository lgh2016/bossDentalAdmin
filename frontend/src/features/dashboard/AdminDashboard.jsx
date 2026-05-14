import { CalendarDays, Users, UserPlus, Wallet, TrendingUp, Activity as ActivityIcon, Stethoscope, Receipt, ChevronRight } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import KpiCard from "@/shared/KpiCard";
import Section from "@/shared/Section";
import StatusBadge from "@/shared/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { appointments, leads, patients, payments, doctors, activity } from "@/mocks";
import { currencyMXN, initials, formatDateLong } from "@/utils/format";
import { Link } from "react-router-dom";

export default function AdminDashboard({ now }) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter((a) => a.date === today);
  const newLeads = leads.filter((l) => l.status === "Nuevo").length;
  const newPatients = patients.filter((p) => p.status === "Activo").length;
  const incomeToday = payments.filter((p) => p.date === today && p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const incomeMonth = payments.filter((p) => p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter((p) => p.status === "Pendiente").reduce((s, p) => s + p.amount, 0);

  const topDoctors = [...doctors].sort((a, b) => b.appointmentsThisMonth - a.appointmentsThisMonth).slice(0, 4);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={formatDateLong(today)}
        title={`Hola, ${user.name.split(" ")[0]}`}
        subtitle="Resumen ejecutivo de la operación de hoy."
        actions={
          <>
            <Link to="/citas"><Button variant="outline" data-testid="quick-citas">Ver citas</Button></Link>
            <Link to="/pacientes"><Button data-testid="quick-pacientes">Nuevo paciente</Button></Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard testId="kpi-citas-hoy" label="Citas hoy" value={todayAppointments.length} delta={8} icon={CalendarDays} accent />
        <KpiCard testId="kpi-pacientes-nuevos" label="Pacientes nuevos" value={newPatients} delta={3} icon={Users} />
        <KpiCard testId="kpi-leads-nuevos" label="Leads nuevos" value={newLeads} delta={12} icon={UserPlus} />
        <KpiCard testId="kpi-ingresos-hoy" label="Ingresos hoy" value={currencyMXN(incomeToday)} delta={5} icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KpiCard label="Ingresos del mes" value={currencyMXN(incomeMonth)} delta={14} icon={TrendingUp} />
        <KpiCard label="Pagos pendientes" value={currencyMXN(pending)} delta={-4} icon={Receipt} />
        <KpiCard label="Tratamientos activos" value="38" delta={6} icon={Stethoscope} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section
          className="lg:col-span-2"
          title="Citas de hoy"
          action={<Link to="/citas" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">Ver todo <ChevronRight size={12} /></Link>}
        >
          <div className="divide-y divide-border">
            {todayAppointments.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <div className="w-14 text-sm font-mono">{a.time}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.type} · {a.doctorName}</p>
                </div>
                <StatusBadge value={a.status} />
              </div>
            ))}
            {todayAppointments.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Sin citas registradas para hoy.</p>
            )}
          </div>
        </Section>

        <Section title="Doctores con más citas">
          <ul className="space-y-3">
            {topDoctors.map((d, i) => (
              <li key={d.id} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <Avatar className="size-9">
                  <AvatarImage src={d.avatar} />
                  <AvatarFallback>{initials(d.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.specialty}</p>
                </div>
                <span className="text-sm font-semibold">{d.appointmentsThisMonth}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Actividad reciente" action={<Link to="/actividad" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">Ver todo <ChevronRight size={12} /></Link>}>
        <ul className="space-y-3">
          {activity.slice(0, 6).map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <div className="size-8 rounded-md bg-secondary grid place-items-center mt-0.5">
                <ActivityIcon size={14} className="text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-medium">{a.actor}</span>{" "}
                  <span className="text-muted-foreground">{a.action}</span>{" "}
                  <span className="font-medium">{a.target}</span>
                  {a.amount && <span className="text-primary font-medium"> · {currencyMXN(a.amount)}</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
