import { useEffect, useState } from "react";
import { CalendarDays, UserPlus, MessageSquare, Receipt, Plus, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "@/shared/PageHeader";
import KpiCard from "@/shared/KpiCard";
import Section from "@/shared/Section";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useClinic } from "@/store/clinicStore";
import { followUps } from "@/mocks";
import { formatDateLong, currencyMXN } from "@/utils/format";
import CreateAppointmentDialog from "@/features/appointments/CreateAppointmentDialog";
import TodayAgendaSection from "./TodayAgendaSection";
import { dashboardApi } from "@/services/dashboardApi";

export default function ReceptionistDashboard() {
  const { user } = useAuth();
  const { payments, patients } = useClinic();
  const [createOpen, setCreateOpen] = useState(false);
  const [citasHoy, setCitasHoy] = useState(null); // null = cargando
  const today = new Date().toISOString().slice(0, 10);
  const pendingPayments = payments.filter((p) => p.status === "Pendiente").length;
  const newPatientsThisMonth = patients.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await dashboardApi.todayCount();
        if (!cancelled) setCitasHoy(data?.total ?? 0);
      } catch {
        if (!cancelled) setCitasHoy(0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
        <KpiCard testId="kpi-citas-hoy" label="Citas hoy" value={citasHoy ?? "…"} icon={CalendarDays} accent />
        <KpiCard label="Pacientes llegaron" value={"—"} icon={UserPlus} />
        <KpiCard label="WhatsApp enviados" value={"—"} icon={MessageSquare} />
        <KpiCard label="Pagos pendientes" value={pendingPayments} icon={Receipt} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TodayAgendaSection />

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
