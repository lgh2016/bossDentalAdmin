import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/shared/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { initials } from "@/utils/format";
import { dentistApi } from "@/services/dentistApi";

const PAGE_SIZE = 20;

export default function MyAssignedPatients() {
  const navigate = useNavigate();
  const [content, setContent] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);

  const load = useCallback(async (signal, q = "", p = 0) => {
    setLoading(true);
    setError(null);
    try {
      const data = await dentistApi.patients({ page: p, size: PAGE_SIZE, query: q, signal });
      setContent(Array.isArray(data?.content) ? data.content : []);
      setPage(data?.page ?? 0);
      setTotalPages(data?.totalPages ?? 0);
      setTotalElements(data?.totalElements ?? 0);
    } catch (err) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      setError("No fue posible cargar tus pacientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal, query);
    return () => ctrl.abort();
  }, [load, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis pacientes"
        subtitle={`Pacientes que has atendido o tienes asignados${totalElements ? ` · ${totalElements} en total` : ""}`}
      />

      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, expediente, teléfono…"
          className="pl-9"
          data-testid="dentist-patients-search"
        />
      </div>

      {loading && content.length === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center">
          <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando pacientes…
        </p>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600">{error}</div>
      )}

      {!loading && !error && content.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Aún no tienes pacientes asignados.
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="dentist-patients-grid">
        {content.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/pacientes/${p.id}`)}
            className="text-left rounded-xl border border-border bg-card p-4 hover:border-foreground/20 transition-colors"
            data-testid={`dentist-patient-${p.id}`}
          >
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarFallback>{initials(p.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium truncate">{p.fullName}</p>
                <p className="text-xs text-muted-foreground truncate font-mono">{p.expedientNumber || "—"}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Última visita</p>
                <p className="font-medium">{p.lastVisit || "Sin registros"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Próxima cita</p>
                <p className="font-medium">
                  {p.nextAppointmentDate ? `${p.nextAppointmentDate}${p.nextAppointmentTime ? " · " + p.nextAppointmentTime : ""}` : "—"}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <p className="text-xs text-center text-muted-foreground">
          Página {page + 1} de {totalPages}
        </p>
      )}
    </div>
  );
}
