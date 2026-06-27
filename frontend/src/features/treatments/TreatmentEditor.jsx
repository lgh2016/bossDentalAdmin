import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Play, Pause, Clock, ChevronDown, ChevronUp, ListChecks, Lock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { currencyMXN } from "@/utils/format";
import { patientsApi } from "@/services/patientsApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_META = {
  ACTIVE: { label: "Activo", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  PAUSED: { label: "Pausado", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  FINALIZED: { label: "Finalizado", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  CANCELLED: { label: "Cancelado", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30" },
};

const ACTIVITY_META = {
  PENDING: { label: "Pendiente", icon: Clock, className: "text-muted-foreground" },
  IN_PROGRESS: { label: "En proceso", icon: Play, className: "text-amber-600 dark:text-amber-400" },
  COMPLETED: { label: "Completado", icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  POSTPONED: { label: "Pospuesto", icon: Pause, className: "text-slate-500" },
  CANCELLED: { label: "Cancelado", icon: XCircle, className: "text-rose-500" },
};

const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
};

const isOpen = (t) => t && (t.status === "ACTIVE" || t.status === "PAUSED");

/**
 * Editor de Tratamientos del paciente.
 * - Lista histórica de tratamientos.
 * - Para el tratamiento abierto: muestra avance %, actividades, acciones por actividad
 *   y botones de Finalizar / Cancelar / Pausar.
 * - Para tratamientos FINALIZED/CANCELLED: solo lectura.
 */
export default function TreatmentEditor({ patientId, refreshKey = 0, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [treatments, setTreatments] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const items = await patientsApi.listTreatments(patientId);
      setTreatments(items);
      setExpanded((prev) => {
        const next = {};
        let any = false;
        for (const t of items) {
          if (prev[t.id]) { next[t.id] = true; any = true; }
        }
        if (!any) {
          const auto = items.find(isOpen) || items[0];
          if (auto) next[auto.id] = true;
        }
        return next;
      });
    } catch {
      toast.error("No fue posible cargar los tratamientos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (patientId) reload(); }, [patientId, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground" data-testid="treatments-loading">
        <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando tratamientos…
      </div>
    );
  }

  if (treatments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="treatments-empty">
        Aún no hay tratamientos. Para iniciar uno nuevo, acepta un presupuesto y selecciona <strong>Iniciar tratamiento</strong>.
      </div>
    );
  }

  const handleActivity = async (tid, aid, payload, successMsg) => {
    setSavingId(tid);
    try {
      await patientsApi.updateActivity(patientId, tid, aid, payload);
      toast.success(successMsg);
      await reload();
      onChanged?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible actualizar la actividad");
    } finally {
      setSavingId(null);
    }
  };

  const handleFinalize = async (tid) => {
    setSavingId(tid);
    try {
      await patientsApi.finalizeTreatment(patientId, tid);
      toast.success("Tratamiento finalizado");
      await reload();
      onChanged?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible finalizar el tratamiento");
    } finally {
      setSavingId(null);
      setConfirmAction(null);
    }
  };

  const handleCancel = async (tid) => {
    setSavingId(tid);
    try {
      await patientsApi.cancelTreatment(patientId, tid);
      toast.success("Tratamiento cancelado");
      await reload();
      onChanged?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible cancelar el tratamiento");
    } finally {
      setSavingId(null);
      setConfirmAction(null);
    }
  };

  const handleTogglePause = async (t) => {
    setSavingId(t.id);
    try {
      if (t.status === "ACTIVE") {
        await patientsApi.pauseTreatment(patientId, t.id);
        toast.success("Tratamiento pausado");
      } else {
        await patientsApi.resumeTreatment(patientId, t.id);
        toast.success("Tratamiento reanudado");
      }
      await reload();
      onChanged?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible actualizar el tratamiento");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="treatments-container">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Tratamientos del paciente</h3>
          <p className="text-xs text-muted-foreground">{treatments.length} en historial</p>
        </div>
      </div>

      <div className="space-y-3">
        {treatments.map((t) => (
          <TreatmentCard
            key={t.id}
            treatment={t}
            expanded={!!expanded[t.id]}
            onToggle={() => setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))}
            onActivityOutcome={(aid, outcome, msg) => handleActivity(t.id, aid, { outcome }, msg)}
            onActivityStart={(aid) => handleActivity(t.id, aid, { status: "IN_PROGRESS" }, "Actividad iniciada")}
            onActivityCancel={(aid) => handleActivity(t.id, aid, { status: "CANCELLED" }, "Actividad cancelada")}
            onActivityReset={(aid) => handleActivity(t.id, aid, { status: "PENDING" }, "Actividad marcada pendiente")}
            onFinalize={() => setConfirmAction({ type: "finalize", treatmentId: t.id })}
            onCancel={() => setConfirmAction({ type: "cancel", treatmentId: t.id })}
            onTogglePause={() => handleTogglePause(t)}
            saving={savingId === t.id}
          />
        ))}
      </div>

      <Dialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <DialogContent data-testid="treatment-confirm-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "finalize" ? "Finalizar tratamiento" : "Cancelar tratamiento"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "finalize"
                ? "Esta acción finalizará el tratamiento y dejará el presupuesto asociado como FINALIZADO. La acción no se puede revertir."
                : "Esta acción cancelará el tratamiento. La acción no se puede revertir."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)} data-testid="treatment-confirm-back">Volver</Button>
            <Button
              variant={confirmAction?.type === "finalize" ? "default" : "destructive"}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "finalize") handleFinalize(confirmAction.treatmentId);
                else handleCancel(confirmAction.treatmentId);
              }}
              disabled={savingId === confirmAction?.treatmentId}
              data-testid="treatment-confirm-action"
            >
              {confirmAction?.type === "finalize" ? "Sí, finalizar" : "Sí, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- TreatmentCard ----------

function TreatmentCard({
  treatment, expanded, onToggle,
  onActivityOutcome, onActivityStart, onActivityCancel, onActivityReset,
  onFinalize, onCancel, onTogglePause, saving,
}) {
  const meta = STATUS_META[treatment.status] || STATUS_META.ACTIVE;
  const open = isOpen(treatment);
  const progress = treatment.progress || { completed: 0, total: 0, percent: 0 };
  const allComplete = useMemo(() => {
    const eligible = (treatment.activities || []).filter((a) => a.status !== "CANCELLED");
    return eligible.length > 0 && eligible.every((a) => a.status === "COMPLETED");
  }, [treatment.activities]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`treatment-card-${treatment.id}`}>
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 min-w-0 text-left"
          data-testid={`treatment-toggle-${treatment.id}`}
        >
          {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ListChecks size={14} className="text-primary" />
              <p className="text-sm font-semibold truncate">Tratamiento · {treatment.budgetName || "Presupuesto"}</p>
              <span
                className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border", meta.className)}
                data-testid={`treatment-status-${treatment.id}`}
              >
                {meta.label}
              </span>
              {!open && <Lock size={11} className="text-muted-foreground" />}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Creado {fmtDate(treatment.createdAt)}
              {treatment.finalizedAt && <> · Finalizado {fmtDate(treatment.finalizedAt)}</>}
              {treatment.cancelledAt && <> · Cancelado {fmtDate(treatment.cancelledAt)}</>}
              {" · "}{progress.completed}/{progress.total} actividades · <strong className="text-foreground" data-testid={`treatment-progress-${treatment.id}`}>{progress.percent}%</strong>
            </p>
          </div>
        </button>
      </div>

      {expanded && (
        <>
          {/* Barra de progreso */}
          <div className="px-5 pt-4">
            <div className="h-2 bg-secondary rounded-full overflow-hidden" data-testid={`treatment-progress-bar-${treatment.id}`}>
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{progress.completed} de {progress.total} actividades completadas</p>
          </div>

          {/* Actividades */}
          <div className="px-5 py-4 space-y-2">
            {(treatment.activities || []).map((a) => (
              <ActivityRow
                key={a.id}
                activity={a}
                editable={open}
                saving={saving}
                onOutcome={(outcome, msg) => onActivityOutcome(a.id, outcome, msg)}
                onStart={() => onActivityStart(a.id)}
                onCancel={() => onActivityCancel(a.id)}
                onReset={() => onActivityReset(a.id)}
              />
            ))}
          </div>

          {/* Footer */}
          {open ? (
            <div className="px-5 py-3 border-t border-border flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onTogglePause}
                disabled={saving}
                data-testid={`treatment-toggle-pause-${treatment.id}`}
              >
                {treatment.status === "PAUSED" ? <><Play size={13} className="mr-1.5" /> Reanudar</> : <><Pause size={13} className="mr-1.5" /> Pausar</>}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onCancel}
                disabled={saving}
                data-testid={`treatment-cancel-${treatment.id}`}
              >
                <XCircle size={13} className="mr-1.5" /> Cancelar tratamiento
              </Button>
              <Button
                size="sm"
                onClick={onFinalize}
                disabled={saving || !allComplete}
                title={!allComplete ? "Completa todas las actividades para finalizar" : undefined}
                data-testid={`treatment-finalize-${treatment.id}`}
              >
                <CheckCircle2 size={13} className="mr-1.5" /> Finalizar tratamiento
              </Button>
            </div>
          ) : (
            <div className="px-5 py-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground" data-testid={`treatment-readonly-${treatment.id}`}>
              <FileText size={12} /> Tratamiento {meta.label.toLowerCase()} · solo lectura
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- ActivityRow ----------

function ActivityRow({ activity, editable, saving, onOutcome, onStart, onCancel, onReset }) {
  const meta = ACTIVITY_META[activity.status] || ACTIVITY_META.PENDING;
  const Icon = meta.icon;
  const cancelled = activity.status === "CANCELLED";
  const completed = activity.status === "COMPLETED";

  return (
    <div
      className={cn(
        "rounded-lg border border-border p-3",
        completed && "bg-emerald-500/[0.04]",
        cancelled && "opacity-60",
      )}
      data-testid={`activity-row-${activity.id}`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <Icon size={16} className={cn("mt-0.5", meta.className)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate" data-testid={`activity-name-${activity.id}`}>{activity.name}</p>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border bg-muted/40", meta.className)} data-testid={`activity-status-${activity.id}`}>
              {meta.label}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {activity.qty}× · {currencyMXN(activity.unitPrice)}
            {activity.dentistName && <> · Dr. {activity.dentistName}</>}
          </p>
          {activity.observations && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{activity.observations}</p>
          )}
        </div>
        {/* Acciones por actividad */}
        {editable && !cancelled && !completed && (
          <div className="flex flex-wrap items-center gap-1">
            {activity.status === "PENDING" && (
              <Button size="sm" variant="outline" onClick={onStart} disabled={saving} data-testid={`activity-start-${activity.id}`}>
                <Play size={12} className="mr-1" /> Iniciar
              </Button>
            )}
            {activity.status === "IN_PROGRESS" && (
              <Button size="sm" variant="ghost" onClick={() => onOutcome("continues", "Actividad continuará en la siguiente cita")} disabled={saving} data-testid={`activity-continues-${activity.id}`}>
                Continuará
              </Button>
            )}
            <Button size="sm" onClick={() => onOutcome("completed", "Actividad completada")} disabled={saving} data-testid={`activity-complete-${activity.id}`}>
              <CheckCircle2 size={12} className="mr-1" /> Completar
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOutcome("not_done", "Actividad pospuesta")} disabled={saving} data-testid={`activity-postpone-${activity.id}`}>
              Posponer
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={onCancel} disabled={saving} title="Cancelar actividad" data-testid={`activity-cancel-${activity.id}`}>
              <XCircle size={13} className="text-rose-500" />
            </Button>
          </div>
        )}
        {editable && (activity.status === "POSTPONED") && (
          <Button size="sm" variant="outline" onClick={onReset} disabled={saving} data-testid={`activity-reset-${activity.id}`}>
            Reactivar
          </Button>
        )}
      </div>
    </div>
  );
}
