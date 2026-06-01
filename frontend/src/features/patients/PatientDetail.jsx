import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Phone, Mail, Calendar, Stethoscope, FileText, Receipt, Activity, IdCard, MapPin, RefreshCw, Pencil, UserCheck, Plus, ShieldAlert, X, ReceiptText, Loader2 } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useClinic, clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { treatments } from "@/mocks";
import { currencyMXN, formatDateLong } from "@/utils/format";
import { ROLES } from "@/constants/roles";
import ChangeDoctorDialog from "@/features/appointments/ChangeDoctorDialog";
import CreateAppointmentDialog from "@/features/appointments/CreateAppointmentDialog";
import RescheduleDialog from "@/features/appointments/RescheduleDialog";
import CancelAppointmentDialog from "@/features/appointments/CancelAppointmentDialog";
import RegisterPaymentDialog from "@/features/payments/RegisterPaymentDialog";
import CancelPaymentDialog from "@/features/payments/CancelPaymentDialog";
import QuotationEditor from "@/features/quotations/QuotationEditor";
import PatientHistory from "./PatientHistory";
import PatientAppointmentsTab from "./PatientAppointmentsTab";
import { patientsApi } from "@/services/patientsApi";
import { cn } from "@/lib/utils";

const trimSec = (t) => (t ? String(t).slice(0, 5) : "");
const apptLabel = (ap) => {
  if (!ap) return null;
  const date = ap.date || ap.appointmentDate;
  const time = trimSec(ap.startTime || ap.time);
  const reason = ap.reason || ap.type || "";
  return [date, time, reason].filter(Boolean).join(" · ");
};

