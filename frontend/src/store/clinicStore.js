import { useSyncExternalStore } from "react";
import {
  patients as basePatients,
  appointments as baseAppointments,
  payments as basePayments,
  doctors,
  treatments as baseTreatments,
} from "@/mocks";
import { branches } from "@/mocks/branches";
import { auditLogs as baseAudit } from "@/mocks/auditLogs";
import { procedureCatalog as baseProcedures } from "@/mocks/procedureCatalog";
import { appointmentReasons as baseReasons } from "@/mocks/appointmentReasons";
import { quotations as baseQuotations } from "@/mocks/quotations";

const STATUS_MAP = { "En curso": "En consulta", Completada: "Atendida" };

const enrichPatients = (list) =>
  list.map((p, i) => ({
    ...p,
    expediente: `BD-2026-${String(i + 1).padStart(4, "0")}`,
    branch: i % 2 === 0 ? "Ecatepec" : "La Villa",
    age: new Date().getFullYear() - new Date(p.dob || "1990-01-01").getFullYear(),
    altaDate: p.altaDate || "2025-10-01",
    totalBudget: 18000 + i * 1500,
    totalPaid: Math.max(0, 18000 + i * 1500 - p.balance),
  }));

const enrichAppointments = (list, patients) =>
  list.map((a, i) => {
    const pat = patients.find((p) => p.id === a.patientId);
    const status = STATUS_MAP[a.status] || a.status;
    return {
      ...a,
      branch: pat?.branch || (i % 2 === 0 ? "Ecatepec" : "La Villa"),
      status,
      hasArrived: status === "En consulta" || status === "Atendida",
    };
  });

let state = (() => {
  // Try restore from localStorage
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("boss_dental_store");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.patients && parsed.appointments) {
          // Migración defensiva: si faltan claves nuevas, sembrarlas desde mocks
          if (!parsed.procedures) parsed.procedures = [...baseProcedures];
          if (!parsed.reasons) parsed.reasons = [...baseReasons];
          if (!parsed.quotations) parsed.quotations = [...baseQuotations];
          if (!parsed.seq) parsed.seq = {};
          parsed.seq = {
            patient: parsed.patients.length,
            appointment: parsed.appointments.length,
            payment: parsed.payments?.length || 0,
            audit: parsed.audit?.length || 0,
            procedure: parsed.procedures.length,
            reason: parsed.reasons.length,
            quotation: parsed.quotations.length,
            item: 100,
            ...parsed.seq,
          };
          return parsed;
        }
      }
    } catch { /* ignore */ }
  }
  const patients = enrichPatients(basePatients);
  return {
    patients,
    appointments: enrichAppointments(baseAppointments, patients),
    payments: [...basePayments],
    treatments: [...baseTreatments],
    doctors,
    branches,
    audit: [...baseAudit],
    procedures: [...baseProcedures],
    reasons: [...baseReasons],
    quotations: [...baseQuotations],
    seq: { patient: patients.length, appointment: baseAppointments.length, payment: basePayments.length, audit: baseAudit.length, procedure: baseProcedures.length, reason: baseReasons.length, quotation: baseQuotations.length, item: 100 },
  };
})();

const persist = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("boss_dental_store", JSON.stringify(state));
  } catch { /* quota exceeded */ }
};

const listeners = new Set();
const notify = () => { persist(); listeners.forEach((fn) => fn()); };

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => state;

const setState = (updater) => {
  state = { ...state, ...updater(state) };
  notify();
};

const nextId = (key, prefix) => {
  state.seq[key] += 1;
  return `${prefix}-${state.seq[key]}`;
};

const formatNow = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const pushAudit = (entry) => {
  const id = nextId("audit", "au");
  state.audit = [
    { id, at: formatNow(), ...entry },
    ...state.audit,
  ];
};

const generateExpediente = () =>
  `BD-2026-${String(state.patients.length + 1).padStart(4, "0")}`;

