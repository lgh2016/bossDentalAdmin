import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const BRANCH_ID = 1;
const SR = "S/R";

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

// Letras (a-z, A-Z), acentos, ñ/Ñ, ü/Ü, espacios, guiones y apóstrofes.
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

  // Contacto de emergencia OPCIONAL: solo validar formato si el usuario llenó algo.
  if (p.emergencyContactName?.trim() && !NAME_REGEX.test(p.emergencyContactName.trim())) {
    errors.emergencyContactName = "Solo letras, acentos y Ñ";
  }
  if (p.emergencyContactPhone && !PHONE_REGEX.test(String(p.emergencyContactPhone))) {
    errors.emergencyContactPhone = "10 dígitos numéricos";
  }

  return errors;
}

const errCls = (hasErr) => (hasErr ? "border-rose-500 focus-visible:ring-rose-500/30" : "");

// "HH:mm:ss" → "HH:mm" (los selects/forms usan formato corto)
const trimSec = (t) => (t ? String(t).slice(0, 5) : "");
const todayISO = () => new Date().toISOString().slice(0, 10);
const valueOrSR = (v) => (v == null || v === "" ? SR : v);

export default function CreateAppointmentDialog({ open, onOpenChange, defaultDate }) {
  const { user } = useAuth();
  const { reasons } = useClinic();

  const [tab, setTab] = useState("existing");

  // -------- Estado del paciente existente (buscador real) --------
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // -------- Estado del flujo de creación de cita --------
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  // Cleanup de locks expirados al abrir el modal (FASE 2)
  const [agendaReady, setAgendaReady] = useState(false);
  const cleanupRanForOpen = useRef(false);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(defaultDate || todayISO());
  const [startSlots, setStartSlots] = useState([]);
  const [loadingStartSlots, setLoadingStartSlots] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endSlots, setEndSlots] = useState([]);
  const [endTime, setEndTime] = useState("");
  const [appointmentId, setAppointmentId] = useState(null);
  const [locking, setLocking] = useState(false);
  const [updatingEnd, setUpdatingEnd] = useState(false);
  const [reasonName, setReasonName] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  // -------- Estado de "Paciente nuevo" --------
  const [newPatient, setNewPatient] = useState(emptyNewPatient());
  const [questionnaire, setQuestionnaire] = useState(emptyQuestionnaire());
  const [touched, setTouched] = useState({});
  const [submittingPatient, setSubmittingPatient] = useState(false);

  const patientErrors = useMemo(() => validateNewPatient(newPatient), [newPatient]);
  const isPatientFormValid = Object.keys(patientErrors).length === 0;

  // Placeholder dinámico (año actual)
  const expedientHint = `EXP-${new Date().getFullYear()}-000001`;
  const searchPlaceholder = `Buscar por nombre, teléfono o expediente (${expedientHint})…`;

  const reasonOptions = reasons.map((r) => ({ value: r.id, label: r.name }));

  // ====== Reset helpers ======
  const resetAppointmentFlow = () => {
    setDoctorId("");
    setDate(defaultDate || todayISO());
    setStartSlots([]);
    setStartTime("");
    setEndSlots([]);
    setEndTime("");
    setAppointmentId(null);
    setReasonName("");
    setNotes("");
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
    resetAppointmentFlow();
    resetPatientForm();
  };

  // ====== Cleanup de locks expirados — una sola vez por apertura del modal (FASE 2) ======
  useEffect(() => {
    if (!open) {
      cleanupRanForOpen.current = false;
      setAgendaReady(false);
      return;
    }
    if (cleanupRanForOpen.current) return;
    cleanupRanForOpen.current = true;
    setAgendaReady(false);
    (async () => {
      try {
        await appointmentsApi.cleanupExpiredLocks();
        setAgendaReady(true);
      } catch {
        setAgendaReady(false);
        toast.error("No fue posible preparar la agenda. Cierra el modal e inténtalo nuevamente.");
      }
    })();
  }, [open]);

  // ====== Doctores (al abrir modal y tras limpieza de locks) ======
  useEffect(() => {
    if (!open || !agendaReady) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingDoctors(true);
        const data = await doctorsApi.listActive({ branchId: BRANCH_ID });
        if (!cancelled) setDoctors(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) {
          setDoctors([]);
          toast.error("No fue posible cargar los doctores");
        }
      } finally {
        if (!cancelled) setLoadingDoctors(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, agendaReady]);

  // ====== Búsqueda real de pacientes (debounced) ======
  const searchRequestId = useRef(0);
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    const myId = ++searchRequestId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await patientsApi.search({ query: query.trim(), page: 0, size: 10 });
        if (myId === searchRequestId.current) {
          setSearchResults(Array.isArray(data?.content) ? data.content : []);
        }
      } catch {
        if (myId === searchRequestId.current) setSearchResults([]);
      } finally {
        if (myId === searchRequestId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // ====== Start slots cuando paciente + doctor + fecha existen ======
  const startSlotsRequestId = useRef(0);
  useEffect(() => {
    if (!agendaReady || !selectedPatient || !doctorId || !date) {
      setStartSlots([]);
      return;
    }
    const myId = ++startSlotsRequestId.current;
    setLoadingStartSlots(true);
    (async () => {
      try {
        const data = await appointmentsApi.startSlots({ doctorId, branchId: BRANCH_ID, date });
        if (myId === startSlotsRequestId.current) {
          setStartSlots(Array.isArray(data?.slots) ? data.slots : []);
        }
      } catch {
        if (myId === startSlotsRequestId.current) {
          setStartSlots([]);
          toast.error("No fue posible cargar las horas disponibles");
        }
      } finally {
        if (myId === startSlotsRequestId.current) setLoadingStartSlots(false);
      }
    })();
  }, [selectedPatient?.id, doctorId, date, agendaReady]);

  // ====== Handlers de cascada (resets) ======
  const onPatientSelect = useCallback((p) => {
    setSelectedPatient(p);
    setQuery(p.fullName || "");
    setSearchResults([]);
    resetAppointmentFlow();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDoctorChange = async (v) => {
    // Si ya existe un appointment bloqueado → PUT /appointments/{id}/dentist (sin crear nuevo lock).
    if (appointmentId) {
      const prevDoctorId = doctorId;
      try {
        setLocking(true);
        await appointmentsApi.updateDentist(appointmentId, Number(v));
        // OK → conservar appointmentId, actualizar doctor y limpiar horarios.
        setDoctorId(v);
        setStartTime("");
        setEndSlots([]);
        setEndTime("");
        // El useEffect existente reconsulta /start-slots con el nuevo doctor automáticamente.
      } catch (err) {
        const msg = err?.response?.data?.message || err?.response?.data?.error || "";
        const expired = /lock\s+has\s+expired/i.test(msg) || err?.response?.status === 410;
        if (expired) {
          toast.error("El bloqueo de la cita expiró. Reinicia la programación de la cita.");
          // Reset al estado inicial del formulario (manteniendo paciente y fecha por UX).
          setAppointmentId(null);
          setDoctorId("");
          setStartTime("");
          setEndTime("");
          setEndSlots([]);
        } else {
          toast.error("No fue posible actualizar el doctor");
          // Revertir doctor visualmente; conservar appointmentId vigente.
          setDoctorId(prevDoctorId);
        }
      } finally {
        setLocking(false);
      }
      return;
    }

    // Sin appointmentId todavía → comportamiento original (flujo intacto).
    setDoctorId(v);
    setStartTime(""); setEndSlots([]); setEndTime(""); setAppointmentId(null);
  };
  const onDateChange = async (v) => {
    // Si ya existe un appointment bloqueado → PUT /appointments/{id}/date (sin crear nuevo lock).
    if (appointmentId) {
      const prevDate = date;
      try {
        setLocking(true);
        await appointmentsApi.updateDate(appointmentId, v);
        // OK → conservar appointmentId, actualizar fecha y limpiar horarios.
        setDate(v);
        setStartTime("");
        setEndSlots([]);
        setEndTime("");
        // El useEffect existente reconsulta /start-slots con la nueva fecha automáticamente.
      } catch (err) {
        const msg = err?.response?.data?.message || err?.response?.data?.error || "";
        const expired = /lock\s+has\s+expired/i.test(msg) || err?.response?.status === 410;
        if (expired) {
          toast.error("El bloqueo de la cita expiró. Reinicia la programación de la cita.");
          // Reset al estado inicial (conservando paciente y doctor por UX).
          setAppointmentId(null);
          setStartTime("");
          setEndTime("");
          setEndSlots([]);
        } else {
          toast.error("No fue posible actualizar la fecha");
          setDate(prevDate);
        }
      } finally {
        setLocking(false);
      }
      return;
    }

    // Sin appointmentId todavía → comportamiento original.
    setDate(v);
    setStartTime(""); setEndSlots([]); setEndTime(""); setAppointmentId(null);
  };

  const onStartTimeChange = async (v) => {
    if (!v) {
      setStartTime("");
      setEndSlots([]); setEndTime(""); setAppointmentId(null);
      return;
    }

    // Si ya hay un appointment bloqueado → actualizar la hora inicio del lock existente
    // y obtener las horas fin disponibles vía GET /end-slots (sin crear nuevo lock).
    if (appointmentId) {
      const prevStart = startTime;
      const prevEnd = endTime;
      setStartTime(v);
      // Limpia visualmente la hora fin; si la anterior sigue siendo válida (> nueva inicio), la conservamos.
      setEndTime(prevEnd && prevEnd > v ? prevEnd : "");
      try {
        setLocking(true);
        // Persistir nueva hora inicio en el appointment existente.
        await appointmentsApi.updateStartTime(appointmentId, v);
        // Pedir horas fin disponibles para esa hora inicio.
        const data = await appointmentsApi.endSlots(appointmentId, v);
        const slots = Array.isArray(data?.endSlots) ? data.endSlots : [];
        setEndSlots(slots);
        // Preseleccionar primera hora válida > nueva hora inicio (formato HH:mm).
        const firstValid = slots.map(trimSec).find((s) => s > v) || trimSec(slots[0] || "");
        setEndTime(firstValid);
      } catch (err) {
        const msg = err?.response?.data?.message || err?.response?.data?.error || "";
        const expired = /lock\s+has\s+expired/i.test(msg) || err?.response?.status === 410;
        if (expired) {
          toast.error("El bloqueo de la cita expiró. Selecciona la hora inicio nuevamente.");
          // Reset al estado previo a la selección de horario.
          setAppointmentId(null);
          setStartTime("");
          setEndTime("");
          setEndSlots([]);
        } else {
          toast.error("No fue posible actualizar la hora inicio");
          // Revertir estado local para mantener consistencia con el backend.
          setStartTime(prevStart);
          setEndTime(prevEnd);
        }
      } finally {
        setLocking(false);
      }
      return;
    }

    // Primer bloqueo: POST /appointments/lock (flujo existente, intacto).
    setStartTime(v);
    setEndSlots([]); setEndTime(""); setAppointmentId(null);
    try {
      setLocking(true);
      const lock = await appointmentsApi.lock({
        doctorId: Number(doctorId),
        branchId: BRANCH_ID,
        patientId: selectedPatient.id,
        date,
        startTime: v,
      });
      setAppointmentId(lock.appointmentId);
      const slots = Array.isArray(lock.endSlots) ? lock.endSlots : [];
      setEndSlots(slots);
      // Preseleccionar primera hora válida > startTime (formato HH:mm)
      const firstValid = slots.map(trimSec).find((s) => s > v) || trimSec(slots[0] || "");
      setEndTime(firstValid);
    } catch {
      toast.error("No fue posible reservar el horario");
      setStartTime("");
    } finally {
      setLocking(false);
    }
  };

  const onEndTimeChange = async (v) => {
    setEndTime(v);
    if (!v || !appointmentId) return;
    try {
      setUpdatingEnd(true);
      await appointmentsApi.updateEndTime(appointmentId, v);
    } catch {
      toast.error("No fue posible actualizar la hora fin");
    } finally {
      setUpdatingEnd(false);
    }
  };

  const onReasonChange = (_id, opt) => setReasonName(opt?.label || reasonName);
  const onCreateReason = (text) => {
    const created = clinicStore.addReason(text, user);
    toast.success(`Motivo "${text}" agregado al catálogo local`);
    setReasonName(created.name);
    return { value: created.id, label: created.name };
  };

  // ====== Cascada de habilitación ======
  const canDoctor = !!selectedPatient;
  const canDate = canDoctor && !!doctorId;
  const canStart = canDate && !!date;
  const canEnd = canStart && endSlots.length > 0;
  const canReason = canEnd && !!endTime;
  const canSubmit = canReason && !!reasonName.trim() && !!appointmentId && !confirming;

  // ====== Submit: confirmar cita ======
  const handleConfirmAppointment = async (e) => {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    try {
      setConfirming(true);
      await appointmentsApi.confirm(appointmentId, {
        patientId: selectedPatient.id,
        reason: reasonName.trim(),
        notes: notes?.trim() || "",
      });
      toast.success(`Cita creada para ${selectedPatient.fullName}`);
      fullReset();
      onOpenChange(false);
    } catch {
      toast.error("No fue posible confirmar la cita");
    } finally {
      setConfirming(false);
    }
  };

  // ====== Submit: registrar paciente nuevo ======
  const updPatient = (patch) => setNewPatient((p) => ({ ...p, ...patch }));
  const markTouched = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const fieldError = (field) => touched[field] && patientErrors[field];

  const handleRegisterPatient = async (e) => {
    e.preventDefault();
    setTouched({
      name: true, lastName: true, email: true, phone: true, gender: true,
      birthDate: true, address: true,
    });
    if (!isPatientFormValid) {
      toast.error("Revisa los campos en rojo");
      return;
    }
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

      // Preselección en tab "Paciente existente" con la shape del buscador.
      const adapted = {
        id: created.id,
        fullName,
        expedientNumber: created.patientNumber || null,
        phone: String(created.phone ?? ""),
        email: created.email,
        photoUrl: created.photoUrl,
        active: true,
      };
      // Cambia a existente, limpia el form nuevo y deja el paciente seleccionado.
      resetPatientForm();
      setSelectedPatient(adapted);
      setQuery(fullName);
      setSearchResults([]);
      resetAppointmentFlow();
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
              : "Programa una cita para un paciente existente."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-secondary">
            <TabsTrigger value="existing" data-testid="tab-existing-patient"><Search size={13} className="mr-1.5" /> Paciente existente</TabsTrigger>
            <TabsTrigger value="new" data-testid="tab-new-patient"><UserPlus size={13} className="mr-1.5" /> Paciente nuevo</TabsTrigger>
          </TabsList>

          {/* ===================== EXISTENTE ===================== */}
          <TabsContent value="existing" className="mt-4">
            <form onSubmit={handleConfirmAppointment} className="space-y-5">
              {/* Buscador */}
              <div className="space-y-3">
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
                {selectedPatient && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs" data-testid="selected-patient">
                    Paciente seleccionado: <span className="font-medium">{valueOrSR(selectedPatient.fullName)}</span> · {valueOrSR(selectedPatient.expedientNumber)}
                  </div>
                )}
              </div>

              {/* Resto del flujo (cascada) */}
              <div className="border-t border-border pt-4 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Doctor</Label>
                  <Select value={doctorId} onValueChange={onDoctorChange} disabled={!canDoctor || loadingDoctors}>
                    <SelectTrigger className="mt-1" data-testid="appt-doctor">
                      <SelectValue placeholder={loadingDoctors ? "Cargando doctores…" : "Selecciona doctor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {valueOrSR(d.fullName)}{d.specialty ? ` · ${d.specialty}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Fecha</Label>
                  <Input
                    data-testid="appt-date"
                    type="date"
                    value={date}
                    min={todayISO()}
                    onChange={(e) => onDateChange(e.target.value)}
                    disabled={!canDate}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Hora inicial</Label>
                  <Select value={startTime} onValueChange={onStartTimeChange} disabled={!canStart || loadingStartSlots || locking}>
                    <SelectTrigger className="mt-1" data-testid="appt-start-time">
                      <SelectValue placeholder={loadingStartSlots ? "Cargando…" : (locking ? "Reservando…" : "Selecciona una hora")} />
                    </SelectTrigger>
                    <SelectContent>
                      {startSlots.map((s) => (
                        <SelectItem key={s} value={trimSec(s)}>{trimSec(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Hora fin</Label>
                  <Select value={endTime} onValueChange={onEndTimeChange} disabled={!canEnd || updatingEnd}>
                    <SelectTrigger className="mt-1" data-testid="appt-end-time">
                      <SelectValue placeholder={updatingEnd ? "Actualizando…" : "Selecciona una hora"} />
                    </SelectTrigger>
                    <SelectContent>
                      {endSlots.map((s) => (
                        <SelectItem key={s} value={trimSec(s)}>{trimSec(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Motivo</Label>
                  <div className={`mt-1 ${canReason ? "" : "opacity-50 pointer-events-none"}`}>
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
                </div>

                <div className="col-span-2">
                  <Label className="text-xs">Observaciones <span className="text-muted-foreground">(opcional)</span></Label>
                  <Textarea
                    data-testid="appt-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!canReason}
                    className="mt-1 min-h-[60px]"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  data-testid="create-appointment-submit"
                  disabled={!canSubmit}
                >
                  {confirming ? "Creando…" : "Crear cita"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* ===================== PACIENTE NUEVO ===================== */}
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
