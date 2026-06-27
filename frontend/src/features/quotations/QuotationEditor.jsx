import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, Lock, FileText, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { currencyMXN } from "@/utils/format";
import { patientsApi } from "@/services/patientsApi";
import { BUDGET_CATALOG, BUDGET_GROUPS } from "./budgetCatalog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRESET = "__preset_value__";

// Estados de presupuesto. El backend acepta DRAFT|PRESENTED|ACCEPTED|REJECTED|IN_EXECUTION|FINALIZED|CANCELLED.
// `ACTIVE` es alias legacy que el backend trata como PRESENTED.
const STATUS_META = {
  DRAFT: { label: "Borrador", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
  PRESENTED: { label: "Presentado", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  ACTIVE: { label: "Presentado", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  ACCEPTED: { label: "Aceptado", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  IN_EXECUTION: { label: "En ejecución", className: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30" },
  REJECTED: { label: "Rechazado", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30" },
  FINALIZED: { label: "Finalizado", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  CANCELLED: { label: "Cancelado", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30" },
};

const EDITABLE_STATUSES = new Set(["DRAFT", "PRESENTED", "ACTIVE", "IN_EXECUTION"]);
const OPEN_STATUSES = new Set(["DRAFT", "PRESENTED", "ACTIVE", "ACCEPTED", "IN_EXECUTION"]);

const isEditable = (b) => b && EDITABLE_STATUSES.has(b.status);
const isOpen = (b) => b && OPEN_STATUSES.has(b.status);

const newTmpId = () => `tmp-${Math.random().toString(36).slice(2, 9)}`;

const normalizeBudget = (b) => ({
  id: b.id,
  status: b.status || "ACTIVE",
  name: b.name || "Presupuesto general",
  observations: b.observations || "",
  createdAt: b.createdAt,
  finalizedAt: b.finalizedAt,
  cancelledAt: b.cancelledAt,
  total: Number(b.total || 0),
  items: (b.items || []).map((it) => ({
    id: it.id || newTmpId(),
    name: it.name || "",
    tooth: it.tooth || "",
    description: it.description || "",
    observations: it.observations || "",
    qty: Number(it.qty || 1),
    unitPrice: Number(it.unitPrice || 0),
  })),
});

const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
};

/**
 * Editor del Presupuesto del paciente con soporte multi-presupuesto histórico.
 * - Lista todos los presupuestos del paciente (más reciente primero).
 * - Sólo DRAFT/ACTIVE permiten edición.
 * - Acciones visibles: Guardar, Finalizar, Cancelar.
 */
export default function QuotationEditor({ patientId, onSaved, onStartTreatment }) {
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState([]);
  const [expanded, setExpanded] = useState({}); // {budgetId: bool}
  const [drafts, setDrafts] = useState({}); // working copy per budget id
  const [savingId, setSavingId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'finalize'|'cancel', budgetId, name }

  const reload = async () => {
    setLoading(true);
    try {
      const { items } = await patientsApi.listBudgets(patientId);
      const normalized = items.map(normalizeBudget);
      setBudgets(normalized);
      // Conservamos las expansiones previas y, si no había ninguna, abrimos
      // automáticamente el editable o el más reciente.
      setExpanded((prev) => {
        const next = {};
        let hasAny = false;
        for (const b of normalized) {
          if (prev[b.id]) { next[b.id] = true; hasAny = true; }
        }
        if (!hasAny) {
          const auto = normalized.find(isEditable) || normalized[0];
          if (auto) next[auto.id] = true;
        }
        return next;
      });
      const draft = {};
      for (const b of normalized) draft[b.id] = { ...b, items: b.items.map((i) => ({ ...i })) };
      setDrafts(draft);
    } catch {
      toast.error("No fue posible cargar los presupuestos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (patientId) reload(); }, [patientId]);

  const hasEditable = budgets.some(isOpen);

  // --- Helpers de mutación del draft ---
  const updateDraft = (bid, patch) =>
    setDrafts((d) => ({ ...d, [bid]: { ...d[bid], ...patch } }));

  const updateDraftItem = (bid, iid, patch) =>
    setDrafts((d) => ({
      ...d,
      [bid]: {
        ...d[bid],
        items: d[bid].items.map((it) => (it.id === iid ? { ...it, ...patch } : it)),
      },
    }));

  const removeDraftItem = (bid, iid) =>
    setDrafts((d) => ({
      ...d,
      [bid]: { ...d[bid], items: d[bid].items.filter((it) => it.id !== iid) },
    }));

  const addEmptyItem = (bid) =>
    setDrafts((d) => ({
      ...d,
      [bid]: {
        ...d[bid],
        items: [
          ...d[bid].items,
          { id: newTmpId(), name: "", tooth: "", description: "", observations: "", qty: 1, unitPrice: 0 },
        ],
      },
    }));

  const addFromCatalog = (bid, catalogName) => {
    const entry = BUDGET_CATALOG.find((c) => c.name === catalogName);
    if (!entry) return;
    setDrafts((d) => ({
      ...d,
      [bid]: {
        ...d[bid],
        items: [
          ...d[bid].items,
          { id: newTmpId(), name: entry.name, tooth: "", description: "", observations: "", qty: 1, unitPrice: entry.price },
        ],
      },
    }));
  };

  // --- Crear presupuesto nuevo (placeholder local). ---
  // Lo abrimos como un draft local con id "new"; al guardar, se hace POST y se reemplaza.
  const startNewBudget = () => {
    if (hasEditable) {
      toast.error("Finaliza o cancela el presupuesto actual antes de crear uno nuevo");
      return;
    }
    const tmp = {
      id: "__new__",
      status: "DRAFT",
      name: "Presupuesto general",
      observations: "",
      total: 0,
      items: [{ id: newTmpId(), name: "", tooth: "", description: "", observations: "", qty: 1, unitPrice: 0 }],
      createdAt: new Date().toISOString(),
      isNew: true,
    };
    setBudgets((b) => [tmp, ...b]);
    setDrafts((d) => ({ ...d, __new__: tmp }));
    setExpanded((e) => ({ ...e, __new__: true }));
  };

  const cancelNewBudgetDraft = () => {
    setBudgets((b) => b.filter((x) => x.id !== "__new__"));
    setDrafts((d) => {
      const next = { ...d };
      delete next.__new__;
      return next;
    });
  };

  // --- Acciones API ---
  const handleSave = async (bid) => {
    const draft = drafts[bid];
    if (!draft) return;
    if (!draft.items?.length) { toast.error("Agrega al menos un concepto"); return; }
    const bad = draft.items.find((i) => !i.name?.trim() || Number(i.qty) <= 0 || Number(i.unitPrice) < 0);
    if (bad) { toast.error("Cada concepto requiere nombre, cantidad > 0 y precio ≥ 0"); return; }
    setSavingId(bid);
    try {
      const payload = {
        name: (draft.name || "Presupuesto general").trim(),
        observations: (draft.observations || "").trim(),
        items: draft.items.map((i) => ({
          id: String(i.id).startsWith("tmp-") ? undefined : i.id,
          name: i.name.trim(),
          tooth: (i.tooth || "").trim(),
          description: (i.description || "").trim(),
          observations: (i.observations || "").trim(),
          qty: Number(i.qty),
          unitPrice: Number(i.unitPrice),
        })),
      };
      if (bid === "__new__") {
        await patientsApi.createBudget(patientId, payload);
        toast.success("Presupuesto creado");
      } else {
        await patientsApi.updateBudget(patientId, bid, payload);
        toast.success("Presupuesto guardado");
      }
      await reload();
      onSaved?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible guardar el presupuesto");
    } finally {
      setSavingId(null);
    }
  };

  const handleFinalize = async (bid) => {
    setSavingId(bid);
    try {
      await patientsApi.finalizeBudget(patientId, bid);
      toast.success("Presupuesto finalizado");
      await reload();
      onSaved?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible finalizar el presupuesto");
    } finally {
      setSavingId(null);
      setConfirmAction(null);
    }
  };

  const handleCancel = async (bid) => {
    setSavingId(bid);
    try {
      await patientsApi.cancelBudget(patientId, bid);
      toast.success("Presupuesto cancelado");
      await reload();
      onSaved?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible cancelar el presupuesto");
    } finally {
      setSavingId(null);
      setConfirmAction(null);
    }
  };

  // ---- Transiciones de estado (Presentar / Aceptar / Rechazar) ----
  const runTransition = async (bid, fn, successMsg, errFallback) => {
    setSavingId(bid);
    try {
      await fn();
      toast.success(successMsg);
      await reload();
      onSaved?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : errFallback);
    } finally {
      setSavingId(null);
    }
  };
  const handlePresent = (bid) => runTransition(bid, () => patientsApi.presentBudget(patientId, bid), "Presupuesto presentado", "No fue posible presentar el presupuesto");
  const handleAccept = (bid) => runTransition(bid, () => patientsApi.acceptBudget(patientId, bid), "Presupuesto aceptado", "No fue posible aceptar el presupuesto");
  const handleReject = (bid) => runTransition(bid, () => patientsApi.rejectBudget(patientId, bid), "Presupuesto rechazado", "No fue posible rechazar el presupuesto");
  const handleStartTreatment = async (bid) => {
    setSavingId(bid);
    try {
      await patientsApi.createTreatment(patientId, { budgetId: bid });
      toast.success("Tratamiento iniciado");
      await reload();
      onSaved?.();
      onStartTreatment?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible iniciar el tratamiento");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground" data-testid="budgets-loading">
        <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando presupuestos…
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="budgets-container">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Presupuestos del paciente</h3>
          <p className="text-xs text-muted-foreground">{budgets.length} en historial</p>
        </div>
        <Button size="sm" onClick={startNewBudget} disabled={hasEditable} data-testid="budgets-new">
          <Plus size={13} className="mr-1" /> Nuevo presupuesto
        </Button>
      </div>

      {budgets.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="budgets-empty">
          Aún no hay presupuestos. Crea el primero para comenzar.
        </div>
      )}

      <div className="space-y-3">
        {budgets.map((b) => (
          <BudgetCard
            key={b.id}
            budget={b}
            draft={drafts[b.id] || b}
            expanded={!!expanded[b.id]}
            onToggle={() => setExpanded((e) => ({ ...e, [b.id]: !e[b.id] }))}
            onChangeName={(name) => updateDraft(b.id, { name })}
            onChangeObservations={(observations) => updateDraft(b.id, { observations })}
            onChangeItem={(iid, patch) => updateDraftItem(b.id, iid, patch)}
            onRemoveItem={(iid) => removeDraftItem(b.id, iid)}
            onAddEmpty={() => addEmptyItem(b.id)}
            onAddFromCatalog={(cn2) => addFromCatalog(b.id, cn2)}
            onSave={() => handleSave(b.id)}
            onFinalize={() => setConfirmAction({ type: "finalize", budgetId: b.id, name: drafts[b.id]?.name || b.name })}
            onCancel={() => setConfirmAction({ type: "cancel", budgetId: b.id, name: drafts[b.id]?.name || b.name })}
            onCancelNewDraft={cancelNewBudgetDraft}
            onPresent={() => handlePresent(b.id)}
            onAccept={() => handleAccept(b.id)}
            onReject={() => handleReject(b.id)}
            onStartTreatment={() => handleStartTreatment(b.id)}
            saving={savingId === b.id}
          />
        ))}
      </div>

      <Dialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <DialogContent data-testid="budget-confirm-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "finalize" ? "Finalizar presupuesto" : "Cancelar presupuesto"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "finalize"
                ? <>Vas a marcar «<strong>{confirmAction?.name}</strong>» como <strong>finalizado</strong>. Quedará en solo lectura como histórico.</>
                : <>Vas a <strong>cancelar</strong> «<strong>{confirmAction?.name}</strong>». Se conservará como histórico en solo lectura.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)} data-testid="budget-confirm-back">Volver</Button>
            <Button
              variant={confirmAction?.type === "finalize" ? "default" : "destructive"}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "finalize") handleFinalize(confirmAction.budgetId);
                else handleCancel(confirmAction.budgetId);
              }}
              disabled={savingId === confirmAction?.budgetId}
              data-testid="budget-confirm-action"
            >
              {confirmAction?.type === "finalize" ? "Sí, finalizar" : "Sí, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- BudgetCard ----------

function BudgetCard({
  budget, draft, expanded, onToggle, onChangeName, onChangeObservations,
  onChangeItem, onRemoveItem, onAddEmpty, onAddFromCatalog,
  onSave, onFinalize, onCancel, onCancelNewDraft,
  onPresent, onAccept, onReject, onStartTreatment,
  saving,
}) {
  const editable = isEditable(budget) || budget.isNew;
  const meta = STATUS_META[budget.status] || STATUS_META.DRAFT;
  const total = useMemo(
    () => (draft.items || []).reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0),
    [draft.items],
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`budget-card-${budget.id}`}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 min-w-0 text-left"
          data-testid={`budget-toggle-${budget.id}`}
        >
          {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold truncate" data-testid={`budget-name-${budget.id}`}>{draft.name || budget.name}</p>
              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border", meta.className)} data-testid={`budget-status-${budget.id}`}>
                {meta.label}
              </span>
              {!editable && <Lock size={11} className="text-muted-foreground" aria-label="Solo lectura" />}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Creado {fmtDate(budget.createdAt)}
              {budget.finalizedAt && <> · Finalizado {fmtDate(budget.finalizedAt)}</>}
              {budget.cancelledAt && <> · Cancelado {fmtDate(budget.cancelledAt)}</>}
              <> · {(draft.items || budget.items).length} concepto(s) · </>
              <strong className="text-foreground">{currencyMXN(editable ? total : budget.total)}</strong>
            </p>
          </div>
        </button>
      </div>

      {expanded && (
        <>
          {editable && (
            <div className="px-5 py-3 border-b border-border">
              <Label className="text-[11px] text-muted-foreground">Nombre del presupuesto</Label>
              <Input
                value={draft.name}
                onChange={(e) => onChangeName(e.target.value)}
                className="mt-1 h-8 max-w-md"
                data-testid={`budget-name-input-${budget.id}`}
              />
            </div>
          )}

          {/* Resumen */}
          <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-b border-border">
            <div className="rounded-md border border-border p-3">
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="font-semibold mt-1" data-testid={`budget-total-${budget.id}`}>
                {currencyMXN(editable ? total : budget.total)}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-muted-foreground text-xs">Conceptos</p>
              <p className="font-semibold mt-1">{(draft.items || []).length}</p>
            </div>
          </div>

          {/* Items */}
          <div className="px-5 py-3 overflow-x-auto">
            <table className="w-full text-sm" data-testid={`budget-items-${budget.id}`}>
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="text-left px-2 py-2">Concepto</th>
                  <th className="text-left px-2 py-2 w-16">Pieza</th>
                  <th className="text-left px-2 py-2 w-16">Cant.</th>
                  <th className="text-left px-2 py-2 w-28">Precio</th>
                  <th className="text-right px-2 py-2 w-28">Subtotal</th>
                  {editable && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {(draft.items || []).length === 0 && (
                  <tr><td colSpan={editable ? 6 : 5} className="px-2 py-6 text-center text-muted-foreground text-sm">Sin conceptos.</td></tr>
                )}
                {(draft.items || []).map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    editable={editable}
                    onChange={(patch) => onChangeItem(it.id, patch)}
                    onRemove={() => onRemoveItem(it.id)}
                    testId={`${budget.id}-${it.id}`}
                  />
                ))}
              </tbody>
            </table>

            {editable && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={onAddEmpty} data-testid={`budget-add-empty-${budget.id}`}>
                  <Plus size={13} className="mr-1" /> Concepto personalizado
                </Button>
                <Select value={PRESET} onValueChange={(v) => { if (v && v !== PRESET) onAddFromCatalog(v); }}>
                  <SelectTrigger className="h-9 text-xs max-w-[260px]" data-testid={`budget-catalog-${budget.id}`}>
                    <SelectValue placeholder="Agregar del catálogo…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PRESET} disabled className="opacity-60">Selecciona un concepto…</SelectItem>
                    {BUDGET_GROUPS.map((g) => (
                      <SelectGroup key={g}>
                        <SelectLabel>{g}</SelectLabel>
                        {BUDGET_CATALOG.filter((c) => c.group === g).map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name} — {currencyMXN(c.price)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Observaciones generales */}
          <div className="px-5 py-3 border-t border-border">
            <Label className="text-xs text-muted-foreground">Observaciones generales del presupuesto</Label>
            {editable ? (
              <Textarea
                value={draft.observations || ""}
                onChange={(e) => onChangeObservations(e.target.value)}
                className="mt-1.5 min-h-[60px] text-xs"
                placeholder="Notas que aplican al presupuesto completo…"
                data-testid={`budget-observations-${budget.id}`}
              />
            ) : (
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                {budget.observations || "Sin observaciones."}
              </p>
            )}
          </div>

          {/* Footer de acciones */}
          {editable ? (
            <div className="px-5 py-3 border-t border-border flex flex-wrap items-center justify-end gap-2">
              {budget.isNew && (
                <Button variant="ghost" size="sm" onClick={onCancelNewDraft} disabled={saving} data-testid={`budget-discard-${budget.id}`}>
                  Descartar
                </Button>
              )}
              {/* Acciones siempre visibles para presupuestos editables */}
              <Button
                variant="destructive"
                size="sm"
                onClick={onCancel}
                disabled={saving || budget.isNew}
                data-testid={`budget-cancel-${budget.id}`}
              >
                <XCircle size={13} className="mr-1.5" /> Cancelar presupuesto
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onFinalize}
                disabled={saving || budget.isNew}
                data-testid={`budget-finalize-${budget.id}`}
              >
                <CheckCircle2 size={13} className="mr-1.5" /> Finalizar presupuesto
              </Button>
              {/* Transiciones por estado */}
              {budget.status === "DRAFT" && !budget.isNew && (
                <Button variant="outline" size="sm" onClick={onPresent} disabled={saving} data-testid={`budget-present-${budget.id}`}>
                  Presentar
                </Button>
              )}
              {(budget.status === "PRESENTED" || budget.status === "ACTIVE") && (
                <>
                  <Button variant="outline" size="sm" onClick={onReject} disabled={saving} data-testid={`budget-reject-${budget.id}`}>
                    Rechazar
                  </Button>
                  <Button variant="outline" size="sm" onClick={onAccept} disabled={saving} data-testid={`budget-accept-${budget.id}`}>
                    Aceptar
                  </Button>
                </>
              )}
              <Button size="sm" onClick={onSave} disabled={saving} data-testid={`budget-save-${budget.id}`}>
                {saving ? <><Loader2 size={13} className="mr-1 animate-spin" /> Guardando…</> : <>Guardar</>}
              </Button>
            </div>
          ) : budget.status === "ACCEPTED" ? (
            <div className="px-5 py-3 border-t border-border flex flex-wrap items-center justify-between gap-2" data-testid={`budget-accepted-${budget.id}`}>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><FileText size={12} /> Presupuesto aceptado — listo para iniciar tratamiento</p>
              <Button size="sm" onClick={onStartTreatment} disabled={saving} data-testid={`budget-start-treatment-${budget.id}`}>
                {saving ? <><Loader2 size={13} className="mr-1 animate-spin" /> Iniciando…</> : <>Iniciar tratamiento</>}
              </Button>
            </div>
          ) : (
            <div className="px-5 py-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground" data-testid={`budget-readonly-${budget.id}`}>
              <FileText size={12} /> Presupuesto {meta.label.toLowerCase()} · solo lectura
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- ItemRow ----------
function ItemRow({ item, editable, onChange, onRemove, testId }) {
  return (
    <>
      <tr className="border-t border-border/60 align-top" data-testid={`budget-row-${testId}`}>
        <td className="px-2 py-2 min-w-[200px]">
          {editable ? (
            <Input
              value={item.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Nombre del concepto"
              className="h-8 text-xs"
              data-testid={`budget-row-name-${testId}`}
            />
          ) : (
            <p className="text-sm font-medium">{item.name}</p>
          )}
        </td>
        <td className="px-2 py-2">
          {editable ? (
            <Input className="h-8 text-xs" value={item.tooth} onChange={(e) => onChange({ tooth: e.target.value })} data-testid={`budget-row-tooth-${testId}`} />
          ) : (
            <span className="text-xs">{item.tooth || "—"}</span>
          )}
        </td>
        <td className="px-2 py-2">
          {editable ? (
            <Input
              className="h-8 text-xs w-16" type="number" min="1" step="1" value={item.qty}
              onChange={(e) => onChange({ qty: Number(e.target.value) })}
              data-testid={`budget-row-qty-${testId}`}
            />
          ) : <span>{item.qty}</span>}
        </td>
        <td className="px-2 py-2">
          {editable ? (
            <Input
              className="h-8 text-xs" type="number" min="0" step="0.01" value={item.unitPrice}
              onChange={(e) => onChange({ unitPrice: Number(e.target.value) })}
              data-testid={`budget-row-price-${testId}`}
            />
          ) : <span>{currencyMXN(item.unitPrice)}</span>}
        </td>
        <td className="px-2 py-2 text-right font-medium" data-testid={`budget-row-subtotal-${testId}`}>
          {currencyMXN(Number(item.qty || 0) * Number(item.unitPrice || 0))}
        </td>
        {editable && (
          <td className="px-2 py-2 text-right">
            <Button size="icon" variant="ghost" className="size-7 text-rose-500 hover:text-rose-600" onClick={onRemove} data-testid={`budget-row-remove-${testId}`}>
              <Trash2 size={13} />
            </Button>
          </td>
        )}
      </tr>
      <tr className="bg-muted/20" data-testid={`budget-row-details-${testId}`}>
        <td colSpan={editable ? 6 : 5} className="px-2 pb-3 pt-0">
          <div className="pl-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Observaciones / Detalles</Label>
            {editable ? (
              <Textarea
                value={item.observations || ""}
                onChange={(e) => onChange({ observations: e.target.value })}
                placeholder="Ej: Pieza 14, endodoncia en molar superior, incluye provisional…"
                className="mt-1 min-h-[44px] text-xs"
                data-testid={`budget-row-observations-${testId}`}
              />
            ) : (
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                {item.observations || "Sin detalles."}
              </p>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}
