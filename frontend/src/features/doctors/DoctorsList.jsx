import { useEffect, useState } from "react";
import { Loader2, Mail, Phone, Plus } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { doctorsApi } from "@/services/doctorsApi";
import { initials } from "@/utils/format";

/**
 * Listado real de doctores activos.
 * Consume `/api/doctors/active` (sin datos mock).
 */
export default function DoctorsList() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    doctorsApi
      .listActive({ branchId: 1 })
      .then((data) => { if (!cancelled) setDoctors(Array.isArray(data) ? data : []); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || "No fue posible cargar los doctores"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctores"
        subtitle="Equipo clínico y especialistas activos."
        actions={
          <Button data-testid="new-doctor-btn" asChild>
            <a href="/admin/doctores"><Plus size={14} className="mr-1" /> Gestionar doctores</a>
          </Button>
        }
      />

      {loading && (
        <div className="rounded-xl border border-border p-6 flex items-center justify-center text-sm text-muted-foreground" data-testid="doctors-loading">
          <Loader2 size={14} className="animate-spin mr-2" /> Cargando doctores…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-4 text-sm text-rose-600 dark:text-rose-300" data-testid="doctors-error">
          {error}
        </div>
      )}

      {!loading && !error && doctors.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground" data-testid="doctors-empty">
          No hay doctores activos registrados.
        </div>
      )}

      {!loading && !error && doctors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="doctors-grid">
          {doctors.map((d) => {
            const name = d.fullName || `${d.name || ""} ${d.lastName || ""}`.trim() || `Doctor #${d.id}`;
            const statusValue = d.active === false ? "Inactivo" : (d.availableForAppointments ? "Disponible" : "Sin citas");
            return (
              <div key={d.id} className="rounded-xl border border-border bg-card p-5 hover:border-foreground/15 transition-colors" data-testid={`doctor-card-${d.id}`}>
                <div className="flex items-start gap-3">
                  <Avatar className="size-12">
                    <AvatarImage src={d.photoUrl || d.avatar} />
                    <AvatarFallback>{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium truncate">{name}</p>
                      <StatusBadge value={statusValue} />
                    </div>
                    {d.specialty && <p className="text-xs text-muted-foreground mt-0.5">{d.specialty}</p>}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground space-y-1">
                  {d.email && <p className="flex items-center gap-1.5"><Mail size={11} />{d.email}</p>}
                  {d.phone && <p className="flex items-center gap-1.5 font-mono"><Phone size={11} />{d.phone}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
