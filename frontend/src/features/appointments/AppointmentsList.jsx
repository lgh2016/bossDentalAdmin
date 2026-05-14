import { Plus } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import DataTable from "@/shared/DataTable";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { appointments } from "@/mocks";

export default function AppointmentsList({ doctorId, title = "Citas", subtitle = "Listado completo de citas registradas." }) {
  const data = doctorId ? appointments.filter((a) => a.doctorId === doctorId) : appointments;

  const columns = [
    { key: "date", label: "Fecha" },
    { key: "time", label: "Hora", render: (a) => <span className="font-mono">{a.time}</span> },
    { key: "patientName", label: "Paciente", render: (a) => <span className="font-medium">{a.patientName}</span> },
    { key: "doctorName", label: "Doctor" },
    { key: "type", label: "Motivo" },
    { key: "duration", label: "Duración", render: (a) => `${a.duration} min` },
    { key: "status", label: "Estado", render: (a) => <StatusBadge value={a.status} /> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<Button data-testid="new-appointment-btn"><Plus size={14} className="mr-1" /> Nueva cita</Button>}
      />
      <DataTable
        testId="appointments-table"
        data={data}
        columns={columns}
        searchKeys={["patientName", "doctorName", "type", "status"]}
        searchPlaceholder="Buscar por paciente, doctor, motivo…"
      />
    </div>
  );
}
