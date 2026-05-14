import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useClinic, clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { currencyMXN } from "@/utils/format";
import { toast } from "sonner";

const METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Otro"];

export default function RegisterPaymentDialog({ open, onOpenChange, patientId }) {
  const { user } = useAuth();
  const { patients, quotations } = useClinic();
  const p = patients.find((x) => x.id === patientId);
  const q = quotations.find((x) => x.patientId === patientId);
  const [form, setForm] = useState({ amount: "", method: "Efectivo", concept: "", notes: "" });

  if (!p) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Monto inválido"); return; }
    if (!form.concept.trim()) { toast.error("Captura el concepto"); return; }
    const newPayment = clinicStore.registerPayment({ patientId, ...form }, user);
    toast.success(`Pago registrado por ${currencyMXN(Number(form.amount))}`);
    setForm({ amount: "", method: "Efectivo", concept: "", notes: "" });
    onOpenChange(false);
    return newPayment;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="register-payment-dialog">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>{p.name} · {p.expediente}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-md border border-border p-3"><p className="text-muted-foreground">Total presup.</p><p className="font-semibold mt-1">{currencyMXN(p.totalBudget)}</p></div>
            <div className="rounded-md border border-border p-3"><p className="text-muted-foreground">Pagado</p><p className="font-semibold mt-1">{currencyMXN(p.totalPaid)}</p></div>
            <div className="rounded-md border border-border p-3"><p className="text-muted-foreground">Saldo</p><p className="font-semibold mt-1 text-amber-600 dark:text-amber-400">{currencyMXN(p.balance)}</p></div>
          </div>
          {q && (
            <div className="rounded-md border border-border p-3 text-xs">
              <p className="font-medium">{q.name}</p>
              <p className="text-muted-foreground">{q.items.length} concepto(s) · {currencyMXN(q.total)}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Monto (MXN)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1" data-testid="rp-amount" /></div>
            <div>
              <Label className="text-xs">Método</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger className="mt-1" data-testid="rp-method"><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label className="text-xs">Concepto</Label><Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} className="mt-1" data-testid="rp-concept" /></div>
            <div className="col-span-2"><Label className="text-xs">Observaciones</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 min-h-[60px]" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" data-testid="rp-submit">Registrar pago</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
