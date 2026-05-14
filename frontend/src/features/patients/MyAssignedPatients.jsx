import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { patients } from "@/mocks";
import { initials, currencyMXN } from "@/utils/format";

export default function MyAssignedPatients({ doctorId = "d-1" }) {
  const navigate = useNavigate();
  const mine = patients.filter((p) => p.assignedDoctorId === doctorId);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pacientes asignados"
        subtitle="Pacientes bajo tu seguimiento clínico."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mine.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/pacientes/${p.id}`)}
            className="text-left rounded-xl border border-border bg-card p-4 hover:border-foreground/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={p.avatar} />
                <AvatarFallback>{initials(p.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground truncate">{p.insurance}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Última visita</p>
                <p className="font-medium">{p.lastVisit}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo</p>
                <p className="font-medium">{currencyMXN(p.balance)}</p>
              </div>
            </div>
            <div className="mt-3"><StatusBadge value={p.status} /></div>
          </button>
        ))}
      </div>
    </div>
  );
}
