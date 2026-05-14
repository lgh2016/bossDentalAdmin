import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, Mail, Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { doctors } from "@/mocks";
import { initials } from "@/utils/format";

export default function DoctorsList() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctores"
        subtitle="Equipo clínico y especialistas activos."
        actions={<Button data-testid="new-doctor-btn"><Plus size={14} className="mr-1" /> Agregar doctor</Button>}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {doctors.map((d) => (
          <div key={d.id} className="rounded-xl border border-border bg-card p-5 hover:border-foreground/15 transition-colors">
            <div className="flex items-start gap-3">
              <Avatar className="size-12">
                <AvatarImage src={d.avatar} />
                <AvatarFallback>{initials(d.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium truncate">{d.name}</p>
                  <StatusBadge value={d.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{d.specialty}</p>
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <Star size={12} fill="currentColor" /> {d.rating}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-border">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Citas mes</p>
                <p className="text-base font-semibold mt-0.5">{d.appointmentsThisMonth}</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="flex items-center gap-1.5"><Mail size={11} />{d.email}</p>
                <p className="flex items-center gap-1.5 font-mono"><Phone size={11} />{d.phone}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
