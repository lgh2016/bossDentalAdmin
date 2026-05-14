import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClinic, clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { Search, UserPlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Combobox from "@/shared/Combobox";
import MedicalQuestionnaire, { emptyQuestionnaire } from "@/features/patients/MedicalQuestionnaire";
import { currencyMXN } from "@/utils/format";

export default function CreateAppointmentDialog({ open, onOpenChange, defaultDate }) {
  const { user } = useAuth();
  const { patients, doctors, branches, reasons, procedures } = useClinic();

  const [tab, setTab] = useState("existing");
  const [query, setQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);

  const [newPatient, setNewPatient] = useState({ name: "", phone: "", email: "", age: "", branch: "Ecatepec", gender: "M" });
  const [questionnaire, setQuestionnaire] = useState(emptyQuestionnaire());

  const [form, setForm] = useState({
    date: defaultDate || new Date().toISOString().slice(0, 10),
    time: "10:00",
    duration: 45,
    reasonName: "Consulta",
    branch: "Ecatepec",
    doctorId: "",
    notes: "",
  });

  // Cotización inicial opcional
  const [includeQuotation, setIncludeQuotation] = useState(false);
  const [quotation, setQuotation] = useState({ name: "Cotización inicial", items: [], observations: "" });

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return patients.filter((p) =>
      [p.name, p.phone, p.expediente].some((f) => String(f).toLowerCase().includes(q)),
    ).slice(0, 6);
  }, [query, patients]);

  const reasonOptions = reasons.map((r) => ({ value: r.id, label: r.name }));
  const procedureOptions = procedures.map((p) => ({ value: p.id, label: p.name, description: `${p.category} · ${currencyMXN(p.suggestedPrice)}`, _data: p }));

  const reset = () => {
    setTab("existing");
    setQuery("");
    setSelectedPatient(null);
    setNewPatient({ name: "", phone: "", email: "", age: "", branch: "Ecatepec", gender: "M" });
    setQuestionnaire(emptyQuestionnaire());
    setIncludeQuotation(false);
    setQuotation({ name: "Cotización inicial", items: [], observations: "" });
    setForm({ date: defaultDate || new Date().toISOString().slice(0, 10), time: "10:00", duration: 45, reasonName: "Consulta", branch: "Ecatepec", doctorId: "", notes: "" });
  };

  const onReasonChange = (id, opt) => setForm((f) => ({ ...f, reasonName: opt?.label || f.reasonName }));
  const onCreateReason = (text) => {
    const created = clinicStore.addReason(text, user);
    toast.success(`Motivo "${text}" agregado`);
    setForm((f) => ({ ...f, reasonName: created.name }));
    return { value: created.id, label: created.name };
  };

  // Cotización item helpers
  const addQItem = () => setQuotation((q) => ({ ...q, items: [...q.items, { id: `tmp-${Math.random().toString(36).slice(2, 7)}`, procedureId: null, name: "", tooth: "", description: "", qty: 1, unitPrice: 0 }] }));
  const updQItem = (id, patch) => setQuotation((q) => ({ ...q, items: q.items.map((i) => i.id === id ? { ...i, ...patch } : i) }));
  const rmQItem = (id) => setQuotation((q) => ({ ...q, items: q.items.filter((i) => i.id !== id) }));
  const onQProcedureSelect = (id, opt, itemId) => {
    const proc = opt?._data;
    if (proc) updQItem(itemId, { procedureId: proc.id, name: proc.name, unitPrice: proc.suggestedPrice });
  };
  const onCreateProcedure = (text) => {
    const created = clinicStore.addProcedure({ name: text, suggestedPrice: 0 }, user);
    toast.success(`Procedimiento "${text}" creado en catálogo`);
    return { value: created.id, label: created.name, description: created.category, _data: created };
  };
  const qTotal = quotation.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    let patientId;
    if (tab === "new") {
      if (!newPatient.name || !newPatient.phone) { toast.error("Nombre y teléfono requeridos"); return; }
      const created = clinicStore.createPatient({ ...newPatient, age: Number(newPatient.age) || 30 }, user);
      patientId = created.id;
      // Guardar cuestionario si se respondieron preguntas
      const anyAnswered = Object.values(questionnaire).some((x) => x.answer !== null);
      if (anyAnswered) clinicStore.saveQuestionnaire(patientId, questionnaire, user);
      toast.success(`Paciente creado · ${created.expediente}`);
    } else {
      if (!selectedPatient) { toast.error("Selecciona un paciente"); return; }
      patientId = selectedPatient.id;
    }
    // Cotización inicial opcional
    if (includeQuotation && quotation.items.length > 0) {
      if (quotation.items.some((i) => !i.name)) { toast.error("Completa los nombres de los conceptos de la cotización"); return; }
      clinicStore.createQuotationFromForm(patientId, quotation, user);
      toast.success("Cotización inicial creada");
    }
    const appt = clinicStore.createAppointment({ ...form, type: form.reasonName, patientId }, user);
    toast.success(`Cita creada para ${appt.patientName}`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="create-appointment-dialog">
        <DialogHeader>
          <DialogTitle>Crear cita</DialogTitle>
          <DialogDescription>Programa una cita para un paciente existente o registra uno nuevo.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-secondary">
              <TabsTrigger value="existing" data-testid="tab-existing-patient"><Search size={13} className="mr-1.5" /> Paciente existente</TabsTrigger>
              <TabsTrigger value="new" data-testid="tab-new-patient"><UserPlus size={13} className="mr-1.5" /> Paciente nuevo</TabsTrigger>
            </TabsList>
            <TabsContent value="existing" className="mt-4 space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, teléfono o expediente (BD-2026-0001)…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedPatient(null); }}
                  className="pl-9"
                  data-testid="patient-search-input"
                />
              </div>
              {results.length > 0 && (
                <div className="rounded-lg border border-border max-h-56 overflow-y-auto">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setSelectedPatient(p); setQuery(p.name); setForm((f) => ({ ...f, branch: p.branch })); }}
                      className={`w-full text-left p-3 hover:bg-secondary/50 border-b border-border/60 last:border-0 ${selectedPatient?.id === p.id ? "bg-secondary" : ""}`}
                      data-testid={`patient-result-${p.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{p.name}</p>
                        <span className="text-[10px] font-mono text-muted-foreground">{p.expediente}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{p.phone} · {p.branch}</p>
                    </button>
                  ))}
                </div>
              )}
              {selectedPatient && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                  Paciente seleccionado: <span className="font-medium">{selectedPatient.name}</span> · {selectedPatient.expediente}
                </div>
              )}
            </TabsContent>
            <TabsContent value="new" className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label className="text-xs">Nombre completo</Label><Input data-testid="new-patient-name" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">Teléfono</Label><Input data-testid="new-patient-phone" value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">Edad</Label><Input type="number" value={newPatient.age} onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })} className="mt-1" /></div>
              <div className="col-span-2"><Label className="text-xs">Correo (opcional)</Label><Input value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} className="mt-1" /></div>
              <div>
                <Label className="text-xs">Sucursal</Label>
                <Select value={newPatient.branch} onValueChange={(v) => setNewPatient({ ...newPatient, branch: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Se generará automáticamente expediente, carnet digital y cargo de primera consulta de $50 MXN.
              </div>
              <div className="col-span-2">
                <MedicalQuestionnaire value={questionnaire} onChange={setQuestionnaire} />
              </div>
            </TabsContent>
          </Tabs>

          <div className="border-t border-border pt-4 grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Fecha</Label><Input data-testid="appt-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Hora</Label><Input data-testid="appt-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Motivo</Label>
              <div className="mt-1">
                <Combobox
                  value={reasons.find((r) => r.name === form.reasonName)?.id || ""}
                  onChange={onReasonChange}
                  options={reasonOptions}
                  placeholder={form.reasonName || "Selecciona motivo…"}
                  onCreateNew={onCreateReason}
                  createLabel="Crear motivo"
                  testId="appt-reason"
                />
              </div>
            </div>
            <div><Label className="text-xs">Duración (min)</Label><Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Doctor</Label>
              <Select value={form.doctorId} onValueChange={(v) => setForm({ ...form, doctorId: v })}>
                <SelectTrigger className="mt-1" data-testid="appt-doctor"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>{doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sucursal</Label>
              <Select value={form.branch} onValueChange={(v) => setForm({ ...form, branch: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label className="text-xs">Observaciones</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 min-h-[60px]" /></div>
          </div>

          {/* Cotización inicial opcional */}
          <div className="border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={includeQuotation} onChange={(e) => setIncludeQuotation(e.target.checked)} data-testid="include-quotation-toggle" className="size-4" />
              <span>Agregar cotización inicial</span>
              <span className="text-xs text-muted-foreground">(opcional — define plan de tratamiento)</span>
            </label>

            {includeQuotation && (
              <div className="mt-3 rounded-lg border border-border p-3 space-y-3" data-testid="initial-quotation-block">
                <Input value={quotation.name} onChange={(e) => setQuotation({ ...quotation, name: e.target.value })} placeholder="Nombre del tratamiento o cotización" className="h-9" data-testid="initial-quotation-name" />

                <div className="space-y-2">
                  {quotation.items.map((it) => (
                    <div key={it.id} className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-5">
                        <Combobox
                          value={it.procedureId || ""}
                          onChange={(id, opt) => onQProcedureSelect(id, opt, it.id)}
                          options={procedureOptions}
                          placeholder={it.name || "Procedimiento…"}
                          onCreateNew={(text) => {
                            const opt = onCreateProcedure(text);
                            updQItem(it.id, { procedureId: opt.value, name: opt.label, unitPrice: opt._data.suggestedPrice });
                            return opt;
                          }}
                          createLabel="Crear procedimiento"
                          testId={`initial-proc-${it.id}`}
                        />
                      </div>
                      <Input className="col-span-1 h-9 text-xs" placeholder="Pza" value={it.tooth} onChange={(e) => updQItem(it.id, { tooth: e.target.value })} />
                      <Input className="col-span-1 h-9 text-xs" type="number" min="1" value={it.qty} onChange={(e) => updQItem(it.id, { qty: Number(e.target.value) })} />
                      <Input className="col-span-2 h-9 text-xs" type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => updQItem(it.id, { unitPrice: Number(e.target.value) })} />
                      <div className="col-span-2 h-9 grid place-items-center text-xs font-medium">{currencyMXN(Number(it.qty || 0) * Number(it.unitPrice || 0))}</div>
                      <Button type="button" size="icon" variant="ghost" className="col-span-1 size-9 text-rose-500" onClick={() => rmQItem(it.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <Button type="button" size="sm" variant="outline" onClick={addQItem} data-testid="initial-quotation-add">
                    <Plus size={13} className="mr-1" /> Agregar concepto
                  </Button>
                  <p className="text-sm font-semibold">Total: {currencyMXN(qTotal)}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" data-testid="create-appointment-submit">Crear cita</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
