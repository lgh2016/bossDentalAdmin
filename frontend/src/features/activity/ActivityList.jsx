import { Activity as ActivityIcon, CreditCard, UserPlus, Calendar, FileText, MessageSquare, Tag } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import { activity } from "@/mocks";
import { currencyMXN } from "@/utils/format";

const ICONS = {
  payment: CreditCard,
  lead: UserPlus,
  record: FileText,
  appointment: Calendar,
  message: MessageSquare,
  promo: Tag,
};

export default function ActivityList() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Actividad reciente"
        subtitle="Bitácora del sistema en tiempo real."
      />
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {activity.map((a) => {
          const Icon = ICONS[a.type] || ActivityIcon;
          return (
            <div key={a.id} className="flex items-start gap-3 p-4">
              <div className="size-9 rounded-md bg-secondary grid place-items-center mt-0.5">
                <Icon size={15} className="text-muted-foreground" />
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
