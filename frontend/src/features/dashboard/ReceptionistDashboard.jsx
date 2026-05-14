import { CalendarDays, UserPlus, MessageSquare, Receipt, Plus, ChevronRight } from "lucide-react";
import { useState } from "react";
import PageHeader from "@/shared/PageHeader";
import KpiCard from "@/shared/KpiCard";
import Section from "@/shared/Section";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useClinic } from "@/store/clinicStore";
import { followUps } from "@/mocks";
import { formatDateLong, currencyMXN } from "@/utils/format";
import { Link } from "react-router-dom";
import CreateAppointmentDialog from "@/features/appointments/CreateAppointmentDialog";

export default function ReceptionistDashboard() {
  const { user } = useAuth();
  const { appointments, payments, patients } = useClinic();
  const [createOpen, setCreateOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter((a) => a.date === today);
  const arrived = todayAppointments.filter((a) => a.hasArrived).length;
  const pendingPayments = payments.filter((p) => p.status === "Pendiente").length;
  const newPatientsThisMonth = patients.length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={formatDateLong(today)}
        title={`Buen día, ${user.name.split(" ")[0]}`}
        subtitle="Tu panel para coordinar la agenda y atención del día."
        actions={
          <>
            <Link to="/agenda"><Button variant="outline" data-testid="quick-agenda">Ver agenda</Button></Link>
            <Button onClick={() => setCreateOpen(true)} data-testid="quick-create-cita"><Plus size={14} className="mr-1" /> Crear cita</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard testId="kpi-citas-hoy" label="Citas hoy" value={todayAppointments.length} icon={CalendarDays} accent />
        <KpiCard label="Pacientes llegaron" value={arrived} icon={UserPlus} />
        <KpiCard label="WhatsApp enviados" value={42} icon={MessageSquare} />
        <KpiCard label="Pagos pendientes" value={pendingPayments} icon={Receipt} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section
          className="lg:col-span-2"
          title="Agenda de hoy"
          action={<Link to="/agenda" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">Abrir agenda <ChevronRight size={12} /></Link>}
        >
          <div className="divide-y divide-border">
            {todayAppointments.map((a) => (
              <Link key={a.id} to={`/pacientes/${a.patientId}`} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0 hover:bg-secondary/30 -mx-2 px-2 rounded-md transition-colors">
                <div className="w-14 text-sm font-mono">{a.time}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.type} · {a.doctorName} · {a.branch}</p>
                </div>
                <StatusBadge value={a.status} />
              </Link>
            ))}
            {todayAppointments.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sin citas para hoy.</p>}
          </div>
        </Section>

        <Section title="Seguimientos">
          <ul className="space-y-3">
            {followUps.map((f) => {
              const target = patients.find((p) => p.name === f.patient);
              const Wrap = target ? Link : "div";
              const wrapProps = target ? { to: `/pacientes/${target.id}` } : {};
              return (
                <Wrap key={f.id} {...wrapProps} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 hover:bg-secondary/30 transition-colors block">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.patient}</p>
                    <p className="text-xs text-muted-foreground">{f.reason}</p>
                    <p className="text-[11px] mt-1 text-muted-foreground">Vence: {f.due}</p>
                  </div>
                  <StatusBadge value={f.priority} />
                </Wrap>
              );
            })}
          </ul>
        </Section>
      </div>

      <Section title="Pagos pendientes recientes" action={<Link to="/pagos" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">Ver todo <ChevronRight size={12} /></Link>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {payments.filter((p) => p.status === "Pendiente").slice(0, 6).map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium truncate">{p.patientName}</p>
                <StatusBadge value="Pendiente" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{p.concept}</p>
              <p className="text-base font-semibold mt-2">{currencyMXN(p.amount)}</p>
            </div>
          ))}
          {payments.filter((p) => p.status === "Pendiente").length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">Sin pagos pendientes.</p>
          )}
        </div>
      </Section>

      <p className="text-xs text-muted-foreground">{newPatientsThisMonth} pacientes activos en sistema.</p>
      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