export default function PatientDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { appointments, payments } = useClinic();

  // Detalle real del paciente desde el WS.
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    (async () => {
      try {
        const d = await patientsApi.getDetail(id);
        if (!cancelled) setDetail(d);
      } catch {
        if (!cancelled) setDetailError("No fue posible cargar el detalle del paciente.");
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const [createOpen, setCreateOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [rescheduleAppt, setRescheduleAppt] = useState(null);
  const [cancelAppt, setCancelAppt] = useState(null);
  const [registerPayOpen, setRegisterPayOpen] = useState(false);
  const [cancelPayTarget, setCancelPayTarget] = useState(null);
  const [tab, setTab] = useState(params.get("tab") || "summary");
  const highlightId = params.get("highlight");

  useEffect(() => {
    const t = params.get("tab"); if (t) setTab(t);
  }, [params]);

  // Datos del store local sólo se usan en las pestañas que aún no migran al WS.
  const apts = appointments.filter((a) => a.patientId === id).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const pays = payments.filter((x) => x.patientId === id);
  const treats = treatments.filter((t) => t.patientId === id);
  const today = new Date().toISOString().slice(0, 10);
  const nextApptLocal = apts.find((a) => a.date >= today && a.status !== "Cancelada");

  // Placeholder para tabs que aún no consumen su WS propio.
  const p = {
    id,
    name: detail?.fullName || "Paciente",
    expediente: detail?.expedientNumber || `EXP-${new Date().getFullYear()}-${String(id).padStart(6, "0")}`,
    branch: detail?.location || "—",
    email: detail?.email || "",
    phone: detail?.phone || "",
    age: detail?.age ?? 0,
    gender: detail?.gender || "—",
    insurance: "Particular",
    status: "Activo",
    balance: detail?.balance ?? 0,
    totalBudget: detail?.totalBudgeted ?? 0,
    totalPaid: detail?.paidAmount ?? 0,
    assignedDoctorId: null,
    hasRisk: false,
  };
  const isReceptionist = user.role === ROLES.RECEPCIONISTA;

  const nextApptLabel = apptLabel(detail?.nextAppointment) || "Sin programar";
  const prevApptLabel = apptLabel(detail?.previousAppointment) || "Sin registro";

  return (
    <div className="space-y-6">
      <Link to={isReceptionist ? "/agenda" : "/pacientes"} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft size={12} /> Volver
      </Link>

      <PageHeader
        eyebrow={`Expediente ${p.expediente}`}
        title={p.name}
        subtitle={detail
          ? `Activo desde ${formatDateLong(detail.createdAt || today)} · Sucursal ${detail.location || "—"}`
          : (loadingDetail ? "Cargando detalle…" : (detailError || ""))}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="patient-create-appt"><Plus size={13} className="mr-1" /> Crear cita</Button>
            <Button variant="outline" size="sm" onClick={() => setDoctorOpen(true)} disabled={!nextApptLocal} data-testid="patient-change-doctor"><RefreshCw size={13} className="mr-1" /> {nextApptLocal?.doctorId ? "Cambiar doctor" : "Asignar doctor"}</Button>
          </>
        }
      />

      {detailError && !loadingDetail && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-600 dark:text-rose-400">
          {detailError}
        </div>
      )}

      {p.hasRisk && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm" data-testid="patient-risk-banner">
          <ShieldAlert size={15} /> Cuestionario clínico marca riesgo: <strong>requiere revisión</strong> antes de cualquier procedimiento.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-border bg-card p-5">
          {loadingDetail && !detail ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Avatar className="size-14">
                  {detail?.avatarUrl ? <AvatarImage src={detail.avatarUrl} /> : null}
                  <AvatarFallback>{detail?.initials || "—"}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.gender} · {p.age} años</p>
                </div>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex items-center gap-2 text-muted-foreground"><Mail size={13} /><span className="text-foreground">{p.email || "—"}</span></li>
                <li className="flex items-center gap-2 text-muted-foreground"><Phone size={13} /><span className="text-foreground font-mono text-xs">{p.phone || "—"}</span></li>
                <li className="flex items-center gap-2 text-muted-foreground"><MapPin size={13} /><span className="text-foreground">{p.branch}</span></li>
                <li className="flex items-center gap-2 text-muted-foreground"><Stethoscope size={13} /><span className="text-foreground">{detail?.doctorName || "Sin asignar"}</span></li>
              </ul>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Saldo</p><p className="text-lg font-semibold mt-1">{currencyMXN(p.balance)}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Pagado</p><p className="text-lg font-semibold mt-1">{currencyMXN(p.totalPaid)}</p></div>
                <div className="rounded-lg border border-border p-3 col-span-2"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Total presupuestado</p><p className="text-lg font-semibold mt-1">{currencyMXN(p.totalBudget)}</p></div>
              </div>
              {detail?.nextAppointment && (
                <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Próxima cita</p>
                  <p className="text-sm font-medium mt-1">{detail.nextAppointment.date || detail.nextAppointment.appointmentDate} · {trimSec(detail.nextAppointment.startTime || detail.nextAppointment.time)}</p>
                  <p className="text-xs text-muted-foreground">{detail.nextAppointment.reason || detail.nextAppointment.type || ""}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="lg:col-span-2">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="bg-secondary flex-wrap h-auto">
              <TabsTrigger value="summary" data-testid="tab-summary"><Activity size={13} className="mr-1.5" />Resumen</TabsTrigger>
              <TabsTrigger value="card" data-testid="tab-card"><IdCard size={13} className="mr-1.5" />Carnet</TabsTrigger>
              <TabsTrigger value="appointments" data-testid="tab-appointments"><Calendar size={13} className="mr-1.5" />Citas</TabsTrigger>
              <TabsTrigger value="treatments" data-testid="tab-treatments"><Stethoscope size={13} className="mr-1.5" />Tratamientos</TabsTrigger>
              <TabsTrigger value="budget" data-testid="tab-budget" onClick={() => clinicStore.consultBudget(id, user)}><FileText size={13} className="mr-1.5" />Cotización</TabsTrigger>
              <TabsTrigger value="payments" data-testid="tab-payments"><Receipt size={13} className="mr-1.5" />Pagos</TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history"><Activity size={13} className="mr-1.5" />Historial</TabsTrigger>
              <TabsTrigger value="notes" data-testid="tab-notes"><FileText size={13} className="mr-1.5" />Notas</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-4 grid grid-cols-2 gap-3">
              {[
                { l: "Próxima cita", v: nextApptLabel },
                { l: "Cita anterior", v: prevApptLabel },
                { l: "Doctor asignado", v: detail?.doctorName || "Sin asignar" },
                { l: "Sucursal", v: detail?.location || "—" },
                { l: "Estado", v: "Activo" },
                { l: "Cobertura", v: "Particular" },
                { l: "Tratamiento actual", v: "—" },
              ].map((x, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{x.l}</p>
                  <p className="text-sm font-medium mt-1">{x.v}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="card" className="mt-4">
              <div className="max-w-md">
                <div className="rounded-2xl overflow-hidden border border-border bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">Boss Dental</p>
                      <p className="text-xs opacity-80">Carnet del paciente</p>
                    </div>
                    <IdCard size={20} />
                  </div>
                  <p className="mt-6 text-base font-semibold tracking-tight">{p.name}</p>
                  <p className="text-[11px] opacity-80 font-mono">{p.expediente}</p>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    <div><p className="opacity-70">Edad</p><p className="font-medium">{p.age} años</p></div>
                    <div><p className="opacity-70">Teléfono</p><p className="font-mono">{p.phone}</p></div>
                    <div><p className="opacity-70">Sucursal</p><p className="font-medium">{p.branch}</p></div>
                    <div><p className="opacity-70">Horario</p><p className="font-medium">L-S 9:00-19:00</p></div>
                    <div className="col-span-2 pt-2 border-t border-white/20">
                      <p className="opacity-70">Próxima cita</p>
                      <p className="font-medium">{nextApptLabel}</p>
                    </div>
                    <div><p className="opacity-70">Doctor</p><p className="font-medium">{detail?.doctorName || "—"}</p></div>
                    <div><p className="opacity-70">Saldo</p><p className="font-medium">{currencyMXN(p.balance)}</p></div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appointments" className="mt-4">
              <PatientAppointmentsTab
                patientId={id}
                onCreate={() => setCreateOpen(true)}
                onReschedule={(a) => setRescheduleAppt(a)}
                onCancel={(a) => setCancelAppt(a)}
              />
            </TabsContent>

            <TabsContent value="treatments" className="mt-4 space-y-3">
              {treats.length === 0 ? <p className="text-sm text-muted-foreground">Sin tratamientos.</p> : treats.map((t) => (
                <div key={t.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between"><p className="text-sm font-medium">{t.name}</p><StatusBadge value={t.status} /></div>
                  <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${t.progress}%` }} /></div>
                  <p className="text-xs text-muted-foreground mt-2">{t.sessions.done}/{t.sessions.total} sesiones · {currencyMXN(t.totalCost)}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="budget" className="mt-4">
              <QuotationEditor patientId={id} />
            </TabsContent>

            <TabsContent value="payments" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setRegisterPayOpen(true)} data-testid="pays-register"><ReceiptText size={13} className="mr-1" /> Registrar pago</Button>
              </div>
              <div className="rounded-xl border border-border divide-y divide-border" data-testid="patient-payments-list">
                {pays.map((x) => (
                  <div
                    key={x.id}
                    className={cn(
                      "flex items-center gap-4 p-3 flex-wrap transition-shadow",
                      x.status === "Cancelado" && "opacity-60",
                      highlightId === x.id && "ring-2 ring-primary/50 bg-primary/5",
                    )}
                    data-testid={`patient-payment-${x.id}`}
                  >
                    <div className="w-24 text-xs">{x.date}</div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium truncate", x.status === "Cancelado" && "line-through")}>{x.concept}</p>
                      <p className="text-xs text-muted-foreground">
                        {x.method}{x.registeredBy && ` · registrado por ${x.registeredBy}`}
                        {x.status === "Cancelado" && x.cancelReason && <> · cancelado por {x.cancelledBy} · {x.cancelReason}</>}
                      </p>
                    </div>
                    <p className={cn("text-sm font-semibold", x.status === "Cancelado" && "line-through")}>{currencyMXN(x.amount)}</p>
                    <StatusBadge value={x.status} />
                    {x.status !== "Cancelado" && (
                      <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => setCancelPayTarget(x)} data-testid={`patient-cancel-payment-${x.id}`}>
                        <X size={12} className="mr-1" /> Cancelar
                      </Button>
                    )}
                  </div>
                ))}
                {pays.length === 0 && <p className="text-sm text-muted-foreground p-6 text-center">Sin pagos registrados.</p>}
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <PatientHistory patientId={id} />
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                Aquí podrás agregar notas clínicas, indicaciones y observaciones del paciente.
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ChangeDoctorDialog open={doctorOpen} onOpenChange={setDoctorOpen} appointment={nextApptLocal} />
      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RescheduleDialog open={!!rescheduleAppt} onOpenChange={(v) => !v && setRescheduleAppt(null)} appointment={rescheduleAppt} />
      <CancelAppointmentDialog open={!!cancelAppt} onOpenChange={(v) => !v && setCancelAppt(null)} appointment={cancelAppt} />
      <RegisterPaymentDialog open={registerPayOpen} onOpenChange={setRegisterPayOpen} patientId={id} />
      <CancelPaymentDialog open={!!cancelPayTarget} onOpenChange={(v) => !v && setCancelPayTarget(null)} payment={cancelPayTarget} />
    </div>
  );
}
