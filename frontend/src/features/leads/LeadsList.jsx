import { Plus } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import DataTable from "@/shared/DataTable";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { leads } from "@/mocks";

export default function LeadsList() {
  const columns = [
    { key: "name", label: "Lead", render: (l) => <span className="font-medium">{l.name}</span> },
    { key: "phone", label: "Teléfono", render: (l) => <span className="font-mono text-xs">{l.phone}</span> },
    { key: "source", label: "Origen" },
    { key: "interest", label: "Interés" },
    { key: "createdAt", label: "Capturado" },
    { key: "assignedTo", label: "Asignado a" },
    { key: "status", label: "Estado", render: (l) => <StatusBadge value={l.status} /> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle="Pipeline de prospectos y solicitudes nuevas."
        actions={<Button data-testid="new-lead-btn"><Plus size={14} className="mr-1" /> Nuevo lead</Button>}
      />
      <DataTable
        testId="leads-table"
        data={leads}
        columns={columns}
        searchKeys={["name", "phone", "interest", "source"]}
        searchPlaceholder="Buscar lead, teléfono, interés…"
      />
    </div>
  );
}
