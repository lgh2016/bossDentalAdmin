import { useNavigate } from "react-router-dom";
import { Plus, Phone, Mail, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import PageHeader from "@/shared/PageHeader";
import DataTable from "@/shared/DataTable";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/utils/format";
import CreateAppointmentDialog from "@/features/appointments/CreateAppointmentDialog";
import { patientsApi } from "@/services/patientsApi";

const PAGE_SIZE = 10;

export default function PatientsList() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  // Search / paginación server-side
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Debounce 350ms para no disparar por cada tecla
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Reset + carga inicial cada vez que cambia el query (debounced)
  const requestId = useRef(0);
  useEffect(() => {
    const myId = ++requestId.current;
    setRows([]); setPage(0); setError(null); setLoading(true);
    (async () => {
      try {
        const data = await patientsApi.search({ query: debouncedQuery, page: 0, size: PAGE_SIZE });
        if (myId !== requestId.current) return;
        setRows(Array.isArray(data?.content) ? data.content : []);
        setTotalPages(data?.totalPages ?? 0);
        setTotalElements(data?.totalElements ?? 0);
      } catch {
        if (myId !== requestId.current) return;
        setError("No fue posible cargar los pacientes. Intenta nuevamente.");
      } finally {
        if (myId === requestId.current) setLoading(false);
      }
    })();
  }, [debouncedQuery]);

  const hasMore = page + 1 < totalPages;
  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    const myId = requestId.current;
    setLoadingMore(true);
    try {
      const data = await patientsApi.search({ query: debouncedQuery, page: nextPage, size: PAGE_SIZE });
      if (myId !== requestId.current) return;
      const next = Array.isArray(data?.content) ? data.content : [];
      // Evitar duplicados por id
      setRows((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...next.filter((r) => !ids.has(r.id))];
      });
      setPage(nextPage);
      setTotalPages(data?.totalPages ?? totalPages);
      setTotalElements(data?.totalElements ?? totalElements);
    } catch {
      // Mantener filas actuales, mostrar mensaje breve.
      setError("No fue posible cargar más resultados.");
    } finally {
      if (myId === requestId.current) setLoadingMore(false);
    }
  };

  const columns = [
    {
      key: "fullName",
      label: "Paciente",
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            {p.photoUrl ? <AvatarImage src={p.photoUrl} /> : null}
            <AvatarFallback>{initials(p.fullName || "")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium truncate">{p.fullName || "—"}</p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Mail size={10} /> {p.email || "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "expedientNumber",
      label: "Expediente",
      render: (p) => <span className="font-mono text-xs">{p.expedientNumber || "—"}</span>,
    },
    {
      key: "phone",
      label: "Teléfono",
      render: (p) => (
        <span className="font-mono text-xs">
          <Phone size={10} className="inline mr-1" />{p.phone || "—"}
        </span>
      ),
    },
    {
      key: "active",
      label: "Estado",
      render: (p) => <StatusBadge value={p.active ? "Activo" : "Inactivo"} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pacientes"
        subtitle="Directorio completo de pacientes registrados en la clínica."
        actions={
          <Button data-testid="new-patient-btn" onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1" /> Nueva cita / paciente
          </Button>
        }
      />

      <DataTable
        testId="patients-table"
        data={rows}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        loading={loading}
        loadingText="Cargando pacientes…"
        searchPlaceholder="Buscar por nombre, teléfono o expediente…"
        emptyText={error || (debouncedQuery ? `Sin resultados para “${debouncedQuery}”` : "No hay pacientes registrados")}
        onRowClick={(p) => navigate(`/pacientes/${p.id}`)}
      />

      {/* Footer: contador + paginación tipo "cargar más" */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span data-testid="patients-count">
          {loading ? "…" : `Mostrando ${rows.length} de ${totalElements} paciente${totalElements === 1 ? "" : "s"}`}
        </span>
        {hasMore && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            data-testid="patients-load-more"
          >
            {loadingMore ? <><Loader2 size={13} className="mr-1.5 animate-spin" /> Cargando…</> : "Cargar más"}
          </Button>
        )}
      </div>

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
