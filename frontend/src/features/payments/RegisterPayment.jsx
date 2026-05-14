import { useMemo, useState } from "react";
import { Plus, Search, ReceiptText, Wallet, Check, IdCard, X, FileText } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import StatusBadge from "@/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClinic, clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { currencyMXN } from "@/utils/format";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import CancelPaymentDialog from "./CancelPaymentDialog";

const METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Otro"];

function PaymentsListing() {
  const { payments, patients } = useClinic();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [confirmMethod, setConfirmMethod] = useState("Efectivo");
  const [cancelTarget, setCancelTarget] = useState(null);
  const { user } = useAuth();

  const balanceByPatient = useMemo(() => {
    const m = {};
    patients.forEach((p) => { m[p.id] = p.balance; });
    return m;
  }, [patients]);

  const filtered = useMemo(() => {
    if (!q.trim()) return payments;
    const lower = q.toLowerCase();
    return payments.filter((p) => [p.patientName, p.expediente, p.concept].some((f) => String(f || "").toLowerCase().includes(lower)));
  }, [q, payments]);

  const handleConfirm = (p) => {
    clinicStore.confirmPayment(p.id, confirmMethod, user);
    toast.success(`Pago confirmado por ${currencyMXN(p.amount)}`);
    setConfirmId(null);
  };

  const openExpediente = (p) => {
    if (!p.patientId) return;
    navigate(`/pacientes/${p.patientId}?tab=payments&highlight=${p.id}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Buscar por paciente, expediente o concepto…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="payments-listing-search" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="payments-listing-table">
            <thead className="bg-secondary/40">
              <tr>
                {["Expediente","Paciente","Concepto","Monto","Método","Fecha de pago","Registrado por","Saldo restante","Estado","Acciones"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] font-medium text-muted-foreground border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-border/60 last:border-0 hover:bg-secondary/30 ${p.status === "Cancelado" ? "opacity-60" : "cursor-pointer"}`}
                  onClick={(e) => { if (e.target.closest("button") || e.target.closest("[role=combobox]")) return; openExpediente(p); }}
                  data-testid={`payment-row-${p.id}`}
                >
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{p.expediente || "—"}</td>
                  <td className="px-4 py-3 font-medium">{p.patientName}</td>
                  <td className="px-4 py-3">{p.concept}</td>
                  <td className={`px-4 py-3 font-semibold ${p.status === "Cancelado" ? "line-through text-muted-foreground" : ""}`}>{currencyMXN(p.amount)}</td>
                  <td className="px-4 py-3 text-xs">{p.method}</td>
                  <td className="px-4 py-3 text-xs">{p.date}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.registeredBy || "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.patientId ? currencyMXN(balanceByPatient[p.patientId] || 0) : "—"}</td>
                  <td className="px-4 py-3"><StatusBadge value={p.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.status === "Pendiente" && confirmId !== p.id && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setConfirmId(p.id); }} data-testid={`confirm-payment-${p.id}`}>
                        <Check size={13} className="mr-1" /> Confirmar
                      </Button>
                    )}
                    {confirmId === p.id && (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Select value={confirmMethod} onValueChange={setConfirmMethod}>
                          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => handleConfirm(p)}>Pagar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>×</Button>
                      </div>
                    )}
                    {p.status !== "Cancelado" && confirmId !== p.id && (
                      <Button size="sm" variant="ghost" className="text-rose-500" onClick={(e) => { e.stopPropagation(); setCancelTarget(p); }} data-testid={`cancel-payment-${p.id}`}>
                        <X size={13} className="mr-1" /> Cancelar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Sin movimientos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <CancelPaymentDialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)} payment={cancelTarget} />
    </div>
  );
}

