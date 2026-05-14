import { useMemo, useState } from "react";
import { useClinic } from "@/store/clinicStore";
import { Switch } from "@/components/ui/switch";
import { CreditCard, UserPlus, Calendar, RefreshCw, FileEdit, X, Activity as ActivityIcon, ShieldAlert, Eye, UserCheck } from "lucide-react";
import { currencyMXN } from "@/utils/format";

const ICONS = {
  patient_created: UserPlus,
  appointment_created: Calendar,
  patient_arrived: UserCheck,
  doctor_assigned: RefreshCw,
  doctor_changed: RefreshCw,
  payment_registered: CreditCard,
  payment_pending: CreditCard,
  payment_cancelled: X,
  budget_consulted: Eye,
  budget_edited: ShieldAlert,
  quotation_created: FileEdit,
  quotation_edited: FileEdit,
  appointment_cancelled: X,
  appointment_rescheduled: RefreshCw,
  appointment_status: ActivityIcon,
  procedure_created: FileEdit,
  reason_created: FileEdit,
  questionnaire_risk: ShieldAlert,
  questionnaire_saved: ActivityIcon,
};

const PAYMENT_TYPES = ["payment_registered", "payment_pending"];

export default function PatientHistory({ patientId }) {
  const { audit } = useClinic();
  const [showPayments, setShowPayments] = useState(true);

  const events = useMemo(() => {
    const list = audit.filter((a) => a.patientId === patientId);
    return showPayments ? list : list.filter((a) => !PAYMENT_TYPES.includes(a.type));
  }, [audit, patientId, showPayments]);

  return (
    <div className="space-y-4" data-testid="patient-history">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
        <div>
          <p className="text-sm font-medium">Historial / Bitácora</p>
          <p className="text-xs text-muted-foreground">{events.length} evento(s) registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Pagos</span>
          <Switch checked={showPayments} onCheckedChange={setShowPayments} data-testid="history-toggle-payments" />
        </div>
      </div>

      {events.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin movimientos registrados.
        </div>
      )}

      <ol className="relative pl-5 border-l border-border space-y-3">
        {events.map((e) => {
          const Icon = ICONS[e.type] || ActivityIcon;
          const isPayment = PAYMENT_TYPES.includes(e.type);
          return (
            <li key={e.id} className="relative" data-testid={`history-event-${e.type}`}>
              <span className={`absolute -left-[27px] top-2 size-3 rounded-full border-2 ${isPayment ? "bg-primary border-primary" : "bg-background border-border"}`} />
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="size-7 rounded-md bg-secondary grid place-items-center mt-0.5">
                      <Icon size={13} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.actor} · <span className="uppercase tracking-[0.1em] text-[10px]">{e.role}</span>
                      </p>
                      {e.meta && Object.keys(e.meta).length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(e.meta).map(([k, v]) => v ? (
                            <li key={k} className="text-[10px] rounded bg-secondary px-1.5 py-0.5 text-foreground/80">
                              <span className="text-muted-foreground">{k}:</span> {k === "amount" ? currencyMXN(Number(v)) : String(v)}
                            </li>
                          ) : null)}
                        </ul>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">{e.at}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
