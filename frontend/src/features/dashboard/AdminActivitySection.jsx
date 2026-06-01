import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import Section from "@/shared/Section";
import ActivityTimeline from "@/shared/ActivityTimeline";
import { activityLogsApi } from "@/services/activityLogsApi";

const PAGE_SIZE = 20;

/**
 * Sección "Actividad reciente" del Admin Dashboard — consume /activity-logs paginado
 * con scroll infinito backend-driven.
 */
export default function AdminActivitySection() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await activityLogsApi.list({ page: 0, size: PAGE_SIZE });
        if (cancelled) return;
        setItems(Array.isArray(data?.content) ? data.content : []);
        setPage(data?.page ?? 0);
        setTotalPages(data?.totalPages ?? 0);
      } catch {
        if (!cancelled) setError("No fue posible cargar la actividad reciente.");
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
      const data = await activityLogsApi.list({ page: next, size: PAGE_SIZE });
      const newItems = Array.isArray(data?.content) ? data.content : [];
      setItems((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        return [...prev, ...newItems.filter((i) => !ids.has(i.id))];
      });
      setPage(next);
      setTotalPages(data?.totalPages ?? totalPages);
    } catch { /* silencioso */ }
    finally { setLoadingMore(false); }
  }, [hasMore, loadingMore, loading, page, totalPages]);

  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
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

  return (
    <Section title="Actividad reciente">
      <div ref={containerRef} className="max-h-[480px] overflow-y-auto pr-1" data-testid="admin-activity-list">
        {loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando actividad…
          </p>
        )}

        {!loading && error && (
          <p className="text-sm text-rose-500 py-6 text-center">{error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">Sin actividad registrada.</p>
        )}

        {items.length > 0 && (
          <ActivityTimeline events={items} testIdPrefix="admin-activity-event" />
        )}

        {hasMore && (
          <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
            {loadingMore ? <><Loader2 size={12} className="inline mr-1 animate-spin" /> Cargando más…</> : "·"}
          </div>
        )}
      </div>
    </Section>
  );
}