function NewPaymentForm() {
  const { user } = useAuth();
  const { patients, payments, quotations } = useClinic();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ amount: "", method: "Efectivo", concept: "", notes: "" });

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return patients.filter((p) => [p.name, p.phone, p.expediente].some((f) => String(f).toLowerCase().includes(lower))).slice(0, 6);
  }, [query, patients]);

  const lastFive = useMemo(() => {
    if (!selected) return [];
    return payments.filter((p) => p.patientId === selected.id).slice(0, 5);
  }, [selected, payments]);

  const quotation = selected ? quotations.find((q) => q.patientId === selected.id) : null;

  const submit = (e) => {
    e.preventDefault();
    if (!selected) { toast.error("Selecciona un paciente"); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Monto inválido"); return; }
    if (!form.concept.trim()) { toast.error("Captura el concepto"); return; }
    clinicStore.registerPayment({ patientId: selected.id, ...form }, user);
    toast.success(`Pago registrado por ${currencyMXN(Number(form.amount))}`);
    setForm({ amount: "", method: "Efectivo", concept: "", notes: "" });
  };

  // Get fresh patient data after store mutates
  const fresh = selected ? patients.find((p) => p.id === selected.id) : null;

  return (
    <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-5" data-testid="new-payment-form">
      <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <Label className="text-xs">Buscar paciente</Label>
          <div className="relative mt-1.5">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Nombre, teléfono o expediente (BD-2026-0001)…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              data-testid="payment-patient-search"
            />
          </div>
          {results.length > 0 && (
            <div className="mt-2 rounded-lg border border-border max-h-48 overflow-y-auto">
              {results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => { setSelected(p); setQuery(p.name); }}
                  data-testid={`payment-patient-result-${p.id}`}
                  className={`w-full text-left p-3 hover:bg-secondary/50 border-b border-border/60 last:border-0 ${selected?.id === p.id ? "bg-secondary" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{p.name}</p>
                    <span className="text-[10px] font-mono text-muted-foreground">{p.expediente}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.phone} · {p.branch} · saldo {currencyMXN(p.balance)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Monto (MXN)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1" data-testid="payment-amount" /></div>
          <div>
            <Label className="text-xs">Método de pago</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger className="mt-1" data-testid="payment-method"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label className="text-xs">Concepto</Label><Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="Ej. Mensualidad brackets 5/12" className="mt-1" data-testid="payment-concept" /></div>
          <div className="col-span-2"><Label className="text-xs">Observaciones</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 min-h-[60px]" /></div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="submit" data-testid="payment-submit"><ReceiptText size={14} className="mr-1.5" /> Registrar pago</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Resumen del paciente</p>
        {fresh ? (
          <>
            <div className="rounded-lg border border-border bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">Carnet</p>
                <IdCard size={16} />
              </div>
              <p className="mt-2 text-base font-semibold">{fresh.name}</p>
              <p className="text-[11px] opacity-80 font-mono">{fresh.expediente}</p>
              <p className="text-[11px] opacity-80 mt-1">{fresh.phone} · {fresh.branch}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Presup.</p><p className="font-semibold mt-0.5">{currencyMXN(fresh.totalBudget)}</p></div>
              <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Pagado</p><p className="font-semibold mt-0.5">{currencyMXN(fresh.totalPaid)}</p></div>
              <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Saldo</p><p className="font-semibold mt-0.5 text-amber-600 dark:text-amber-400">{currencyMXN(fresh.balance)}</p></div>
            </div>
            {quotation && (
              <div className="rounded-md border border-border p-3 text-xs">
                <p className="font-medium flex items-center gap-1"><FileText size={11} /> {quotation.name}</p>
                <p className="text-muted-foreground">{quotation.items.length} concepto(s)</p>
              </div>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Últimos 5 pagos</p>
              <div className="rounded-md border border-border divide-y divide-border" data-testid="last-five-payments">
                {lastFive.length === 0 && <p className="p-3 text-xs text-muted-foreground text-center">Sin pagos.</p>}
                {lastFive.map((pp) => (
                  <div key={pp.id} className={`flex items-center justify-between gap-2 p-2.5 ${pp.status === "Cancelado" ? "opacity-60" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{pp.concept}</p>
                      <p className="text-[10px] text-muted-foreground">{pp.date} · {pp.method}</p>
                    </div>
                    <span className={`text-xs font-semibold ${pp.status === "Cancelado" ? "line-through" : ""}`}>{currencyMXN(pp.amount)}</span>
                    <StatusBadge value={pp.status} />
                  </div>
                ))}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => navigate(`/pacientes/${fresh.id}?tab=payments`)} data-testid="rp-view-record">
              <Wallet size={13} className="mr-1.5" /> Ver expediente
            </Button>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Busca y selecciona un paciente para mostrar su resumen, presupuesto y saldo.</p>
        )}
      </div>
    </form>
  );
}

export default function RegisterPayment() {
  const [tab, setTab] = useState("list");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recepción"
        title="Registrar pago"
        subtitle="Gestiona pagos parciales, confirma cargos pendientes y consulta el historial."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="list" data-testid="tab-payments-list"><ReceiptText size={13} className="mr-1.5" /> Listado</TabsTrigger>
          <TabsTrigger value="new" data-testid="tab-new-payment"><Plus size={13} className="mr-1.5" /> Registrar nuevo</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4">
          <PaymentsListing />
        </TabsContent>
        <TabsContent value="new" className="mt-4">
          <NewPaymentForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
