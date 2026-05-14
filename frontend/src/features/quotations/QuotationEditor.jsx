import { useState, useMemo } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useClinic, clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { currencyMXN } from "@/utils/format";
import Combobox from "@/shared/Combobox";
import AdminPasswordDialog from "@/features/admin-auth/AdminPasswordDialog";
import { toast } from "sonner";

const newItem = () => ({ id: `tmp-${Math.random().toString(36).slice(2, 7)}`, procedureId: null, name: "", tooth: "", description: "", qty: 1, unitPrice: 0, subtotal: 0 });

export default function QuotationEditor({ patientId, embedded = false, onSaved }) {
  const { user } = useAuth();
  const { quotations, procedures, patients } = useClinic();
  const existing = quotations.find((q) => q.patientId === patientId);
  const patient = patients.find((p) => p.id === patientId);

  const [editing, setEditing] = useState(!existing);
  const [authOpen, setAuthOpen] = useState(false);
  const [name, setName] = useState(existing?.name || "Cotización general");
  const [items, setItems] = useState(existing?.items || []);
  const [observations, setObservations] = useState(existing?.observations || "");

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0), [items]);
  const totalPaid = patient?.totalPaid || 0;
  const balance = Math.max(0, total - totalPaid);

  const procedureOptions = procedures.map((p) => ({ value: p.id, label: p.name, description: `${p.category} · ${currencyMXN(p.suggestedPrice)}`, _data: p }));

  const updateItem = (id, patch) => setItems((arr) => arr.map((i) => i.id === id ? { ...i, ...patch, subtotal: Number((patch.qty ?? i.qty) || 0) * Number((patch.unitPrice ?? i.unitPrice) || 0) } : i));
  const removeItem = (id) => setItems((arr) => arr.filter((i) => i.id !== id));
  const addItem = () => setItems((arr) => [...arr, newItem()]);

  const onProcedureSelect = (id, opt, itemId) => {
    const proc = opt?._data;
    if (proc) updateItem(itemId, { procedureId: proc.id, name: proc.name, unitPrice: proc.suggestedPrice });
  };

  const onCreateProcedure = (text) => {
    const created = clinicStore.addProcedure({ name: text, suggestedPrice: 0 }, user);
    toast.success(`Procedimiento "${text}" creado en catálogo`);
    return { value: created.id, label: created.name, description: created.category, _data: created };
  };

  const handleSave = () => {
    if (!items.length) { toast.error("Agrega al menos un concepto"); return; }
    if (items.some((i) => !i.name)) { toast.error("Completa el nombre de cada concepto"); return; }
    if (existing) {
      // Edición → admin password
      setAuthOpen(true);
    } else {
      // Creación inicial → sin gate
      clinicStore.createQuotationFromForm(patientId, { name, items, observations }, user);
      toast.success("Cotización creada");
      setEditing(false);
      onSaved?.();
    }
  };

  const onAuthorized = ({ reason }) => {
    clinicStore.editBudgetItems(patientId, { name, items, observations }, reason, user);
    toast.success("Cotización actualizada con autorización");
    setEditing(false);
    onSaved?.();
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="quotation-editor">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Cotización</p>
          {editing ? (
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 max-w-md" data-testid="quotation-name-input" />
          ) : (
            <p className="text-base font-semibold mt-0.5">{existing?.name || "Sin cotización"}</p>
          )}
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="quotation-edit-btn">
            <Pencil size={13} className="mr-1.5" /> {existing ? "Editar cotización" : "Crear cotización"}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(existing?.name || "Cotización general"); setItems(existing?.items || []); setObservations(existing?.observations || ""); }} data-testid="quotation-cancel">
              <X size={13} className="mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} data-testid="quotation-save">
              <Check size={13} className="mr-1" /> Guardar
            </Button>
          </div>
        )}
      </div>

      <div className="px-5 py-4 grid grid-cols-3 gap-3 text-sm border-b border-border">
        <div className="rounded-md border border-border p-3"><p className="text-muted-foreground text-xs">Total cotizado</p><p className="font-semibold mt-1">{currencyMXN(total)}</p></div>
        <div className="rounded-md border border-border p-3"><p className="text-muted-foreground text-xs">Total pagado</p><p className="font-semibold mt-1">{currencyMXN(totalPaid)}</p></div>
        <div className="rounded-md border border-border p-3"><p className="text-muted-foreground text-xs">Saldo restante</p><p className="font-semibold mt-1 text-amber-600 dark:text-amber-400">{currencyMXN(balance)}</p></div>
      </div>

      <div className="px-5 py-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="quotation-items-table">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="text-left px-2 py-2">Concepto</th>
                <th className="text-left px-2 py-2 w-16">Pieza</th>
                <th className="text-left px-2 py-2">Descripción</th>
                <th className="text-left px-2 py-2 w-16">Cant.</th>
                <th className="text-left px-2 py-2 w-32">Precio</th>
                <th className="text-right px-2 py-2 w-32">Subtotal</th>
                {editing && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={editing ? 7 : 6} className="px-2 py-6 text-center text-muted-foreground text-sm">Sin conceptos.</td></tr>
              )}
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border/60 align-top">
                  <td className="px-2 py-2 min-w-[200px]">
                    {editing ? (
                      <Combobox
                        value={it.procedureId || ""}
                        onChange={(id, opt) => onProcedureSelect(id, opt, it.id)}
                        options={procedureOptions}
                        placeholder={it.name || "Selecciona o escribe…"}
                        onCreateNew={(text) => {
                          const opt = onCreateProcedure(text);
                          updateItem(it.id, { procedureId: opt.value, name: opt.label, unitPrice: opt._data.suggestedPrice });
                          return opt;
                        }}
                        createLabel="Crear procedimiento"
                        testId={`procedure-cb-${it.id}`}
                      />
                    ) : (
                      <p className="text-sm font-medium">{it.name}</p>
                    )}
                  </td>
                  <td className="px-2 py-2">{editing ? <Input className="h-8 text-xs" value={it.tooth} onChange={(e) => updateItem(it.id, { tooth: e.target.value })} /> : <span className="text-xs">{it.tooth || "—"}</span>}</td>
                  <td className="px-2 py-2">{editing ? <Input className="h-8 text-xs" value={it.description} onChange={(e) => updateItem(it.id, { description: e.target.value })} /> : <span className="text-xs text-muted-foreground">{it.description || "—"}</span>}</td>
                  <td className="px-2 py-2">{editing ? <Input className="h-8 text-xs w-14" type="number" min="1" value={it.qty} onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) })} /> : <span>{it.qty}</span>}</td>
                  <td className="px-2 py-2">{editing ? <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) })} /> : <span>{currencyMXN(it.unitPrice)}</span>}</td>
                  <td className="px-2 py-2 text-right font-medium">{currencyMXN(Number(it.qty || 0) * Number(it.unitPrice || 0))}</td>
                  {editing && (
                    <td className="px-2 py-2 text-right">
                      <Button size="icon" variant="ghost" className="size-7 text-rose-500 hover:text-rose-600" onClick={() => removeItem(it.id)} data-testid={`quotation-item-remove-${it.id}`}>
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && (
          <Button variant="outline" size="sm" className="mt-3" onClick={addItem} data-testid="quotation-add-item">
            <Plus size={13} className="mr-1" /> Agregar concepto
          </Button>
        )}
      </div>

      <div className="px-5 py-4 border-t border-border">
        <Label className="text-xs text-muted-foreground">Observaciones</Label>
        {editing ? (
          <Textarea value={observations} onChange={(e) => setObservations(e.target.value)} className="mt-1.5 min-h-[60px] text-xs" />
        ) : (
          <p className="text-sm text-muted-foreground mt-1">{observations || "Sin observaciones."}</p>
        )}
      </div>

      <AdminPasswordDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        title="Edición de cotización"
        description="La edición de la cotización requiere autorización del administrador (mock: Admin123)."
        onAuthorized={onAuthorized}
      />
    </div>
  );
}
