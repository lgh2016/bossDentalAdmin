import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ActivityTimeline, { isPaymentEvent } from "@/shared/ActivityTimeline";
import { patientsApi } from "@/services/patientsApi";

const PAGE_SIZE = 20;

export default function PatientHistory({ patientId }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [showPayments, setShowPayments] = useState(true);

  const requestId = useRef(0);

  // Carga inicial (cancelable contra StrictMode dev double-invoke)
  useEffect(() => {
    const ctrl = new AbortController();
    const myId = ++requestId.current;
    setItems([]); setPage(0); setTotalPages(0); setTotalElements(0); setError(null); setLoading(true);
    (async () => {
      try {
        const data = await patientsApi.getActivityLogs(patientId, { page: 0, size: PAGE_SIZE, signal: ctrl.signal });
        if (myId !== requestId.current) return;
        setItems(Array.isArray(data?.content) ? data.content : []);
        setPage(data?.page ?? 0);
        setTotalPages(data?.totalPages ?? 0);
        setTotalElements(data?.totalElements ?? 0);
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        if (myId === requestId.current) setError("No fue posible cargar el historial.");
      } finally {
        if (myId === requestId.current) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [patientId]);

  const hasMore = page + 1 < totalPages;
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await patientsApi.getActivityLogs(patientId, { page: next, size: PAGE_SIZE });
      const newItems = Array.isArray(data?.content) ? data.content : [];
      setItems((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...newItems.filter((x) => !ids.has(x.id))];
      });
      setPage(next);
      setTotalPages(data?.totalPages ?? totalPages);
      setTotalElements(data?.totalElements ?? totalElements);
    } catch {/* mantener silencioso */}
    finally { setLoadingMore(false); }
  }, [hasMore, loadingMore, loading, page, patientId, totalPages, totalElements]);

  // Filtro de pagos in-memory sobre la lista cargada.
  const visible = useMemo(
    () => (showPayments ? items : items.filter((e) => !isPaymentEvent(e))),
    [items, showPayments],
  );

  // Sentinel + IntersectionObserver
  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) loadMore(); }),
      { threshold: 0.1 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-4" data-testid="patient-history">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
        <div>
          <p className="text-sm font-medium">Historial / Bitácora</p>
          <p className="text-xs text-muted-foreground">{totalElements} evento(s) registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Pagos</span>
          <Switch checked={showPayments} onCheckedChange={setShowPayments} data-testid="history-toggle-payments" />
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground py-6 text-center"><Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando historial…</p>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600 dark:text-rose-400">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin movimientos registrados.
        </div>
      )}

      {visible.length > 0 && (
        <ActivityTimeline events={visible} testIdPrefix="history-event" />
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-2 text-xs text-muted-foreground">
          {loadingMore ? <><Loader2 size={12} className="inline mr-1 animate-spin" /> Cargando más…</> : (
            <Button variant="ghost" size="sm" onClick={loadMore} data-testid="history-load-more">Cargar más</Button>
          )}
        </div>
      )}
    </div>
  );
}
