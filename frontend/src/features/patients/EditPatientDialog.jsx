import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { patientsApi } from "@/services/patientsApi";
import { httpClient } from "@/services/httpClient";

const GENDER_OPTIONS = [
  { value: "Femenino", label: "Femenino" },
  { value: "Masculino", label: "Masculino" },
  { value: "Otro", label: "Otro" },
  // Compatibilidad con datos legados ("F" / "M")
  { value: "F", label: "F (legado)" },
  { value: "M", label: "M (legado)" },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^\d{10}$/;

function validate(form) {
  const errors = {};
  if (!form.name?.trim()) errors.name = "Nombre requerido";
  if (!form.lastName?.trim()) errors.lastName = "Apellido requerido";
  if (!form.phone) errors.phone = "Teléfono requerido";
  else if (!PHONE_REGEX.test(String(form.phone))) errors.phone = "10 dígitos numéricos";
  // Email opcional, pero si está debe ser válido
  if (form.email?.trim() && !EMAIL_REGEX.test(form.email.trim())) errors.email = "Email inválido";
  if (form.emergencyContactPhone && !PHONE_REGEX.test(String(form.emergencyContactPhone))) {
    errors.emergencyContactPhone = "10 dígitos numéricos";
  }
  if (form.birthDate) {
    const d = new Date(form.birthDate);
    if (Number.isNaN(d.getTime())) errors.birthDate = "Fecha inválida";
    else if (d > new Date()) errors.birthDate = "No puede ser futura";
  }
  return errors;
}

const errCls = (e) => (e ? "border-rose-500 focus-visible:ring-rose-500/30" : "");

// Compara el form contra el snapshot original para saber si hay cambios reales.
// Devuelve un objeto SÓLO con los campos modificados (útil para PATCH parcial).
function diffPayload(form, original) {
  if (!original) return {};
  const out = {};
  const fields = [
    "name", "lastName", "email", "phone", "gender", "birthDate",
    "address", "emergencyContactName", "emergencyContactPhone", "branchId",
  ];
  for (const f of fields) {
    const a = form[f];
    const b = original[f];
    const aN = a == null ? "" : String(a).trim();
    const bN = b == null ? "" : String(b).trim();
    if (aN !== bN) out[f] = f === "branchId" ? Number(a) : (typeof a === "string" ? a.trim() : a);
  }
  return out;
}

export default function EditPatientDialog({ open, onOpenChange, patientId, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(null);
  const [touched, setTouched] = useState({});
  const [branches, setBranches] = useState([]);

  // Cargar paciente + sucursales al abrir
  useEffect(() => {
    if (!open || !patientId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      patientsApi.get(patientId),
      httpClient.get("/branches").then((r) => r.data).catch(() => []),
    ])
      .then(([p, b]) => {
        if (cancelled) return;
        setOriginal(p);
        setForm({ ...p });
        setBranches(Array.isArray(b) ? b : []);
      })
      .catch(() => { if (!cancelled) toast.error("No fue posible cargar el paciente"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, patientId]);

  // Limpia al cerrar
  useEffect(() => {
    if (!open) {
      setForm(null);
      setOriginal(null);
      setTouched({});
      setSaving(false);
    }
  }, [open]);

  const errors = useMemo(() => (form ? validate(form) : {}), [form]);
  const dirtyPayload = useMemo(() => diffPayload(form || {}, original), [form, original]);
  const isDirty = Object.keys(dirtyPayload).length > 0;
  const isValid = Object.keys(errors).length === 0;

  const upd = (patch) => setForm((f) => ({ ...f, ...patch }));
  const mark = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const fieldErr = (field) => touched[field] && errors[field];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, lastName: true, phone: true, email: true, birthDate: true });
    if (!isValid) {
      toast.error(Object.values(errors)[0] || "Revisa los campos");
      return;
    }
    if (!isDirty) {
      toast.info("No hay cambios para guardar");
      return;
    }
    setSaving(true);
    try {
      const result = await patientsApi.update(patientId, dirtyPayload);
      toast.success(result?.changed === false ? "Sin cambios detectados" : "Paciente actualizado");
      onSaved?.(result?.data || dirtyPayload);
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible actualizar el paciente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="edit-patient-dialog">
        <DialogHeader>
          <DialogTitle>Editar paciente</DialogTitle>
          <DialogDescription>
            Actualiza la información del paciente. Sólo se enviarán al backend los campos modificados.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6" data-testid="edit-patient-loading">
            <Loader2 size={14} className="animate-spin" /> Cargando datos del paciente…
          </div>
        )}

        {!loading && form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Número de expediente</Label>
                <Input
                  data-testid="edit-patient-expedient"
                  value={form.expedientNumber || ""}
                  readOnly
                  disabled
                  className="mt-1 font-mono bg-muted/40"
                />
              </div>

              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  data-testid="edit-patient-name"
                  value={form.name || ""}
                  onChange={(e) => upd({ name: e.target.value })}
                  onBlur={() => mark("name")}
                  className={`mt-1 ${errCls(fieldErr("name"))}`}
                />
                {fieldErr("name") && <p className="text-[11px] text-rose-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <Label className="text-xs">Apellidos</Label>
                <Input
                  data-testid="edit-patient-lastname"
                  value={form.lastName || ""}
                  onChange={(e) => upd({ lastName: e.target.value })}
                  onBlur={() => mark("lastName")}
                  className={`mt-1 ${errCls(fieldErr("lastName"))}`}
                />
                {fieldErr("lastName") && <p className="text-[11px] text-rose-500 mt-1">{errors.lastName}</p>}
              </div>

              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input
                  data-testid="edit-patient-phone"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.phone || ""}
                  onChange={(e) => upd({ phone: e.target.value.replace(/\D/g, "") })}
                  onBlur={() => mark("phone")}
                  className={`mt-1 ${errCls(fieldErr("phone"))}`}
                />
                {fieldErr("phone") && <p className="text-[11px] text-rose-500 mt-1">{errors.phone}</p>}
              </div>

              <div>
                <Label className="text-xs">Email <span className="text-muted-foreground">(opcional)</span></Label>
                <Input
                  data-testid="edit-patient-email"
                  type="email"
                  value={form.email || ""}
                  onChange={(e) => upd({ email: e.target.value })}
                  onBlur={() => mark("email")}
                  className={`mt-1 ${errCls(fieldErr("email"))}`}
                />
                {fieldErr("email") && <p className="text-[11px] text-rose-500 mt-1">{errors.email}</p>}
              </div>

              <div>
                <Label className="text-xs">Fecha de nacimiento</Label>
                <Input
                  data-testid="edit-patient-birthdate"
                  type="date"
                  value={form.birthDate || ""}
                  onChange={(e) => upd({ birthDate: e.target.value })}
                  onBlur={() => mark("birthDate")}
                  className={`mt-1 ${errCls(fieldErr("birthDate"))}`}
                />
                {fieldErr("birthDate") && <p className="text-[11px] text-rose-500 mt-1">{errors.birthDate}</p>}
              </div>

              <div>
                <Label className="text-xs">Género</Label>
                <Select value={form.gender || ""} onValueChange={(v) => upd({ gender: v })}>
                  <SelectTrigger className="mt-1" data-testid="edit-patient-gender"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>{GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label className="text-xs">Dirección</Label>
                <Textarea
                  data-testid="edit-patient-address"
                  value={form.address || ""}
                  onChange={(e) => upd({ address: e.target.value })}
                  className="mt-1 min-h-[60px]"
                />
              </div>

              <div>
                <Label className="text-xs">Contacto de emergencia <span className="text-muted-foreground">(opcional)</span></Label>
                <Input
                  data-testid="edit-patient-emergency-name"
                  value={form.emergencyContactName || ""}
                  onChange={(e) => upd({ emergencyContactName: e.target.value })}
                  onBlur={() => mark("emergencyContactName")}
                  className={`mt-1 ${errCls(fieldErr("emergencyContactName"))}`}
                />
                {fieldErr("emergencyContactName") && <p className="text-[11px] text-rose-500 mt-1">{errors.emergencyContactName}</p>}
              </div>

              <div>
                <Label className="text-xs">Teléfono de emergencia <span className="text-muted-foreground">(opcional)</span></Label>
                <Input
                  data-testid="edit-patient-emergency-phone"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.emergencyContactPhone || ""}
                  onChange={(e) => upd({ emergencyContactPhone: e.target.value.replace(/\D/g, "") })}
                  onBlur={() => mark("emergencyContactPhone")}
                  className={`mt-1 ${errCls(fieldErr("emergencyContactPhone"))}`}
                />
                {fieldErr("emergencyContactPhone") && <p className="text-[11px] text-rose-500 mt-1">{errors.emergencyContactPhone}</p>}
              </div>

              <div className="col-span-2">
                <Label className="text-xs">Sucursal</Label>
                <Select
                  value={form.branchId != null ? String(form.branchId) : ""}
                  onValueChange={(v) => upd({ branchId: Number(v) })}
                >
                  <SelectTrigger className="mt-1" data-testid="edit-patient-branch"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
              <Button
                type="submit"
                data-testid="edit-patient-submit"
                disabled={saving || !isValid || !isDirty}
                title={!isDirty ? "No hay cambios para guardar" : ""}
              >
                {saving ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Guardando…</> : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
