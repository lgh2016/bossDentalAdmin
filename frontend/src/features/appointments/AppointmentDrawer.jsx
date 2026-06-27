import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/shared/StatusBadge";
import ConfirmDialog from "@/shared/ConfirmDialog";
import { Calendar, Clock, MapPin, Stethoscope, UserCheck, RefreshCw, FileText, X, Check, Loader2, History, Phone, Play, UserX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { appointmentsApi } from "@/services/appointmentsApi";
import { appointmentLifecycleApi } from "@/services/appointmentLifecycleApi";
import { effectiveDoctor } from "@/utils/appointmentStatus";
import ChangeDoctorDialog from "./ChangeDoctorDialog";
import CancelAppointmentDialog from "./CancelAppointmentDialog";

const trimSec = (t) => (t ? String(t).slice(0, 5) : "");

export default function AppointmentDrawer({ open, onOpenChange, appointmentId, appointment: inlineAppt, onChanged }) {
  const navigate = useNavigate();
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(false);

  const reload = useCallback(async (signal) => {
    if (!appointmentId) return;
    setLoading(true); setError(null);
    try {
      const [appt, hist] = await Promise.all([
        appointmentsApi.getById(appointmentId, { signal }),
        appointmentsApi.history(appointmentId, { signal }).catch(() => ({ events: [] })),
      ]);
      setData(appt);
      setHistory(Array.isArray(hist?.events) ? hist.events : []);
    } catch (err) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      setError("No fue posible cargar la cita.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    if (!open) { setData(null); setHistory([]); setError(null); return; }
    if (inlineAppt) { setData(inlineAppt); setHistory([]); return; }
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [open, appointmentId, inlineAppt, reload]);

  const eff = data ? effectiveDoctor(data) : { id: null, name: null };
  const requested = data?.doctorSolicitadoName;
  const assigned = data?.doctorAsignadoName;
  const wasReassigned = data && data.doctorSolicitado != null && data.doctorAsignado != null && data.doctorSolicitado !== data.doctorAsignado;

  const goRecord = () => {
    if (!data?.patientId) return;
    onOpenChange(false);
    navigate(`/pacientes/${data.patientId}`);
  };

  const wrap = (fn, successMsg) => async () => {
    if (!data || acting) return;
    setActing(true);
    try {
      await fn();
      toast.success(successMsg);
      await reload();
      onChanged?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible completar la acción");
    } finally {
      setActing(false);
    }
  };

  const handleArrive = wrap(() => appointmentLifecycleApi.arrive(data.appointmentId), "Llegada registrada");
  const handleStart = wrap(() => appointmentLifecycleApi.startAttention(data.appointmentId), "Atención iniciada");
  const handleFinish = wrap(() => appointmentLifecycleApi.finishAttention(data.appointmentId, ""), "Cita marcada como atendida");
  const handleNoShow = async () => {
    if (!data) return;
    setActing(true);
    try {
      await appointmentLifecycleApi.noShow(data.appointmentId);
      toast.success("Cita marcada como No asistió");
      setNoShowOpen(false);
      await reload();
      onChanged?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible marcar como No asistió");
    } finally {
      setActing(false);
    }
  };

  const status = data?.statusCode;
  const canArrive = status === "CONFIRMED";
  const canStart = status === "ARRIVED" || (status === "CONFIRMED" && data?.doctorAsignado);
  const canFinish = status === "IN_PROGRESS";
  const canCancel = data && !["CANCELLED", "COMPLETED", "ATTENDED", "NO_SHOW"].includes(status);
  const canNoShow = data && ["CONFIRMED", "ARRIVED"].includes(status);
  // Cambiar/asignar doctor: NO permitido durante atención ni en estados finales.
  const canChangeDoctor = data && !["IN_PROGRESS", "CANCELLED", "COMPLETED", "ATTENDED", "NO_SHOW"].includes(status);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="appointment-drawer">
          <SheetHeader>
            <SheetTitle>{data?.patientName || (loading ? "Cargando…" : "Cita")}</SheetTitle>
            <SheetDescription>
              {data ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="font-mono">{data.patientExpedient || "—"}</span>
                  {data.reason ? <span>· {data.reason}</span> : null}
                  {data.durationMinutes ? <span>· {data.durationMinutes} min</span> : null}
                </span>
              ) : "Detalle de cita"}
            </SheetDescription>
          </SheetHeader>

          {loading && (
            <div className="mt-8 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Cargando detalle…
            </div>
          )}

          {error && !loading && (
            <div className="mt-8 text-sm text-rose-500" data-testid="appt-detail-error">{error}</div>
          )}

          {!loading && !error && data && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-2">
                <StatusBadge appointment={data} />
                {data.walkIn && <span className="text-[10px] uppercase tracking-wide font-medium text-violet-700 dark:text-violet-300">Atención operativa</span>}
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm">
                <DetailRow icon={Calendar} label="Fecha" value={data.appointmentDate || data.date} />
                <DetailRow icon={Clock} label="Horario" value={`${trimSec(data.startTime)}${data.endTime ? ` – ${trimSec(data.endTime)}` : ""}`} />
                <DetailRow icon={MapPin} label="Sucursal" value={data.branchName || "—"} />
                {data.patientPhone && <DetailRow icon={Phone} label="Teléfono" value={data.patientPhone} />}
              </div>

              {/* Doctores */}
              <section className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Asignación</p>
                <DetailRow icon={Stethoscope} label="Doctor asignado" value={assigned || (requested ? <span className="text-muted-foreground italic">{requested} (solicitado)</span> : "Sin asignar")} />
                {wasReassigned && (
                  <p className="text-[11px] text-muted-foreground pl-6">
                    Solicitado originalmente: <span className="italic">{requested}</span>
                  </p>
                )}
              </section>

              {/* Tracking */}
              <section className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Línea de tiempo</p>
                <TimelineRow label="Programada" value={trimSec(data.horaProgramada)} />
                <TimelineRow label="Llegada" value={trimSec(data.horaLlegada)} />
                <TimelineRow label="Inicio real" value={trimSec(data.horaInicioReal)} />
                <TimelineRow label="Fin real" value={trimSec(data.horaFinReal)} />
              </section>

              {data.notes && (
                <section>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{data.notes}</p>
                </section>
              )}

              {data.cancelReason && (
                <section>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Motivo de cancelación</p>
                  <p className="text-xs text-muted-foreground">{data.cancelReason}</p>
                </section>
              )}

              {/* Acciones */}
              <section className="grid grid-cols-2 gap-2 pt-2">
                {canArrive && (
                  <Button type="button" onClick={handleArrive} disabled={acting} data-testid="action-arrived">
                    <UserCheck size={14} className="mr-1.5" /> Marcar llegada
                  </Button>
                )}
                {canStart && (
                  <Button type="button" onClick={handleStart} disabled={acting} data-testid="action-start-attention">
                    <Play size={14} className="mr-1.5" /> Iniciar atención
                  </Button>
                )}
                {canFinish && (
                  <Button type="button" onClick={handleFinish} disabled={acting} data-testid="action-finish">
                    <Check size={14} className="mr-1.5" /> Marcar atendida
                  </Button>
                )}
                {canChangeDoctor && (
                  <Button type="button" variant="outline" onClick={() => setChangeOpen(true)} disabled={acting} data-testid="action-change-doctor">
                    <RefreshCw size={14} className="mr-1.5" /> {data.doctorAsignado || data.doctorSolicitado ? "Cambiar doctor" : "Asignar doctor"}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={goRecord} disabled={!data.patientId || acting} data-testid="action-open-record">
                  <FileText size={14} className="mr-1.5" /> Expediente
                </Button>
                {canCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    className="col-span-2 text-rose-600 hover:text-rose-700"
                    onClick={() => setCancelOpen(true)}
                    disabled={acting}
                    data-testid="action-cancel"
                  >
                    <X size={14} className="mr-1.5" /> Cancelar cita
                  </Button>
                )}
                {canNoShow && (
                  <Button
                    type="button"
                    variant="outline"
                    className="col-span-2 text-rose-600 hover:text-rose-700"
                    onClick={() => setNoShowOpen(true)}
                    disabled={acting}
                    data-testid="action-no-show"
                  >
                    <UserX size={14} className="mr-1.5" /> Marcar como No asistió
                  </Button>
                )}
              </section>

              {/* Historial */}
              {history.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><History size={12} /> Historial</p>
                  <ul className="space-y-2" data-testid="appt-history">
                    {history.map((e, i) => (
                      <li key={i} className="text-[11px] border-l-2 border-border pl-3 py-0.5">
                        <p className="font-medium text-foreground">{e.title || e.actionCode}</p>
                        <p className="text-muted-foreground">
                          {e.description}
                          {e.actorName ? <> · <span className="italic">{e.actorName}</span></> : null}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 font-mono">
                          {e.createdAt ? new Date(e.createdAt).toLocaleString("es-MX") : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ChangeDoctorDialog
        open={changeOpen}
        onOpenChange={(o) => { setChangeOpen(o); if (!o) { reload(); onChanged?.(); } }}
        appointment={data ? legacyApptShape(data) : null}
      />
      <CancelAppointmentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        appointment={data}
        onCancelled={() => { reload(); onChanged?.(); }}
      />
      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar como No asistió"
        description="Se liberará el bloque operativo y el doctor asignado. La cita quedará registrada en histórico."
        confirmLabel="Sí, no asistió"
        destructive
        onConfirm={handleNoShow}
        testId="no-show-confirm"
      />
    </>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="mt-0.5 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
        <div className="text-sm text-foreground">{value || "—"}</div>
      </div>
    </div>
  );
}

function TimelineRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-[11px] py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? "text-foreground font-mono" : "text-muted-foreground/60 font-mono"}>
        {value || "—"}
      </span>
    </div>
  );
}

function legacyApptShape(d) {
  return {
    id: d.appointmentId,
    appointmentId: d.appointmentId,
    patientId: d.patientId,
    patientName: d.patientName,
    doctorId: d.doctorAsignado || d.doctorSolicitado || d.doctorId,
    doctorName: d.doctorAsignadoName || d.doctorSolicitadoName || d.doctorName,
    branch: d.branchName,
    date: d.appointmentDate || d.date,
    time: trimSec(d.startTime),
    type: d.reason,
  };
}
