import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { treatments } from "@/mocks";
import { currencyMXN } from "@/utils/format";

export default function TreatmentsList({ doctorId }) {
  const data = doctorId ? treatments.filter((t) => t.doctorId === doctorId) : treatments;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tratamientos"
        subtitle="Tratamientos en curso y completados de la clínica."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((t) => (
          <div key={t.id} className="rounded-xl border border-border bg-card p-5 hover:border-foreground/15 transition-colors">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{t.patientName}</p>
              <StatusBadge value={t.status} />
            </div>
            <p className="mt-2 text-base font-semibold">{t.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">Inició el {t.startDate} · {currencyMXN(t.totalCost)}</p>

            <div className="mt-4 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${t.progress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t.sessions.done}/{t.sessions.total} sesiones</span>
              <span>{t.progress}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
