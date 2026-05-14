import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { payments, patients } from "@/mocks";
import { currencyMXN } from "@/utils/format";

export default function AccountStatement({ patientId = "p-1" }) {
  const me = patients.find((p) => p.id === patientId);
  const myPayments = payments.filter((p) => p.patientId === patientId);
  const totalPaid = myPayments.filter((p) => p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const pending = myPayments.filter((p) => p.status === "Pendiente").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Estado de cuenta" subtitle="Movimientos, pagos realizados y saldos pendientes." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Total pagado</p>
          <p className="text-2xl font-semibold mt-2">{currencyMXN(totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Pendiente</p>
          <p className="text-2xl font-semibold mt-2 text-amber-600 dark:text-amber-400">{currencyMXN(pending)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Saldo actual</p>
          <p className="text-2xl font-semibold mt-2">{currencyMXN(me?.balance || 0)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/40">
          <p className="text-sm font-medium">Movimientos</p>
        </div>
        <div className="divide-y divide-border">
          {myPayments.map((p) => (
            <div key={p.id} className="flex items-center gap-4 p-4">
              <div className="w-24 text-xs">{p.date}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.concept}</p>
                <p className="text-xs text-muted-foreground">{p.method}</p>
              </div>
              <p className="text-sm font-semibold">{currencyMXN(p.amount)}</p>
              <StatusBadge value={p.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
