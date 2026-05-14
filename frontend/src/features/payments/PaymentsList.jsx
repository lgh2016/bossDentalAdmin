import { Plus } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import DataTable from "@/shared/DataTable";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { payments } from "@/mocks";
import { currencyMXN } from "@/utils/format";

export default function PaymentsList() {
  const columns = [
    { key: "date", label: "Fecha" },
    { key: "patientName", label: "Paciente", render: (p) => <span className="font-medium">{p.patientName}</span> },
    { key: "concept", label: "Concepto" },
    { key: "method", label: "Método" },
    { key: "amount", label: "Monto", render: (p) => <span className="font-semibold">{currencyMXN(p.amount)}</span> },
    { key: "status", label: "Estado", render: (p) => <StatusBadge value={p.status} /> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        subtitle="Historial y registro de pagos de pacientes."
        actions={<Button data-testid="new-payment-btn"><Plus size={14} className="mr-1" /> Registrar pago</Button>}
      />
      <DataTable
        testId="payments-table"
        data={payments}
        columns={columns}
        searchKeys={["patientName", "concept", "method"]}
        searchPlaceholder="Buscar pago, paciente, concepto…"
      />
    </div>
  );
}
