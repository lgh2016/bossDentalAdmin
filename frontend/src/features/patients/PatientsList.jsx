import { useNavigate } from "react-router-dom";
import { Plus, Phone, Mail } from "lucide-react";
import { useState } from "react";
import PageHeader from "@/shared/PageHeader";
import DataTable from "@/shared/DataTable";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useClinic } from "@/store/clinicStore";
import { currencyMXN, initials } from "@/utils/format";
import CreateAppointmentDialog from "@/features/appointments/CreateAppointmentDialog";

export default function PatientsList() {
  const navigate = useNavigate();
  const { patients, doctors } = useClinic();
  const [createOpen, setCreateOpen] = useState(false);
  const docMap = Object.fromEntries(doctors.map((d) => [d.id, d.name]));

  const columns = [
    {
      key: "name",
      label: "Paciente",
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-9"><AvatarImage src={p.avatar} /><AvatarFallback>{initials(p.name)}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <p className="font-medium truncate">{p.name}</p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><Mail size={10} /> {p.email || "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "expediente", label: "Expediente", render: (p) => <span className="font-mono text-xs">{p.expediente}</span> },
    { key: "phone", label: "Teléfono", render: (p) => <span className="font-mono text-xs"><Phone size={10} className="inline mr-1" />{p.phone}</span> },
    { key: "branch", label: "Sucursal" },
    { key: "doctor", label: "Doctor", render: (p) => docMap[p.assignedDoctorId] || "—" },
    { key: "balance", label: "Saldo", render: (p) => p.balance > 0 ? <span className="text-amber-600 dark:text-amber-400 font-medium">{currencyMXN(p.balance)}</span> : <span className="text-muted-foreground">—</span> },
    { key: "status", label: "Estado", render: (p) => <StatusBadge value={p.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pacientes"
        subtitle="Directorio completo de pacientes registrados en la clínica."
        actions={<Button data-testid="new-patient-btn" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1" /> Nueva cita / paciente</Button>}
      />
      <DataTable
        testId="patients-table"
        data={patients}
        columns={columns}
        searchKeys={["name", "email", "phone", "expediente", "branch"]}
        searchPlaceholder="Buscar por nombre, expediente, teléfono o sucursal…"
        onRowClick={(p) => navigate(`/pacientes/${p.id}`)}
      />
      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
