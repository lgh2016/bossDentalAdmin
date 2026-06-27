import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Users, Stethoscope, Loader2, Play, CheckCircle2, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import PageHeader from "@/shared/PageHeader";
import KpiCard from "@/shared/KpiCard";
import Section from "@/shared/Section";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { formatDateLong } from "@/utils/format";
import { dentistApi } from "@/services/dentistApi";
import { appointmentLifecycleApi } from "@/services/appointmentLifecycleApi";
import FinishAttentionDialog from "./FinishAttentionDialog";

const today = () => new Date().toISOString().slice(0, 10);

export default function DentistDashboard() {
  const { user } = useAuth();
  const [doctor, setDoctor] = useState(null);
  const [stats, setStats] = useState(null);
  const [todays, setTodays] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [inProgress, setInProgress] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [finishTarget, setFinishTarget] = useState(null);
  const refreshRef = useRef(0);

  const reload = useCallback(async (signal) => {
    setError(null);
    try {
      const [s, t, w, p, c, me] = await Promise.all([
        dentistApi.stats({ signal }),
        dentistApi.today({ signal }),
        dentistApi.waitingRoom({ signal }),
        dentistApi.inProgress({ signal }),
        dentistApi.completedToday({ signal }),
        doctor ? Promise.resolve(null) : dentistApi.me({ signal }),
      ]);
      setStats(s);
      setTodays(t);
      setWaiting(w);
      setInProgress(p);
      setCompleted(c);
      if (me) setDoctor(me.doctor);
    } catch (err) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      setError("No fue posible cargar tu jornada clínica.");
    } finally {
      setLoading(false);
    }
  }, [doctor]);

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    // Auto refresh cada 30s para reflejar cambios de recepción (llegadas/reasignaciones)
    const tick = setInterval(() => reload(), 30000);
    return () => { ctrl.abort(); clearInterval(tick); };
  }, [reload, refreshRef.current]);

  const refresh = () => refreshRef.current++;

  const handleStart = async (a) => {
    setActingId(a.appointmentId);
    try {
      await appointmentLifecycleApi.startAttention(a.appointmentId);
      toast.success(`Atención iniciada · ${a.patientName}`);
      await reload();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible iniciar la atención");
    } finally {
      setActingId(null);
    }
  };

  const handleFinish = (a) => setFinishTarget(a);

  const onFinished = async () => {
    setFinishTarget(null);
    await reload();
  };

  const firstName = (doctor?.name) || (user?.name?.split(" ")?.[0]) || "";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={formatDateLong(today())}
        title={`Buen día, Dr. ${firstName}`}
        subtitle={doctor ? `${doctor.specialty} · ${doctor.fullName}` : "Tu jornada clínica de un vistazo."}
        actions={<Button variant="outline" size="sm" onClick={refresh} data-testid="dentist-refresh">Refrescar</Button>}
      />

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600" data-testid="dentist-error">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard testId="kpi-dentist-today" label="Mis citas hoy" value={loading ? "…" : (stats?.todayCount ?? 0)} icon={CalendarDays} accent />
        <KpiCard testId="kpi-dentist-waiting" label="En sala de espera" value={loading ? "…" : (stats?.waitingCount ?? 0)} icon={Clock} />
        <KpiCard testId="kpi-dentist-inprogress" label="En atención" value={loading ? "…" : (stats?.inProgressCount ?? 0)} icon={Play} />
        <KpiCard testId="kpi-dentist-completed" label="Atendidas hoy" value={loading ? "…" : (stats?.completedTodayCount ?? 0)} icon={CheckCircle2} />
        <KpiCard testId="kpi-dentist-patients" label="Pacientes asignados" value={loading ? "…" : (stats?.assignedPatientsCount ?? 0)} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Sala de espera">
          <div className="divide-y divide-border" data-testid="dentist-waiting-list">
            {loading && waiting.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center"><Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando…</p>
            )}
            {!loading && waiting.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Nadie en espera ahora mismo.</p>
            )}
            {waiting.map((a) => (
              <div key={a.appointmentId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" data-testid={`waiting-${a.appointmentId}`}>
                <div className="w-16 text-xs text-muted-foreground font-mono">
                  <p>Llegó</p>
                  <p className="text-foreground font-medium">{(a.horaLlegada || "").slice(0,5) || "—"}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/pacientes/${a.patientId}`}
                    className="text-sm font-medium truncate hover:underline hover:text-primary inline-block"
                    data-testid={`waiting-patient-link-${a.appointmentId}`}
                  >
                    {a.patientName}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.reason} · {a.doctorAsignado === doctor?.id ? "Asignado a ti" : `Asignado: ${a.doctorAsignadoName || "—"}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={actingId === a.appointmentId || a.doctorAsignado !== doctor?.id}
                  onClick={() => handleStart(a)}
                  data-testid={`start-attention-${a.appointmentId}`}
                >
                  {actingId === a.appointmentId ? <Loader2 size={14} className="animate-spin" /> : "Iniciar atención"}
                </Button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="En atención">
          <div className="divide-y divide-border" data-testid="dentist-inprogress-list">
            {!loading && inProgress.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Sin pacientes en atención.</p>
            )}
            {inProgress.map((a) => (
              <div key={a.appointmentId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" data-testid={`inprogress-${a.appointmentId}`}>
                <div className="w-16 text-xs text-muted-foreground font-mono">
                  <p>Inicio</p>
                  <p className="text-foreground font-medium">{(a.horaInicioReal || "").slice(0,5) || "—"}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/pacientes/${a.patientId}`}
                    className="text-sm font-medium truncate hover:underline hover:text-primary inline-block"
                    data-testid={`inprogress-patient-link-${a.appointmentId}`}
                  >
                    {a.patientName}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">{a.reason}</p>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => handleFinish(a)}
                  data-testid={`finish-attention-${a.appointmentId}`}
                >
                  <CheckCircle2 size={14} className="mr-1.5" /> Finalizar atención
                </Button>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section
        title="Mis citas de hoy"
        action={<Link to="/mis-citas" className="text-xs text-muted-foreground hover:text-foreground">Ver toda mi agenda →</Link>}
      >
        <div className="divide-y divide-border" data-testid="dentist-today-list">
          {!loading && todays.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin citas agendadas hoy.</p>
          )}
          {todays.map((a) => (
            <div key={a.appointmentId} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0" data-testid={`today-${a.appointmentId}`}>
              <div className="w-14 text-sm font-mono">{a.time}</div>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/pacientes/${a.patientId}`}
                  className="text-sm font-medium truncate hover:underline hover:text-primary inline-block"
                  data-testid={`today-patient-link-${a.appointmentId}`}
                >
                  {a.patientName}
                </Link>
                <p className="text-xs text-muted-foreground truncate">
                  {a.reason}
                  {a.doctorAsignado !== doctor?.id && a.doctorAsignadoName ? ` · Asignado: ${a.doctorAsignadoName}` : ""}
                </p>
              </div>
              <StatusBadge value={a.statusName} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Atendidas hoy">
        <div className="divide-y divide-border" data-testid="dentist-completed-list">
          {!loading && completed.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Aún no has finalizado atenciones hoy.</p>
          )}
          {completed.map((a) => (
            <div key={a.appointmentId} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <div className="w-20 text-xs font-mono text-muted-foreground">
                <p>{(a.horaInicioReal || "").slice(0,5) || "—"} → {(a.horaFinReal || "").slice(0,5) || "—"}</p>
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/pacientes/${a.patientId}`}
                  className="text-sm font-medium truncate hover:underline hover:text-primary inline-block"
                  data-testid={`completed-patient-link-${a.appointmentId}`}
                >
                  {a.patientName}
                </Link>
                <p className="text-xs text-muted-foreground truncate">{a.reason}</p>
              </div>
              <StatusBadge value="Atendida" />
            </div>
          ))}
        </div>
      </Section>

      <FinishAttentionDialog
        appointment={finishTarget}
        open={!!finishTarget}
        onOpenChange={(o) => !o && setFinishTarget(null)}
        onFinished={onFinished}
      />
    </div>
  );
}
