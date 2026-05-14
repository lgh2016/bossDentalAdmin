import { Calendar, IdCard, Receipt, FileText, Sparkles, Clock } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import Section from "@/shared/Section";
import StatusBadge from "@/shared/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { appointments, payments, treatments, treatmentTimelineByPatient, patients } from "@/mocks";
import { currencyMXN, formatDateLong, initials } from "@/utils/format";
import { Link } from "react-router-dom";

export default function PatientDashboard() {
  const { user } = useAuth();
  const myId = "p-1"; // demo patient maps to Carlos Mendoza
  const me = patients.find((p) => p.id === myId);
  const today = new Date().toISOString().slice(0, 10);
  const next = appointments.find((a) => a.patientId === myId && a.date >= today);
  const myPayments = payments.filter((p) => p.patientId === myId);
  const myTreatment = treatments.find((t) => t.patientId === myId);
  const timeline = treatmentTimelineByPatient[myId] || [];
  const totalPaid = myPayments.filter((p) => p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const balance = me?.balance ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mi clínica"
        title={`Hola, ${user.name.split(" ")[0]}`}
        subtitle="Tu información clínica y financiera, siempre a la mano."
      />

      {/* Hero próxima cita */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/8 via-card to-card p-6 sm:p-8">
        <div className="absolute -top-20 -right-20 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
              <Sparkles size={11} /> Próxima cita
            </div>
            {next ? (
              <>
                <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
                  {formatDateLong(next.date)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {next.type} · {next.duration} min · con {next.doctorName}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Clock size={14} className="text-muted-foreground" /> {next.time}
                  </span>
                  <StatusBadge value={next.status} />
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No tienes citas programadas.</p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/mi-cita"><Button variant="outline" size="sm">Detalles</Button></Link>
              <Link to="/mi-tratamiento"><Button size="sm">Mi tratamiento</Button></Link>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card/70 p-5 lg:w-72">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Saldo</p>
            <p className="mt-1 text-2xl font-semibold">{currencyMXN(balance)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total pagado: {currencyMXN(totalPaid)}</p>
            <Link to="/mi-cuenta" className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">
              Ver estado de cuenta →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section className="lg:col-span-2" title="Mi tratamiento">
          {myTreatment ? (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{myTreatment.name}</p>
                  <p className="text-xs text-muted-foreground">Inició el {myTreatment.startDate}</p>
                </div>
                <StatusBadge value={myTreatment.status} />
              </div>
              <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${myTreatment.progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {myTreatment.sessions.done} de {myTreatment.sessions.total} sesiones · {myTreatment.progress}%
              </p>

              <div className="mt-6 border-t border-border pt-5">
                <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground mb-3">
                  Línea de tiempo
                </p>
                <ol className="relative pl-5 border-l border-border space-y-4">
                  {timeline.map((s, i) => (
                    <li key={i} className="relative">
                      <span className={`absolute -left-[27px] top-1 size-3 rounded-full border-2 ${s.status === "Completado" ? "bg-primary border-primary" : "bg-background border-border"}`} />
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{s.date} · {s.status}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay tratamientos activos.</p>
          )}
        </Section>

        <Section title="Mi carnet digital">
          <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] opacity-80">Boss Dental · Carnet</p>
                <p className="mt-2 text-base font-semibold">{user.name}</p>
              </div>
              <IdCard size={22} />
            </div>
            <Avatar className="size-14 mt-5 ring-2 ring-white/30">
              <AvatarImage src={user.avatar} />
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="opacity-70">ID</p>
                <p className="font-mono">{user.id.toUpperCase()}</p>
              </div>
              <div>
                <p className="opacity-70">Vigencia</p>
                <p className="font-mono">12/2027</p>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Link to="/mi-presupuesto" className="rounded-lg border border-border bg-card p-3 text-center hover:bg-secondary/40 transition-colors">
              <FileText size={14} className="mx-auto text-muted-foreground" />
              <p className="text-[11px] mt-1.5 font-medium">Presupuesto</p>
            </Link>
            <Link to="/mi-cuenta" className="rounded-lg border border-border bg-card p-3 text-center hover:bg-secondary/40 transition-colors">
              <Receipt size={14} className="mx-auto text-muted-foreground" />
              <p className="text-[11px] mt-1.5 font-medium">Estado</p>
            </Link>
            <Link to="/mi-cita" className="rounded-lg border border-border bg-card p-3 text-center hover:bg-secondary/40 transition-colors">
              <Calendar size={14} className="mx-auto text-muted-foreground" />
              <p className="text-[11px] mt-1.5 font-medium">Cita</p>
            </Link>
          </div>
        </Section>
      </div>
    </div>
  );
}
