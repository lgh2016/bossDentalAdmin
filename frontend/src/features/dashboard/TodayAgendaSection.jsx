import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Section from "@/shared/Section";
import StatusBadge from "@/shared/StatusBadge";
import { dashboardApi } from "@/services/dashboardApi";
import { appointmentsApi } from "@/services/appointmentsApi";

const PAGE_SIZE = 10;

/**
 * Sección "Agenda de hoy" reutilizable (Dashboard Admin + Recepción).
 * Consume GET /api/dashboard/appointments/today con scroll infinito backend-driven.
 */
export default function TodayAgendaSection() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const containerRef = useRef(null);
  const sentinelRef = useRef(null);

  // Carga inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await dashboardApi.todayPaged({ page: 0, size: PAGE_SIZE });
        if (cancelled) return;
        setItems(Array.isArray(data?.content) ? data.content : []);
        setPage(data?.page ?? 0);
        setTotalPages(data?.totalPages ?? 0);
        setTotalElements(data?.totalElements ?? 0);
      } catch {
        if (!cancelled) setError("No fue posible cargar la agenda de hoy.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasMore = page + 1 < totalPages;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await dashboardApi.todayPaged({ page: next, size: PAGE_SIZE });
      const newItems = Array.isArray(data?.content) ? data.content : [];
      setItems((prev) => {
        const ids = new Set(prev.map((i) => i.appointmentId));
        return [...prev, ...newItems.filter((i) => !ids.has(i.appointmentId))];
      });
      setPage(next);
      setTotalPages(data?.totalPages ?? totalPages);
      setTotalElements(data?.totalElements ?? totalElements);
    } catch {
      // Mantener silencioso para no spamear al usuario; un toast saturaría.
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, page, totalPages, totalElements]);

  // Infinite scroll dentro del contenedor con IntersectionObserver
  useEffect(() => {
    const root = containerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) loadMore(); }),
      { root, threshold: 0.1 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMore]);

  // Click sobre una cita del dashboard → redirige al expediente del paciente.
  // Como el WS de listado no incluye patientId, consultamos el detalle para obtenerlo.
  const goToPatient = useCallback(async (appointmentId) => {
    try {
      const data = await appointmentsApi.getById(appointmentId);
      if (data?.patientId) navigate(`/pacientes/${data.patientId}`);
      else toast.error("No fue posible localizar el expediente del paciente");
    } catch {
      toast.error("No fue posible abrir el expediente");
    }
  }, [navigate]);

  return (
    <>
      <Section
        className="lg:col-span-2"
        title="Agenda de hoy"
        action={
          <Link to="/agenda" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Abrir agenda <ChevronRight size={12} />
          </Link>
        }
      >
        <div
          ref={containerRef}
          className="divide-y divide-border max-h-[400px] overflow-y-auto -mx-2 px-2"
          data-testid="today-agenda-list"
        >
          {loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando agenda…
            </p>
          )}

          {!loading && error && (
            <p className="text-sm text-rose-500 py-6 text-center">{error}</p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin citas para hoy.</p>
          )}

          {items.map((a) => (
            <button
              key={a.appointmentId}
              type="button"
              onClick={() => goToPatient(a.appointmentId)}
              className="w-full flex items-center gap-4 py-3 first:pt-0 last:pb-0 hover:bg-secondary/30 rounded-md transition-colors text-left"
              data-testid={`today-appt-${a.appointmentId}`}
            >
              <div className="w-14 text-sm font-mono">{a.time}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.patientName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {a.reason} · {a.doctorName} · {a.branchName}
                </p>
              </div>
              <StatusBadge value={a.statusName} />
            </button>
          ))}

          {/* Sentinel para infinite scroll */}
          {hasMore && (
            <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
              {loadingMore ? <><Loader2 size={12} className="inline mr-1 animate-spin" /> Cargando más…</> : "·"}
            </div>
          )}

          {!hasMore && items.length > 0 && (
            <p className="py-3 text-center text-[11px] text-muted-foreground/60">
              {totalElements} cita{totalElements === 1 ? "" : "s"} en total
            </p>
          )}
        </div>
      </Section>
    </>
  );
}
