import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ActivityTimeline from "@/shared/ActivityTimeline";
import { activityLogsApi } from "@/services/activityLogsApi";

const PAGE_SIZE = 20;

export default function ActivityList() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await activityLogsApi.list({ page: 0, size: PAGE_SIZE, signal: ctrl.signal });
        if (cancelled) return;
        setItems(Array.isArray(data?.content) ? data.content : []);
        setPage(data?.page ?? 0);
        setTotalPages(data?.totalPages ?? 0);
        setTotalElements(data?.totalElements ?? 0);
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        if (!cancelled) setError("No fue posible cargar la actividad reciente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; ctrl.abort(); };
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
      setTotalElements(data?.totalElements ?? totalElements);
    } catch { /* silencioso */ }
    finally { setLoadingMore(false); }
  }, [hasMore, loadingMore, loading, page, totalPages, totalElements]);

  // Scroll infinito con IntersectionObserver
  const sentinelRef = useRef(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) loadMore(); }),
      { threshold: 0.1 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actividad reciente"
        subtitle={`Bitácora del sistema · ${totalElements} evento${totalElements === 1 ? "" : "s"}`}
      />

      {loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center">
          <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando actividad…
        </p>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600 dark:text-rose-400">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Sin actividad registrada.
        </div>
      )}

      {items.length > 0 && (
        <ActivityTimeline events={items} testIdPrefix="activity-event" />
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-3 text-xs text-muted-foreground">
          {loadingMore ? <><Loader2 size={12} className="inline mr-1 animate-spin" /> Cargando más…</> : (
            <Button variant="ghost" size="sm" onClick={loadMore} data-testid="activity-load-more">Cargar más</Button>
          )}
        </div>
      )}
    </div>
  );
}
