import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { currencyMXN } from "@/utils/format";
import { patientsApi } from "@/services/patientsApi";
import { toast } from "sonner";

const METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Otro"];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Registra un pago para el paciente del expediente actual.
 * Se usa SIEMPRE con el patientId del expediente abierto — sin búsqueda de paciente.
 *
 * Props:
 *  - open / onOpenChange   → control del modal
 *  - patientId             → id numérico del paciente (obligatorio)
 *  - patient               → { fullName, expedientNumber } para encabezado (opcional)
 *  - onSaved               → callback tras registro exitoso (refresca pestaña Pagos + totales)
 */
export default function RegisterPaymentDialog({ open, onOpenChange, patientId, patient, onSaved }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Efectivo");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [totals, setTotals] = useState({ paidAmount: 0, totalBudgeted: 0, balance: 0 });

  // Carga totales del paciente al abrir
  useEffect(() => {
    if (!open || !patientId) return;
    let cancelled = false;
    patientsApi.listPayments(patientId)
      .then((r) => { if (!cancelled) setTotals(r.totals); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, patientId]);

  // Limpia al cerrar
  useEffect(() => {
    if (!open) {
      setAmount(""); setMethod("Efectivo"); setPaymentDate(todayISO());
      setConcept(""); setNotes(""); setSubmitting(false);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("Monto debe ser mayor a 0"); return; }
    if (!method) { toast.error("Método requerido"); return; }
    if (!concept.trim()) { toast.error("Concepto requerido"); return; }
    if (!paymentDate) { toast.error("Fecha requerida"); return; }
    setSubmitting(true);
    try {
      const res = await patientsApi.createPayment(patientId, {
        amount: n,
        method,
        concept: concept.trim(),
        paymentDate,
        notes: notes.trim(),
      });
      toast.success(`Pago registrado por ${currencyMXN(n)}`);
      onSaved?.(res);
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible registrar el pago");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg" data-testid="register-payment-dialog">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {patient?.fullName ? `${patient.fullName}` : `Paciente #${patientId}`}
            {patient?.expedientNumber ? ` · ${patient.expedientNumber}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-md border border-border p-3"><p className="text-muted-foreground">Total presup.</p><p className="font-semibold mt-1">{currencyMXN(totals.totalBudgeted)}</p></div>
            <div className="rounded-md border border-border p-3"><p className="text-muted-foreground">Pagado</p><p className="font-semibold mt-1">{currencyMXN(totals.paidAmount)}</p></div>
            <div className="rounded-md border border-border p-3"><p className="text-muted-foreground">Saldo</p><p className="font-semibold mt-1 text-amber-600 dark:text-amber-400">{currencyMXN(totals.balance)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Monto (MXN)</Label>
              <Input
                type="number" min="0.01" step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
                data-testid="rp-amount"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="mt-1" data-testid="rp-method"><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha de pago</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1"
                data-testid="rp-date"
              />
            </div>
            <div>
              <Label className="text-xs">Concepto</Label>
              <Input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="mt-1"
                data-testid="rp-concept"
                maxLength={200}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Observaciones <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 min-h-[60px]"
                data-testid="rp-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button type="submit" data-testid="rp-submit" disabled={submitting}>
              {submitting ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Registrando…</> : "Registrar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