const createPatient = (data, actor) => {
  const id = nextId("patient", "p");
  const expediente = generateExpediente();
  const newPatient = {
    id,
    expediente,
    name: data.name,
    email: data.email || "",
    phone: data.phone,
    dob: data.dob || "1990-01-01",
    age: data.age || (data.dob ? new Date().getFullYear() - new Date(data.dob).getFullYear() : 30),
    gender: data.gender || "M",
    insurance: "Particular",
    branch: data.branch || "Ecatepec",
    lastVisit: new Date().toISOString().slice(0, 10),
    assignedDoctorId: data.assignedDoctorId || null,
    status: "Activo",
    balance: 50,
    totalBudget: 50,
    totalPaid: 0,
    altaDate: new Date().toISOString().slice(0, 10),
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.name)}`,
  };
  state.patients = [newPatient, ...state.patients];
  pushAudit({
    patientId: id,
    type: "patient_created",
    actor: actor.name,
    role: actor.role,
    description: `Paciente creado · ${expediente}`,
    meta: { branch: newPatient.branch },
  });
  // Cargo de primera consulta $50 → pago Pendiente real
  const payId = nextId("payment", "pay");
  state.payments = [
    {
      id: payId,
      patientId: id,
      patientName: newPatient.name,
      expediente,
      concept: "Primera consulta",
      amount: 50,
      method: "—",
      status: "Pendiente",
      date: new Date().toISOString().slice(0, 10),
      registeredBy: actor.name,
      notes: "Cargo automático generado al alta del paciente",
    },
    ...state.payments,
  ];
  pushAudit({
    patientId: id,
    type: "payment_pending",
    actor: "Sistema",
    role: "SISTEMA",
    description: "Cargo de primera consulta generado (Pendiente)",
    meta: { amount: 50, concept: "Primera consulta", paymentId: payId },
  });
  notify();
  return newPatient;
};

const confirmPayment = (paymentId, method, actor) => {
  let target;
  state.payments = state.payments.map((p) => {
    if (p.id === paymentId && p.status === "Pendiente") {
      target = { ...p, status: "Pagado", method: method || p.method, date: new Date().toISOString().slice(0, 10), registeredBy: actor.name };
      return target;
    }
    return p;
  });
  if (target) {
    state.patients = state.patients.map((p) =>
      p.id === target.patientId
        ? { ...p, balance: Math.max(0, p.balance - target.amount), totalPaid: (p.totalPaid || 0) + target.amount }
        : p,
    );
    pushAudit({
      patientId: target.patientId,
      type: "payment_registered",
      actor: actor.name,
      role: actor.role,
      description: `Pago confirmado · ${target.concept}`,
      meta: { amount: target.amount, method: method || target.method },
    });
  }
  notify();
};

const createAppointment = (data, actor) => {
  const id = nextId("appointment", "a");
  const doc = state.doctors.find((d) => d.id === data.doctorId);
  const pat = state.patients.find((p) => p.id === data.patientId);
  const appt = {
    id,
    patientId: data.patientId,
    patientName: pat?.name || data.patientName,
    doctorId: data.doctorId || null,
    doctorName: doc?.name || "Sin asignar",
    date: data.date,
    time: data.time,
    duration: data.duration || 45,
    type: data.type,
    status: data.status || "Pendiente",
    notes: data.notes || "",
    branch: data.branch || pat?.branch || "Ecatepec",
    hasArrived: false,
  };
  state.appointments = [...state.appointments, appt];
  pushAudit({
    patientId: data.patientId,
    type: "appointment_created",
    actor: actor.name,
    role: actor.role,
    description: `Cita creada · ${data.type}`,
    meta: { date: data.date, time: data.time, doctor: appt.doctorName },
  });
  notify();
  return appt;
};

const markArrived = (appointmentId, actor) => {
  state.appointments = state.appointments.map((a) =>
    a.id === appointmentId ? { ...a, hasArrived: true, status: "Llegó" } : a,
  );
  const a = state.appointments.find((x) => x.id === appointmentId);
  pushAudit({
    patientId: a.patientId,
    type: "patient_arrived",
    actor: actor.name,
    role: actor.role,
    description: `Paciente registró llegada`,
    meta: { time: a.time },
  });
  notify();
};

const updateAppointmentStatus = (appointmentId, status, actor) => {
  state.appointments = state.appointments.map((a) =>
    a.id === appointmentId ? { ...a, status } : a,
  );
  const a = state.appointments.find((x) => x.id === appointmentId);
  pushAudit({
    patientId: a.patientId,
    type: status === "Cancelada" ? "appointment_cancelled" : status === "Reprogramada" ? "appointment_rescheduled" : "appointment_status",
    actor: actor.name,
    role: actor.role,
    description: `Estado de cita: ${status}`,
    meta: { id: appointmentId },
  });
  notify();
};

const assignDoctor = (appointmentId, doctorId, reason, actor) => {
  const doctor = state.doctors.find((d) => d.id === doctorId);
  let prev;
  state.appointments = state.appointments.map((a) => {
    if (a.id === appointmentId) {
      prev = a.doctorName;
      return { ...a, doctorId, doctorName: doctor?.name || "Sin asignar" };
    }
    return a;
  });
  const appt = state.appointments.find((x) => x.id === appointmentId);
  pushAudit({
    patientId: appt.patientId,
    type: prev && prev !== "Sin asignar" ? "doctor_changed" : "doctor_assigned",
    actor: actor.name,
    role: actor.role,
    description: prev && prev !== "Sin asignar" ? `Doctor cambiado: ${prev} → ${doctor?.name}` : `Doctor asignado: ${doctor?.name}`,
    meta: { from: prev, to: doctor?.name, reason },
  });
  notify();
};

const registerPayment = (data, actor) => {
  const id = nextId("payment", "pay");
  const pat = state.patients.find((p) => p.id === data.patientId);
  const newPayment = {
    id,
    patientId: data.patientId,
    patientName: pat?.name,
    expediente: pat?.expediente,
    concept: data.concept,
    amount: Number(data.amount),
    method: data.method,
    status: "Pagado",
    date: new Date().toISOString().slice(0, 10),
    registeredBy: actor.name,
    notes: data.notes,
  };
  state.payments = [newPayment, ...state.payments];
  state.patients = state.patients.map((p) =>
    p.id === data.patientId
      ? { ...p, balance: Math.max(0, p.balance - Number(data.amount)), totalPaid: (p.totalPaid || 0) + Number(data.amount) }
      : p,
  );
  pushAudit({
    patientId: data.patientId,
    type: "payment_registered",
    actor: actor.name,
    role: actor.role,
    description: `Pago registrado · ${data.concept}`,
    meta: { amount: Number(data.amount), method: data.method },
  });
  notify();
  return newPayment;
};

const editBudget = (patientId, newTotal, reason, actor) => {
  let prev = 0;
  state.patients = state.patients.map((p) => {
    if (p.id === patientId) {
      prev = p.totalBudget;
      const balance = Math.max(0, Number(newTotal) - (p.totalPaid || 0));
      return { ...p, totalBudget: Number(newTotal), balance };
    }
    return p;
  });
  pushAudit({
    patientId,
    type: "budget_edited",
    actor: actor.name,
    role: actor.role,
    description: `Cotización editada con autorización admin`,
    meta: { from: prev, to: Number(newTotal), reason },
  });
  notify();
};

const consultBudget = (patientId, actor) => {
  pushAudit({
    patientId,
    type: "budget_consulted",
    actor: actor.name,
    role: actor.role,
    description: "Cotización consultada",
    meta: {},
  });
  notify();
};

// === Catálogos ===
const addProcedure = (procedure, actor) => {
  const id = nextId("procedure", "pr");
  const created = { id, requiresTooth: false, category: "Custom", suggestedPrice: 0, description: "", ...procedure };
  state.procedures = [created, ...state.procedures];
  pushAudit({
    patientId: null,
    type: "procedure_created",
    actor: actor?.name || "Sistema",
    role: actor?.role || "SISTEMA",
    description: `Procedimiento creado: ${created.name}`,
    meta: { id, price: created.suggestedPrice },
  });
  notify();
  return created;
};

const addReason = (name, actor) => {
  const id = nextId("reason", "rs");
  const created = { id, name };
  state.reasons = [...state.reasons, created];
  pushAudit({
    patientId: null,
    type: "reason_created",
    actor: actor?.name || "Sistema",
    role: actor?.role || "SISTEMA",
    description: `Motivo de cita creado: ${name}`,
    meta: {},
  });
  notify();
  return created;
};

// === Cotizaciones ===
const computeTotal = (items) =>
  items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0);

const recalcItems = (items) =>
  items.map((i) => ({ ...i, subtotal: Number(i.qty || 0) * Number(i.unitPrice || 0) }));

const upsertQuotation = (patientId, payload, actor, { isNew = false, reason = "" } = {}) => {
  const items = recalcItems(payload.items || []);
  const total = computeTotal(items);
  const existing = state.quotations.find((q) => q.patientId === patientId);
  let qid = existing?.id;
  if (existing) {
    state.quotations = state.quotations.map((q) =>
      q.id === existing.id ? { ...q, name: payload.name || q.name, items, total, observations: payload.observations || "" } : q,
    );
  } else {
    qid = nextId("quotation", "q");
    state.quotations = [
      ...state.quotations,
      { id: qid, patientId, name: payload.name || "Cotización", items, total, observations: payload.observations || "" },
    ];
  }
  // recalcular saldo del paciente: balance = max(0, totalQuoted + cargos pendientes - totalPaid)
  state.patients = state.patients.map((p) => {
    if (p.id !== patientId) return p;
    const totalPaid = p.totalPaid || 0;
    return { ...p, totalBudget: total, balance: Math.max(0, total - totalPaid) };
  });
  pushAudit({
    patientId,
    type: isNew ? "quotation_created" : "quotation_edited",
    actor: actor.name,
    role: actor.role,
    description: isNew ? `Cotización creada · ${payload.name || "Cotización"}` : `Cotización editada con autorización admin`,
    meta: { total, items: items.length, reason, name: payload.name },
  });
  notify();
  return state.quotations.find((q) => q.id === qid);
};

const editBudgetItems = (patientId, payload, reason, actor) => {
  // Versión gated por admin password — usado por QuotationEditor
  return upsertQuotation(patientId, payload, actor, { isNew: false, reason });
};

const createQuotationFromForm = (patientId, payload, actor) => {
  return upsertQuotation(patientId, payload, actor, { isNew: true });
};

// === Pagos ===
const cancelPayment = (paymentId, reason, actor) => {
  let target;
  state.payments = state.payments.map((p) => {
    if (p.id === paymentId && p.status !== "Cancelado") {
      target = p;
      return {
        ...p,
        status: "Cancelado",
        cancelReason: reason,
        cancelledBy: actor.name,
        cancelledAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      };
    }
    return p;
  });
  if (target) {
    if (target.status === "Pagado") {
      // revertir totalPaid y subir balance
      state.patients = state.patients.map((p) =>
        p.id === target.patientId
          ? { ...p, totalPaid: Math.max(0, (p.totalPaid || 0) - target.amount), balance: (p.balance || 0) + target.amount }
          : p,
      );
    } else if (target.status === "Pendiente") {
      // sólo bajamos balance
      state.patients = state.patients.map((p) =>
        p.id === target.patientId
          ? { ...p, balance: Math.max(0, (p.balance || 0) - target.amount) }
          : p,
      );
    }
    pushAudit({
      patientId: target.patientId,
      type: "payment_cancelled",
      actor: actor.name,
      role: actor.role,
      description: `Pago cancelado · ${target.concept}`,
      meta: { amount: target.amount, reason, paymentId },
    });
  }
  notify();
};

// === Citas ===
const rescheduleAppointment = (appointmentId, newDate, newTime, reason, actor) => {
  let prev;
  state.appointments = state.appointments.map((a) => {
    if (a.id === appointmentId) {
      prev = `${a.date} ${a.time}`;
      return { ...a, date: newDate, time: newTime, status: "Reprogramada" };
    }
    return a;
  });
  const a = state.appointments.find((x) => x.id === appointmentId);
  pushAudit({
    patientId: a.patientId,
    type: "appointment_rescheduled",
    actor: actor.name,
    role: actor.role,
    description: `Cita reprogramada: ${prev} → ${newDate} ${newTime}`,
    meta: { reason, from: prev, to: `${newDate} ${newTime}` },
  });
  notify();
};

const cancelAppointment = (appointmentId, reason, actor) => {
  let target;
  state.appointments = state.appointments.map((a) => {
    if (a.id === appointmentId) { target = a; return { ...a, status: "Cancelada" }; }
    return a;
  });
  if (target) {
    pushAudit({
      patientId: target.patientId,
      type: "appointment_cancelled",
      actor: actor.name,
      role: actor.role,
      description: `Cita cancelada · ${target.type}`,
      meta: { reason, date: target.date, time: target.time },
    });
  }
  notify();
};

// === Cuestionario ===
const saveQuestionnaire = (patientId, q, actor) => {
  const risk = Object.values(q || {}).some((x) => x?.answer === true);
  state.patients = state.patients.map((p) =>
    p.id === patientId ? { ...p, questionnaire: q, hasRisk: risk } : p,
  );
  if (risk) {
    pushAudit({
      patientId,
      type: "questionnaire_risk",
      actor: actor.name,
      role: actor.role,
      description: "Cuestionario clínico con riesgo detectado",
      meta: {
        allergies: q.allergies?.answer ? "Sí" : "No",
        chronic: q.chronic?.answer ? "Sí" : "No",
        medications: q.medications?.answer ? "Sí" : "No",
      },
    });
  } else {
    pushAudit({
      patientId,
      type: "questionnaire_saved",
      actor: actor.name,
      role: actor.role,
      description: "Cuestionario clínico capturado (sin riesgo)",
      meta: {},
    });
  }
  notify();
};

export const clinicStore = {
  subscribe,
  getSnapshot,
  setState,
  generateExpediente,
  createPatient,
  createAppointment,
  markArrived,
  updateAppointmentStatus,
  assignDoctor,
  registerPayment,
  confirmPayment,
  cancelPayment,
  editBudget,
  editBudgetItems,
  createQuotationFromForm,
  consultBudget,
  addProcedure,
  addReason,
  rescheduleAppointment,
  cancelAppointment,
  saveQuestionnaire,
  resetDemo() {
    if (typeof window !== "undefined") localStorage.removeItem("boss_dental_store");
    const patients = enrichPatients(basePatients);
    state = {
      patients,
      appointments: enrichAppointments(baseAppointments, patients),
      payments: [...basePayments],
      treatments: [...baseTreatments],
      doctors,
      branches,
      audit: [...baseAudit],
      procedures: [...baseProcedures],
      reasons: [...baseReasons],
      quotations: [...baseQuotations],
      seq: { patient: patients.length, appointment: baseAppointments.length, payment: basePayments.length, audit: baseAudit.length, procedure: baseProcedures.length, reason: baseReasons.length, quotation: baseQuotations.length, item: 100 },
    };
    notify();
  },
};

export function useClinic() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
