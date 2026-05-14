import PageHeader from "@/shared/PageHeader";
import { patients, treatmentTimelineByPatient } from "@/mocks";
import { ClipboardList } from "lucide-react";

export default function RecordsList() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Expedientes"
        subtitle="Registros clínicos recientes."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {patients.slice(0, 6).map((p) => {
          const tl = treatmentTimelineByPatient[p.id] || treatmentTimelineByPatient["p-1"];
          const last = tl[tl.length - 1];
          return (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <ClipboardList size={13} />
                <span>Expediente · {p.id.toUpperCase()}</span>
              </div>
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Última visita: {p.lastVisit}</p>
              {last && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Último avance</p>
                  <p className="text-sm mt-1">{last.title}</p>
                  <p className="text-xs text-muted-foreground">{last.date}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
