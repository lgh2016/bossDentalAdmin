import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Combobox from "@/shared/Combobox";
import MedicalQuestionnaire, { emptyQuestionnaire } from "@/features/patients/MedicalQuestionnaire";
import { patientsApi } from "@/services/patientsApi";
import { doctorsApi } from "@/services/doctorsApi";
import { appointmentsApi } from "@/services/appointmentsApi";
import { useClinic, clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import {
  todayISO, startSlots, endSlots, defaultEndTime, validateAppointmentDateTime, isSunday,
} from "@/utils/scheduleTime";

const BRANCH_ID = 1;
const SR = "S/R";
const NO_DOCTOR = "NONE";

const GENDER_OPTIONS = [
  { value: "Femenino", label: "Femenino" },
  { value: "Masculino", label: "Masculino" },
  { value: "Otro", label: "Otro" },
];

const emptyNewPatient = () => ({
  name: "",
  lastName: "",
  email: "",
  phone: "",
  gender: "",
  birthDate: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
});

const NAME_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'-]*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^\d{10}$/;

function validateNewPatient(p) {
  const errors = {};
  if (!p.name?.trim()) errors.name = "Nombre requerido";
  else if (!NAME_REGEX.test(p.name.trim())) errors.name = "Solo letras, acentos y Ñ";
  if (!p.lastName?.trim()) errors.lastName = "Apellido requerido";
  else if (!NAME_REGEX.test(p.lastName.trim())) errors.lastName = "Solo letras, acentos y Ñ";
  if (!p.email?.trim()) errors.email = "Email requerido";
  else if (!EMAIL_REGEX.test(p.email.trim())) errors.email = "Email inválido";
  if (!p.phone) errors.phone = "Teléfono requerido";
  else if (!PHONE_REGEX.test(String(p.phone))) errors.phone = "10 dígitos numéricos";
  if (!p.gender) errors.gender = "Género requerido";
  if (!p.birthDate) errors.birthDate = "Fecha requerida";
  else {
    const d = new Date(p.birthDate);
    const now = new Date();
    if (Number.isNaN(d.getTime())) errors.birthDate = "Fecha inválida";
    else if (d > now) errors.birthDate = "No puede ser futura";
    else if (d < new Date("1900-01-01")) errors.birthDate = "Fecha fuera de rango";
  }
  if (!p.address?.trim()) errors.address = "Dirección requerida";
  if (p.emergencyContactName?.trim() && !NAME_REGEX.test(p.emergencyContactName.trim())) {
    errors.emergencyContactName = "Solo letras, acentos y Ñ";
  }
  if (p.emergencyContactPhone && !PHONE_REGEX.test(String(p.emergencyContactPhone))) {
    errors.emergencyContactPhone = "10 dígitos numéricos";
  }
  return errors;
}

const errCls = (hasErr) => (hasErr ? "border-rose-500 focus-visible:ring-rose-500/30" : "");
const valueOrSR = (v) => (v == null || v === "" ? SR : v);

// Validaciones del formulario de cita: paciente + motivo + fecha/hora (delegado).
function validateAppointment({ patient, date, startTime, endTime, reason }) {
  const errors = validateAppointmentDateTime({ date, startTime, endTime });
  if (!patient) errors.patient = "Selecciona un paciente";
  if (!reason?.trim()) errors.reason = "Motivo requerido";
  return errors;
}

export default function CreateAppointmentDialog({ open, onOpenChange, defaultDate, lockedPatient = null, onCreated }) {
  const { user } = useAuth();
  const { reasons } = useClinic();

  // Si viene lockedPatient (p.ej. desde el detalle del paciente), saltamos la búsqueda
  // y forzamos la pestaña "existente". Tampoco se permite cambiar a "nuevo paciente".
  const [tab, setTab] = useState("existing");

  // --- Paciente existente ---
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // --- Datos de la cita ---
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [doctorKey, setDoctorKey] = useState(NO_DOCTOR);    // NO_DOCTOR | "<id>"
  const [date, setDate] = useState(defaultDate || todayISO());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reasonName, setReasonName] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [appointmentTouched, setAppointmentTouched] = useState({});

  // --- Paciente nuevo ---
  const [newPatient, setNewPatient] = useState(emptyNewPatient());
  const [questionnaire, setQuestionnaire] = useState(emptyQuestionnaire());
  const [touched, setTouched] = useState({});
  const [submittingPatient, setSubmittingPatient] = useState(false);

  const patientErrors = useMemo(() => validateNewPatient(newPatient), [newPatient]);
  const isPatientFormValid = Object.keys(patientErrors).length === 0;

  const apptErrors = useMemo(
    () => validateAppointment({ patient: selectedPatient, date, startTime, endTime, reason: reasonName }),
    [selectedPatient, date, startTime, endTime, reasonName],
  );
  const isApptValid = Object.keys(apptErrors).length === 0;

  const expedientHint = `EXP-${new Date().getFullYear()}-000001`;
  const searchPlaceholder = `Buscar por nombre, teléfono o expediente (${expedientHint})…`;
  const reasonOptions = reasons.map((r) => ({ value: r.id, label: r.name }));

  // ====== Resets ======
  const resetAppointmentForm = () => {
    setDoctorKey(NO_DOCTOR);
    setDate(defaultDate || todayISO());
    setStartTime("");
    setEndTime("");
    setReasonName("");
    setNotes("");
    setAppointmentTouched({});
  };
  const resetPatientForm = () => {
    setNewPatient(emptyNewPatient());
    setQuestionnaire(emptyQuestionnaire());
    setTouched({});
  };
  const fullReset = () => {
    setTab("existing");
    setQuery("");
    setSearchResults([]);
    setSelectedPatient(null);
    resetAppointmentForm();
    resetPatientForm();
  };

  // ====== Sincronizar defaultDate al abrir ======
  useEffect(() => {
    if (open && defaultDate) setDate(defaultDate);
  }, [open, defaultDate]);

  // ====== Precarga paciente bloqueado (desde detalle de paciente) ======
  useEffect(() => {
    if (!open) return;
    if (lockedPatient) {
      setSelectedPatient(lockedPatient);
      setQuery(lockedPatient.fullName || "");
      setSearchResults([]);
      setTab("existing");
    }
  }, [open, lockedPatient]);

  // ====== Cargar doctores activos ======
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingDoctors(true);
    doctorsApi.listActive({ branchId: BRANCH_ID })
      .then((data) => { if (!cancelled) setDoctors(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) { setDoctors([]); toast.error("No fue posible cargar los doctores"); } })
      .finally(() => { if (!cancelled) setLoadingDoctors(false); });
    return () => { cancelled = true; };
  }, [open]);

  // ====== Búsqueda de pacientes ======
  const searchRequestId = useRef(0);
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    const myId = ++searchRequestId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await patientsApi.search({ query: query.trim(), page: 0, size: 10 });
        if (myId === searchRequestId.current) setSearchResults(Array.isArray(data?.content) ? data.content : []);
      } catch {
        if (myId === searchRequestId.current) setSearchResults([]);
      } finally {
        if (myId === searchRequestId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const onPatientSelect = (p) => {
    setSelectedPatient(p);
    setQuery(p.fullName || "");
    setSearchResults([]);
  };

  const apptError = (field) => appointmentTouched[field] && apptErrors[field];
  const markApptTouched = (field) => setAppointmentTouched((t) => ({ ...t, [field]: true }));

  // Slots dinámicos según fecha seleccionada (horario laboral + redondeo al siguiente bloque).
  const startSlotOptions = useMemo(() => startSlots(date), [date]);
  const endSlotOptions = useMemo(() => endSlots(date, startTime), [date, startTime]);
  const noSlotsMessage = useMemo(() => {
    if (!date || startSlotOptions.length > 0) return null;
    if (isSunday(date)) return "La clínica no atiende los domingos.";
    if (date === todayISO()) return "Ya no hay horarios disponibles para hoy.";
    return "Sin horarios disponibles para esta fecha.";
  }, [date, startSlotOptions.length]);

  // Al cambiar de fecha, limpia horas si quedaron fuera del nuevo horario.
  useEffect(() => {
    if (!date) return;
    if (startTime && !startSlotOptions.find((s) => s.value === startTime)) {
      setStartTime("");
      setEndTime("");
    }
  }, [date, startSlotOptions, startTime]);

  // Al elegir hora inicial, sugiere hora fin = inicio + 1h (alineada al horario laboral).
  const onStartTimeChange = (v) => {
    setStartTime(v);
    markApptTouched("startTime");
    const suggested = defaultEndTime(date, v);
    if (suggested) setEndTime(suggested);
  };

  const onReasonChange = (_id, opt) => {
    setReasonName(opt?.label || reasonName);
    markApptTouched("reason");
  };
  const onCreateReason = (text) => {
    const created = clinicStore.addReason(text, user);
    toast.success(`Motivo "${text}" agregado al catálogo local`);
    setReasonName(created.name);
    return { value: created.id, label: created.name };
  };

  // ====== Submit: crear cita ======
  const handleCreate = async (e) => {
    e.preventDefault();
    setAppointmentTouched({ patient: true, date: true, startTime: true, endTime: true, reason: true });
    if (!isApptValid) {
      toast.error(Object.values(apptErrors)[0] || "Revisa los campos");
      return;
    }
    setCreating(true);
    try {
      const created = await appointmentsApi.create({
        patientId: selectedPatient.id,
        branchId: BRANCH_ID,
        appointmentDate: date,
        startTime,
        endTime,
        doctorId: doctorKey === NO_DOCTOR ? null : Number(doctorKey),
        reason: reasonName.trim(),
        notes: notes.trim(),
      });
      const doctorLbl = doctorKey === NO_DOCTOR ? "sin doctor asignado" : (created.doctorAsignadoName || "doctor asignado");
      toast.success(`Cita creada para ${selectedPatient.fullName} (${doctorLbl})`);
      onCreated?.(created);
      fullReset();
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No fue posible crear la cita");
    } finally {
      setCreating(false);
    }
  };

  // ====== Submit: registrar paciente nuevo ======
  const updPatient = (patch) => setNewPatient((p) => ({ ...p, ...patch }));
  const markTouched = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const fieldError = (field) => touched[field] && patientErrors[field];

  const handleRegisterPatient = async (e) => {
    e.preventDefault();
    setTouched({ name: true, lastName: true, email: true, phone: true, gender: true, birthDate: true, address: true });
    if (!isPatientFormValid) { toast.error("Revisa los campos en rojo"); return; }
    const payload = {
      name: newPatient.name.trim(),
      lastName: newPatient.lastName.trim(),
      email: newPatient.email.trim(),
      phone: Number(newPatient.phone),
      gender: newPatient.gender,
      birthDate: newPatient.birthDate,
      address: newPatient.address.trim(),
      emergencyContactName: newPatient.emergencyContactName.trim(),
      emergencyContactPhone: String(newPatient.emergencyContactPhone),
      photoUrl: null,
    };
    setSubmittingPatient(true);
    try {
      const created = await patientsApi.create(payload);
      const fullName = `${created.name} ${created.lastName}`.trim();
      toast.success(`Paciente ${fullName} registrado correctamente. ID: ${created.id}`);
      const adapted = {
        id: created.id,
        fullName,
        expedientNumber: created.patientNumber || null,
        phone: String(created.phone ?? ""),
        email: created.email,
        photoUrl: created.photoUrl,
        active: true,
      };
      resetPatientForm();
      setSelectedPatient(adapted);
      setQuery(fullName);
      setSearchResults([]);
      setTab("existing");
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message
        || (status === 409 ? "El paciente ya existe" : null)
        || (status === 400 ? "Datos inválidos" : null)
        || (status === 401 ? "Sesión expirada" : null)
        || "No se pudo registrar el paciente";
      toast.error(message);
    } finally {
      setSubmittingPatient(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) fullReset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="create-appointment-dialog">
        <DialogHeader>
          <DialogTitle>{tab === "new" ? "Registrar paciente" : "Crear cita"}</DialogTitle>
          <DialogDescription>
            {tab === "new"
              ? "Da de alta a un paciente nuevo. La cita podrás agendarla después desde Paciente existente."
              : "Programa una cita. El doctor es opcional — si lo dejas vacío, la cita aparecerá en Pacientes citados sin asignar."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          {!lockedPatient && (
            <TabsList className="bg-secondary">
              <TabsTrigger value="existing" data-testid="tab-existing-patient"><Search size={13} className="mr-1.5" /> Paciente existente</TabsTrigger>
              <TabsTrigger value="new" data-testid="tab-new-patient"><UserPlus size={13} className="mr-1.5" /> Paciente nuevo</TabsTrigger>
            </TabsList>
          )}

          {/* ============ EXISTENTE ============ */}
          <TabsContent value="existing" className="mt-4">
            <form onSubmit={handleCreate} className="space-y-5">
              {/* Buscador paciente — oculto si viene un paciente bloqueado desde el detalle */}
              <div className="space-y-3">
                {!lockedPatient && (
                  <>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={searchPlaceholder}
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setSelectedPatient(null); }}
                        className="pl-9"
                        data-testid="patient-search-input"
                      />
                      {searching && (
                        <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
                      )}
                    </div>
                    {searchResults.length > 0 && (
                      <div className="rounded-lg border border-border max-h-56 overflow-y-auto" data-testid="patient-results">
                        {searchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onPatientSelect(p)}
                            className={`w-full text-left p-3 hover:bg-secondary/50 border-b border-border/60 last:border-0 ${selectedPatient?.id === p.id ? "bg-secondary" : ""}`}
                            data-testid={`patient-result-${p.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">{valueOrSR(p.fullName)}</p>
                              <span className="text-[10px] font-mono text-muted-foreground">{valueOrSR(p.expedientNumber)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{valueOrSR(p.phone)} · {valueOrSR(p.email)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {selectedPatient && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs flex items-center justify-between" data-testid="selected-patient">
                    <span>
                      Paciente seleccionado: <span className="font-medium">{valueOrSR(selectedPatient.fullName)}</span> · {valueOrSR(selectedPatient.expedientNumber)}
                    </span>
                    {!lockedPatient && (
                      <button
                        type="button"
                        className="text-[11px] underline text-muted-foreground hover:text-foreground"
                        onClick={() => { setSelectedPatient(null); setQuery(""); }}
                      >
                        cambiar
                      </button>
                    )}
                  </div>
                )}
                {apptError("patient") && !selectedPatient && (
                  <p className="text-[11px] text-rose-500" data-testid="appt-patient-error">{apptErrors.patient}</p>
                )}
              </div>

              {/* Datos de la cita */}
              <div className="border-t border-border pt-4 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Doctor <span className="text-muted-foreground">(opcional)</span></Label>
                  <Select value={doctorKey} onValueChange={setDoctorKey} disabled={loadingDoctors}>
                    <SelectTrigger className="mt-1" data-testid="appt-doctor">
                      <SelectValue placeholder={loadingDoctors ? "Cargando doctores…" : "Sin doctor (asignar después)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_DOCTOR}>Sin doctor (asignar después)</SelectItem>
                      {doctors.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {valueOrSR(d.fullName)}{d.specialty ? ` · ${d.specialty}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {doctorKey === NO_DOCTOR && (
                    <p className="text-[11px] text-muted-foreground mt-1">La cita se creará en &quot;Pacientes citados&quot; sin doctor. Podrás asignarlo después.</p>
                  )}
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Fecha</Label>
                  <Input
                    type="date"
                    value={date}
                    min={todayISO()}
                    onChange={(e) => { setDate(e.target.value); markApptTouched("date"); }}
                    onBlur={() => markApptTouched("date")}
                    className={`mt-1 ${errCls(apptError("date"))}`}
                    data-testid="appt-date"
                  />
                  {apptError("date") && <p className="text-[11px] text-rose-500 mt-1">{apptErrors.date}</p>}
                  {noSlotsMessage && !apptError("date") && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1" data-testid="appt-closed-warning">
                      {noSlotsMessage}
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Hora inicial</Label>
                  <Select value={startTime} onValueChange={onStartTimeChange} disabled={!date || startSlotOptions.length === 0}>
                    <SelectTrigger
                      className={`mt-1 ${errCls(apptError("startTime"))}`}
                      data-testid="appt-start-time"
                      onBlur={() => markApptTouched("startTime")}
                    >
                      <SelectValue placeholder={startSlotOptions.length ? "Selecciona…" : "Sin horarios"} />
                    </SelectTrigger>
                    <SelectContent>
                      {startSlotOptions.map((s) => (
                        <SelectItem key={s.value} value={s.value} data-testid={`appt-start-slot-${s.value}`}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {apptError("startTime") && <p className="text-[11px] text-rose-500 mt-1">{apptErrors.startTime}</p>}
                </div>

                <div>
                  <Label className="text-xs">Hora fin</Label>
                  <Select
                    value={endTime}
                    onValueChange={(v) => { setEndTime(v); markApptTouched("endTime"); }}
                    disabled={!startTime}
                  >
                    <SelectTrigger
                      className={`mt-1 ${errCls(apptError("endTime"))}`}
                      data-testid="appt-end-time"
                      onBlur={() => markApptTouched("endTime")}
                    >
                      <SelectValue placeholder={endSlotOptions.length ? "Selecciona…" : "—"} />
                    </SelectTrigger>
                    <SelectContent>
                      {endSlotOptions.map((s) => (
                        <SelectItem key={s.value} value={s.value} data-testid={`appt-end-slot-${s.value}`}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {apptError("endTime") && <p className="text-[11px] text-rose-500 mt-1">{apptErrors.endTime}</p>}
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Motivo</Label>
                  <div className="mt-1">
                    <Combobox
                      value={reasons.find((r) => r.name === reasonName)?.id || ""}
                      onChange={onReasonChange}
                      options={reasonOptions}
                      placeholder={reasonName || "Selecciona o escribe motivo…"}
                      onCreateNew={onCreateReason}
                      createLabel="Crear motivo"
                      testId="appt-reason"
                    />
                  </div>
                  {apptError("reason") && <p className="text-[11px] text-rose-500 mt-1">{apptErrors.reason}</p>}
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Observaciones <span className="text-muted-foreground">(opcional)</span></Label>
                  <Textarea
                    data-testid="appt-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 min-h-[60px]"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" data-testid="create-appointment-submit" disabled={creating}>
                  {creating ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Creando…</> : "Crear cita"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* ============ PACIENTE NUEVO ============ */}
          <TabsContent value="new" className="mt-4">
            <form onSubmit={handleRegisterPatient} className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    data-testid="new-patient-name"
                    value={newPatient.name}
                    onChange={(e) => updPatient({ name: e.target.value })}
                    onBlur={() => markTouched("name")}
                    className={`mt-1 ${errCls(fieldError("name"))}`}
                  />
                  {fieldError("name") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.name}</p>}
                </div>
                <div>
                  <Label className="text-xs">Apellido</Label>
                  <Input
                    data-testid="new-patient-lastname"
                    value={newPatient.lastName}
                    onChange={(e) => updPatient({ lastName: e.target.value })}
                    onBlur={() => markTouched("lastName")}
                    className={`mt-1 ${errCls(fieldError("lastName"))}`}
                  />
                  {fieldError("lastName") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.lastName}</p>}
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    data-testid="new-patient-email"
                    type="email"
                    value={newPatient.email}
                    onChange={(e) => updPatient({ email: e.target.value })}
                    onBlur={() => markTouched("email")}
                    className={`mt-1 ${errCls(fieldError("email"))}`}
                  />
                  {fieldError("email") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.email}</p>}
                </div>
                <div>
                  <Label className="text-xs">Teléfono</Label>
                  <Input
                    data-testid="new-patient-phone"
                    inputMode="numeric"
                    maxLength={10}
                    value={newPatient.phone}
                    onChange={(e) => updPatient({ phone: e.target.value.replace(/\D/g, "") })}
                    onBlur={() => markTouched("phone")}
                    className={`mt-1 ${errCls(fieldError("phone"))}`}
                  />
                  {fieldError("phone") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.phone}</p>}
                </div>
                <div>
                  <Label className="text-xs">Género</Label>
                  <Select value={newPatient.gender} onValueChange={(v) => { updPatient({ gender: v }); markTouched("gender"); }}>
                    <SelectTrigger className={`mt-1 ${errCls(fieldError("gender"))}`} data-testid="new-patient-gender"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>{GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {fieldError("gender") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.gender}</p>}
                </div>
                <div>
                  <Label className="text-xs">Fecha de nacimiento</Label>
                  <Input
                    data-testid="new-patient-birthdate"
                    type="date"
                    value={newPatient.birthDate}
                    onChange={(e) => updPatient({ birthDate: e.target.value })}
                    onBlur={() => markTouched("birthDate")}
                    className={`mt-1 ${errCls(fieldError("birthDate"))}`}
                  />
                  {fieldError("birthDate") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.birthDate}</p>}
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Dirección</Label>
                  <Input
                    data-testid="new-patient-address"
                    value={newPatient.address}
                    onChange={(e) => updPatient({ address: e.target.value })}
                    onBlur={() => markTouched("address")}
                    className={`mt-1 ${errCls(fieldError("address"))}`}
                  />
                  {fieldError("address") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.address}</p>}
                </div>
                <div>
                  <Label className="text-xs">Nombre de contacto de emergencia <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input
                    data-testid="new-patient-emergency-name"
                    value={newPatient.emergencyContactName}
                    onChange={(e) => updPatient({ emergencyContactName: e.target.value })}
                    onBlur={() => markTouched("emergencyContactName")}
                    className={`mt-1 ${errCls(fieldError("emergencyContactName"))}`}
                  />
                  {fieldError("emergencyContactName") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.emergencyContactName}</p>}
                </div>
                <div>
                  <Label className="text-xs">Teléfono de contacto de emergencia <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input
                    data-testid="new-patient-emergency-phone"
                    inputMode="numeric"
                    maxLength={10}
                    value={newPatient.emergencyContactPhone}
                    onChange={(e) => updPatient({ emergencyContactPhone: e.target.value.replace(/\D/g, "") })}
                    onBlur={() => markTouched("emergencyContactPhone")}
                    className={`mt-1 ${errCls(fieldError("emergencyContactPhone"))}`}
                  />
                  {fieldError("emergencyContactPhone") && <p className="text-[11px] text-rose-500 mt-1">{patientErrors.emergencyContactPhone}</p>}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <MedicalQuestionnaire value={questionnaire} onChange={setQuestionnaire} />
                <p className="text-[11px] text-muted-foreground mt-2">
                  El cuestionario es informativo y se almacena localmente. No se envía al backend todavía.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  data-testid="register-patient-submit"
                  disabled={!isPatientFormValid || submittingPatient}
                >
                  {submittingPatient ? "Registrando…" : "Registrar paciente"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
