import { useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Lightweight data table.
 * columns = [{ key, label, render?, className? }]
 *
 * Modos de búsqueda:
 *  - Client-side: pasar `searchKeys` con la lista de campos a filtrar.
 *  - Server-side: pasar `query`, `onQueryChange` (y NO `searchKeys`). El padre
 *    es responsable de proveer `data` ya filtrada/paginada y opcionalmente `loading`.
 */
export default function DataTable({
  data,
  columns,
  searchKeys = [],
  searchPlaceholder = "Buscar…",
  onRowClick,
  testId = "data-table",
  emptyText = "Sin resultados",
  rightSlot,
  // Server-side opcional:
  query,
  onQueryChange,
  loading = false,
  loadingText = "Cargando…",
}) {
  const isServerSide = typeof onQueryChange === "function";
  const [localQ, setLocalQ] = useState("");
  const q = isServerSide ? (query ?? "") : localQ;

  const filtered = useMemo(() => {
    if (isServerSide) return data;
    if (!q.trim()) return data;
    const lower = q.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((k) => String(row[k] ?? "").toLowerCase().includes(lower)),
    );
  }, [isServerSide, q, data, searchKeys]);

  const showSearch = isServerSide || searchKeys.length > 0;
  const handleQ = (v) => (isServerSide ? onQueryChange(v) : setLocalQ(v));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between p-3 border-b border-border">
        {showSearch ? (
          <div className="relative w-full sm:w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid={`${testId}-search`}
              value={q}
              onChange={(e) => handleQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9 h-9 bg-secondary/40"
            />
            {isServerSide && loading && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
            )}
          </div>
        ) : <div />}
        {rightSlot}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid={testId}>
          <thead>
            <tr className="bg-secondary/40">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] font-medium text-muted-foreground border-b border-border",
                    c.className,
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  <Loader2 size={16} className="inline mr-2 animate-spin" />{loadingText}
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  {emptyText}
                </td>
              </tr>
            )}
            {filtered.map((row, idx) => (
              <tr
                key={row.id ?? idx}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-border/60 last:border-0 transition-colors",
                  onRowClick ? "cursor-pointer hover:bg-secondary/40" : "hover:bg-secondary/30",
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
