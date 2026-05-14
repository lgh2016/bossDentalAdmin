import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { treatmentTimelineByPatient, treatments } from "@/mocks";
import { formatDateLong } from "@/utils/format";

export default function TreatmentTimeline({ patientId = "p-1" }) {
  const t = treatments.find((x) => x.patientId === patientId);
  const timeline = treatmentTimelineByPatient[patientId] || treatmentTimelineByPatient["p-1"];
  return (
    <div className="space-y-6">
      <PageHeader title="Mi tratamiento" subtitle={t ? `${t.name} · ${t.progress}% completado` : "Línea de tiempo de tu tratamiento."} />

      {t && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">Inició el {t.startDate}</p>
            </div>
            <StatusBadge value={t.status} />
          </div>
          <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${t.progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t.sessions.done}/{t.sessions.total} sesiones</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground mb-4">Línea de tiempo</p>
        <ol className="relative pl-5 border-l border-border space-y-5">
          {timeline.map((s, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[27px] top-1 size-3 rounded-full border-2 ${s.status === "Completado" ? "bg-primary border-primary" : "bg-background border-border"}`} />
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.description}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">{formatDateLong(s.date)} · {s.status}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
