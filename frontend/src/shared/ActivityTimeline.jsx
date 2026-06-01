import { Activity as ActivityIcon, Calendar, CreditCard, UserPlus, UserCheck, RefreshCw, FileEdit, X, ShieldAlert, ClipboardList } from "lucide-react";

const MODULE_ICON = {
  APPOINTMENTS: Calendar,
  PAYMENTS: CreditCard,
  PATIENTS: UserPlus,
  QUOTATIONS: FileEdit,
  TREATMENTS: ClipboardList,
};

const ACTION_ICON = {
  APPOINTMENT_CREATED: Calendar,
  APPOINTMENT_RESCHEDULED: RefreshCw,
  APPOINTMENT_CANCELLED: X,
  APPOINTMENT_STATUS_CHANGED: ActivityIcon,
  DOCTOR_ASSIGNED: RefreshCw,
  DOCTOR_CHANGED: RefreshCw,
  PATIENT_CREATED: UserPlus,
  PATIENT_ARRIVED: UserCheck,
  PAYMENT_REGISTERED: CreditCard,
  PAYMENT_CANCELLED: X,
  QUOTATION_CREATED: FileEdit,
  QUOTATION_EDITED: FileEdit,
  QUESTIONNAIRE_RISK: ShieldAlert,
};

const iconFor = (e) => ACTION_ICON[e?.actionCode] || MODULE_ICON[e?.module] || ActivityIcon;

const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-MX", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

const isPaymentEvent = (e) => e?.module === "PAYMENTS" || e?.entityType === "PAYMENT";

export { isPaymentEvent };

export default function ActivityTimeline({ events, testIdPrefix = "activity-event" }) {
  return (
    <ol className="relative pl-5 border-l border-border space-y-3">
      {events.map((e) => {
        const Icon = iconFor(e);
        const payment = isPaymentEvent(e);
        return (
          <li key={e.id} className="relative" data-testid={`${testIdPrefix}-${e.id}`}>
            <span className={`absolute -left-[27px] top-2 size-3 rounded-full border-2 ${payment ? "bg-primary border-primary" : "bg-background border-border"}`} />
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="size-7 rounded-md bg-secondary grid place-items-center mt-0.5 shrink-0">
                    <Icon size={13} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.title || e.actionCode}</p>
                    {e.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {e.actorName || "—"}
                      {e.actorRole && <> · <span className="uppercase tracking-[0.1em] text-[10px]">{e.actorRole}</span></>}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">{fmtDate(e.createdAt)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
