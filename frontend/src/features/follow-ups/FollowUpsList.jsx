import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { followUps } from "@/mocks";
import { Phone, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FollowUpsList() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Seguimientos"
        subtitle="Acciones pendientes de contacto y confirmación."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {followUps.map((f) => (
          <div key={f.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{f.patient}</p>
              <StatusBadge value={f.priority} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{f.reason}</p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mt-3">Vence: {f.due}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline"><Phone size={13} className="mr-1" /> Llamar</Button>
              <Button size="sm"><MessageSquare size={13} className="mr-1" /> WhatsApp</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
